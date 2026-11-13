/**
 * The D1 schema this package expects, as a single SQL string
 * (identical to `schema.sql` in the package directory).
 *
 * @example
 * ```ts
 * // In a Worker: create the tables once.
 * await env.DB.exec(SCHEMA_SQL);
 *
 * // Or run it from the CLI instead:
 * // deno run -A npm:wrangler d1 execute guestbook --file=schema.sql
 * ```
 *
 * @module
 */

export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  password    TEXT    NOT NULL,
  ip          TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS banned (
  ip          TEXT    PRIMARY KEY,
  reason      TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_attempts (
  ip          TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;
