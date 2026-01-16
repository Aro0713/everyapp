// src/utils/i18n.ts
import { EU_LANGS, translations, type LangKey, type TranslationKey } from "./translations";

export const DEFAULT_LANG: LangKey = "en";

export function isLangKey(v: string | undefined | null): v is LangKey {
  return typeof v === "string" && (EU_LANGS as readonly string[]).includes(v);
}

export function t(
  lang: LangKey,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const raw = translations[key][lang] ?? translations[key][DEFAULT_LANG];

  if (!vars) return raw;

  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
