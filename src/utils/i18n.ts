import {
  SUPPORTED_LANGS,
  type LangKey,
  type TranslationKey,
  translations,
} from "@/utils/translations";

export const DEFAULT_LANG: LangKey = "pl";

export function isLangKey(v: unknown): v is LangKey {
  return typeof v === "string" && (SUPPORTED_LANGS as readonly string[]).includes(v);
}

export function t(
  lang: LangKey,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const entry = translations[key];

  if (!entry) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] Missing translation key: ${String(key)}`);
    }
    return String(key);
  }

  const raw = entry[lang] ?? entry[DEFAULT_LANG] ?? String(key);

  if (!vars) return raw;

  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
