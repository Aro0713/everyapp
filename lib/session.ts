import type { NextApiRequest } from "next";
import crypto from "crypto";

const COOKIE_NAME = "sid";

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing AUTH_SECRET in environment");
  return s;
}

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sign(payload: object) {
  const secret = getSecret();
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function verify(token: string) {
  const secret = getSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  if (sig !== expected) return null;

  try {
    const json = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return json;
  } catch {
    return null;
  }
}

export function setSessionCookie(userId: string) {
  const token = sign({ userId, iat: Date.now() });
  // HttpOnly + Secure + SameSite=Lax => podstawowy bezpieczny wariant
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600; Secure`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export function getUserIdFromRequest(req: NextApiRequest): string | null {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;

  const token = decodeURIComponent(m[1]);
  const data = verify(token);
  return typeof data?.userId === "string" ? data.userId : null;
}
