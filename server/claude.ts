import { execCommand } from "@getpaseo/plugin/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResetAccount, ResetKind, ResetOutcome } from "../shared/resets";
import { ResetError, errorMessage } from "./errors";
import { type Credit, groupCredits } from "./group";

// Claude Code's own endpoints, as used by T3 Code. They are not publicly documented.
const API = "https://api.anthropic.com";
const PROGRAM = "cedar_ember";
const FALLBACK_VERSION = "2.1.0";
const TIMEOUT_MS = 15_000;

interface OauthCredentials {
  accessToken?: string;
  expiresAt?: number;
}

function customConfigDir(): string | undefined {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || undefined;
}

function configDir(): string {
  return customConfigDir() ?? path.join(os.homedir(), ".claude");
}

async function readJsonFile(file: string): Promise<any | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Claude Code keeps macOS logins in the Keychain, one entry per config directory. */
async function readKeychainCredentials(): Promise<OauthCredentials | undefined> {
  const dir = customConfigDir();
  const service = dir
    ? `Claude Code-credentials-${createHash("sha256").update(dir).digest("hex").slice(0, 8)}`
    : "Claude Code-credentials";
  try {
    const { stdout } = await execCommand(
      "security",
      ["find-generic-password", "-s", service, "-w"],
      { timeout: 10_000 },
    );
    return JSON.parse(stdout.trim())?.claudeAiOauth;
  } catch {
    return undefined;
  }
}

async function readCredentials(): Promise<OauthCredentials> {
  if (process.platform === "darwin") {
    const fromKeychain = await readKeychainCredentials();
    if (fromKeychain?.accessToken) return fromKeychain;
  }
  const file = await readJsonFile(path.join(configDir(), ".credentials.json"));
  const oauth: OauthCredentials | undefined = file?.claudeAiOauth;
  if (oauth?.accessToken) return oauth;
  throw new ResetError(process.platform === "darwin" ? "claudeKeychain" : "claudeSignedOut");
}

async function readAccessToken(): Promise<string> {
  const credentials = await readCredentials();
  if (typeof credentials.expiresAt === "number" && credentials.expiresAt <= Date.now()) {
    // Claude Code refreshes its own token; refreshing here would rotate it behind its back.
    throw new ResetError("claudeExpired");
  }
  return credentials.accessToken!.trim();
}

async function readOrganizationId(): Promise<string> {
  const dir = customConfigDir();
  const candidates = dir
    ? [path.join(dir, ".claude.json")]
    : [path.join(os.homedir(), ".claude.json"), path.join(configDir(), ".claude.json")];
  for (const file of candidates) {
    const id = (await readJsonFile(file).catch(() => undefined))?.oauthAccount?.organizationUuid;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  throw new ResetError("claudeNoOrganization");
}

let cachedVersion: Promise<string> | undefined;
function claudeVersion(): Promise<string> {
  cachedVersion ??= execCommand("claude", ["--version"], { timeout: 10_000 })
    .then(({ stdout }) => stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? FALLBACK_VERSION)
    .catch(() => FALLBACK_VERSION);
  return cachedVersion;
}

async function claudeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await readAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const response = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "user-agent": `claude-cli/${await claudeVersion()} (external, cli)`,
    },
  }).finally(() => clearTimeout(timer));
  if (response.status === 401 || response.status === 403) throw new ResetError("claudeSignedOut");
  if (response.status === 429) throw new ResetError("claudeRateLimited");
  if (!response.ok) throw new Error(`Claude answered HTTP ${response.status}`);
  return response;
}

interface Grant {
  id?: unknown;
  resets_left?: unknown;
  ends_at?: unknown;
  paused?: unknown;
  usable_now?: unknown;
  clears?: unknown;
  type?: unknown;
  gives_back_weekly?: unknown;
}

// Claude Code's own grouping: a grant that gives back weekly usage is a Fable reset, else its
// declared type, else what it clears.
function grantKind(grant: Grant): ResetKind {
  if (grant.gives_back_weekly === true) return "fable";
  if (grant.type === "session" || grant.type === "weekly" || grant.type === "full") {
    return grant.type;
  }
  const clears = Array.isArray(grant.clears) ? grant.clears : [];
  const session = clears.includes("five_hour");
  const other = clears.some((limit) => limit !== "five_hour");
  if (session && !other) return "session";
  if (other && !session) return "weekly";
  return "full";
}

export function claudeCredits(block: unknown, nowMs: number): Credit[] {
  const data = block as { eligible?: unknown; grants?: unknown } | null | undefined;
  if (!data || data.eligible !== true || !Array.isArray(data.grants)) return [];
  return (data.grants as Grant[]).flatMap((grant): Credit[] => {
    if (typeof grant.id !== "string" || !/^[a-z0-9_-]{1,40}$/.test(grant.id)) return [];
    if (typeof grant.resets_left !== "number" || grant.resets_left <= 0) return [];
    if (grant.paused === true || grant.usable_now !== true) return [];
    const endsAt = typeof grant.ends_at === "string" ? Date.parse(grant.ends_at) : null;
    if (endsAt !== null && !(endsAt > nowMs)) return [];
    return [
      { id: grant.id, kind: grantKind(grant), title: null, count: grant.resets_left, expiresAtMs: endsAt },
    ];
  });
}

export async function listClaudeResets(): Promise<ResetAccount> {
  try {
    const response = await claudeFetch(`${API}/api/oauth/usage?cedar_ember=1&skip_spend=1`);
    const body = (await response.json()) as { cedar_ember?: unknown };
    const options = groupCredits(claudeCredits(body.cedar_ember, Date.now()));
    const total = options.reduce((sum, option) => sum + option.count, 0);
    return { provider: "claude", status: "ok", message: null, total, options };
  } catch (error) {
    const signedOut =
      error instanceof ResetError &&
      ["claudeSignedOut", "claudeExpired", "claudeKeychain"].includes(error.code);
    return {
      provider: "claude",
      status: signedOut ? "signedOut" : "error",
      message: errorMessage(error),
      total: 0,
      options: [],
    };
  }
}

const OUTCOMES: Record<string, ResetOutcome> = {
  reset: "reset",
  not_limited: "nothingToReset",
  already_used: "alreadyRedeemed",
  ineligible: "noCredit",
};

export async function useClaudeReset(grantId: string, requestId: string): Promise<ResetOutcome> {
  if (!/^[a-z0-9_-]{1,40}$/.test(grantId)) throw new Error("Malformed Claude reset id");
  const organization = await readOrganizationId();
  const response = await claudeFetch(
    `${API}/api/organizations/${encodeURIComponent(organization)}/reset_rate_limits`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ program: PROGRAM, grant_id: grantId, request_id: requestId }),
    },
  );
  const { result } = (await response.json()) as { result?: string };
  if (result === "cooldown") throw new ResetError("claudeCooldown");
  const outcome = result ? OUTCOMES[result] : undefined;
  // "unavailable" or anything new: the claim may or may not have happened. Retrying with the
  // same request id is safe.
  if (!outcome) throw new ResetError("claudeUnconfirmed");
  return outcome;
}
