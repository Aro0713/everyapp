// middleware.ts (ROOT)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_LANG = "en";
const EU_LANGS = new Set([
  "bg","hr","cs","da","nl","en","et","fi","fr","de","el","hu",
  "ga","it","lv","lt","mt","pl","pt","ro","sk","sl","es","sv",
]);

const COUNTRY_TO_LANG: Record<string, string> = {
  PL: "pl", DE: "de", FR: "fr", ES: "es", IT: "it", PT: "pt",
  NL: "nl", SE: "sv", FI: "fi", DK: "da", CZ: "cs", SK: "sk",
  RO: "ro", BG: "bg", HR: "hr", HU: "hu", GR: "el",
  IE: "en", AT: "de", BE: "nl", LU: "fr", SI: "sl",
  EE: "et", LV: "lv", LT: "lt", MT: "mt",
};

function pickFromAcceptLanguage(header: string | null) {
  if (!header) return null;
  const base = header.split(",")[0]?.trim().toLowerCase().split("-")[0];
  return EU_LANGS.has(base) ? base : null;
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const cookieLang = req.cookies.get("lang")?.value;
  if (cookieLang && EU_LANGS.has(cookieLang)) return res;

  const geoCountry = (req as any).geo?.country;
  const geoLang = geoCountry ? COUNTRY_TO_LANG[geoCountry] : null;

  const acceptLang = pickFromAcceptLanguage(
    req.headers.get("accept-language")
  );

  const chosen =
    (geoLang && EU_LANGS.has(geoLang) && geoLang) ||
    acceptLang ||
    DEFAULT_LANG;

  res.cookies.set("lang", chosen, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return res;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
