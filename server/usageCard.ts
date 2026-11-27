import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { UsageDetail } from "@getpaseo/plugin/server/usage";
import { z } from "zod";
import { KIND_LABELS } from "../shared/labels";
import type { ResetAccount } from "../shared/resets";
import { listAccounts } from "./accounts";

// The daemon does not know the app's language, so the card follows the machine's locale.
const LOCALE = Intl.DateTimeFormat().resolvedOptions().locale || "en";
const LANG = LOCALE.toLowerCase().startsWith("es") ? "es" : "en";

const TEXT = {
  en: {
    providers: { codex: "Codex", claude: "Claude" },
    none: "None banked",
    unavailable: "Unavailable",
    expires: (date: string) => `expires ${date}`,
  },
  es: {
    providers: { codex: "Codex", claude: "Claude" },
    none: "Ninguno guardado",
    unavailable: "No disponible",
    expires: (date: string) => `caduca el ${date}`,
  },
}[LANG];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

export function resetDetails(accounts: ResetAccount[]): UsageDetail[] {
  return accounts.flatMap((account): UsageDetail[] => {
    const provider = TEXT.providers[account.provider];
    if (account.status !== "ok") {
      return [{ id: account.provider, label: provider, value: TEXT.unavailable, tone: "warning" }];
    }
    if (account.options.length === 0) {
      return [{ id: account.provider, label: provider, value: TEXT.none }];
    }
    return account.options.map((option) => ({
      id: `${account.provider}-${option.kind}-${option.creditId ?? "next"}`,
      label: `${provider} · ${KIND_LABELS[LANG][option.kind]}`,
      value: [String(option.count), option.expiresAt ? TEXT.expires(formatDate(option.expiresAt)) : null]
        .filter(Boolean)
        .join(" · "),
    }));
  });
}

/** A "Resets" card in Paseo's own Usage window. Using a reset happens in the plugin's popover. */
export function registerResetsUsageCard(server: PluginServerContext) {
  server.registerUsageSource({
    id: "resets",
    label: "Resets",
    providers: ["codex", "claude"],
    input: z.object({}),
    // Resets belong to the machine's logins, not to one agent session.
    async discover(scope) {
      return scope.kind === "global" ? [{ key: "banked-resets", input: {} }] : [];
    },
    async fetch() {
      const accounts = await listAccounts();
      return { status: "available", windows: [], details: resetDetails(accounts) };
    },
  });
}
