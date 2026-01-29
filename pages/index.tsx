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

  const year = String(new Date().getFullYear());

  const features = useMemo(
    () => [
      { title: "featPostCallTitle", desc: "featPostCallDesc" },
      { title: "featCalendarTitle", desc: "featCalendarDesc" },
      { title: "featSmsTitle", desc: "featSmsDesc" },
      { title: "featVoiceAiTitle", desc: "featVoiceAiDesc" },
      { title: "featEffectivenessTitle", desc: "featEffectivenessDesc" },
      { title: "featOpportunitiesMapTitle", desc: "featOpportunitiesMapDesc" },
    ],
    []
  );

  const steps = useMemo(
    () => [
      { k: "step1Title", d: "step1Desc" },
      { k: "step2Title", d: "step2Desc" },
      { k: "step3Title", d: "step3Desc" },
      { k: "step4Title", d: "step4Desc" },
    ],
    []
  );
  const [isTopDark, setIsTopDark] = useState(true);

useEffect(() => {
  const onScroll = () => setIsTopDark(window.scrollY < 80);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}, []);

  return (
    <main className="min-h-screen bg-ew-bg text-ew-primary">
      <div className="fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl px-2 py-2">
<Link
  href="/login"
  className={
    "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold shadow-lg transition " +
    (isTopDark
      ? "border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/15"
      : "border border-gray-200 bg-white text-ew-primary hover:bg-ew-accent/10")
  }
>
  {t(lang, "ctaLogin")}
</Link>


<div
  className={
    "rounded-2xl px-2 py-1 shadow-lg backdrop-blur " +
    (isTopDark ? "border border-white/20 bg-white/10" : "border border-gray-200 bg-white")
  }
>
  <LanguageSwitcher currentLang={lang} />
</div>
</div>


      {/* HERO */}
      <section className="relative overflow-hidden bg-ew-primary text-white">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/15" />
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-12 md:py-28">
          {/* Left */}
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-ew-accent" />
              {t(lang, "heroBadge")}
            </div>

           <div className="mt-5 inline-flex">
            <span className="rounded-2xl bg-white/20 backdrop-blur ring-1 ring-white/25 px-4 py-3">
              <Image
                src="/everyapp-logo.svg"
                alt="EveryAPP"
                width={360}
                height={90}
                priority
                className="h-auto w-[240px] md:w-[360px]"
              />
            </span>
          </div>

            <p className="mt-4 text-xl font-semibold text-ew-accent md:text-2xl">
              {t(lang, "heroTagline")}
            </p>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
              {t(lang, "heroDescStrong")}
            </p>

            {/* Mini-benefits */}
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { k: "heroProof1" },
                { k: "heroProof2" },
                { k: "heroProof3" },
              ].map((it) => (
                <div
                  key={it.k}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <p className="text-sm font-semibold">{t(lang, it.k as any)}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href="#demo"
               className="inline-flex items-center justify-center rounded-xl bg-ew-accent px-7 py-3.5 font-semibold text-ew-primary shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0"
              >
                {t(lang, "ctaDemo")}
              </a>

              <a
                href="#funkcje"
                className="inline-flex items-center justify-center rounded-xl border border-white/30 px-7 py-3.5 font-semibold text-white/95 transition hover:bg-white/10"
              >
                {t(lang, "ctaSeeFeatures")}
              </a>

              <a
                href="mailto:kontakt@everyapp.pl?subject=EveryAPP%20Wycena"
                className="inline-flex items-center justify-center rounded-xl px-0 py-3.5 text-sm font-semibold text-white/80 transition hover:text-white"
              >
                {t(lang, "ctaPricing")}
              </a>
            </div>

            <p className="mt-4 text-xs text-white/55">{t(lang, "heroFootnote")}</p>
          </div>

          {/* Right - UI mock */}
          <div className="md:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{t(lang, "mockTitle")}</p>
                <span className="rounded-full bg-ew-accent/15 px-2 py-1 text-xs text-ew-accent">
                  {t(lang, "mockLive")}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-black/20 p-4">
                <p className="text-xs text-white/60">{t(lang, "mockCallEnded")}</p>
                <p className="mt-1 text-sm font-semibold">{t(lang, "mockQuestion")}</p>

                <div className="mt-4 grid gap-2">
                  {[
                    "mockBtn1",
                    "mockBtn2",
                    "mockBtn3",
                    "mockBtn4",
                  ].map((k) => (
                    <div
                      key={k}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90"
                    >
                      {t(lang, k as any)}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-xs text-white/60">{t(lang, "mockNext")}</p>
                  <p className="mt-1 text-sm font-semibold">
                    {t(lang, "mockCalendarLine")}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {["mockStat1", "mockStat2"].map((k) => (
                  <div
                    key={k}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-xs text-white/60">{t(lang, "mockStatsLabel")}</p>
                    <p className="mt-1 text-sm font-semibold">{t(lang, k as any)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 text-xs text-white/55">
              {t(lang, "mockDisclaimer")}
            </div>
          </div>
        </div>
      </section>

      {/* LOGOS / INTEGRATIONS STRIP */}
    <section className="mx-auto max-w-6xl px-6 py-12">
  <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-ew-accent">
        {t(lang, "integrationsBadge")}
      </p>
      <p className="text-sm text-gray-500">
        {t(lang, "integrationsSubtitle")}
      </p>
    </div>

    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {[
        "integrationCalendar",
        "integrationSms",
        "integrationVoip",
        "integrationWebUtm",
        "integrationExport",
      ].map((k) => (
        <div
          key={k}
          className="flex items-center justify-center rounded-2xl border border-gray-200 bg-ew-accent/10 px-4 py-4 text-sm font-semibold text-ew-primary transition hover:bg-ew-accent/15"
        >
          {t(lang, k as any)}
        </div>
      ))}
    </div>
  </div>
</section>

      {/* LISTINGS EXPORT + ANALYTICS */}
<section id="ogloszenia" className="mx-auto max-w-6xl px-6 py-14 md:py-18">
  <div className="grid gap-8 md:grid-cols-12 md:items-start">
    <div className="md:col-span-6">
      <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
        {t(lang, "listingsTitle")}
      </h2>
      <p className="mt-3 max-w-xl text-gray-600 leading-relaxed">
        {t(lang, "listingsDesc")}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {["listingsBullet1", "listingsBullet2", "listingsBullet3", "listingsBullet4"].map((k) => (
          <div key={k} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold">{t(lang, k as any)}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="md:col-span-6">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold">{t(lang, "listingCardTitle")}</p>

        <div className="mt-4 rounded-2xl bg-ew-accent/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">{t(lang, "listingCardLabel")}</p>
              <p className="mt-1 text-base font-semibold text-gray-900">
                {t(lang, "listingCardName")}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {t(lang, "listingCardMeta")}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">{t(lang, "listingCardExport")}</p>
              <p className="mt-1 text-sm font-semibold">{t(lang, "listingCardExportValue")}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["listingStat1", "listingStat2", "listingStat3"].map((k) => (
              <div key={k} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <p className="text-xs text-gray-500">{t(lang, "listingStatLabel")}</p>
                <p className="mt-1 text-sm font-semibold">{t(lang, k as any)}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-gray-500">{t(lang, "listingCardFootnote")}</p>
        </div>
      </div>
    </div>
  </div>
</section>

      {/* FEATURES */}
      <section id="funkcje" className="mx-auto max-w-6xl px-6 py-14 md:py-18">
        <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          {t(lang, "featuresTitle")}
        </h2>
        <p className="mt-3 max-w-3xl text-gray-600 leading-relaxed">
          {t(lang, "featuresSubtitle")}
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            >
              <h3 className="text-lg font-semibold">{t(lang, f.title as any)}</h3>
              <p className="mt-2 text-gray-600 leading-relaxed">
                {t(lang, f.desc as any)}
              </p>

              <div className="mt-5 rounded-2xl bg-ew-accent/10 p-4 text-sm text-ew-primary/90">
              {t(lang, "featuresNote")}
            </div>
            </div>
          ))}
        </div>
      </section>
          {/* SMS FLOWS (BUYER vs SELLER) */}
<section id="sms-flow" className="bg-white">
  <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
    <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
      {t(lang, "smsFlowsTitle")}
    </h2>
    <p className="mt-3 max-w-3xl text-gray-600 leading-relaxed">
      {t(lang, "smsFlowsDesc")}
    </p>

    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {/* Buyer */}
      <div className="rounded-3xl border border-gray-200 bg-ew-accent/10 p-6 shadow-sm">
        <p className="text-sm font-semibold">{t(lang, "smsBuyerTitle")}</p>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">{t(lang, "smsBuyerDesc")}</p>

        <div className="mt-5 grid gap-2">
          {["smsBuyerStep1", "smsBuyerStep2", "smsBuyerStep3"].map((k) => (
            <div key={k} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
              {t(lang, k as any)}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">{t(lang, "smsRangeLabel")}</p>
          <p className="mt-1 text-sm font-semibold">{t(lang, "smsRangeExample")}</p>
          <p className="mt-2 text-xs text-gray-500">{t(lang, "smsRangeFootnote")}</p>
        </div>
      </div>

      {/* Seller */}
      <div className="rounded-3xl border border-gray-200 bg-ew-accent/10 p-6 shadow-sm">
        <p className="text-sm font-semibold">{t(lang, "smsSellerTitle")}</p>
        <p className="mt-2 text-sm text-gray-700 leading-relaxed">{t(lang, "smsSellerDesc")}</p>

        <div className="mt-5 grid gap-2">
          {["smsSellerStep1", "smsSellerStep2", "smsSellerStep3"].map((k) => (
            <div key={k} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
              {t(lang, k as any)}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">{t(lang, "smsAuthorityLabel")}</p>
          <p className="mt-1 text-sm font-semibold">{t(lang, "smsAuthorityExample")}</p>
        </div>
      </div>
    </div>
  </div>
</section>

      {/* HOW IT WORKS */}
      <section id="jak-dziala" className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {t(lang, "howTitle")}
          </h2>
          <p className="mt-3 max-w-3xl text-gray-600 leading-relaxed">
            {t(lang, "howSubtitle")}
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-4">
            {steps.map((s, idx) => (
              <div
                key={s.k}
                className="rounded-3xl border border-gray-200 bg-ew-accent/10 p-6 shadow-sm transition hover:shadow"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ew-primary font-bold text-white">
                  {idx + 1}
                </div>
                <p className="mt-4 text-base font-semibold">{t(lang, s.k as any)}</p>
                <p className="mt-2 text-sm text-gray-700 leading-relaxed">{t(lang, s.d as any)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
            {/* VERIFIED MEETINGS (GEO) */}
<section id="geo" className="mx-auto max-w-6xl px-6 py-14 md:py-18">
  <div className="grid gap-8 md:grid-cols-12 md:items-center">
    <div className="md:col-span-7">
      <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
        {t(lang, "geoTitle")}
      </h2>
      <p className="mt-3 max-w-3xl text-gray-600 leading-relaxed">
        {t(lang, "geoDesc")}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {["geoBullet1", "geoBullet2", "geoBullet3", "geoBullet4"].map((k) => (
          <div key={k} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold">{t(lang, k as any)}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="md:col-span-5">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold">{t(lang, "geoMockTitle")}</p>

        <div className="mt-4 rounded-2xl bg-ew-primary p-5 text-white">
          <p className="text-xs text-white/70">{t(lang, "geoMockHint")}</p>
          <p className="mt-2 text-sm font-semibold">{t(lang, "geoMockQuestion")}</p>

          <div className="mt-4 grid gap-2">
            {["geoMockBtn1", "geoMockBtn2", "geoMockBtn3"].map((k) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                {t(lang, k as any)}
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-white/60">{t(lang, "geoMockFootnote")}</p>
        </div>
      </div>
    </div>
  </div>
</section>
{/* OPPORTUNITY MAP */}
<section id="mapa" className="bg-white">
  <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
    <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
      {t(lang, "mapTitle")}
    </h2>
    <p className="mt-3 max-w-3xl text-gray-600 leading-relaxed">
      {t(lang, "mapDesc")}
    </p>

    <div className="mt-10 grid gap-6 md:grid-cols-12 md:items-start">
      <div className="md:col-span-7">
        <div className="rounded-3xl border border-gray-200 bg-ew-accent/10 p-6 shadow-sm">
          <p className="text-sm font-semibold">{t(lang, "mapLegendTitle")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {["mapLegendGreen", "mapLegendBlue", "mapLegendRed"].map((k) => (
              <div key={k} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold">
                {t(lang, k as any)}
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["mapCard1", "mapCard2", "mapCard3", "mapCard4"].map((k) => (
              <div key={k} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold">{t(lang, k as any)}</p>
                <p className="mt-1 text-xs text-gray-500">{t(lang, "mapCardHint")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:col-span-5">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold">{t(lang, "mapMockTitle")}</p>
          <div className="mt-4 rounded-2xl bg-ew-primary p-5 text-white">
            <p className="text-xs text-white/70">{t(lang, "mapMockHint")}</p>
            <div className="mt-4 grid gap-2">
              {["mapMockItem1", "mapMockItem2", "mapMockItem3"].map((k) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  {t(lang, k as any)}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">{t(lang, "mapFootnote")}</p>
        </div>
      </div>
    </div>
  </div>
</section>

      {/* TRUST / SECURITY */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-18">
        <div className="grid gap-6 md:grid-cols-12">
          <div className="md:col-span-7">
            <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
              {t(lang, "trustTitle")}
            </h2>
            <p className="mt-3 max-w-3xl text-gray-600 leading-relaxed">
              {t(lang, "trustDesc")}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {["trustBullet1", "trustBullet2", "trustBullet3", "trustBullet4"].map((k) => (
                <div
                  key={k}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm font-semibold">{t(lang, k as any)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold">{t(lang, "metricsTitle")}</p>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                {t(lang, "metricsDesc")}
              </p>

              <div className="mt-6 grid gap-3">
                {[
                  "metricsRow1",
                  "metricsRow2",
                  "metricsRow3",
                  "metricsRow4",
                ].map((k) => (
                  <div
                    key={k}
                    className="flex items-center justify-between rounded-2xl bg-ew-accent/10 px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-gray-800">
                      {t(lang, k as any)}
                    </span>
                    <span className="text-xs text-gray-500">{t(lang, "metricsRealtime")}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">{t(lang, "trustFootnote")}</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="demo" className="bg-ew-primary text-white">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-12 md:items-center">
            <div className="md:col-span-7">
              <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
                {t(lang, "cta2Title")}
              </h2>
              <p className="mt-4 max-w-2xl text-white/80 leading-relaxed">
                {t(lang, "cta2Desc")}
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <a
                  href="mailto:kontakt@everyapp.pl?subject=EveryAPP%20Demo"
                 className="inline-flex items-center justify-center rounded-2xl bg-ew-accent px-9 py-4 font-semibold text-ew-primary shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 active:translate-y-0"
                >
                  {t(lang, "cta2Button")}
                </a>

                <a
                  href="#"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/30 px-9 py-4 font-semibold text-white/95 transition hover:bg-white/10"
                >
                  {t(lang, "cta2Secondary")}
                </a>
              </div>

              <p className="mt-4 text-xs text-white/55">{t(lang, "cta2Footnote")}</p>
            </div>

            <div className="md:col-span-5">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-sm font-semibold">{t(lang, "ctaBoxTitle")}</p>
                <p className="mt-2 text-sm text-white/75 leading-relaxed">
                  {t(lang, "ctaBoxDesc")}
                </p>
                <div className="mt-5 grid gap-2">
                  {["ctaBoxBullet1", "ctaBoxBullet2", "ctaBoxBullet3"].map((k) => (
                    <div key={k} className="rounded-2xl bg-white/5 px-4 py-3 text-sm">
                      {t(lang, k as any)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-ew-bg">
        <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-gray-600">
          {t(lang, "footerRights", { year })}
        </div>
      </footer>
    </main>
  );
}
