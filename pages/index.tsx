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

  const year = String(new Date().getFullYear());

  return (
    <main className="min-h-screen bg-ew-bg text-ew-primary">
      {/* TOPBAR (logo nie wjeżdża na kontenery) */}
            <header className="sticky top-0 z-50 border-b border-gray-200 bg-ew-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-end px-4 sm:px-6">
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

      {/* LAYOUT: lewy duży + po prawej 3 mniejsze */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-stretch">
          {/* LEFT BIG */}
          <div className="lg:col-span-7">
            <div className="h-full rounded-3xl border border-gray-200 bg-white p-10 shadow-sm flex flex-col justify-between">

              {/* GÓRNA CZĘŚĆ */}
              <div>
                {/* DUŻE LOGO */}
                <div className="mb-6">
                  <Image
                    src="/everyapp-logo.svg"
                    alt="EveryAPP"
                    width={360}
                    height={90}
                    priority
                    className="h-auto w-[340px] sm:w-[420px]"
                  />
                </div>

                {/* TYTUŁ – zmniejszony */}
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                  {t(lang, "heroTagline")}
                </h1>

                <p className="mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-gray-600">
                  {t(lang, "heroDescStrong")}
                </p>

                {/* Osobisty Agent AI */}
                <div className="mt-6 rounded-3xl border border-gray-200 bg-ew-accent/10 p-6">
                  <p className="text-sm font-extrabold text-ew-primary">
                    {t(lang, "landingAiAssistantTitle" as any)}
                  </p>
                  <p className="mt-2 text-sm text-gray-700 leading-relaxed">
                    {t(lang, "landingAiAssistantDesc" as any)}
                  </p>
                </div>
              </div>

              {/* DOLNA CZĘŚĆ */}
              <div className="pt-6 text-xs text-gray-500">
                {t(lang, "footerRights", { year })}
              </div>

            </div>
          </div>

          {/* RIGHT 3 SMALL */}
          <div className="lg:col-span-5">
            <div className="grid h-full gap-6">
              {valueCards.map((it) => (
                <div
                  key={it.t}
                  className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <p className="text-sm font-extrabold">{t(lang, it.t as any)}</p>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    {t(lang, it.d as any)}
                  </p>

                  <div className="mt-4 rounded-2xl bg-ew-accent/10 px-4 py-3 text-xs font-semibold text-ew-primary">
                    {t(lang, "featuresNote")}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
        </div>
      </section>  
      {/* FOOTER */}
      <footer className="mt-10 border-t border-gray-200 bg-ew-bg">
        <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-gray-500 sm:px-6">
          {t(lang, "footerRights", { year })}
        </div>
      </footer>
    </main> 
  );
}

