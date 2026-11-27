import { type PluginPopoverProps, useRpc, useTranslation } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { type ResetAccount, type ResetOption, useResetRpc } from "../shared/resets";
import { messages } from "./messages";
import { RESETS_QUERY_KEY, formatTimeLeft, useErrorText, useResets } from "./useResets";

type Theme = PluginPopoverProps["theme"];

interface Pending {
  key: string;
  account: ResetAccount;
  option: ResetOption;
  /** Kept across retries of this attempt, so a retry can never spend a second reset. */
  requestId: string;
}

const newRequestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function makeStyles(theme: Theme, compact: boolean) {
  const { colors } = theme;
  const button = {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  };
  return {
    root: { padding: compact ? 16 : 14, gap: 14, minWidth: compact ? undefined : 340 },
    header: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },
    title: { color: colors.foreground, fontSize: 15, fontWeight: "600" as const },
    provider: { gap: 6 },
    providerHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const },
    providerName: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const, textTransform: "uppercase" as const },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      padding: 10,
      borderRadius: 8,
      backgroundColor: colors.surface1,
    },
    rowText: { flex: 1, gap: 2 },
    kind: { color: colors.foreground, fontSize: 14, fontWeight: "500" as const },
    meta: { color: colors.foregroundMuted, fontSize: 12 },
    muted: { color: colors.foregroundMuted, fontSize: 13 },
    warning: { color: colors.statusWarning, fontSize: 13 },
    button,
    buttonText: { color: colors.foreground, fontSize: 13, fontWeight: "500" as const },
    primary: { ...button, borderColor: colors.accent, backgroundColor: colors.accent },
    primaryText: { color: colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
    confirm: { gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.accent },
    confirmActions: { flexDirection: "row" as const, justifyContent: "flex-end" as const, gap: 8 },
  };
}

export function ResetsPopover({ theme, layout }: PluginPopoverProps) {
  const { t } = useTranslation(messages);
  const errorText = useErrorText();
  const toast = useToast();
  const queryClient = useQueryClient();
  const resets = useResets();
  const useReset = useRpc(useResetRpc);
  const [pending, setPending] = useState<Pending | null>(null);
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);

  const redeem = useMutation({
    mutationFn: (attempt: Pending) =>
      useReset({
        provider: attempt.account.provider,
        creditId: attempt.option.creditId,
        requestId: attempt.requestId,
      }),
    onSuccess: ({ outcome }, attempt) => {
      const provider = t(`providers.${attempt.account.provider}`);
      const text = t(`outcomes.${outcome}`, { provider });
      if (outcome === "reset") toast.show(text, { variant: "success" });
      else toast.show(text, { variant: "warning" });
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: RESETS_QUERY_KEY });
    },
    // Keep `pending` (and its request id) so "Use reset" retries the same attempt.
    onError: (error) => toast.error(errorText(error instanceof Error ? error.message : String(error))),
  });

  const kindLabel = (option: ResetOption) =>
    option.kind === "other" && option.title ? option.title : t(`kinds.${option.kind}`);
  const helpText = (account: ResetAccount, option: ResetOption) =>
    account.provider === "codex" && option.kind === "full" ? t("help.codex") : t(`help.${option.kind}`);

  const renderOption = (account: ResetAccount, option: ResetOption) => {
    const key = `${account.provider}:${option.kind}:${option.title ?? ""}`;
    const meta = [
      t("available", { count: option.count }),
      option.expiresAt ? t("expires", { time: formatTimeLeft(option.expiresAt) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const isPending = pending?.key === key;
    return (
      <View key={key} style={{ gap: 6 }}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.kind}>{kindLabel(option)}</Text>
            <Text style={styles.meta}>{meta}</Text>
            {helpText(account, option) ? <Text style={styles.meta}>{helpText(account, option)}</Text> : null}
          </View>
          {isPending ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("use")} ${kindLabel(option)} ${t(`providers.${account.provider}`)}`}
              style={styles.button}
              disabled={redeem.isPending}
              onPress={() => setPending({ key, account, option, requestId: newRequestId() })}
            >
              <Text style={styles.buttonText}>{t("use")}</Text>
            </Pressable>
          )}
        </View>
        {isPending ? (
          <View style={styles.confirm}>
            <Text style={styles.muted}>
              {t("confirm", { kind: kindLabel(option), provider: t(`providers.${account.provider}`) })}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                disabled={redeem.isPending}
                onPress={() => setPending(null)}
              >
                <Text style={styles.buttonText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.primary}
                disabled={redeem.isPending}
                onPress={() => redeem.mutate(pending)}
              >
                <Text style={styles.primaryText}>{redeem.isPending ? t("using") : t("useNow")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderAccount = (account: ResetAccount) => (
    <View key={account.provider} style={styles.provider}>
      <View style={styles.providerHeader}>
        <Text style={styles.providerName}>{t(`providers.${account.provider}`)}</Text>
        {account.status === "ok" ? <Text style={styles.providerName}>{account.total}</Text> : null}
      </View>
      {account.status !== "ok" ? (
        <Text style={styles.warning}>{errorText(account.message)}</Text>
      ) : account.options.length === 0 ? (
        <Text style={styles.muted}>{t("none")}</Text>
      ) : (
        account.options.map((option) => renderOption(account, option))
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("title")}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("refresh")}
          disabled={resets.isFetching}
          onPress={() => void resets.refetch()}
        >
          {resets.isFetching ? (
            <ActivityIndicator size="small" color={theme.colors.foregroundMuted} />
          ) : (
            <Icon name="RefreshCw" size={16} color={theme.colors.foregroundMuted} />
          )}
        </Pressable>
      </View>
      {resets.data ? (
        resets.data.accounts.map(renderAccount)
      ) : resets.error ? (
        <Text style={styles.warning}>{errorText(resets.error.message)}</Text>
      ) : (
        <Text style={styles.muted}>{t("loading")}</Text>
      )}
    </View>
  );
}
