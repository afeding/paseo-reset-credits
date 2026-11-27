import type { PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./client/messages";
import { ResetsChips } from "./client/ResetsChips";

export default function contribute(client: PluginClientContext) {
  client.addSidebarFooterItem({
    id: "resets",
    title: messages.message("title"),
    Component: ResetsChips,
  });
  return () => {};
}
