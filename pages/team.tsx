// pages/team.tsx
import Head from "next/head";
import { useEffect, useState } from "react";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import TeamView from "@/components/TeamView";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

export default function TeamPage() {
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  return (
    <>
      <Head>
        <title>{t(lang, "teamTitle" as any) ?? "Team management"}</title>
      </Head>
      <main className="min-h-screen bg-ew-bg p-6 text-ew-primary">
        <TeamView />
      </main>
    </>
  );
}
