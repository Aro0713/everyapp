import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

type KanbanStage =
  | "lead"
  | "qualified"
  | "contacted"
  | "meeting_scheduled"
  | "needs_analysis"
  | "property_match"
  | "offer_preparation"
  | "offer_sent"
  | "negotiation"
  | "contract_preparation"
  | "closed_won"
  | "closed_lost";

type KanbanItem = {
  client_case_id?: string | null;
  party_id: string;
  full_name: string;
  party_type?: string | null;
  phone?: string | null;
  email?: string | null;
  case_type?: string | null;
  case_status?: string | null;
  pipeline_stage?: KanbanStage | string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  listing_count?: number;
  listing_ids?: string[];
  listing_titles?: string[];
  latest_listing_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type KanbanColumn = {
  id: KanbanStage;
  title: string;
  items: KanbanItem[];
};

type KanbanResponse = {
  ok?: boolean;
  officeId?: string;
  scope?: "office" | "agent";
  columns?: KanbanColumn[];
  stages?: KanbanStage[];
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function mapStageToKey(stage: string) {
  switch (stage) {
    case "lead":
      return "pipelineLead";
    case "qualified":
      return "pipelineQualified";
    case "contacted":
      return "pipelineContacted";
    case "meeting_scheduled":
      return "pipelineMeeting";
    case "needs_analysis":
      return "pipelineNeeds";
    case "property_match":
      return "pipelineMatch";
    case "offer_preparation":
      return "pipelineOfferPrep";
    case "offer_sent":
      return "pipelineOfferSent";
    case "negotiation":
      return "pipelineNegotiation";
    case "contract_preparation":
      return "pipelineContract";
    case "closed_won":
      return "pipelineWon";
    case "closed_lost":
      return "pipelineLost";
    default:
      return stage;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleDateString();
}

function stageTone(stage: string) {
  if (stage === "closed_won") {
    return "border-emerald-500/25 bg-emerald-500/10";
  }
  if (stage === "closed_lost") {
    return "border-rose-500/25 bg-rose-500/10";
  }
  if (stage === "negotiation" || stage === "contract_preparation") {
    return "border-amber-500/25 bg-amber-500/10";
  }
  return "border-white/10 bg-white/5";
}

export default function KanbanView({ lang }: { lang: LangKey }) {
  const router = useRouter();

  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  async function load() {
    try {
      setLoading(true);
      setErr(null);

      const r = await fetch("/api/kanban/list", {
        method: "GET",
        cache: "no-store",
      });

      const j = (await r.json().catch(() => null)) as KanbanResponse | null;

      if (!r.ok) {
        throw new Error(j && "error" in (j as any) ? (j as any).error : `HTTP ${r.status}`);
      }

      setColumns(Array.isArray(j?.columns) ? j!.columns : []);
    } catch (e: any) {
      setErr(e?.message ?? "KANBAN_LOAD_ERROR");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const allItemsByPartyId = useMemo(() => {
    const map = new Map<string, KanbanItem>();
    for (const col of columns) {
      for (const item of col.items) {
        map.set(item.party_id, item);
      }
    }
    return map;
  }, [columns]);

  function openContact(partyId: string) {
    router.push(`/panel?view=contacts&clientId=${encodeURIComponent(partyId)}`);
  }

  function openListing(listingId: string) {
    router.push(`/panel/offers/${listingId}`);
  }

 async function handleDragEnd(event: DragEndEvent) {
  const activeId = String(event.active?.id ?? "");
  const overId = String(event.over?.id ?? "");

  if (!activeId || !overId) return;
  console.log("KANBAN_DND", { activeId, overId });

  const fromCol = columns.find((c) => c.items.some((i) => i.party_id === activeId));

  const toCol =
    columns.find((c) => c.id === overId) ||
    columns.find((c) => c.items.some((i) => i.party_id === overId));

  if (!fromCol || !toCol) return;
  if (fromCol.id === toCol.id) return;

  const movedItem = allItemsByPartyId.get(activeId);
  if (!movedItem) return;

  const prevColumns = columns;

  setColumns((prev) =>
    prev.map((col) => {
      if (col.id === fromCol.id) {
        return {
          ...col,
          items: col.items.filter((item) => item.party_id !== activeId),
        };
      }

      if (col.id === toCol.id) {
        return {
          ...col,
          items: [{ ...movedItem, pipeline_stage: toCol.id }, ...col.items],
        };
      }

      return col;
    })
  );

  try {
    setSavingId(activeId);

    const r = await fetch("/api/kanban/move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        partyId: movedItem.party_id,
        pipelineStage: toCol.id,
      }),
    });

    const j = await r.json().catch(() => null);

    if (!r.ok) {
      throw new Error(j?.error ?? `HTTP ${r.status}`);
    }
  } catch (e: any) {
    setColumns(prevColumns);
    setErr(e?.message ?? "KANBAN_MOVE_ERROR");
  } finally {
    setSavingId(null);
  }
}

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-6 shadow-2xl backdrop-blur-xl">
        <div className="text-sm text-white/70">
          {t(lang, "loading" as any) ?? "Loading..."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white">
              {t(lang, "panelNavPipeline" as any)}
            </h2>
            <p className="mt-0.5 text-xs text-white/50">
              {t(lang, "panelPipelineSub" as any)}
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
          >
            {t(lang, "offersRefresh" as any)}
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto pb-3">
            <div className="flex min-w-max gap-4">
              {columns.map((col) => (
                <div
                  key={col.id}
                  className={clsx(
                    "w-[320px] shrink-0 rounded-3xl border p-3 shadow-xl backdrop-blur-xl",
                    stageTone(col.id)
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold text-white">
                        {t(lang, mapStageToKey(col.id) as any)}
                      </div>
                      <div className="mt-0.5 text-xs text-white/50">
                        {col.items.length}
                      </div>
                    </div>
                  </div>

                  <SortableContext
                    items={col.items.map((i) => i.party_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      id={col.id}
                      className="min-h-[220px] space-y-3 rounded-2xl border border-white/5 bg-black/10 p-1"
                    >
                      {col.items.map((item) => {
                        const isSaving = savingId === item.party_id;

                        return (
                          <button
                            type="button"
                            key={item.party_id}
                            id={item.party_id}
                            onClick={() => openContact(item.party_id)}
                            className={clsx(
                              "w-full rounded-2xl border border-white/10 bg-white/10 p-4 text-left text-white shadow-lg transition",
                              "hover:bg-white/15",
                              isSaving && "opacity-70"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-bold text-white">
                                  {item.full_name || "—"}
                                </div>

                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {item.case_type ? (
                                    <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                      {item.case_type}
                                    </span>
                                  ) : null}

                                  {item.case_status ? (
                                    <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                      {item.case_status}
                                    </span>
                                  ) : null}

                                  {typeof item.listing_count === "number" ? (
                                    <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                                      oferty: {item.listing_count}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              {isSaving ? (
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70">
                                  saving
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 space-y-1 text-xs text-white/65">
                              <div>{item.phone || "—"}</div>
                              <div className="truncate">{item.email || "—"}</div>
                              <div>
                                {item.assigned_user_name || "—"} • {formatDate(item.updated_at)}
                              </div>
                            </div>

                            {item.latest_listing_id ? (
                              <div className="mt-3">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openListing(item.latest_listing_id!);
                                  }}
                                  className="text-xs font-semibold text-ew-accent underline"
                                >
                                  {t(lang, "pipelineOpenListing" as any)}
                                </button>
                              </div>
                            ) : null}
                          </button>
                        );
                      })}

                      {col.items.length === 0 ? (
                        <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-3 py-6 text-center text-xs text-white/45">
                          —
                        </div>
                      ) : null}
                    </div>
                  </SortableContext>
                </div>
              ))}
            </div>
          </div>
        </DndContext>
      </div>
    </div>
  );
}