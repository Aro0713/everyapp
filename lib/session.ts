import type { NextApiRequest } from "next";
import crypto from "crypto";

const COOKIE_NAME = "sid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 dni

function getSecret() {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("Missing AUTH_SECRET (or NEXTAUTH_SECRET) in environment");
  return s;
}

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlToBuffer(input: string) {
  // pad base64 and convert base64url -> base64
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function sign(payload: object) {
  const secret = getSecret();
  const body = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verify(token: string) {
  const secret = getSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = base64url(crypto.createHmac("sha256", secret).update(body).digest());
  if (!safeEqual(sig, expected)) return null;

  try {
    const json = JSON.parse(base64urlToBuffer(body).toString("utf8"));
    return json;
  } catch {
    return null;
  }
}

function isHttps(req?: NextApiRequest) {
  // Vercel / reverse proxies
  const xfProto = req?.headers["x-forwarded-proto"];
  if (typeof xfProto === "string" && xfProto.toLowerCase().includes("https")) return true;
  return process.env.NODE_ENV === "production";
}

function parseCookies(cookieHeader: string) {
  const out: Record<string, string> = {};
  cookieHeader.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  });
  return out;
}

export function setSessionCookie(userId: string, req?: NextApiRequest) {
  const token = sign({ userId, iat: Math.floor(Date.now() / 1000) });

  const secure = isHttps(req);
  // HttpOnly + SameSite=Lax => OK dla klasycznego SSR/Next
  // Secure tylko gdy https (prod / vercel)
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookie(req?: NextApiRequest) {
  const secure = isHttps(req);
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function getUserIdFromRequest(req: NextApiRequest): string | null {
  const cookieHeader = req.headers.cookie || "";
  const cookies = parseCookies(cookieHeader);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return null;

  const token = decodeURIComponent(raw);
  const data = verify(token);
  return typeof data?.userId === "string" ? data.userId : null;
}
