import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ResetAccount, ResetOutcome } from "../shared/resets";
import { ResetError, errorMessage } from "./errors";
import { type Credit, groupCredits } from "./group";

const TIMEOUT_MS = 20_000;

/** Codex on PATH, else the usual install locations (the daemon's PATH can be minimal on macOS). */
function findCodex(): string | undefined {
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, `codex${ext.toLowerCase()}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  const home = os.homedir();
  const fallbacks =
    process.platform === "win32"
      ? [
          path.join(process.env.LOCALAPPDATA ?? "", "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
          path.join(process.env.APPDATA ?? "", "npm", "codex.cmd"),
        ]
      : [
          "/opt/homebrew/bin/codex",
          "/usr/local/bin/codex",
          path.join(home, ".local", "bin", "codex"),
          path.join(home, ".npm-global", "bin", "codex"),
          "/Applications/Codex.app/Contents/Resources/codex",
        ];
  return fallbacks.find((candidate) => existsSync(candidate));
}

/** Runs one short JSON-RPC session against `codex app-server`, then stops it. */
async function withAppServer<T>(
  work: (request: (method: string, params: unknown) => Promise<any>) => Promise<T>,
): Promise<T> {
  const binary = findCodex();
  if (!binary) throw new ResetError("codexNotFound");
  const child = spawnProcess(binary, ["app-server"], { stdio: "pipe", env: process.env });
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  let nextId = 1;
  let buffer = "";
  const failAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = typeof message.id === "number" ? pending.get(message.id) : undefined;
      if (!waiter) continue;
      pending.delete(message.id!);
      if (message.error) waiter.reject(new Error(message.error.message ?? "Codex request failed"));
      else waiter.resolve(message.result);
    }
  });
  child.stderr.resume();
  child.on("error", (error) => failAll(error));
  child.on("exit", () => failAll(new Error("Codex stopped before answering")));

  const request = (method: string, params: unknown) =>
    new Promise<any>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ResetError("codexTimeout")), TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        await request("initialize", {
          clientInfo: { name: "paseo-reset-credits", version: "0.1.0" },
        });
        child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
        return work(request);
      })(),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    child.removeAllListeners("exit");
    await terminateProcess(child).catch(() => {});
  }
}

interface CodexCredit {
  id?: unknown;
  resetType?: unknown;
  status?: unknown;
  expiresAt?: unknown;
  title?: unknown;
}

export function codexCredits(
  summary: { availableCount?: unknown; credits?: unknown } | null | undefined,
): Credit[] {
  if (!summary) return [];
  const available = Number(summary.availableCount ?? 0);
  if (!Number.isFinite(available) || available <= 0) return [];
  if (!Array.isArray(summary.credits)) {
    // Codex only knows the count: let it pick the credit.
    return [{ id: "", kind: "full", title: null, count: available, expiresAtMs: null }];
  }
  return (summary.credits as CodexCredit[]).flatMap((credit): Credit[] => {
    if (credit.status !== "available" || typeof credit.id !== "string") return [];
    return [
      {
        id: credit.id,
        kind: credit.resetType === "codexRateLimits" ? "full" : "other",
        title: typeof credit.title === "string" ? credit.title : null,
        count: 1,
        expiresAtMs: typeof credit.expiresAt === "number" ? credit.expiresAt * 1000 : null,
      },
    ];
  });
}

export async function listCodexResets(): Promise<ResetAccount> {
  try {
    const response = await withAppServer((request) => request("account/rateLimits/read", null));
    const summary = response?.rateLimitResetCredits;
    const options = groupCredits(codexCredits(summary)).map((option) => ({
      ...option,
      creditId: option.creditId || null,
    }));
    const total = Math.max(
      Number(summary?.availableCount ?? 0) || 0,
      options.reduce((sum, option) => sum + option.count, 0),
    );
    return { provider: "codex", status: "ok", message: null, total, options };
  } catch (error) {
    const notFound = error instanceof ResetError && error.code === "codexNotFound";
    return {
      provider: "codex",
      status: notFound ? "unsupported" : "error",
      message: errorMessage(error),
      total: 0,
      options: [],
    };
  }
}

export async function useCodexReset(
  creditId: string | null,
  requestId: string,
): Promise<ResetOutcome> {
  const response = await withAppServer((request) =>
    request("account/rateLimitResetCredit/consume", {
      idempotencyKey: requestId,
      ...(creditId ? { creditId } : {}),
    }),
  );
  const outcome = response?.outcome;
  if (outcome === "reset" || outcome === "nothingToReset" || outcome === "noCredit" || outcome === "alreadyRedeemed") {
    return outcome;
  }
  throw new Error(`Codex answered an unknown outcome: ${String(outcome)}`);
}
