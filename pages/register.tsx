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

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  type RegisterMode = "create_office" | "join_office";
    const [mode, setMode] = useState<RegisterMode>("join_office");
    const [officeName, setOfficeName] = useState("");
    const [officeQuery, setOfficeQuery] = useState("");
    type OfficeResult = { id: string; name: string; code: string };
    const [officeResults, setOfficeResults] = useState<OfficeResult[]>([]);
    const [officeCode, setOfficeCode] = useState(""); // <-- NOWE
    const [selectedOfficeId, setSelectedOfficeId] = useState("");
    const [isOfficeOpen, setIsOfficeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

useEffect(() => {
  const c = getCookie("lang");
  if (isLangKey(c)) setLang(c);
}, []);

useEffect(() => {
  let alive = true;

  if (mode !== "join_office") {
    setOfficeResults([]);
    setIsOfficeOpen(false);
    return;
  }

  // jeśli dropdown jest zamknięty, nie pobieramy
  if (!isOfficeOpen) return;

  const q = officeQuery.trim();
  const tmr = setTimeout(async () => {
    try {
      const res = await fetch(`/api/offices/search?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (!alive) return;

      const offices = Array.isArray((data as any)?.offices) ? (data as any).offices : [];
      setOfficeResults(offices);
    } catch {
      if (!alive) return;
      setOfficeResults([]);
    }
  }, 200);
  
  return () => {
    alive = false;
    clearTimeout(tmr);
  };
}, [officeQuery, mode, isOfficeOpen]);
  
 async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  setOk(false);

  const em = email.trim().toLowerCase();

  if (!em || !em.includes("@")) {
    setError(t(lang, "registerErrorEmail"));
    return;
  }

  if (mode === "create_office") {
    if (!officeName.trim()) {
      setError(t(lang, "registerErrorOfficeName"));
      return;
    }
  } else {
    const ic = inviteCode.trim();
    if (!ic && !selectedOfficeId) {
      setError(t(lang, "registerErrorOfficePick"));
      return;
    }
  }
    if (password.length < 8) {
    setError(t(lang, "registerErrorPasswordTooShort"));
    return;
    }
    if (password !== password2) {
    setError(t(lang, "registerErrorPasswordMismatch"));
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
        password, // <-- NOWE
        mode,
        officeName: mode === "create_office" ? officeName.trim() : undefined,
        inviteCode: mode === "join_office" ? inviteCode.trim() : undefined,
        officeId: mode === "join_office" ? selectedOfficeId : undefined,
        }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const code = (data as any)?.error;
      if (code === "INVALID_INVITE_CODE") return setError(t(lang, "registerErrorInviteInvalid"));
      if (code === "INVALID_EMAIL") return setError(t(lang, "registerErrorEmail"));
      if (code === "MISSING_OFFICE_NAME") return setError(t(lang, "registerErrorOfficeName"));
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
       <div className="fixed left-4 right-4 top-4 z-50 flex items-center justify-between gap-3">
       <Link
            href="/login"
            className="inline-flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-lg transition hover:bg-ew-accent/10"
            >
            <span className="inline-flex items-center justify-center rounded-xl bg-white/30 backdrop-blur ring-1 ring-black/10 px-2 py-1">
                <Image
                src="/everyapp-logo.svg"
                alt="EveryAPP"
                width={120}
                height={30}
                className="h-6 w-auto"
                priority
                />
            </span>

            <span>{t(lang, "registerBackLogin")}</span>
            </Link>

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
              <div className="relative overflow-visible rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

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
              <div className="relative overflow-visible rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="rounded-2xl border border-gray-200 bg-ew-accent/5 p-4">
                        <p className="text-sm font-semibold">{t(lang, "registerModeLabel")}</p>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <button
                            type="button"
                            onClick={() => {
                                setMode("create_office");
                                setInviteCode("");
                                setOfficeQuery("");
                                setOfficeResults([]);
                                setSelectedOfficeId("");
                            }}
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                mode === "create_office"
                                ? "border-ew-accent bg-white"
                                : "border-gray-200 bg-white/70 hover:bg-white"
                            }`}
                            >
                            {t(lang, "registerModeCreateOffice")}
                            </button>

                            <button
                            type="button"
                            onClick={() => {
                                setMode("join_office");
                                setOfficeName("");
                            }}
                            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                                mode === "join_office"
                                ? "border-ew-accent bg-white"
                                : "border-gray-200 bg-white/70 hover:bg-white"
                            }`}
                            >
                            {t(lang, "registerModeJoinOffice")}
                            </button>
                        </div>
                        </div>

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
                    <label className="block text-sm font-semibold" htmlFor="password">
                        {t(lang, "registerPassword")}
                    </label>
                    <input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={t(lang, "registerPasswordPlaceholder")}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                    </div>

                    <div>
                    <label className="block text-sm font-semibold" htmlFor="password2">
                        {t(lang, "registerPassword2")}
                    </label>
                    <input
                        id="password2"
                        type="password"
                        autoComplete="new-password"
                        value={password2}
                        onChange={(e) => setPassword2(e.target.value)}
                        placeholder={t(lang, "registerPassword2Placeholder")}
                        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                    />
                    </div>

                            {mode === "create_office" && (
                        <div>
                            <label className="block text-sm font-semibold" htmlFor="officeName">
                            {t(lang, "registerOfficeName")}
                            </label>
                            <input
                            id="officeName"
                            type="text"
                            value={officeName}
                            onChange={(e) => setOfficeName(e.target.value)}
                            placeholder={t(lang, "registerOfficeNamePlaceholder")}
                            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                            {t(lang, "registerOfficeNameHint")}
                            </p>
                        </div>
                        )}

                                            {mode === "join_office" && (
                        <>
                            <div className="relative">
                            <label className="block text-sm font-semibold" htmlFor="officeSearch">
                                {t(lang, "registerOfficeSearch")}
                            </label>
                            <input
                            id="officeSearch"
                            type="text"
                            value={officeQuery}
                            onFocus={() => setIsOfficeOpen(true)}
                            onClick={() => setIsOfficeOpen(true)}
                            onChange={(e) => {
                            setOfficeQuery(e.target.value);
                            setSelectedOfficeId("");
                            setInviteCode("");      // ← TUTAJ, dokładnie tu
                            setIsOfficeOpen(true);
                            }}
                            placeholder={t(lang, "registerOfficeSearchPlaceholder")}
                            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                            />

                          {isOfficeOpen && (
                            <div className="absolute z-20 mt-2 w-full max-h-56 overflow-auto rounded-2xl border border-gray-200 bg-white shadow-lg">
                                {officeResults.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-gray-500">
                                    {t(lang, "registerOfficeSearchNoResults")}
                                </div>
                                ) : (
                                officeResults.map((o) => (
                                    <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => {
                                    setSelectedOfficeId(o.id);
                                    setOfficeQuery(o.name);
                                    setOfficeCode(o.code);       // ✅ AUTO
                                    setInviteCode(o.code);       // opcja: jeśli inviteCode ma być kodem biura
                                    setIsOfficeOpen(false);
                                    }}

                                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-ew-accent/10 ${
                                        selectedOfficeId === o.id ? "bg-ew-accent/10 font-semibold" : ""
                                    }`}
                                    >
                                    {o.name}
                                    </button>
                                ))
                                )}
                            </div>
                            )}


                            <p className="mt-2 text-xs text-gray-500">
                                {t(lang, "registerOfficeSearchHint")}
                            </p>
                            </div>

                            <div>
                            <label className="block text-sm font-semibold" htmlFor="inviteCode">
                                {t(lang, "registerInvite")}
                            </label>
                            <input
                                id="inviteCode"
                                type="text"
                                value={inviteCode}
                                readOnly={!!selectedOfficeId}
                                placeholder={t(lang, "registerInvitePlaceholder")}
                                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                {t(lang, "registerInviteHint")}
                            </p>
                            </div>
                        </>
                        )}

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
