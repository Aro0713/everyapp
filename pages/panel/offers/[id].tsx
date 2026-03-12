import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

type OfferForm = {
  id: string;
  record_type: string;
  transaction_type: string;
  status: string;
  contract_type: string;
  market: string;
  internal_notes: string;
  currency: string;
  price_amount: string;
  budget_min: string;
  budget_max: string;
  area_min_m2: string;
  area_max_m2: string;
  rooms_min: string;
  rooms_max: string;
  location_text: string;
  title: string;
  description: string;
  property_type: string;
  area_m2: string;
  rooms: string;
  floor: string;
  year_built: string;
  voivodeship: string;
  city: string;
  district: string;
  street: string;
  postal_code: string;
  lat: string;
  lng: string;
};

function toStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

const EMPTY_FORM: OfferForm = {
  id: "",
  record_type: "offer",
  transaction_type: "sale",
  status: "draft",
  contract_type: "",
  market: "",
  internal_notes: "",
  currency: "PLN",
  price_amount: "",
  budget_min: "",
  budget_max: "",
  area_min_m2: "",
  area_max_m2: "",
  rooms_min: "",
  rooms_max: "",
  location_text: "",
  title: "",
  description: "",
  property_type: "",
  area_m2: "",
  rooms: "",
  floor: "",
  year_built: "",
  voivodeship: "",
  city: "",
  district: "",
  street: "",
  postal_code: "",
  lat: "",
  lng: "",
};

export default function OfferEditorPage() {
  const router = useRouter();
  const id = useMemo(
    () => (typeof router.query.id === "string" ? router.query.id : ""),
    [router.query.id]
  );

  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let active = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const r = await fetch(`/api/offers/${encodeURIComponent(id)}`);
        const j = await r.json().catch(() => null);

        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        if (!active) return;

        const row = j?.row ?? {};

        setForm({
          id: toStr(row.id),
          record_type: toStr(row.record_type || "offer"),
          transaction_type: toStr(row.transaction_type || "sale"),
          status: toStr(row.status || "draft"),
          contract_type: toStr(row.contract_type),
          market: toStr(row.market),
          internal_notes: toStr(row.internal_notes),
          currency: toStr(row.currency || "PLN"),
          price_amount: toStr(row.price_amount),
          budget_min: toStr(row.budget_min),
          budget_max: toStr(row.budget_max),
          area_min_m2: toStr(row.area_min_m2),
          area_max_m2: toStr(row.area_max_m2),
          rooms_min: toStr(row.rooms_min),
          rooms_max: toStr(row.rooms_max),
          location_text: toStr(row.location_text),
          title: toStr(row.title),
          description: toStr(row.description),
          property_type: toStr(row.property_type),
          area_m2: toStr(row.area_m2),
          rooms: toStr(row.rooms),
          floor: toStr(row.floor),
          year_built: toStr(row.year_built),
          voivodeship: toStr(row.voivodeship),
          city: toStr(row.city),
          district: toStr(row.district),
          street: toStr(row.street),
          postal_code: toStr(row.postal_code),
          lat: toStr(row.lat),
          lng: toStr(row.lng),
        });
      } catch (e: any) {
        if (!active) return;
        setErr(e?.message ?? "Load failed");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  function setField<K extends keyof OfferForm>(key: K, value: OfferForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (!id) return;

    setSaving(true);
    setErr(null);
    setOkMsg(null);

    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          property_type: form.property_type,
          contract_type: form.contract_type,
          market: form.market,
          internal_notes: form.internal_notes,
          currency: form.currency,
          price_amount: form.price_amount,
          budget_min: form.budget_min,
          budget_max: form.budget_max,
          area_min_m2: form.area_min_m2,
          area_max_m2: form.area_max_m2,
          rooms_min: form.rooms_min,
          rooms_max: form.rooms_max,
          location_text: form.location_text,
          area_m2: form.area_m2,
          rooms: form.rooms,
          floor: form.floor,
          year_built: form.year_built,
          voivodeship: form.voivodeship,
          city: form.city,
          district: form.district,
          street: form.street,
          postal_code: form.postal_code,
          lat: form.lat,
          lng: form.lng,
          transaction_type: form.transaction_type,
          status: form.status,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setOkMsg("Oferta zapisana.");
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08131a] p-6 text-white">
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-white/5 p-6">
          Ładowanie oferty...
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Edycja oferty</title>
      </Head>

      <div className="min-h-screen bg-[#08131a] p-6 text-white">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Edycja oferty</h1>
              <div className="mt-1 text-sm text-white/60">ID: {form.id}</div>
            </div>

            <div className="flex gap-2">
              <Link
                href="/panel"
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                ← Wróć do panelu
              </Link>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? "Zapisywanie..." : "Zapisz ofertę"}
              </button>
            </div>
          </div>

          {err ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {err}
            </div>
          ) : null}

          {okMsg ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              {okMsg}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-lg font-semibold">Podstawowe</h2>

              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">Tytuł</div>
                  <input
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">Opis</div>
                  <textarea
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Typ transakcji</div>
                    <select
                      value={form.transaction_type}
                      onChange={(e) => setField("transaction_type", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    >
                      <option value="sale">sale</option>
                      <option value="rent">rent</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Status</div>
                    <select
                      value={form.status}
                      onChange={(e) => setField("status", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    >
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="closed">closed</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Property type</div>
                    <input
                      value={form.property_type}
                      onChange={(e) => setField("property_type", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Rynek</div>
                    <input
                      value={form.market}
                      onChange={(e) => setField("market", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Cena</div>
                    <input
                      value={form.price_amount}
                      onChange={(e) => setField("price_amount", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Waluta</div>
                    <input
                      value={form.currency}
                      onChange={(e) => setField("currency", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-lg font-semibold">Parametry</h2>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">Powierzchnia m²</div>
                  <input
                    value={form.area_m2}
                    onChange={(e) => setField("area_m2", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">Pokoje</div>
                  <input
                    value={form.rooms}
                    onChange={(e) => setField("rooms", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">Piętro</div>
                  <input
                    value={form.floor}
                    onChange={(e) => setField("floor", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">Rok budowy</div>
                  <input
                    value={form.year_built}
                    onChange={(e) => setField("year_built", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-lg font-semibold">Adres</h2>

              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">Lokalizacja opisowa</div>
                  <input
                    value={form.location_text}
                    onChange={(e) => setField("location_text", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Województwo</div>
                    <input
                      value={form.voivodeship}
                      onChange={(e) => setField("voivodeship", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Miasto</div>
                    <input
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Dzielnica</div>
                    <input
                      value={form.district}
                      onChange={(e) => setField("district", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Kod pocztowy</div>
                    <input
                      value={form.postal_code}
                      onChange={(e) => setField("postal_code", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">Ulica</div>
                  <input
                    value={form.street}
                    onChange={(e) => setField("street", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Lat</div>
                    <input
                      value={form.lat}
                      onChange={(e) => setField("lat", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">Lng</div>
                    <input
                      value={form.lng}
                      onChange={(e) => setField("lng", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-lg font-semibold">CRM</h2>

              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">Typ umowy</div>
                  <input
                    value={form.contract_type}
                    onChange={(e) => setField("contract_type", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">Notatki wewnętrzne</div>
                  <textarea
                    value={form.internal_notes}
                    onChange={(e) => setField("internal_notes", e.target.value)}
                    rows={8}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}