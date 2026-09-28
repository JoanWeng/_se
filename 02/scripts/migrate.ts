/**
 * 建立 migration 記錄表並套用所有尚未套用的 .sql。
 *   deno task db:migrate
 */
import { getDb, getDbPath } from "../lib/db.ts";
import { runMigrations } from "../lib/migrate.ts";

const db = getDb();
const executed = runMigrations(db);

console.log(`資料庫：${getDbPath()}`);
if (executed.length === 0) {
  console.log("schema 已是最新，沒有需要套用的 migration。");
} else {
  for (const name of executed) console.log(`已套用：${name}`);
}
