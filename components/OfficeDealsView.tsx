import { useEffect, useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

type OfficeDealsViewProps = { lang: LangKey };

type DealRow = {
  id: string;
  caseType: string | null;
  status: string | null;
  pipelineStage: string;
  clientName: string | null;
  agentUserId: string | null;
  agentName: string | null;
  priceAmount: number | null;
  currency: string | null;
  listingId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const STAGE_ORDER = [
  "lead",
  "qualified",
  "contacted",
  "meeting_scheduled",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

function money(v: number | null, c = "PLN") {
  if (!v) return "—";
  return `${v.toLocaleString()} ${c}`;
}

function getStageLabel(stage: string, lang: LangKey) {
  const map: Record<string, string> = {
    lead: "Lead",
    qualified: "Zakwalifikowany",
    contacted: "Kontakt",
    meeting_scheduled: "Spotkanie",
    negotiation: "Negocjacje",
    closed_won: "Wygrane",
    closed_lost: "Utracone",
  };
  return map[stage] || stage;
}

const MOCK: DealRow[] = [
  {
    id: "1",
    caseType: "sale",
    status: "active",
    pipelineStage: "lead",
    clientName: "Jan Kowalski",
    agentUserId: "a1",
    agentName: "Michał",
    priceAmount: 850000,
    currency: "PLN",
    listingId: "l1",
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "2",
    caseType: "sale",
    status: "active",
    pipelineStage: "negotiation",
    clientName: "Anna Nowak",
    agentUserId: "a2",
    agentName: "Karolina",
    priceAmount: 1200000,
    currency: "PLN",
    listingId: "l2",
    createdAt: "",
    updatedAt: "",
  },
];

export default function OfficeDealsView({ lang }: OfficeDealsViewProps) {
  const [rows, setRows] = useState<DealRow[]>([]);

  useEffect(() => {
    fetch("/api/transactions/list")
      .then((r) => r.json())
      .then(setRows)
      .catch(console.error);
  }, []);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (query && !r.clientName?.toLowerCase().includes(query.toLowerCase())) return false;
      if (stageFilter && r.pipelineStage !== stageFilter) return false;
      return true;
    });
  }, [rows, query, stageFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, DealRow[]> = {};
    for (const s of STAGE_ORDER) map[s] = [];
    for (const r of filtered) {
      map[r.pipelineStage]?.push(r);
    }
    return map;
  }, [filtered]);

  const kpis = useMemo(() => {
    return {
      total: filtered.length,
      won: filtered.filter((r) => r.pipelineStage === "closed_won").length,
      lost: filtered.filter((r) => r.pipelineStage === "closed_lost").length,
      value: filtered.reduce((sum, r) => sum + (r.priceAmount || 0), 0),
    };
  }, [filtered]);

  const selected = rows.find((r) => r.id === selectedId);

  return (
    <div className="space-y-6">

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white/10 p-4 rounded-2xl">
          {t(lang, "officeDealsKpiTotal")}: {kpis.total}
        </div>
        <div className="bg-white/10 p-4 rounded-2xl">
          {t(lang, "officeDealsKpiWon")}: {kpis.won}
        </div>
        <div className="bg-white/10 p-4 rounded-2xl">
          {t(lang, "officeDealsKpiLost")}: {kpis.lost}
        </div>
        <div className="bg-white/10 p-4 rounded-2xl">
          {t(lang, "officeDealsKpiValue")}: {money(kpis.value)}
        </div>
      </div>

      {/* FILTRY */}
      <div className="flex gap-3">
        <input
          placeholder={t(lang, "officeDealsSearchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="px-4 py-2 rounded-xl bg-white/10"
        />

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="px-4 py-2 rounded-xl bg-white/10"
        >
          <option value="">{t(lang, "officeDealsAllStages")}</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {getStageLabel(s, lang)}
            </option>
          ))}
        </select>
      </div>

      {/* PIPELINE */}
      <div className="flex gap-4 overflow-x-auto">
        {STAGE_ORDER.map((stage) => (
          <div key={stage} className="min-w-[250px] bg-white/5 rounded-2xl p-3">
            <h3 className="font-bold mb-2">
              {getStageLabel(stage, lang)}
            </h3>

            <div className="space-y-2">
              {grouped[stage]?.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="bg-white/10 p-3 rounded-xl cursor-pointer hover:bg-white/20"
                >
                  <div className="font-semibold">{r.clientName}</div>
                  <div className="text-xs opacity-70">
                    {money(r.priceAmount)}
                  </div>
                  <div className="text-xs opacity-50">
                    {r.agentName}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* TABELA */}
      <div className="bg-white/5 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/10">
            <tr>
              <th className="p-2">{t(lang, "officeDealsTableClient")}</th>
              <th>{t(lang, "officeDealsTableType")}</th>
              <th>{t(lang, "officeDealsTableStage")}</th>
              <th>{t(lang, "officeDealsTablePrice")}</th>
              <th>{t(lang, "officeDealsTableAgent")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className="hover:bg-white/10 cursor-pointer"
              >
                <td className="p-2">{r.clientName}</td>
                <td>{r.caseType}</td>
                <td>{getStageLabel(r.pipelineStage, lang)}</td>
                <td>{money(r.priceAmount)}</td>
                <td>{r.agentName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DRAWER */}
      {selected && (
        <div className="fixed right-0 top-0 w-[350px] h-full bg-slate-900 p-6 shadow-2xl">
          <button onClick={() => setSelectedId(null)}>✕</button>

          <h2 className="text-lg font-bold mt-4">
            {selected.clientName}
          </h2>

          <p>{t(lang, "officeDealsTableStage")}: {getStageLabel(selected.pipelineStage, lang)}</p>
          <p>{t(lang, "officeDealsTablePrice")}: {money(selected.priceAmount)}</p>
          <p>{t(lang, "officeDealsTableAgent")}: {selected.agentName}</p>

          <div className="mt-6 space-y-2">
            <button className="w-full bg-white/10 p-2 rounded">
              📞 {t(lang, "officeDealsCall")}
            </button>
            <button className="w-full bg-white/10 p-2 rounded">
              📅 {t(lang, "officeDealsMeeting")}
            </button>
            <button className="w-full bg-white/10 p-2 rounded">
              📝 {t(lang, "officeDealsNote")}
            </button>
            {selected.listingId && (
              <button className="w-full bg-white/10 p-2 rounded">
                🏠 {t(lang, "officeDealsOpenOffer")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}