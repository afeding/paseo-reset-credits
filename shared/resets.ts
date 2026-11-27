import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const resetProviderSchema = z.enum(["codex", "claude"]);
export type ResetProvider = z.infer<typeof resetProviderSchema>;

/** What a reset refills. Claude has several kinds; Codex currently grants only full resets. */
export const resetKindSchema = z.enum(["full", "session", "weekly", "fable", "other"]);
export type ResetKind = z.infer<typeof resetKindSchema>;

export const resetOptionSchema = z.object({
  /** Credit to redeem. Null lets the provider pick the next one. */
  creditId: z.string().nullable(),
  kind: resetKindSchema,
  /** The provider's own name for the reset, shown for kinds we do not know. */
  title: z.string().nullable(),
  count: z.number().int().nonnegative(),
  /** Soonest expiry in this group, ISO 8601. */
  expiresAt: z.string().nullable(),
});
export type ResetOption = z.infer<typeof resetOptionSchema>;

export const resetAccountSchema = z.object({
  provider: resetProviderSchema,
  status: z.enum(["ok", "signedOut", "unsupported", "error"]),
  /** An error code from ERROR_CODES, or the raw error text. */
  message: z.string().nullable(),
  total: z.number().int().nonnegative(),
  options: z.array(resetOptionSchema),
});
export type ResetAccount = z.infer<typeof resetAccountSchema>;

export const resetOutcomeSchema = z.enum(["reset", "nothingToReset", "noCredit", "alreadyRedeemed"]);
export type ResetOutcome = z.infer<typeof resetOutcomeSchema>;

/** Stable error codes the client translates. */
export const ERROR_CODES = [
  "codexNotFound",
  "codexTimeout",
  "claudeSignedOut",
  "claudeExpired",
  "claudeKeychain",
  "claudeRateLimited",
  "claudeCooldown",
  "claudeUnconfirmed",
  "claudeNoOrganization",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const listResetsRpc = defineRpc({
  name: "resets.list",
  input: z.object({}),
  output: z.object({ accounts: z.array(resetAccountSchema) }),
});

export const useResetRpc = defineRpc({
  name: "resets.use",
  input: z.object({
    provider: resetProviderSchema,
    creditId: z.string().nullable(),
    /** Idempotency key: retrying the same attempt reuses it, so a reset is never spent twice. */
    requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  }),
  output: z.object({ outcome: resetOutcomeSchema }),
});
