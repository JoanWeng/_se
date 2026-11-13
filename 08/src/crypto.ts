/**
 * SHA-256 password hashing and HMAC-SHA256 admin token helpers
 * (Web Crypto, available in Cloudflare Workers and Deno).
 *
 * @module
 */

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 hash a password, hex encoded.
 *
 * @example
 * ```ts
 * const hashed = await hashPassword("s3cret");
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(password),
  );
  return hex(digest);
}

async function adminHmac(
  adminPassword: string,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(adminPassword),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return hex(sig);
}

/**
 * Issue a signed admin token: `<expiry ms>.<hmac>`.
 * Tokens are valid for `ttlMs` milliseconds.
 *
 * @example
 * ```ts
 * const token = await issueAdminToken(env.ADMIN_PASSWORD, 8 * 60 * 60 * 1000);
 * ```
 */
export async function issueAdminToken(
  adminPassword: string,
  ttlMs: number,
): Promise<string> {
  const exp = Date.now() + ttlMs;
  const sig = await adminHmac(adminPassword, `admin:${exp}`);
  return `${exp}.${sig}`;
}

/**
 * Verify a token issued by {@link issueAdminToken} for the same admin password.
 */
export async function verifyAdminToken(
  adminPassword: string,
  token: string,
): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await adminHmac(adminPassword, `admin:${exp}`);
  return token.slice(dot + 1) === expected;
}
