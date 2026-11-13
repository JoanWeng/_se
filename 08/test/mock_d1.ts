/**
 * In-memory D1Database mock covering exactly the SQL statements the
 * message-board app issues (see test/app_test.ts). NOT a general SQLite.
 *
 * Implements SQLite-compatible behaviors the app relies on:
 * - `datetime('now', '-N minutes')` window comparisons (UTC strings)
 * - AUTOINCREMENT ids that are never reused
 * - `INSERT OR IGNORE` on the banned primary key
 * - affected-row counts in `meta.changes`
 *
 * @module
 */

// The interface mandates async methods, but the mock executes synchronously.
// deno-lint-ignore-file require-await

import type { D1Database, D1Meta, D1PreparedStatement } from "../src/types.ts";


interface MessageRow {
  id: number;
  name: string;
  content: string;
  password: string;
  ip: string;
  created_at: string;
}

function utcNow(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function toMs(sqlDate: string): number {
  return Date.parse(sqlDate.replace(" ", "T") + "Z");
}

export class MockD1 implements D1Database {
  messages: MessageRow[] = [];
  banned = new Map<string, { reason: string; created_at: string }>();
  adminAttempts: { ip: string; created_at: string }[] = [];
  nextId = 1;

  prepare(sql: string): D1PreparedStatement {
    const normalized = sql.replace(/\s+/g, " ").trim();

    const exec = (
      params: (string | number | null)[],
    ): { meta: D1Meta; results: Record<string, unknown>[] } => {
      const p = (i: number) => params[i - 1];

      let m: RegExpMatchArray | null;

      m = normalized.match(/^SELECT 1 AS ok FROM banned WHERE ip = \?1$/);
      if (m) {
        return {
          meta: {},
          results: this.banned.has(String(p(1))) ? [{ ok: 1 }] : [],
        };
      }

      m = normalized.match(
        /^SELECT COUNT\(\*\) AS n FROM admin_attempts WHERE ip = \?1 AND created_at > datetime\('now', '-(\d+) minutes'\)$/,
      );
      if (m) {
        const cutoff = Date.now() - Number(m[1]) * 60_000;
        const n = this.adminAttempts.filter(
          (a) => a.ip === String(p(1)) && toMs(a.created_at) > cutoff,
        ).length;
        return { meta: {}, results: [{ n }] };
      }

      m = normalized.match(
        /^INSERT INTO admin_attempts \(ip\) VALUES \(\?1\)$/,
      );
      if (m) {
        this.adminAttempts.push({ ip: String(p(1)), created_at: utcNow() });
        return { meta: { changes: 1 }, results: [] };
      }

      m = normalized.match(/^SELECT COUNT\(\*\) AS n FROM messages$/);
      if (m) {
        return { meta: {}, results: [{ n: this.messages.length }] };
      }

      m = normalized.match(
        /^SELECT COUNT\(\*\) AS n FROM messages WHERE ip = \?1 AND created_at > datetime\('now', '-(\d+) minutes'\)$/,
      );
      if (m) {
        const cutoff = Date.now() - Number(m[1]) * 60_000;
        const n = this.messages.filter(
          (r) => r.ip === String(p(1)) && toMs(r.created_at) > cutoff,
        ).length;
        return { meta: {}, results: [{ n }] };
      }

      m = normalized.match(
        /^SELECT id, name, content, (ip, )?created_at FROM messages ORDER BY created_at DESC, id DESC LIMIT \?1 OFFSET \?2$/,
      );
      if (m) {
        const withIp = m[1] !== undefined;
        const limit = Number(p(1));
        const offset = Number(p(2));
        const sorted = [...this.messages].sort(
          (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
        );
        const rows = sorted
          .slice(offset, offset + limit)
          .map((r) =>
            withIp
              ? {
                id: r.id,
                name: r.name,
                content: r.content,
                ip: r.ip,
                created_at: r.created_at,
              }
              : {
                id: r.id,
                name: r.name,
                content: r.content,
                created_at: r.created_at,
              }
          );
        return { meta: {}, results: rows };
      }

      m = normalized.match(/^DELETE FROM messages WHERE id = \?1$/);
      if (m) {
        const id = Number(p(1));
        const before = this.messages.length;
        this.messages = this.messages.filter((r) => r.id !== id);
        const changes = before - this.messages.length;
        return { meta: { changes }, results: [] };
      }

      m = normalized.match(
        /^SELECT ip, reason, created_at FROM banned ORDER BY created_at DESC, ip$/,
      );
      if (m) {
        const rows = [...this.banned.entries()]
          .sort((a, b) =>
            b[1].created_at.localeCompare(a[1].created_at) ||
            b[0].localeCompare(a[0])
          )
          .map(([ip, v]) => ({
            ip,
            reason: v.reason,
            created_at: v.created_at,
          }));
        return { meta: {}, results: rows };
      }

      m = normalized.match(
        /^INSERT OR IGNORE INTO banned \(ip, reason\) VALUES \(\?1, \?2\)$/,
      );
      if (m) {
        const ip = String(p(1));
        if (!this.banned.has(ip)) {
          this.banned.set(ip, { reason: String(p(2)), created_at: utcNow() });
          return { meta: { changes: 1 }, results: [] };
        }
        return { meta: { changes: 0 }, results: [] };
      }

      m = normalized.match(/^DELETE FROM banned WHERE ip = \?1$/);
      if (m) {
        const changes = this.banned.delete(String(p(1))) ? 1 : 0;
        return { meta: { changes }, results: [] };
      }

      m = normalized.match(
        /^INSERT INTO messages \(name, content, password, ip\) VALUES \(\?1, \?2, \?3, \?4\)$/,
      );
      if (m) {
        const id = this.nextId++;
        this.messages.push({
          id,
          name: String(p(1)),
          content: String(p(2)),
          password: String(p(3)),
          ip: String(p(4)),
          created_at: utcNow(),
        });
        return { meta: { changes: 1, last_row_id: id }, results: [] };
      }

      m = normalized.match(/^SELECT password FROM messages WHERE id = \?1$/);
      if (m) {
        const row = this.messages.find((r) => r.id === Number(p(1)));
        return { meta: {}, results: row ? [{ password: row.password }] : [] };
      }

      throw new Error(`MockD1: unsupported SQL: ${normalized}`);
    };

    const statement: D1PreparedStatement = {
      bind(...values) {
        const captured = values;
        return {
          ...statement,
          bind: statement.bind,
          async first<T = Record<string, unknown>>(
            column?: string,
          ): Promise<T | null> {
            const { results } = exec(captured);
            const row = results[0];
            if (!row) return null;
            return (column ? row[column] : row) as T;
          },
          run: async () => {
            const { meta, results } = exec(captured);
            return { success: true, meta, results };
          },
        };
      },
      async first<T = Record<string, unknown>>(column?: string) {
        const { results } = exec([]);
        const row = results[0];
        if (!row) return null;
        return (column ? row[column] : row) as T;
      },
      run: async () => {
        const { meta, results } = exec([]);
        return { success: true, meta, results };
      },
    };
    return statement;
  }
}
