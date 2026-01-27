import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

export default function RegisterPage() {
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);

    const em = email.trim().toLowerCase();
    const ic = inviteCode.trim();

    if (!em || !em.includes("@")) {
      setError(t(lang, "registerErrorEmail"));
      return;
    }
    if (!ic) {
      setError(t(lang, "registerErrorInvite"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: em,
          fullName: fullName.trim(),
          phone: phone.trim(),
          inviteCode: ic,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // mapowanie najważniejszych błędów
        const code = data?.error;
        if (code === "INVALID_INVITE_CODE") return setError(t(lang, "registerErrorInviteInvalid"));
        if (code === "INVALID_EMAIL") return setError(t(lang, "registerErrorEmail"));
        return setError(t(lang, "registerErrorGeneric"));
      }

      setOk(true);
    } catch {
      setError(t(lang, "registerErrorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t(lang, "registerPageTitle")}</title>
        <meta name="description" content={t(lang, "registerPageDesc")} />
      </Head>

      <main className="min-h-screen bg-ew-bg text-ew-primary">
        {/* Topbar */}
        <div className="fixed right-4 top-4 z-50 flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-lg transition hover:bg-ew-accent/10"
          >
            {t(lang, "registerBackLogin")}
          </Link>

          <div className="rounded-2xl border border-gray-200 bg-white px-2 py-1 shadow-lg">
            <LanguageSwitcher currentLang={lang} />
          </div>
        </div>

        {/* Header strip */}
        <section className="relative overflow-hidden bg-ew-primary text-white">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/15" />
          <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-ew-accent" />
              {t(lang, "registerBadge")}
            </div>

            <h1 className="mt-5 text-3xl font-extrabold tracking-tight md:text-4xl">
              {t(lang, "registerHeadline")}
            </h1>
            <p className="mt-3 max-w-2xl text-white/80">
              {t(lang, "registerSubhead")}
            </p>
          </div>
        </section>

        {/* Form */}
        <section className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <div className="grid gap-8 md:grid-cols-12 md:items-start">
            {/* Left info */}
            <div className="md:col-span-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-ew-accent">
                  {t(lang, "registerInfoBadge")}
                </p>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
                  {t(lang, "registerInfoTitle")}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {t(lang, "registerInfoDesc")}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {["registerInfo1", "registerInfo2", "registerInfo3", "registerInfo4"].map((k) => (
                    <div key={k} className="rounded-2xl border border-gray-200 bg-ew-accent/10 p-4">
                      <p className="text-sm font-semibold text-ew-primary">
                        {t(lang, k as any)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right form */}
            <div className="md:col-span-6">
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <form onSubmit={onSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold" htmlFor="email">
                      {t(lang, "registerEmail")}
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t(lang, "registerEmailPlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold" htmlFor="fullName">
                      {t(lang, "registerFullName")}
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t(lang, "registerFullNamePlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold" htmlFor="phone">
                      {t(lang, "registerPhone")}
                    </label>
                    <input
                      id="phone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={t(lang, "registerPhonePlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold" htmlFor="inviteCode">
                      {t(lang, "registerInvite")}
                    </label>
                    <input
                      id="inviteCode"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder={t(lang, "registerInvitePlaceholder")}
                      className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      {t(lang, "registerInviteHint")}
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {ok && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {t(lang, "registerOk")}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-ew-accent px-6 py-3.5 text-sm font-semibold text-ew-primary shadow-sm transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? t(lang, "registerSubmitting") : t(lang, "registerSubmit")}
                  </button>

                  <p className="text-xs text-gray-500">
                    {t(lang, "registerLegal")}
                  </p>
                </form>
              </div>

              <p className="mt-4 text-center text-sm text-gray-600">
                {t(lang, "registerHaveAccount")}{" "}
                <Link href="/login" className="font-semibold text-ew-primary hover:underline">
                  {t(lang, "registerGoLogin")}
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
