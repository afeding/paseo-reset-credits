import type { ResetKind } from "./resets";

/** Reset names, shared by the app UI and the daemon's Usage card. */
export const KIND_LABELS = {
  en: {
    full: "Full reset",
    weekly: "Weekly reset",
    session: "5-hour reset",
    fable: "Fable reset",
    other: "Reset",
  },
  es: {
    full: "Reset completo",
    weekly: "Reset semanal",
    session: "Reset de 5 h",
    fable: "Reset de Fable",
    other: "Reset",
  },
} as const satisfies Record<string, Record<ResetKind, string>>;
