import type { ResetAccount, ResetProvider } from "../shared/resets";
import { listClaudeResets } from "./claude";
import { listCodexResets } from "./codex";

/**
 * Every client, the popover and the Usage card share one reading per provider. Claude's usage
 * endpoint rate limits hard, so a failed read keeps showing the last good one.
 */
function cachedAccount(load: () => Promise<ResetAccount>, ttlMs: number) {
  let last: { at: number; value: ResetAccount } | undefined;
  let lastGood: ResetAccount | undefined;
  let inflight: Promise<ResetAccount> | undefined;
  return {
    get(): Promise<ResetAccount> {
      if (last && Date.now() - last.at < ttlMs) return Promise.resolve(last.value);
      inflight ??= load()
        .then((value) => {
          if (value.status === "ok") lastGood = value;
          const shown = value.status === "error" && lastGood ? lastGood : value;
          last = { at: Date.now(), value: shown };
          return shown;
        })
        .finally(() => {
          inflight = undefined;
        });
      return inflight;
    },
    invalidate() {
      last = undefined;
    },
  };
}

const accounts: Record<ResetProvider, ReturnType<typeof cachedAccount>> = {
  codex: cachedAccount(listCodexResets, 60_000),
  claude: cachedAccount(listClaudeResets, 5 * 60_000),
};

export function listAccounts(): Promise<ResetAccount[]> {
  return Promise.all([accounts.codex.get(), accounts.claude.get()]);
}

/** After using a reset, the next read must ask the provider again. */
export function invalidateAccount(provider: ResetProvider) {
  accounts[provider].invalidate();
}
