import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listClaudeResets, useClaudeReset } from "./server/claude";
import { listCodexResets, useCodexReset } from "./server/codex";
import { listResetsRpc, useResetRpc } from "./shared/resets";

export default function contribute(server: PluginServerContext) {
  server.handle(listResetsRpc, async () => ({
    accounts: await Promise.all([listCodexResets(), listClaudeResets()]),
  }));

  server.handle(useResetRpc, async ({ provider, creditId, requestId }) => {
    const outcome =
      provider === "codex"
        ? await useCodexReset(creditId, requestId)
        : await useClaudeReset(creditId ?? "", requestId);
    console.log(`[resets] ${provider} reset attempt ${requestId}: ${outcome}`);
    return { outcome };
  });

  return () => {};
}
