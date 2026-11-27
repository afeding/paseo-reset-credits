import { type PluginSidebarItemProps, useTranslation } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { ResetAccount } from "../shared/resets";
import { messages } from "./messages";
import { ResetsPopover } from "./ResetsPopover";
import { useResets } from "./useResets";

/** Days left as "4d", or hours as "7h" on the last day. */
function shortTimeLeft(iso: string): string {
  const hours = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d` : `${hours}h`;
}

function soonestExpiry(account: ResetAccount): string | null {
  const dates = account.options.flatMap((option) => (option.expiresAt ? [option.expiresAt] : []));
  return dates.sort()[0] ?? null;
}

/** Small chips in the sidebar footer: banked resets per account and when the next one expires. */
export function ResetsChips({ theme, openPopover }: PluginSidebarItemProps) {
  const { t } = useTranslation(messages);
  const resets = useResets();
  const styles = useMemo(
    () => ({
      row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
      chip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 5,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      text: { color: theme.colors.foreground, fontSize: 12 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
    }),
    [theme],
  );

  const accounts = (resets.data?.accounts ?? []).filter((account) => account.status === "ok");
  const open = () => openPopover(ResetsPopover);

  if (accounts.length === 0) {
    return (
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("title")} style={styles.chip} onPress={open}>
          <Icon name="Ticket" size={13} color={theme.colors.foregroundMuted} />
          <Text style={styles.muted}>{t("title")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {accounts.map((account) => {
        const provider = t(`providers.${account.provider}`);
        const expiry = soonestExpiry(account);
        return (
          <Pressable
            key={account.provider}
            accessibilityRole="button"
            accessibilityLabel={`${t("title")} ${provider}: ${t("available", { count: account.total })}${
              expiry ? `, ${t("expires", { time: shortTimeLeft(expiry) })}` : ""
            }`}
            style={styles.chip}
            onPress={open}
          >
            <Icon name="Ticket" size={13} color={theme.colors.foregroundMuted} />
            <Text style={styles.text}>
              {provider} {account.total}
            </Text>
            {expiry && account.total > 0 ? <Text style={styles.muted}>· {shortTimeLeft(expiry)}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
