import {
  type PluginClientContext,
  type PluginSidebarItemProps,
  useTranslation,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { messages } from "./client/messages";
import { ResetsPopover } from "./client/ResetsPopover";
import { useResets } from "./client/useResets";

function ResetsSidebarItem({ openPopover }: PluginSidebarItemProps) {
  const { t } = useTranslation(messages);
  const resets = useResets();
  const counts = (resets.data?.accounts ?? [])
    .filter((account) => account.status === "ok")
    .map((account) => `${t(`providers.${account.provider}`)} ${account.total}`);
  return (
    <SidebarRow
      icon="RotateCcw"
      label={[t("title"), ...counts].join(" · ")}
      onPress={() => openPopover(ResetsPopover)}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addSidebarFooterItem({
    id: "resets",
    title: messages.message("title"),
    Component: ResetsSidebarItem,
  });
  return () => {};
}
