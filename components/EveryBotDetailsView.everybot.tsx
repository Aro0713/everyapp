import { useEffect, useMemo, useState } from "react";

type External = {
  id: string;
  title?: string | null;
  price?: number | null;
  area_m2?: number | null;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  url?: string | null;

  status: "new" | "shortlisted" | "rejected" | "converted";
  shortlisted: boolean;
  rejected_reason?: string | null;
  converted_listing_id?: string | null;

  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;

  thumb?: string | null; // base64 lub data-url
};

type Note = { id: string; note: string; created_at: string; user_id: string };
type Action = { id: string; action: string; payload: any; created_at: string; user_id: string };

function moneyPLN(v?: number | null) {
  if (v == null || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(v);
}
function num(v?: number | null, suffix = "") {
  if (v == null || Number.isNaN(v)) return "—";
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(v)}${suffix}`;
}

export default function EveryBotDetailsView({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const [external, setExternal] = useState<External | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [noteDraft, setNoteDraft] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/everybot/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed");
      setExternal(j.external);
      setNotes(j.notes ?? []);
      setActions(j.actions ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const mapUrl = useMemo(() => {
    if (!external?.lat || !external?.lng) return null;
    const lat = external.lat;
    const lng = external.lng;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.01}%2C${lat - 0.01}%2C${lng + 0.01}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`;
  }, [external?.lat, external?.lng]);

  async function postAction(body: any) {
    setBusy(true);
    try {
      const r = await fetch(`/api/everybot/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Action failed");
      setExternal(j.external);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function convert() {
    setBusy(true);
    try {
      const r = await fetch(`/api/everybot/${id}/convert`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Convert failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-600">Ładowanie…</div>;
  if (err) return <div className="p-6 text-sm text-red-600">Błąd: {err}</div>;
  if (!external) return <div className="p-6 text-sm text-gray-600">Nie znaleziono oferty.</div>;

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="h-44 w-full shrink-0 overflow-hidden rounded-2xl bg-gray-100 md:h-44 md:w-72">
              {external.thumb ? (
                <img
                  src={external.thumb.startsWith("data:") ? external.thumb : `data:image/jpeg;base64,${external.thumb}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
                  brak miniatury
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-500">EveryBOT • {external.status}</div>
                  <h1 className="mt-1 text-xl font-bold text-gray-900">
                    {external.title ?? "Oferta z rynku"}
                  </h1>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-700">
                    <span className="rounded-full bg-gray-100 px-3 py-1">{moneyPLN(external.price)}</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1">{num(external.area_m2, " m²")}</span>
                    <span className="rounded-full bg-gray-100 px-3 py-1">
                      {[external.city, external.address].filter(Boolean).join(", ") || "—"}
                    </span>
                  </div>
                </div>

                {external.url ? (
                  <a
                    href={external.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  >
                    Otwórz źródło
                  </a>
                ) : null}
              </div>

              <div className="mt-4 rounded-2xl border border-gray-200 p-4">
                <div className="text-xs font-semibold text-gray-500">Właściciel / kontakt</div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-gray-800 sm:grid-cols-3">
                  <div><span className="text-gray-500">Imię:</span> {external.owner_name ?? "—"}</div>
                  <div><span className="text-gray-500">Telefon:</span> {external.owner_phone ?? "—"}</div>
                  <div><span className="text-gray-500">Email:</span> {external.owner_email ?? "—"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold text-gray-500">Mapa</div>
            {mapUrl ? (
              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <iframe title="map" src={mapUrl} className="h-72 w-full" />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-sm text-gray-600">
                Brak lat/lng – mapa niedostępna.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-gray-900">Notatki</div>

          <div className="mt-4 flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Dodaj notatkę…"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
            />
            <button
              disabled={busy || !noteDraft.trim()}
              onClick={() => { postAction({ type: "note", note: noteDraft }); setNoteDraft(""); }}
              className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Dodaj
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {notes.length === 0 ? (
              <div className="text-sm text-gray-600">Brak notatek.</div>
            ) : notes.map(n => (
              <div key={n.id} className="rounded-2xl border border-gray-200 p-4">
                <div className="text-sm text-gray-900">{n.note}</div>
                <div className="mt-2 text-xs text-gray-500">{new Date(n.created_at).toLocaleString("pl-PL")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-gray-900">Akcje</div>

          <div className="mt-4 space-y-2">
            <button
              disabled={busy}
              onClick={() => postAction({ type: "shortlist", value: !external.shortlisted })}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              {external.shortlisted ? "Usuń ze schowka" : "Dodaj do schowka"}
            </button>

            <button
              disabled={busy || external.status === "converted"}
              onClick={() => setRejectOpen(v => !v)}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
            >
              {external.status === "rejected" ? "Cofnij odrzucenie" : "Odrzuć"}
            </button>

            {rejectOpen && external.status !== "converted" ? (
              <div className="rounded-2xl border border-gray-200 p-3">
                {external.status === "rejected" ? (
                  <button
                    disabled={busy}
                    onClick={() => postAction({ type: "unreject" })}
                    className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Cofnij odrzucenie
                  </button>
                ) : (
                  <>
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Powód odrzucenia…"
                      className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-gray-400"
                    />
                    <button
                      disabled={busy || !rejectReason.trim()}
                      onClick={() => { postAction({ type: "reject", reason: rejectReason.trim() }); setRejectReason(""); setRejectOpen(false); }}
                      className="mt-2 w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Odrzuć z powodem
                    </button>
                  </>
                )}
              </div>
            ) : null}

            <button
              disabled={busy || external.status === "converted"}
              onClick={convert}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Utwórz ofertę biura (konwersja)
            </button>

            {external.status === "converted" && external.converted_listing_id ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                Skonwertowano do listings: <span className="font-mono">{external.converted_listing_id}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-bold text-gray-900">Historia</div>
          <div className="mt-3 space-y-2">
            {actions.length === 0 ? (
              <div className="text-sm text-gray-600">Brak akcji.</div>
            ) : actions.map(a => (
              <div key={a.id} className="rounded-2xl border border-gray-200 p-3">
                <div className="text-sm text-gray-900">{a.action}</div>
                <div className="mt-1 text-xs text-gray-500">{new Date(a.created_at).toLocaleString("pl-PL")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
