// middleware.ts (w root projektu)
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LANG, isLangKey } from "./src/utils/i18n";

// Mapowanie kraju -> język (minimum sensu, bez “Poland -> Klingon”)
const COUNTRY_TO_LANG: Record<string, string> = {
  PL: "pl",
  DE: "de",
  FR: "fr",
  ES: "es",
  IT: "it",
  PT: "pt",
  NL: "nl",
  SE: "sv",
  FI: "fi",
  DK: "da",
  CZ: "cs",
  SK: "sk",
  RO: "ro",
  BG: "bg",
  HR: "hr",
  HU: "hu",
  GR: "el",
  IE: "en", // ga możesz wymusić ręcznie, ale domyślnie zwykle en
  AT: "de",
  BE: "nl",
  LU: "fr",
  SI: "sl",
  EE: "et",
  LV: "lv",
  LT: "lt",
  MT: "mt",
};

function pickFromAcceptLanguage(header: string | null) {
  if (!header) return null;
  // przykład: "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7"
  const first = header.split(",")[0]?.trim()?.toLowerCase(); // pl-pl
  const base = first?.split("-")[0]; // pl
  return base || null;
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const cookieLang = req.cookies.get("lang")?.value;
  if (isLangKey(cookieLang)) return res;

  const geo = (req as any).geo as { country?: string } | undefined;
    const country = geo?.country;

  const geoLang = country ? COUNTRY_TO_LANG[country] : null;

  const acceptLang = pickFromAcceptLanguage(req.headers.get("accept-language"));

  const chosen =
    (isLangKey(geoLang) && geoLang) ||
    (isLangKey(acceptLang) && acceptLang) ||
    DEFAULT_LANG;

  res.cookies.set("lang", chosen, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 rok
  });

  return res;
}

// Middleware tylko na strony (nie na /api, nie na pliki statyczne)
export const config = {
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|sitemap.xml).*)"],
};
