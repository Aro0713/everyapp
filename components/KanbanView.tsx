import { useEffect, useState } from "react";
import {
  DndContext,
  closestCorners,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

type KanbanItem = {
  client_case_id: string;
  full_name: string;
  phone?: string;
  case_type?: string;
  latest_listing_id?: string | null;
};

type Column = {
  id: string;
  title: string;
  items: KanbanItem[];
};

export default function KanbanView() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/kanban/list");
      const j = await r.json();
      setColumns(j.columns ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const fromCol = columns.find((c) =>
      c.items.some((i) => i.client_case_id === active.id)
    );
    const toCol = columns.find((c) => c.id === over.id);

    if (!fromCol || !toCol) return;
    if (fromCol.id === toCol.id) return;

    // optimistic UI
    const item = fromCol.items.find((i) => i.client_case_id === active.id);
    if (!item) return;

    setColumns((prev) =>
      prev.map((c) => {
        if (c.id === fromCol.id) {
          return {
            ...c,
            items: c.items.filter((i) => i.client_case_id !== active.id),
          };
        }
        if (c.id === toCol.id) {
          return {
            ...c,
            items: [item, ...c.items],
          };
        }
        return c;
      })
    );

    // backend
    await fetch("/api/kanban/move", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientCaseId: item.client_case_id,
        pipelineStage: toCol.id,
      }),
    });
  }

  if (loading) {
    return <div className="text-white">Ładowanie pipeline...</div>;
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.id}
            className="w-72 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3"
          >
            <div className="mb-2 text-sm font-bold text-white">
              {col.title}
            </div>

            <SortableContext
              items={col.items.map((i) => i.client_case_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {col.items.map((item) => (
                  <div
                    key={item.client_case_id}
                    id={item.client_case_id}
                    className="cursor-grab rounded-xl border border-white/10 bg-white/10 p-3 text-sm text-white"
                  >
                    <div className="font-semibold">
                      {item.full_name}
                    </div>

                    <div className="text-xs text-white/60">
                      {item.phone || "-"}
                    </div>

                    <div className="mt-1 text-xs text-white/50">
                      {item.case_type}
                    </div>

                    {item.latest_listing_id && (
                      <button
                        onClick={() =>
                          window.location.href = `/panel/offers/${item.latest_listing_id}`
                        }
                        className="mt-2 text-xs text-ew-accent underline"
                      >
                        Otwórz ofertę
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>
    </DndContext>
  );
}