/**
 * `@nqucsie111310512/message-board` — a self-contained message-board
 * (guestbook) backend for Cloudflare Workers + D1, built with Hono.
 *
 * Ported from the original `se07-guestbook` Worker; all HTTP paths and
 * behaviors are identical, with tunable limits.
 *
 * @example Minimal Cloudflare Worker
 * ```ts
 * import { createGuestbookApp } from "jsr:@nqucsie111310512/message-board@1";
 *
 * export default createGuestbookApp();
 * ```
 *
 * @example Initialize the database
 * ```ts
 * import { SCHEMA_SQL } from "jsr:@nqucsie111310512/message-board@1";
 *
 * await env.DB.exec(SCHEMA_SQL);
 * ```
 *
 * @module
 */

export { createGuestbookApp } from "./app.ts";
export { DEFAULT_OPTIONS, type GuestbookOptions } from "./options.ts";
export { SCHEMA_SQL } from "./schema.ts";
export type {
  D1Database,
  D1Meta,
  D1PreparedStatement,
  GuestbookBindings,
  GuestbookEnv,
} from "./types.ts";
