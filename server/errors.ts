import type { ErrorCode } from "../shared/resets";

/** An error whose message is a code the client translates. */
export class ResetError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
