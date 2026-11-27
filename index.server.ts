import type { PluginServerContext } from "@getpaseo/plugin/server";
import { invalidateAccount, listAccounts } from "./server/accounts";
import { useClaudeReset } from "./server/claude";
import { useCodexReset } from "./server/codex";
import { registerResetsUsageCard } from "./server/usageCard";
import { listResetsRpc, useResetRpc } from "./shared/resets";

export default function contribute(server: PluginServerContext) {
  server.handle(listResetsRpc, async () => ({ accounts: await listAccounts() }));

  server.handle(useResetRpc, async ({ provider, creditId, requestId }) => {
    try {
      const outcome =
        provider === "codex"
          ? await useCodexReset(creditId, requestId)
          : await useClaudeReset(creditId ?? "", requestId);
      console.log(`[resets] ${provider} reset attempt ${requestId}: ${outcome}`);
      return { outcome };
    } finally {
      invalidateAccount(provider);
    }
  });

  registerResetsUsageCard(server);

  return () => {};
}
