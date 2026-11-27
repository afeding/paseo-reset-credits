import type { ResetKind, ResetOption } from "../shared/resets";

export interface Credit {
  id: string;
  kind: ResetKind;
  title: string | null;
  count: number;
  /** Epoch milliseconds, or null when it never expires. */
  expiresAtMs: number | null;
}

const KIND_ORDER: ResetKind[] = ["full", "weekly", "session", "fable", "other"];

/**
 * One option per kind (and title, for unknown kinds). Each option redeems the credit that
 * expires first, so using a reset never lets another one go to waste.
 */
export function groupCredits(credits: Credit[]): ResetOption[] {
  const groups = new Map<string, Credit[]>();
  for (const credit of credits) {
    if (credit.count <= 0) continue;
    const key = credit.kind === "other" ? `other:${credit.title ?? ""}` : credit.kind;
    groups.set(key, [...(groups.get(key) ?? []), credit]);
  }
  return [...groups.values()]
    .map((group): ResetOption => {
      const sorted = [...group].sort(
        (a, b) => (a.expiresAtMs ?? Infinity) - (b.expiresAtMs ?? Infinity),
      );
      const first = sorted[0]!;
      return {
        creditId: first.id,
        kind: first.kind,
        title: first.title,
        count: group.reduce((sum, credit) => sum + credit.count, 0),
        expiresAt: first.expiresAtMs === null ? null : new Date(first.expiresAtMs).toISOString(),
      };
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
