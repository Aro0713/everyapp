import { useEffect, useState } from "react";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";

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

  const year = String(new Date().getFullYear());

 return (
  <main className="min-h-screen bg-[#F7F7F5] text-gray-900">
    {/* Language switcher – fixed, nie wpływa na layout */}
    <div className="fixed right-4 top-4 z-50">
  <div className="rounded-2xl border border-white/10 bg-white/60 px-2 py-1 shadow-lg backdrop-blur">
    <LanguageSwitcher currentLang={lang} />
  </div>
  </div>

      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0B1F3A] text-white">
        {/* delikatny gradient – nadal ten sam kolor brandu */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/10" />

        <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight">
              {t(lang, "brandName")}
            </h1>

            <p className="mt-4 text-xl md:text-2xl font-semibold text-[#C8A24A]">
              {t(lang, "heroTagline")}
            </p>

            <p className="mt-2 text-sm text-white/60">
              {t(lang, "heroByline")}
            </p>

            <p className="mt-6 text-base md:text-lg leading-relaxed text-white/85">
              {t(lang, "heroDesc")}
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href="#demo"
                className="inline-flex items-center justify-center rounded-xl bg-[#C8A24A] px-7 py-3.5 font-semibold text-[#0B1F3A] shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0"
              >
                {t(lang, "ctaDemo")}
              </a>

              <a
                href="#jak-dziala"
                className="inline-flex items-center justify-center rounded-xl border border-white/30 px-7 py-3.5 font-semibold text-white/95 transition hover:bg-white/10"
              >
                {t(lang, "ctaHowItWorks")}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* DLACZEGO */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
          {t(lang, "whyTitle")}
        </h2>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            { title: "whyCard1Title", desc: "whyCard1Desc" },
            { title: "whyCard2Title", desc: "whyCard2Desc" },
            { title: "whyCard3Title", desc: "whyCard3Desc" },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <h3 className="text-lg font-semibold">
                {t(lang, c.title as any)}
              </h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {t(lang, c.desc as any)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* JAK DZIAŁA */}
      <section id="jak-dziala" className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {t(lang, "howTitle")}
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-4">
            {[
              t(lang, "howStep1"),
              t(lang, "howStep2"),
              t(lang, "howStep3"),
              t(lang, "howStep4"),
            ].map((text, index) => (
              <div
                key={`how-step-${index}`}
                className="rounded-2xl border border-gray-200 bg-[#F7F7F5] p-6 shadow-sm transition hover:shadow"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1F3A] font-bold text-[#C8A24A]">
                  {index + 1}
                </div>
                <p className="mt-4 font-medium leading-snug">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="bg-[#0B1F3A] text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {t(lang, "cta2Title")}
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-white/80 leading-relaxed">
            {t(lang, "cta2Desc")}
          </p>

          <a
            href="mailto:kontakt@everywhere.psa?subject=EveryAPP%20Demo"
            className="mt-8 inline-flex items-center justify-center rounded-2xl bg-[#C8A24A] px-9 py-4 font-semibold text-[#0B1F3A] shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0"
          >
            {t(lang, "cta2Button")}
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#F7F7F5]">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-gray-600">
          {t(lang, "footerRights", { year })}
        </div>
      </footer>
    </main>
  );
}
