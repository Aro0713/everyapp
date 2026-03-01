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
      {/* HERO: panorama + overlay */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/katowice-panorama.jpg"
            alt="Panorama Katowic"
            fill
            priority
            className="object-cover"
          />
          {/* Overlay: czytelność tekstu */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/65 to-slate-900/35" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/55" />
        </div>

        {/* TOPBAR – półprzezroczysty na tle panoramy */}
        <header className="sticky top-0 z-50">
          <div className="bg-ew-primary/70 text-white backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-end px-4 sm:px-6">
              <div className="flex items-center gap-2">
                <div className="rounded-2xl bg-white/10 px-2 py-1">
                  <LanguageSwitcher currentLang={lang} />
                </div>

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  {t(lang, "ctaLogin")}
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-10 pt-10 sm:px-6 md:pt-14 lg:min-h-[calc(100vh-4rem)] lg:justify-center">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            {/* LEFT: tekst */}
            <div className="lg:col-span-7">
              <div className="max-w-2xl">
                {/* Logo (na ciemnym tle lepiej mniejsze i czystsze) */}
                <div className="mb-6">
                  <Image
                    src="/everyapp-logo.svg"
                    alt="EveryAPP"
                    width={340}
                    height={90}
                    priority
                    className="h-auto w-[240px] sm:w-[300px] brightness-0 invert"
                  />
                </div>

                <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {t(lang, "heroTagline")}
                </h1>

                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
                  {t(lang, "heroDescStrong")}
                </p>

                {/* AI Assistant – w stylu “glass”, ale bez neonów */}
                <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-6 text-white backdrop-blur-md">
                  <p className="text-sm font-extrabold">
                    {t(lang, "landingAiAssistantTitle" as any)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-white/80">
                    {t(lang, "landingAiAssistantDesc" as any)}
                  </p>
                </div>

                {/* Stopka drobnym – jak w przykładzie, ale subtelnie */}
                <div className="mt-8 text-xs text-white/60">
                  {t(lang, "footerRights", { year })}
                </div>
              </div>
            </div>

            {/* RIGHT: karta logowania (wizualnie jak przykład) */}
            <div className="lg:col-span-5">
              <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-8 text-white shadow-2xl backdrop-blur-xl">
                <div className="mb-6 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/10 p-2">
                    <Image
                      src="/everyapp-logo.svg"
                      alt="EveryAPP"
                      width={40}
                      height={40}
                      className="h-full w-full brightness-0 invert"
                    />
                  </div>
                  <div className="text-lg font-extrabold tracking-wide">
                    EVERYWHERE
                  </div>
                </div>

                {/* Uwaga: to jest tylko “front” jak na inspiracji.
                    Autoryzację zostawiamy na /login. */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-white/80">
                      E-mail
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="text-white/50">✉️</span>
                      <input
                        className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
                        placeholder="Email"
                        disabled
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-white/80">
                      Hasło
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="text-white/50">🔒</span>
                      <input
                        className="w-full bg-transparent text-sm text-white placeholder:text-white/40 outline-none"
                        placeholder="Hasło"
                        type="password"
                        disabled
                      />
                      <span className="text-white/35">👁️</span>
                    </div>
                  </div>

                  <Link
                    href="/login"
                    className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-blue-600/80 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-blue-600"
                  >
                    Zaloguj się
                  </Link>

                  <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                    <span>🔐</span>
                    <span>Logowanie dwuskładnikowe</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <Link
                      href="/login"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                    >
                      <span>G</span> Zaloguj przez Google
                    </Link>

                    <Link
                      href="/login"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
                    >
                      <span>⬛</span> Zaloguj przez Microsoft
                    </Link>
                  </div>

                  <div className="mt-4 text-center text-xs text-white/55">
                    Nie masz dostępu? Skontaktuj się z administratorem.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom “value cards” – jak w inspiracji (3 boxy), glass */}
          <div className="grid gap-4 lg:grid-cols-3">
            {valueCards.map((it) => (
              <div
                key={it.t}
                className="rounded-3xl border border-white/10 bg-white/10 p-6 text-white shadow-lg backdrop-blur-md"
              >
                <p className="text-sm font-extrabold">{t(lang, it.t as any)}</p>

                <p className="mt-2 text-sm leading-relaxed text-white/80">
                  {t(lang, it.d as any)}
                </p>

                <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-xs font-semibold text-white/85">
                  {t(lang, "featuresNote")}
                </div>
              </div>
            ))}
          </div>

          {/* Mini footer line */}
          <div className="pt-2 text-center text-xs text-white/50">
            {t(lang, "footerRights", { year })}
          </div>
        </div>
      </section>
    </main>
  );
}