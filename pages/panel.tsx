import { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CalendarPage from "./calendar";
import { useRouter } from "next/router";
import TeamView from "@/components/TeamView";
import OffersView from "@/components/OffersView";
import OfficeDealsView from "@/components/OfficeDealsView";
import Image from "next/image";
import ContactsView from "@/components/ContactsView";
import KanbanView from "@/components/KanbanView";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

type PanelView =
  | "dashboard"
  | "calendar"
  | "offers"
  | "contacts"
  | "team"
  | "officeTransactions"
  | "downloads"
  | "notes"
  | "reports"
  | "menuSettings"
  | "pipeline";

type NavItem = {
  key: string;
  view?: PanelView;
  href?: string;
  subKey?: string;
  badge?: string;
  disabled?: boolean;
};

type BackfillScope = "office" | "global";

type PhoneBackfillStats = {
  scope: BackfillScope;
  officeId: string | null;
  allListings: number;
  withPhone: number;
  withoutPhone: number;
  filledTodayByUpdatedAt: number;
  filledTodayByEnrichedAt: number;
  checkedTodayByLastCheckedAt: number;
  lastUpdateAt: string | null;
  lastEnrichedAt: string | null;
  lastCheckedAt: string | null;
  effectivenessPercent: number;
};

type AgentChatMessage = {
  role: "user" | "assistant";
  text: string;
  actions?: any[];
};

type DashboardData = {
  scope: "agent" | "office";
  officeId: string;
  userId: string;
  me: {
    fullName: string | null;
    email: string | null;
    officeName: string | null;
    membershipRole: string | null;
  };
  kpis: {
    calls: number;
    meetings: number;
    exports: number;
    aiNotes: number;
  };
  offersInProgress: Array<{
    listing_id: string;
    office_id: string;
    record_type: string;
    transaction_type: string;
    status: string;
    created_at: string | null;
    case_owner_name: string | null;
    parties_summary: string | null;
  }>;
  topBuyers: Array<{
    id: string;
    name: string | null;
    cnt: number;
  }>;
  newExternalListings: Array<{
    id: string;
    source: string;
    source_url: string;
    title: string | null;
    price_amount: number | null;
    currency: string | null;
    location_text: string | null;
    created_at: string | null;
    updated_at: string | null;
    my_office_saved: boolean;
  }>;
  todayEvents: Array<{
    id: string;
    title: string;
    start_at: string | null;
    end_at: string | null;
    location_text: string | null;
    description: string | null;
    owner_user_id: string | null;
  }>;
  recentActivatedOffers: Array<{
    listing_id: string;
    office_id: string;
    record_type: string;
    transaction_type: string;
    status: string;
    created_at: string | null;
    case_owner_name: string | null;
    parties_summary: string | null;
  }>;
  recentPriceChanges: Array<{
    id: string;
    source: string;
    title: string | null;
    price_amount: number | null;
    currency: string | null;
    updated_at: string | null;
    location_text: string | null;
  }>;
  goals: {
    calls: number;
    visits: number;
    saved: number;
    revenue: number;
  };
  teamSnapshot: {
    membersCount: number;
    activeAgents: number;
    pendingMembers: number;
  };
  sales: {
    closedTotal: number;
    closedValue: number;
  };
  listingsSummary: {
    all: number;
    draft: number;
    active: number;
    closed: number;
    archived: number;
  };
  exportErrors: Array<any>;
  generatedAt: string;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDateTime(value: string | null, lang: LangKey) {
  if (!value) return t(lang, "panelCrawlerNoData" as any);
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatMoney(value: number | null | undefined, currency = "PLN") {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Number(value).toLocaleString()} ${currency}`.trim();
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString();
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPanelView(value: unknown): value is PanelView {
  return (
    value === "dashboard" ||
    value === "calendar" ||
    value === "offers" ||
    value === "contacts" ||
    value === "team" ||
    value === "officeTransactions" ||
    value === "downloads" ||
    value === "notes" ||
    value === "reports" ||
    value === "menuSettings" ||
    value === "pipeline"
  );
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
    <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-extrabold tracking-tight text-white">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-white/60">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 shadow-lg backdrop-blur-md">
      <p className="text-xs text-white/60">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-white">{value}</p>
    </div>
  );
}

function PlaceholderView({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-white/50">{subtitle}</p>
          </div>

          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80">
            W przygotowaniu
          </span>
        </div>

        <div className="mt-4 flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
          <p className="text-sm text-white/60">
            Kontener sekcji jest już aktywny. Kolejny krok: właściwy widok i dane.
          </p>
        </div>
      </div>
    </div>
  );
}

function ClickableRow({
  title,
  subtitle,
  right,
  onClick,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left backdrop-blur-md transition hover:bg-white/15"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        <p className="truncate text-xs text-white/60">{subtitle || "—"}</p>
      </div>

      {right ? <div className="shrink-0">{right}</div> : null}
    </button>
  );
}

export default function PanelPage() {
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);

  const router = useRouter();

  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarVisible = isMobile ? sidebarOpen : true;

  const [activeView, setActiveView] = useState<PanelView>("dashboard");

  const [agentText, setAgentText] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([
    {
      role: "assistant",
      text: t(lang, "panelAgentWelcome" as any),
      actions: [],
    },
  ]);

  const [dashboardScope, setDashboardScope] = useState<"agent" | "office">("office");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [backfillScope, setBackfillScope] = useState<BackfillScope>("office");
  const [stats, setStats] = useState<PhoneBackfillStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  
  const statsRequestSeqRef = useRef(0);

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;

    const viewFromQuery = router.query.view;
    const nextView =
      typeof viewFromQuery === "string" && isPanelView(viewFromQuery)
        ? viewFromQuery
        : "dashboard";

    setActiveView(nextView);
  }, [router.isReady, router.query.view]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (activeView === "dashboard") {
      loadDashboard(dashboardScope);
    }
  }, [activeView, dashboardScope]);

  useEffect(() => {
    if (activeView === "reports") {
      fetchPhoneBackfillStats(backfillScope);
    }
  }, [activeView, backfillScope]);

  const nav = useMemo<NavItem[]>(
    () => [
      { key: "panelNavDashboard", view: "dashboard", subKey: "panelHeaderSub" },
      { key: "panelNavCalendar", view: "calendar", subKey: "panelCalendarSub" },
      { key: "panelNavListings", view: "offers", subKey: "offersSubtitle" },
      { key: "panelNavClients", view: "contacts", subKey: "panelContactsSub" },
      { key: "panelNavTeam", view: "team", subKey: "teamSubtitle" },
      { key: "panelNavOfficeDeals", view: "officeTransactions", subKey: "panelOfficeDealsSub" },
      { key: "panelNavDownloads", view: "downloads", subKey: "panelDownloadsSub" },
      { key: "panelNavNotes", view: "notes", subKey: "panelNotesSub" },
      { key: "panelNavReports", view: "reports", subKey: "panelReportsSub" },
      { key: "panelNavMenuSettings", view: "menuSettings", subKey: "panelMenuSettingsSub" },
      { key: "panelNavPipeline", view: "pipeline", subKey: "panelPipelineSub" },
    ],
    []
  );

  const activeNavItem = useMemo(() => {
    return nav.find((x) => x.view === activeView) ?? nav[0];
  }, [nav, activeView]);

  async function loadDashboard(scope: "agent" | "office" = dashboardScope) {
    try {
      setDashboardLoading(true);
      setDashboardError(null);

      const r = await fetch(`/api/dashboard?scope=${scope}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }

      setDashboardData(j as DashboardData);
    } catch (e: any) {
      console.error("DASHBOARD_LOAD_ERROR", e);
      setDashboardError(e?.message ?? "DASHBOARD_LOAD_ERROR");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function runEveryAgent() {
    const msg = agentText.trim();
    if (!msg) return;

    const nextHistory: AgentChatMessage[] = [...agentMessages, { role: "user", text: msg }];

    setAgentMessages(nextHistory);
    setAgentText("");

    try {
      setAgentLoading(true);

      const r = await fetch("/api/everyagent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: msg,
          history: nextHistory,
          uiContext: {
            currentView: activeView,
            currentFilters: null,
            currentListingId: "",
            currentClientId: "",
            currentLocation: "",
            clientProfile: "",
          },
        }),
      });

      const j = await r.json().catch(() => null);

      const reply =
        typeof j?.reply === "string" && j.reply.trim()
          ? j.reply.trim()
          : t(lang, "panelAgentNoResult" as any);

      const actions = Array.isArray(j?.actions) ? j.actions : [];

      setAgentMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: reply,
          actions,
        },
      ]);

      for (const action of actions) {
        console.log("EVERYAGENT_ACTION", action);
      }
    } catch (e) {
      console.error("EVERYAGENT_RUN_ERROR", e);

      setAgentMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: t(lang, "panelAgentError" as any),
        },
      ]);
    } finally {
      setAgentLoading(false);
    }
  }

  function handleAgentAction(action: any) {
    if (!action || typeof action !== "object") return;

    if (action.type === "open_listing" && typeof action.url === "string") {
      window.open(action.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (
      action.type === "set_filters" ||
      action.type === "run_live" ||
      action.type === "load_neon" ||
      action.type === "refresh_map"
    ) {
      router.push({
        pathname: "/panel",
        query: { view: "offers" },
      });
      return;
    }
  }


  async function fetchPhoneBackfillStats(scope: BackfillScope) {
    const requestSeq = ++statsRequestSeqRef.current;

    try {
      setStatsLoading(true);
      setStatsError(null);

      const res = await fetch(`/api/external_listings/phone-backfill-stats?scope=${scope}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (requestSeq !== statsRequestSeqRef.current) return;

      if (!res.ok) {
        setStatsError(data?.error ?? "STATS_ERROR");
        return;
      }

      setStats(data as PhoneBackfillStats);
    } catch (err) {
      if (requestSeq !== statsRequestSeqRef.current) return;
      console.error("PHONE_BACKFILL_FETCH_ERROR", err);
      setStatsError("STATS_ERROR");
    } finally {
      if (requestSeq === statsRequestSeqRef.current) {
        setStatsLoading(false);
      }
    }
  }

  function switchBackfillScope(scope: BackfillScope) {
    setBackfillScope(scope);
  }

  function goToView(view: PanelView) {
    router.push({
      pathname: "/panel",
      query: { view },
    });
  }

  function goToOffer(listingId: string) {
    router.push(`/panel/offers/${listingId}`);
  }

  function goToContact(contactId: string) {
    router.push(`/panel/contacts/${encodeURIComponent(contactId)}`);
  }

  return (
    <>
      <Head>
        <title>{t(lang, "panelTitle")}</title>
        <meta name="description" content={t(lang, "panelDesc")} />
      </Head>

      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="absolute inset-0">
          <Image
            src="/katowice-panorama.jpg"
            alt="Panorama Katowic"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/70 to-slate-900/40" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/75" />
        </div>

        <div className="relative flex min-h-screen">
          <aside
            className={clsx(
              "fixed left-0 top-0 z-50 h-screen",
              "transition-all duration-200",
              isMobile && !sidebarVisible && "pointer-events-none"
            )}
          >
            {isMobile && sidebarVisible ? (
              <button
                type="button"
                aria-label="Close sidebar overlay"
                className="fixed inset-0 z-40 bg-black/30 pointer-events-auto"
                onClick={() => setSidebarOpen(false)}
              />
            ) : null}

            <div
              className={clsx(
                "h-full border-r border-white/10 bg-gradient-to-b from-slate-950/88 via-slate-900/80 to-slate-950/88 text-white backdrop-blur-xl",
                "transition-transform duration-200 will-change-transform",
                "w-56",
                "relative z-50",
                isMobile ? (sidebarVisible ? "translate-x-0" : "-translate-x-full") : "translate-x-0",
                isMobile && "pointer-events-auto",
                isMobile && "pt-[env(safe-area-inset-top)]"
              )}
            >
              <div className="flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/20">
                    <img
                      src="/everyapp-logo.svg"
                      alt="EveryAPP"
                      className="h-7 w-auto brightness-0 invert"
                    />
                  </div>

                  <div className="leading-tight">
                    <div className="text-sm font-extrabold tracking-tight">EveryAPP</div>
                    <div className="text-xs text-white/70">{t(lang, "panelSidebarSub")}</div>
                  </div>
                </div>

                {isMobile ? (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10"
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <nav className="px-2 pb-6 pt-2">
                {nav.map((it) => {
                  const isActive = it.view ? activeView === it.view : false;
                  const isDisabled = !!it.disabled;

                  const rowClass = clsx(
                    "mt-1 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left text-sm transition",
                    isActive && "bg-white/10 ring-1 ring-white/10 text-white",
                    !isActive && !isDisabled && "text-white/85 hover:bg-white/10 hover:text-white",
                    isDisabled && "cursor-not-allowed opacity-50"
                  );

                  return (
                    <button
                      key={it.key}
                      type="button"
                      className={rowClass}
                      title={t(lang, it.key as any)}
                      disabled={isDisabled}
                      onClick={() => {
                        if (it.disabled) return;

                        if (it.href) {
                          router.push(it.href);
                        } else if (it.view) {
                          router.push({
                            pathname: "/panel",
                            query: { view: it.view },
                          });
                        }

                        if (isMobile) setSidebarOpen(false);
                      }}
                    >
                      <span className="truncate">{t(lang, it.key as any)}</span>
                      {it.badge ? (
                        <span className="rounded-full bg-ew-accent/20 px-2 py-0.5 text-[11px] font-semibold text-ew-accent">
                          {it.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto px-3 pb-5">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-white/80">
                    {t(lang, "panelSidebarHintTitle")}
                  </p>
                  <p className="mt-1 text-xs text-white/65">
                    {t(lang, "panelSidebarHintDesc")}
                  </p>

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
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col lg:pl-56">
            <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/45 backdrop-blur-md">
              <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-4 lg:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-sm transition hover:bg-white/15"
                    aria-label="Open menu"
                    title="Open menu"
                  >
                    ☰
                  </button>

                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-extrabold tracking-tight text-white">
                      {t(lang, activeNavItem.key as any)}
                    </h1>

                    <p className="truncate text-xs text-white/60">
                      {activeNavItem.subKey
                        ? t(lang, activeNavItem.subKey as any)
                        : t(lang, "panelHeaderSub")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="hidden sm:block">
                    <div className="relative">
                      <input
                        placeholder={t(lang, "panelSearchPlaceholder")}
                        className="w-72 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40">
                        ⌘K
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-2 py-1 shadow-sm backdrop-blur-md">
                    <LanguageSwitcher currentLang={lang} />
                  </div>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
                  >
                    + {t(lang, "panelAdd")}
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
                  >
                    {t(lang, "panelCustomize")}
                  </button>
                </div>
              </div>
            </header>

            {activeView === "dashboard" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                {dashboardError ? (
                  <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
                    {dashboardError}
                  </div>
                ) : null}

                {dashboardLoading ? (
                  <div className="mb-4 rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/60">
                    Ładowanie pulpitu...
                  </div>
                ) : null}

                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
                    <button
                      type="button"
                      onClick={() => setDashboardScope("office")}
                      className={clsx(
                        "rounded-xl px-3 py-2 text-xs font-semibold transition",
                        dashboardScope === "office"
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      Biuro
                    </button>

                    <button
                      type="button"
                      onClick={() => setDashboardScope("agent")}
                      className={clsx(
                        "rounded-xl px-3 py-2 text-xs font-semibold transition",
                        dashboardScope === "agent"
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      Agent
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadDashboard(dashboardScope)}
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
                  >
                    {t(lang, "offersRefresh" as any)}
                  </button>
                </div>

                <div className="mb-6">
                  <PanelCard
                    title={t(lang, "panelAgentTitle" as any)}
                    subtitle={t(lang, "panelAgentSubtitle" as any)}
                  >
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                        {agentMessages.map((msg, idx) => (
                          <div
                            key={`${msg.role}-${idx}`}
                            className={clsx(
                              "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                              msg.role === "user"
                                ? "ml-auto bg-white/15 text-white"
                                : "mr-auto border border-white/10 bg-white/10 text-white/90"
                            )}
                          >
                            <div>{msg.text}</div>

                            {msg.role === "assistant" &&
                            Array.isArray(msg.actions) &&
                            msg.actions.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {msg.actions.map((action, actionIdx) => {
                                  if (
                                    action?.type === "set_filters" ||
                                    action?.type === "run_live" ||
                                    action?.type === "load_neon" ||
                                    action?.type === "refresh_map"
                                  ) {
                                    return (
                                      <button
                                        key={`action-${idx}-${actionIdx}`}
                                        type="button"
                                        onClick={() => handleAgentAction(action)}
                                        className="rounded-xl border border-white/10 bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                                      >
                                        {t(lang, "panelAgentOpenOffers" as any)}
                                      </button>
                                    );
                                  }

                                  if (action?.type === "open_listing" && typeof action.url === "string") {
                                    return (
                                      <button
                                        key={`action-${idx}-${actionIdx}`}
                                        type="button"
                                        onClick={() => handleAgentAction(action)}
                                        className="rounded-xl border border-white/10 bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
                                      >
                                        {t(lang, "panelAgentOpenListing" as any)}
                                      </button>
                                    );
                                  }

                                  return null;
                                })}
                              </div>
                            ) : null}
                          </div>
                        ))}

                        {agentLoading && (
                          <div className="mr-auto max-w-[85%] rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/70">
                            {t(lang, "panelAgentThinking" as any)}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex gap-3">
                        <input
                          value={agentText}
                          onChange={(e) => setAgentText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") runEveryAgent();
                          }}
                          placeholder={t(lang, "panelAgentPlaceholder" as any)}
                          className="flex-1 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                        />

                        <button
                          onClick={runEveryAgent}
                          className="rounded-2xl border border-white/10 bg-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/30"
                        >
                          {t(lang, "panelAgentSend" as any)}
                        </button>
                      </div>
                    </div>
                  </PanelCard>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <StatPill label={t(lang, "panelKpiCalls")} value={String(dashboardData?.kpis.calls ?? 0)} />
                  <StatPill
                    label={t(lang, "panelKpiMeetings")}
                    value={String(dashboardData?.kpis.meetings ?? 0)}
                  />
                  <StatPill
                    label={t(lang, "panelKpiExports")}
                    value={String(dashboardData?.kpis.exports ?? 0)}
                  />
                  <StatPill
                    label={t(lang, "panelKpiNotes")}
                    value={String(dashboardData?.kpis.aiNotes ?? 0)}
                  />
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-12">
                  <div className="md:col-span-7">
                    <PanelCard
                      title={t(lang, "panelWidgetListingsInProgressTitle")}
                      subtitle={t(lang, "panelWidgetListingsInProgressSub")}
                      right={
                        <button
                          type="button"
                          onClick={() => goToView("offers")}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                        >
                          {t(lang, "panelWidgetManage")}
                        </button>
                      }
                    >
                      {dashboardData?.offersInProgress?.length ? (
                        <div className="space-y-3">
                          {dashboardData.offersInProgress.map((item) => (
                            <ClickableRow
                              key={item.listing_id}
                              onClick={() => goToOffer(item.listing_id)}
                              title={
                                [item.record_type, item.transaction_type, item.status]
                                  .filter(Boolean)
                                  .join(" / ") || item.listing_id
                              }
                              subtitle={
                                item.parties_summary || item.case_owner_name || item.created_at || "—"
                              }
                              right={
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                                  {item.status}
                                </span>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelEmpty")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>

                  <div className="md:col-span-5">
                    <PanelCard
                      title={t(lang, "panelWidgetTopBuyersTitle")}
                      subtitle={t(lang, "panelWidgetTopBuyersSub")}
                      right={
                        <button
                          type="button"
                          onClick={() => goToView("contacts")}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                        >
                          Otwórz
                        </button>
                      }
                    >
                      {dashboardData?.topBuyers?.length ? (
                        <div className="space-y-3">
                          {dashboardData.topBuyers.map((item, idx) => (
                            <ClickableRow
                              key={item?.id ?? idx}
                              onClick={() => goToContact(item.id)}
                              title={item?.name ?? "—"}
                              subtitle={`Powiązania kupującego: ${item?.cnt ?? 0}`}
                              right={
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                                  {item?.cnt ?? 0}
                                </span>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelEmpty")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>

                  <div className="md:col-span-7">
                    <PanelCard
                      title={t(lang, "panelWidgetNewOffersTitle")}
                      subtitle={t(lang, "panelWidgetNewOffersSub")}
                      right={
                        <button
                          type="button"
                          onClick={() => goToView("offers")}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                        >
                          Otwórz
                        </button>
                      }
                    >
                      {dashboardData?.newExternalListings?.length ? (
                        <div className="space-y-3">
                          {dashboardData.newExternalListings.map((item) => (
                            <ClickableRow
                              key={item.id}
                              onClick={() => goToView("offers")}
                              title={item.title || item.source_url || item.id}
                              subtitle={[item.location_text, item.source].filter(Boolean).join(" • ") || "—"}
                              right={
                                <div className="text-right">
                                  <p className="text-sm font-extrabold text-emerald-300">
                                    {formatMoney(item.price_amount, item.currency ?? "PLN")}
                                  </p>
                                  <p className="text-xs text-white/60">
                                    {formatShortDate(item.created_at)}
                                  </p>
                                </div>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelEmpty")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>

                  <div className="md:col-span-5">
                    <PanelCard
                      title={t(lang, "panelWidgetTodayTitle")}
                      subtitle={t(lang, "panelWidgetTodaySub")}
                      right={
                        <button
                          type="button"
                          onClick={() => goToView("calendar")}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                        >
                          Otwórz
                        </button>
                      }
                    >
                      {dashboardData?.todayEvents?.length ? (
                        <div className="space-y-3">
                          {dashboardData.todayEvents.map((item) => (
                            <ClickableRow
                              key={item.id}
                              onClick={() => goToView("calendar")}
                              title={item.title}
                              subtitle={item.location_text || item.description || "—"}
                              right={
                                <p className="text-sm font-extrabold text-white">
                                  {item.start_at
                                    ? new Date(item.start_at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "—"}
                                </p>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelEmpty")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>

                  <div className="md:col-span-7">
                    <PanelCard
                      title={t(lang, "panelWidgetRecentPriceChangesTitle")}
                      subtitle={t(lang, "panelWidgetRecent7Days")}
                      right={
                        <button
                          type="button"
                          onClick={() => goToView("offers")}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                        >
                          Otwórz
                        </button>
                      }
                    >
                      {dashboardData?.recentPriceChanges?.length ? (
                        <div className="space-y-3">
                          {dashboardData.recentPriceChanges.map((item) => (
                            <ClickableRow
                              key={item.id}
                              onClick={() => goToView("offers")}
                              title={item.title || item.id}
                              subtitle={[item.location_text, item.source].filter(Boolean).join(" • ") || "—"}
                              right={
                                <div className="text-right">
                                  <p className="text-sm font-extrabold text-emerald-300">
                                    {formatMoney(item.price_amount, item.currency ?? "PLN")}
                                  </p>
                                  <p className="text-xs text-white/60">
                                    {formatShortDate(item.updated_at)}
                                  </p>
                                </div>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelEmpty")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>

                  <div className="md:col-span-5">
                    <PanelCard
                      title={t(lang, "panelWidgetRecentActivatedTitle")}
                      subtitle={t(lang, "panelWidgetRecent7Days")}
                      right={
                        <button
                          type="button"
                          onClick={() => goToView("offers")}
                          className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
                        >
                          Otwórz
                        </button>
                      }
                    >
                      {dashboardData?.recentActivatedOffers?.length ? (
                        <div className="space-y-3">
                          {dashboardData.recentActivatedOffers.map((item) => (
                            <ClickableRow
                              key={item.listing_id}
                              onClick={() => goToOffer(item.listing_id)}
                              title={
                                [item.record_type, item.transaction_type]
                                  .filter(Boolean)
                                  .join(" / ") || item.listing_id
                              }
                              subtitle={item.case_owner_name || item.parties_summary || "—"}
                              right={
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                                  {item.status}
                                </span>
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelEmpty")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>

                  <div className="md:col-span-7">
                    <PanelCard
                      title={t(lang, "panelWidgetMetricsTitle")}
                      subtitle={t(lang, "panelWidgetMetricsSub")}
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-md">
                          <p className="text-xs text-white/60">{t(lang, "panelMetricDeals")}</p>
                          <p className="mt-2 text-4xl font-extrabold text-white">
                            {dashboardData?.sales?.closedTotal ?? 0}
                          </p>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-md">
                          <p className="text-xs text-white/60">{t(lang, "panelMetricRevenue")}</p>
                          <p className="mt-2 text-4xl font-extrabold text-white">
                            {dashboardData?.sales?.closedValue
                              ? Number(dashboardData.sales.closedValue).toLocaleString()
                              : 0}
                          </p>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-md">
                          <p className="text-xs text-white/60">{t(lang, "panelMetricNewListings")}</p>
                          <p className="mt-2 text-4xl font-extrabold text-white">
                            {dashboardData?.listingsSummary?.active ?? 0}
                          </p>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-lg backdrop-blur-md">
                          <p className="text-xs text-white/60">{t(lang, "panelMetricPresentations")}</p>
                          <p className="mt-2 text-4xl font-extrabold text-white">
                            {dashboardData?.goals?.calls ?? 0}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-5">
                        <StatPill label="Wszystkie" value={String(dashboardData?.listingsSummary?.all ?? 0)} />
                        <StatPill label="Draft" value={String(dashboardData?.listingsSummary?.draft ?? 0)} />
                        <StatPill label="Active" value={String(dashboardData?.listingsSummary?.active ?? 0)} />
                        <StatPill label="Closed" value={String(dashboardData?.listingsSummary?.closed ?? 0)} />
                        <StatPill label="Archived" value={String(dashboardData?.listingsSummary?.archived ?? 0)} />
                      </div>
                    </PanelCard>
                  </div>

                  <div className="md:col-span-5">
                    <PanelCard
                      title={t(lang, "panelWidgetExportErrorsTitle")}
                      subtitle={t(lang, "panelWidgetExportErrorsSub")}
                    >
                      {dashboardData?.exportErrors?.length ? (
                        <div className="space-y-3">
                          {dashboardData.exportErrors.map((item: any, idx: number) => (
                            <div
                              key={item?.id ?? idx}
                              className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3"
                            >
                              <p className="text-sm font-semibold text-amber-100">
                                {item?.title ?? item?.message ?? "Błąd eksportu"}
                              </p>
                              <p className="mt-1 text-xs text-amber-200/80">
                                {item?.details ?? item?.code ?? "—"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
                          <p className="text-sm text-white/60">{t(lang, "panelNoMessages")}</p>
                        </div>
                      )}
                    </PanelCard>
                  </div>
                </div>

                <footer className="mt-10 pb-6 text-xs text-white/55">{t(lang, "panelFooter")}</footer>
              </div>
            ) : activeView === "calendar" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <CalendarPage />
              </div>
            ) : activeView === "offers" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <OffersView lang={lang} />
              </div>
            ) : activeView === "contacts" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <ContactsView lang={lang} />
              </div>
            ) : activeView === "team" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <TeamView />
              </div>
              ) : activeView === "pipeline" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <KanbanView lang={lang} />
              </div>
            ) : activeView === "officeTransactions" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <OfficeDealsView lang={lang} />
              </div>
            ) : activeView === "reports" ? (
              <div className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4 lg:px-6">
                <PanelCard
                  title={t(lang, "panelCrawlerCardTitle" as any)}
                  subtitle={t(lang, "panelCrawlerCardSubtitle" as any)}
                  right={
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
                        <button
                          type="button"
                          onClick={() => switchBackfillScope("office")}
                          className={clsx(
                            "rounded-xl px-3 py-2 text-xs font-semibold transition",
                            backfillScope === "office"
                              ? "bg-white/10 text-white"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          {t(lang, "panelCrawlerScopeOffice" as any)}
                        </button>
                        <button
                          type="button"
                          onClick={() => switchBackfillScope("global")}
                          className={clsx(
                            "rounded-xl px-3 py-2 text-xs font-semibold transition",
                            backfillScope === "global"
                              ? "bg-white/10 text-white"
                              : "text-white/70 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          {t(lang, "panelCrawlerScopeGlobal" as any)}
                        </button>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-5">
                    {statsLoading ? (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-10 text-sm text-white/60">
                        {t(lang, "panelCrawlerLoading" as any)}
                      </div>
                    ) : statsError ? (
                      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
                        {t(lang, "panelCrawlerRunError" as any)}
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 md:grid-cols-3">
                          <StatPill
                            label={t(lang, "panelCrawlerAllListings" as any)}
                            value={String(stats?.allListings ?? 0)}
                          />
                          <StatPill
                            label={t(lang, "panelCrawlerWithPhone" as any)}
                            value={String(stats?.withPhone ?? 0)}
                          />
                          <StatPill
                            label={t(lang, "panelCrawlerWithoutPhone" as any)}
                            value={String(stats?.withoutPhone ?? 0)}
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <StatPill
                            label={t(lang, "panelCrawlerFilledTodayUpdated" as any)}
                            value={String(stats?.filledTodayByUpdatedAt ?? 0)}
                          />
                          <StatPill
                            label={t(lang, "panelCrawlerFilledTodayEnriched" as any)}
                            value={String(stats?.filledTodayByEnrichedAt ?? 0)}
                          />
                          <StatPill
                            label={t(lang, "panelCrawlerCheckedToday" as any)}
                            value={String(stats?.checkedTodayByLastCheckedAt ?? 0)}
                          />
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold text-white">
                              {t(lang, "panelCrawlerEffectiveness" as any)}
                            </p>
                            <p className="text-sm font-extrabold text-white">
                              {stats?.effectivenessPercent ?? 0}%
                            </p>
                          </div>

                          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full bg-white/70 transition-all"
                              style={{ width: `${stats?.effectivenessPercent ?? 0}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-white/60">
                              {t(lang, "panelCrawlerLastUpdateAt" as any)}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-white">
                              {formatDateTime(stats?.lastUpdateAt ?? null, lang)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-white/60">
                              {t(lang, "panelCrawlerLastEnrichedAt" as any)}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-white">
                              {formatDateTime(stats?.lastEnrichedAt ?? null, lang)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <p className="text-xs text-white/60">
                              {t(lang, "panelCrawlerLastCheckedAt" as any)}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-white">
                              {formatDateTime(stats?.lastCheckedAt ?? null, lang)}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </PanelCard>
              </div>
            ) : activeView === "downloads" ? (
              <PlaceholderView
                title={t(lang, "panelNavDownloads" as any)}
                subtitle={t(lang, "panelDownloadsSub" as any)}
              />
            ) : activeView === "notes" ? (
              <PlaceholderView
                title={t(lang, "panelNavNotes" as any)}
                subtitle={t(lang, "panelNotesSub" as any)}
              />
            ) : activeView === "menuSettings" ? (
              <PlaceholderView
                title={t(lang, "panelNavMenuSettings" as any)}
                subtitle={t(lang, "panelMenuSettingsSub" as any)}
              />
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}