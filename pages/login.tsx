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
      if (!email.trim() || !email.includes("@")) {
        setError(t(lang, "loginErrorEmail"));
        return;
      }
      if (password.length < 6) {
        setError(t(lang, "loginErrorPassword"));
        return;
      }

      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => null);
        setError(
          err?.error === "INVALID_CREDENTIALS"
            ? t(lang, "loginErrorInvalidCredentials")
            : t(lang, "loginErrorGeneric")
        );
        return;
      }

      if (remember) setCookie("rememberMe", "1");
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

        {/* TOPBAR – cienki, bez logo */}
        <header className="sticky top-0 z-50 bg-ew-primary text-white">
          <div className="mx-auto flex h-12 max-w-7xl items-center justify-end px-4 sm:px-6">
            <div className="rounded-2xl bg-white/10 px-2 py-1">
              <LanguageSwitcher currentLang={lang} />
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 md:grid-cols-12 md:items-center">

            {/* LEFT – DUŻE LOGO */}
            <div className="md:col-span-6">
              <div className="flex items-center justify-center md:justify-start">
                <div className="rounded-3xl border border-ew-accent/20 bg-ew-accent/10 px-10 py-12 shadow-sm">
                  <Image
                    src="/everyapp-logo.svg"
                    alt="EveryAPP"
                    width={520}
                    height={130}
                    priority
                    className="h-auto w-[320px] sm:w-[420px] md:w-[460px]"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT – LOGIN CARD */}
            <div className="md:col-span-6">
              <div className="rounded-3xl border border-ew-accent/20 bg-ew-accent/10 p-8 shadow-sm">

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
                      className="mt-2 w-full rounded-2xl border border-ew-accent/20 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
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
                      className="mt-2 w-full rounded-2xl border border-ew-accent/20 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
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

                    <Link
                      href="/reset-password"
                      className="text-sm font-semibold text-ew-primary hover:text-ew-primary/80"
                    >
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
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-ew-primary px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? t(lang, "loginSubmitting") : t(lang, "loginSubmit")}
                  </button>

                  <p className="text-xs text-gray-600">
                    {t(lang, "loginLegal")}
                  </p>

                </form>

              </div>

              <p className="mt-6 text-center text-sm text-gray-600">
                {t(lang, "loginNoAccount")}{" "}
                <Link href="/register" className="font-semibold text-ew-primary hover:underline">
                  {t(lang, "loginRegisterLink")}
                </Link>
              </p>

              <p className="mt-3 text-center text-xs text-gray-500">
                {t(lang, "loginFooterHint")}
              </p>
            </div>

          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-ew-accent/20 bg-ew-bg">
          <div className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-gray-500 sm:px-6">
            {t(lang, "footerRights", { year: String(new Date().getFullYear()) })}
          </div>
        </footer>

      </main>
    </>
  );
}
