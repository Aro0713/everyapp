import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Image from "next/image";
import Link from "next/link";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Home() {
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  const valueCards = useMemo(
    () => [
      { t: "landingValue1Title", d: "landingValue1Desc" },
      { t: "landingValue2Title", d: "landingValue2Desc" },
      { t: "landingValue3Title", d: "landingValue3Desc" },
    ],
    []
  );

  return (
    <main className="min-h-screen bg-ew-bg text-ew-primary">
      {/* TOPBAR */}
      <header className="sticky top-0 z-50 bg-ew-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-gray-200">
              <Image
                src="/everyapp-logo.svg"
                alt="EveryAPP"
                width={220}
                height={55}
                priority
                className="h-auto w-[160px] sm:w-[180px]"
              />
            </div>

            <div className="hidden sm:block text-sm text-gray-600">
              {t(lang, "heroTagline")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-gray-200 bg-white px-2 py-1 shadow-sm">
              <LanguageSwitcher currentLang={lang} />
            </div>

            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
            >
              {t(lang, "ctaLogin")}
            </Link>
          </div>
        </div>
      </header>

      {/* ONE SCREEN LAYOUT */}
      <section className="mx-auto flex max-w-6xl flex-1 flex-col px-4 pb-6 pt-6 sm:px-6">
        {/* UPPER GRID: Copy + Mock */}
        <div className="grid flex-1 gap-5 md:grid-cols-12">
          {/* LEFT */}
          <div className="md:col-span-7">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-ew-accent/10 px-3 py-1 text-xs font-semibold text-ew-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-ew-accent" />
                {t(lang, "heroBadge")}
              </div>

              <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t(lang, "heroTagline")}
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base">
                {t(lang, "heroDescStrong")}
              </p>

              {/* PERSONAL AI (new keys) */}
              <div className="mt-5 rounded-3xl border border-gray-200 bg-ew-accent/10 p-5">
                <p className="text-sm font-extrabold text-ew-primary">
                  {t(lang, "landingAiAssistantTitle" as any)}
                </p>
                <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                  {t(lang, "landingAiAssistantDesc" as any)}
                </p>
              </div>

              {/* CTA ROW */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="mailto:kontakt@everyapp.pl?subject=EveryAPP%20Demo"
                  className="inline-flex items-center justify-center rounded-2xl bg-ew-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
                >
                  {t(lang, "ctaDemo")}
                </a>

                <a
                  href="mailto:kontakt@everyapp.pl?subject=EveryAPP%20Wycena"
                  className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
                >
                  {t(lang, "ctaPricing")}
                </a>

                <Link
                  href="/panel"
                  className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold text-gray-600 transition hover:text-ew-primary"
                >
                  {t(lang, "ctaSeeFeatures")}
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT MOCK (Podgląd: post-call push) */}
          <div className="md:col-span-5">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-extrabold">{t(lang, "mockTitle")}</p>
                <span className="rounded-full bg-ew-accent/10 px-2 py-1 text-xs font-semibold text-ew-primary">
                  {t(lang, "mockLive")}
                </span>
              </div>

              <div className="mt-4 rounded-2xl border border-gray-200 bg-ew-accent/10 p-4">
                <p className="text-xs text-gray-600">{t(lang, "mockCallEnded")}</p>
                <p className="mt-1 text-sm font-semibold">{t(lang, "mockQuestion")}</p>

                <div className="mt-4 grid gap-2">
                  {["mockBtn1", "mockBtn2", "mockBtn3"].map((k) => (
                    <div
                      key={k}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"
                    >
                      {t(lang, k as any)}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <p className="text-xs text-gray-600">{t(lang, "mockNext")}</p>
                  <p className="mt-1 text-sm font-semibold">{t(lang, "mockCalendarLine")}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {["mockStat1", "mockStat2"].map((k) => (
                  <div key={k} className="rounded-2xl border border-gray-200 bg-ew-accent/10 p-4">
                    <p className="text-xs text-gray-600">{t(lang, "mockStatsLabel")}</p>
                    <p className="mt-1 text-sm font-extrabold">{t(lang, k as any)}</p>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-gray-500">{t(lang, "mockDisclaimer")}</p>
            </div>
          </div>
        </div>

        {/* LOWER STRIP: 3 cards (always visible) */}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {valueCards.map((it) => (
            <div key={it.t} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-extrabold">{t(lang, it.t as any)}</p>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{t(lang, it.d as any)}</p>
              <div className="mt-4 rounded-2xl bg-ew-accent/10 px-4 py-3 text-xs font-semibold text-ew-primary">
                {t(lang, "featuresNote")}
              </div>
            </div>
          ))}
        </div>

        {/* FOOTER mini (no scroll) */}
        <div className="mt-4 text-center text-xs text-gray-500">
          {t(lang, "footerRights", { year: String(new Date().getFullYear()) })}
        </div>
      </section>
    </main>
  );
}
