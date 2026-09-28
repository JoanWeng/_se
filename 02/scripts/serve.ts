/**
 * Production 啟動器。
 *
 * 為什麼不直接 `deno serve -A _fresh/server.js`？
 * 因為 `deno task start --port 9000` 會把參數接在腳本路徑「後面」，
 * `deno serve` 只認腳本路徑「前面」的 flag，於是 port 會被安靜地忽略。
 * 這裡自己包一層，就能用環境變數控制 port：
 *
 *   deno task build && deno task start
 *   PORT=9000 deno task start        （PowerShell: $env:PORT=9000; deno task start）
 */
import handler from "../_fresh/server.js";

const port = Number(Deno.env.get("PORT") ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT 不是有效的連接埠：${Deno.env.get("PORT")}`);
  Deno.exit(1);
}

const hostname = Deno.env.get("HOST") ?? "127.0.0.1";

// 建置產物 export 出來的 fetch 簽章是 (req, conn?)，
// 跟 Deno.serve 要求的 (request, conn) 不完全一致，中間包一層。
const fetchHandler: Deno.ServeHandler = (request) => handler.fetch(request);

Deno.serve({ port, hostname }, fetchHandler);
console.log(`校務系統已啟動：http://${hostname}:${port}/`);
