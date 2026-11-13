/**
 * Minimal typings for the parts of Cloudflare D1 this package uses.
 *
 * They are structurally compatible with `@cloudflare/workers-types`
 * (and with real Workers bindings), so this package does not force
 * that dependency on consumers.
 *
 * @module
 */

/** Metadata returned by a D1 statement execution. */
export interface D1Meta {
  last_row_id?: number;
  changes?: number;
}

/** A prepared D1 statement. */
export interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  run(): Promise<{
    success: boolean;
    meta: D1Meta;
    results: Record<string, unknown>[];
  }>;
}

/** The subset of {@link https://developers.cloudflare.com/d1/ | Cloudflare D1} this package needs. */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

/**
 * Environment bindings required by the app.
 * Bind `DB` to a Cloudflare D1 database and keep `ADMIN_PASSWORD` in a secret.
 */
export interface GuestbookBindings {
  DB: D1Database;
  ADMIN_PASSWORD: string;
}

/** Hono environment for {@link GuestbookBindings}. */
export type GuestbookEnv = {
  Bindings: GuestbookBindings;
};
