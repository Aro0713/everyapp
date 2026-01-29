import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import Image from "next/image";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000`;
}

export default function LoginPage() {
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  // UI-only (na razie bez backendu)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // MVP: placeholder. Tu podepniesz Clerk/NextAuth albo własne API.
      // Na razie tylko walidacja frontowa:
      if (!email.trim() || !email.includes("@")) {
        setError(t(lang, "loginErrorEmail"));
        return;
      }
      if (password.length < 6) {
        setError(t(lang, "loginErrorPassword"));
        return;
      }

      // Symulacja logowania
      await new Promise((r) => setTimeout(r, 350));

      if (remember) setCookie("rememberMe", "1");
      // docelowo: redirect do panelu
      window.location.href = "/panel";
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t(lang, "loginPageTitle")}</title>
        <meta name="description" content={t(lang, "loginPageDesc")} />
      </Head>

      <main className="min-h-screen bg-ew-bg text-ew-primary">
        {/* Topbar */}
       <div className="fixed left-4 right-4 top-4 z-50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-lg transition hover:bg-ew-accent/10">
            <Image
                src="/everyapp-logo.svg"
                alt="EveryAPP"
                width={120}
                height={30}
                className="h-6 w-auto"
                priority
            />
            <span className="sr-only">EveryAPP</span>
            <span>{t(lang, "loginBackHome")}</span>
            </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-2 py-1 shadow-lg">
            <LanguageSwitcher currentLang={lang} />
        </div>
        </div>

        {/* Header strip */}
        <section className="relative overflow-hidden bg-ew-primary text-white">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/15" />
          <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
            <div className="mb-4">
            <Image
                src="/everyapp-logo.svg"
                alt="EveryAPP"
                width={220}
                height={55}
                className="h-10 w-auto"
                priority
            />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-ew-accent" />
              {t(lang, "loginBadge")}
            </div>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight md:text-4xl">
              {t(lang, "loginHeadline")}
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              {t(lang, "loginSubhead")}
            </p>
          </div>
        </section>

        {/* Form */}
        <section className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <div className="grid gap-8 md:grid-cols-12 md:items-start">
            {/* Left copy */}
            <div className="md:col-span-6">
  <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-ew-accent">
      {t(lang, "loginBenefitsBadge")}
    </p>
    <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
      {t(lang, "loginBenefitsTitle")}
    </h2>
    <p className="mt-3 text-sm leading-relaxed text-gray-600">
      {t(lang, "loginBenefitsDesc")}
    </p>

    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {[
        "loginBenefit1",
        "loginBenefit2",
        "loginBenefit3",
        "loginBenefit4",
      ].map((k) => (
        <div
          key={k}
          className="rounded-2xl border border-gray-200 bg-ew-accent/10 p-4"
        >
          <p className="text-sm font-semibold text-ew-primary">
            {t(lang, k as any)}
          </p>
        </div>
      ))}
    </div>
  </div>
</div>

            {/* Right form card */}
            <div className="md:col-span-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <form onSubmit={onSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold" htmlFor="email">
                      {t(lang, "loginEmail")}
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t(lang, "loginEmailPlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold" htmlFor="password">
                      {t(lang, "loginPassword")}
                    </label>
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t(lang, "loginPasswordPlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      {t(lang, "loginRemember")}
                    </label>

                    <Link href="/reset-password" className="text-sm font-semibold text-ew-primary hover:text-ew-primary/80">
                      {t(lang, "loginForgot")}
                    </Link>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-ew-accent px-6 py-3.5 text-sm font-semibold text-ew-primary shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? t(lang, "loginSubmitting") : t(lang, "loginSubmit")}
                  </button>

                  <p className="text-xs text-gray-500">
                    {t(lang, "loginLegal")}
                  </p>
                </form>
              </div>
                <p className="mt-4 text-center text-sm text-gray-600">
                {t(lang, "loginNoAccount")}{" "}
                <Link href="/register" className="font-semibold text-ew-primary hover:underline">
                    {t(lang, "loginRegisterLink")}
                </Link>
                </p>
                <p className="mt-3 text-xs text-gray-500">
                {t(lang, "loginFooterHint")}
                </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
