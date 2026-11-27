import { useRpc, useTranslation } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { ERROR_CODES, type ErrorCode, listResetsRpc } from "../shared/resets";
import { messages } from "./messages";

export const RESETS_QUERY_KEY = ["paseo-reset-credits", "list"] as const;

export function useResets() {
  const list = useRpc(listResetsRpc);
  return useQuery({
    queryKey: RESETS_QUERY_KEY,
    queryFn: () => list({}),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** "4d 7h", "5h 20m" or "12m". */
export function formatTimeLeft(iso: string, nowMs = Date.now()): string {
  const minutes = Math.max(0, Math.round((Date.parse(iso) - nowMs) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function useErrorText() {
  const { t } = useTranslation(messages);
  return (message: string | null | undefined): string => {
    if (!message) return "";
    const code = ERROR_CODES.find((known) => message.includes(known)) as ErrorCode | undefined;
    return code ? t(`errors.${code}`) : t("errors.generic", { message });
  };
}
