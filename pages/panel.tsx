import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useRouter } from "next/router";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

type NavItem = {
  key: string;         // translation key
  href?: string;       // optional route
  active?: boolean;    // simple active marker (MVP)
  badge?: string;      // e.g. "NEW"
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function PanelCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold tracking-tight text-ew-primary">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

function StatPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-ew-accent/10 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-ew-primary">{value}</p>
    </div>
  );
}

export default function PanelPage() {
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

const nav = useMemo<NavItem[]>(
  () => [
    { key: "panelNavDashboard", href: "/panel" },
    { key: "panelNavCalendar", href: "/calendar" }, // <-- poprawka
    { key: "panelNavListings" },
    { key: "panelNavBuyers" },
    { key: "panelNavClients" },
    { key: "panelNavTeam" },
    { key: "panelNavOfficeDeals" },
    { key: "panelNavEmployees" },
    { key: "panelNavPrimaryMarket" },
    { key: "panelNavBoard" },
    { key: "panelNavUsers" },
    { key: "panelNavLeaderboard" },
    { key: "panelNavDownloads" },
    { key: "panelNavQueries" },
    { key: "panelNavReports" },
    { key: "panelNavMenuSettings" },
  ],
  []
);

  return (
    <>
      <Head>
        <title>{t(lang, "panelTitle")}</title>
        <meta name="description" content={t(lang, "panelDesc")} />
      </Head>

      <main className="min-h-screen bg-ew-bg text-ew-primary">
        <div className="flex min-h-screen">
          {/* SIDEBAR */}
          <aside
            className={clsx(
              "sticky top-0 hidden h-screen w-72 shrink-0 border-r border-white/10 bg-ew-primary text-white md:block",
              sidebarOpen ? "" : "md:w-20"
            )}
          >
            <div className="flex h-16 items-center justify-between px-5">
              <div className="flex items-center gap-3">
                {/* LOGO */}
                <div
                className="
                    flex h-10 w-10 items-center justify-center
                    rounded-2xl
                    bg-white/25 backdrop-blur
                    ring-1 ring-white/30
                "
                >
                <img
                    src="/everyapp-logo.svg"
                    alt="EveryAPP"
                    className="h-7 w-auto"
                    />
                </div>

                {sidebarOpen ? (
                  <div className="leading-tight">
                    <div className="text-sm font-extrabold tracking-tight">EveryAPP</div>
                    <div className="text-xs text-white/70">{t(lang, "panelSidebarSub")}</div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setSidebarOpen((v) => !v)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10"
                aria-label={t(lang, "panelToggleSidebar")}
                title={t(lang, "panelToggleSidebar")}
              >
                {sidebarOpen ? "⟨⟨" : "⟩⟩"}
              </button>
            </div>

            <nav className="px-3 pb-6 pt-2">
                {nav.map((it) => {
                    const isActive =
                    !!it.href && (router.asPath === it.href || router.asPath.startsWith(it.href + "?"));

                    const rowClass = clsx(
                    "mt-1 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm transition",
                    isActive
                        ? "bg-white/10 text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    );

                    const content = (
                    <>
                        <span className={clsx("truncate", sidebarOpen ? "" : "text-center w-full")}>
                        {sidebarOpen ? t(lang, it.key as any) : "•"}
                        </span>

                        {sidebarOpen && it.badge ? (
                        <span className="rounded-full bg-ew-accent/20 px-2 py-0.5 text-[11px] font-semibold text-ew-accent">
                            {it.badge}
                        </span>
                        ) : null}
                    </>
                    );

                    return it.href ? (
                    <Link
                        key={it.key}
                        href={it.href}
                        className={rowClass}
                        title={t(lang, it.key as any)}
                    >
                        {content}
                    </Link>
                    ) : (
                    <button
                        key={it.key}
                        type="button"
                        className={rowClass}
                        title={t(lang, it.key as any)}
                    >
                        {content}
                    </button>
                    );
                })}
                </nav>

            <div className="mt-auto px-4 pb-5">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold text-white/80">{t(lang, "panelSidebarHintTitle")}</p>
                <p className="mt-1 text-xs text-white/65">{t(lang, "panelSidebarHintDesc")}</p>

                <div className="mt-3 flex gap-2">
                  <Link
                    href="/"
                    className="inline-flex flex-1 items-center justify-center rounded-2xl bg-ew-accent px-3 py-2 text-xs font-bold text-ew-primary transition hover:opacity-95"
                  >
                    {t(lang, "panelGoHome")}
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex flex-1 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10"
                  >
                    {t(lang, "panelLogout")}
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* CONTENT */}
          <section className="flex min-w-0 flex-1 flex-col">
            {/* TOPBAR */}
            <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
              <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-extrabold tracking-tight text-ew-primary">
                      {t(lang, "panelHeaderTitle")}
                    </h1>
                    <p className="truncate text-xs text-gray-500">{t(lang, "panelHeaderSub")}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="hidden sm:block">
                    <div className="relative">
                      <input
                        placeholder={t(lang, "panelSearchPlaceholder")}
                        className="w-72 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none transition focus:border-ew-accent focus:ring-2 focus:ring-ew-accent/20"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        ⌘K
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white px-2 py-1 shadow-sm">
                    <LanguageSwitcher currentLang={lang} />
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
                  >
                    + {t(lang, "panelAdd")}
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10"
                  >
                    {t(lang, "panelCustomize")}
                  </button>
                </div>
              </div>
            </header>

            {/* MAIN GRID */}
            <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
              {/* KPI row */}
              <div className="grid gap-4 md:grid-cols-4">
                <StatPill label={t(lang, "panelKpiCalls")} value="0" />
                <StatPill label={t(lang, "panelKpiMeetings")} value="0" />
                <StatPill label={t(lang, "panelKpiExports")} value="0" />
                <StatPill label={t(lang, "panelKpiNotes")} value="0" />
              </div>

              {/* Widgets grid (jak EstiCRM) */}
              <div className="mt-6 grid gap-6 md:grid-cols-12">
                <div className="md:col-span-7">
                  <PanelCard
                    title={t(lang, "panelWidgetListingsInProgressTitle")}
                    subtitle={t(lang, "panelWidgetListingsInProgressSub")}
                    right={
                      <button
                        type="button"
                        className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-ew-primary transition hover:bg-ew-accent/10"
                      >
                        {t(lang, "panelWidgetManage")}
                      </button>
                    }
                  >
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-ew-accent/5">
                      <p className="text-sm text-gray-500">{t(lang, "panelEmpty")}</p>
                    </div>
                  </PanelCard>
                </div>

                <div className="md:col-span-5">
                  <PanelCard
                    title={t(lang, "panelWidgetTopBuyersTitle")}
                    subtitle={t(lang, "panelWidgetTopBuyersSub")}
                  >
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-ew-accent/5">
                      <p className="text-sm text-gray-500">{t(lang, "panelEmpty")}</p>
                    </div>
                  </PanelCard>
                </div>

                <div className="md:col-span-7">
                  <PanelCard
                    title={t(lang, "panelWidgetNewOffersTitle")}
                    subtitle={t(lang, "panelWidgetNewOffersSub")}
                  >
                    <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-ew-accent/5">
                      <p className="text-sm text-gray-500">{t(lang, "panelEmpty")}</p>
                    </div>
                  </PanelCard>
                </div>

                <div className="md:col-span-5">
                  <PanelCard
                    title={t(lang, "panelWidgetTodayTitle")}
                    subtitle={t(lang, "panelWidgetTodaySub")}
                  >
                    <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-ew-accent/5">
                      <p className="text-sm text-gray-500">{t(lang, "panelEmpty")}</p>
                    </div>
                  </PanelCard>
                </div>

                {/* Recent changes / recent activated */}
                <div className="md:col-span-7">
                  <PanelCard title={t(lang, "panelWidgetRecentPriceChangesTitle")} subtitle={t(lang, "panelWidgetRecent7Days")}>
                    <div className="space-y-3">
                      {/* Placeholder rows */}
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ew-primary">{t(lang, "panelRowPlaceholderTitle")}</p>
                            <p className="truncate text-xs text-gray-500">{t(lang, "panelRowPlaceholderMeta")}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-extrabold text-emerald-600">0 PLN</p>
                            <p className="text-xs text-gray-500">{t(lang, "panelRowPlaceholderDate")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PanelCard>
                </div>

                <div className="md:col-span-5">
                  <PanelCard title={t(lang, "panelWidgetRecentActivatedTitle")} subtitle={t(lang, "panelWidgetRecent7Days")}>
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ew-primary">{t(lang, "panelRowPlaceholderTitle")}</p>
                            <p className="truncate text-xs text-gray-500">{t(lang, "panelRowPlaceholderMeta")}</p>
                          </div>
                          <span className="rounded-full bg-ew-accent/15 px-3 py-1 text-xs font-semibold text-ew-accent">
                            {t(lang, "panelStatusActive")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </PanelCard>
                </div>

                {/* Bottom widgets */}
                <div className="md:col-span-7">
                  <PanelCard title={t(lang, "panelWidgetMetricsTitle")} subtitle={t(lang, "panelWidgetMetricsSub")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-3xl border border-gray-200 bg-white p-5">
                        <p className="text-xs text-gray-500">{t(lang, "panelMetricDeals")}</p>
                        <p className="mt-2 text-4xl font-extrabold text-ew-primary">0</p>
                      </div>
                      <div className="rounded-3xl border border-gray-200 bg-white p-5">
                        <p className="text-xs text-gray-500">{t(lang, "panelMetricRevenue")}</p>
                        <p className="mt-2 text-4xl font-extrabold text-ew-primary">0</p>
                      </div>
                      <div className="rounded-3xl border border-gray-200 bg-white p-5">
                        <p className="text-xs text-gray-500">{t(lang, "panelMetricNewListings")}</p>
                        <p className="mt-2 text-4xl font-extrabold text-ew-primary">0</p>
                      </div>
                      <div className="rounded-3xl border border-gray-200 bg-white p-5">
                        <p className="text-xs text-gray-500">{t(lang, "panelMetricPresentations")}</p>
                        <p className="mt-2 text-4xl font-extrabold text-ew-primary">0</p>
                      </div>
                    </div>
                  </PanelCard>
                </div>

                <div className="md:col-span-5">
                  <PanelCard title={t(lang, "panelWidgetExportErrorsTitle")} subtitle={t(lang, "panelWidgetExportErrorsSub")}>
                    <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-ew-accent/5">
                      <p className="text-sm text-gray-500">{t(lang, "panelNoMessages")}</p>
                    </div>
                  </PanelCard>
                </div>
              </div>

              <footer className="mt-10 pb-6 text-xs text-gray-500">
                {t(lang, "panelFooter")}
              </footer>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
