/**
 * Tunable limits for {@link ./app.ts | createGuestbookApp}.
 *
 * @module
 */

/** Options accepted by `createGuestbookApp`. Every field is optional. */
export interface GuestbookOptions {
  /** Messages per page (default 20, as in the original guestbook). */
  pageSize?: number;
  /** Maximum nickname length (default 20). */
  nameMax?: number;
  /** Maximum message length (default 500). */
  contentMax?: number;
  /** Minimum delete-password length (default 4). */
  passwordMin?: number;
  /** Maximum delete-password length (default 64). */
  passwordMax?: number;
  /** Rate-limit window in minutes (default 5). */
  rateLimitWindowMinutes?: number;
  /** Messages an IP may post within the window (default 5). */
  rateLimitMax?: number;
  /** Admin login failure window in minutes (default 15). */
  adminAttemptWindowMinutes?: number;
  /** Failed admin logins within the window before lockout (default 10). */
  adminAttemptMax?: number;
  /** Admin token lifetime in milliseconds (default 8 hours). */
  tokenTtlMs?: number;
}

/** Default values for {@link GuestbookOptions}, matching the original project. */
export const DEFAULT_OPTIONS: Required<GuestbookOptions> = {
  pageSize: 20,
  nameMax: 20,
  contentMax: 500,
  passwordMin: 4,
  passwordMax: 64,
  rateLimitWindowMinutes: 5,
  rateLimitMax: 5,
  adminAttemptWindowMinutes: 15,
  adminAttemptMax: 10,
  tokenTtlMs: 8 * 60 * 60 * 1000,
};

export function resolveOptions(
  options?: GuestbookOptions,
): Required<GuestbookOptions> {
  return { ...DEFAULT_OPTIONS, ...options };
}
