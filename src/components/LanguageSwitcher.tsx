import { SUPPORTED_LANGS as EU_LANGS, type LangKey } from "@/utils/translations";

const LANG_LABEL: Record<LangKey, string> = {
  pl: "PL",
  en: "EN",
  de: "DE",
  cs: "CZ",
  sk: "SK",
  ua: "UA",
  lt: "LT",
  vi: "VI",
};

export default function LanguageSwitcher({
  currentLang,
}: {
  currentLang: LangKey;
}) {
  function setLang(lang: LangKey) {
    document.cookie = `lang=${lang}; path=/; max-age=31536000`;
    window.location.reload();
  }

  return (
    <div className="relative">
      <select
        value={currentLang}
        onChange={(e) => setLang(e.target.value as LangKey)}
        className="
          appearance-none
          rounded-xl
          bg-white/70
          px-3 py-2 pr-8
          text-sm font-semibold tracking-wide
          text-gray-900
          shadow-sm
          backdrop-blur
          border border-white/30
          hover:bg-white
          focus:outline-none focus:ring-2 focus:ring-[#C8A24A]/40
          transition
        "
        aria-label="Language"
      >
        {EU_LANGS.map((lang) => (
          <option key={lang} value={lang}>
            {LANG_LABEL[lang]}
          </option>
        ))}
      </select>

      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-500">
        <svg
          width="14"
          height="14"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
}
