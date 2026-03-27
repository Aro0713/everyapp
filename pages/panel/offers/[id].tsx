import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

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

type OfferParty = {
  id: string;
  full_name: string | null;
  party_type: string | null;
  notes: string | null;
  source: string | null;
  created_by_user_id: string | null;
  assigned_user_id: string | null;
  status: string | null;
  pipeline_stage: string | null;
  created_at: string | null;
  updated_at: string | null;
  first_name?: string | null;
  last_name?: string | null;
  pesel?: string | null;
  company_name?: string | null;
  nip?: string | null;
  regon?: string | null;
  krs?: string | null;
  phone?: string | null;
  email?: string | null;
  listing_party_role?: string | null;
  listing_party_notes?: string | null;
};

type ListingImage = {
  id: string;
  url: string;
  sort_order: number;
  created_at?: string | null;
};

function toStr(v: unknown) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString();
}

function getPartyTypeLabel(v?: string | null) {
  if (v === "person") return "Osoba";
  if (v === "company") return "Firma";
  return v || "-";
}

function getPartyRoleLabel(v?: string | null) {
  switch (v) {
    case "seller":
      return "Sprzedający";
    case "buyer":
      return "Kupujący";
    case "landlord":
      return "Wynajmujący";
    case "tenant":
      return "Najemca";
    default:
      return v || "-";
  }
}

function getPartyStatusLabel(v?: string | null) {
  switch (v) {
    case "new":
      return "Nowy";
    case "active":
      return "Aktywny";
    case "in_progress":
      return "W trakcie";
    case "won":
      return "Wygrany";
    case "lost":
      return "Przegrany";
    case "inactive":
      return "Nieaktywny";
    case "archived":
      return "Zarchiwizowany";
    default:
      return v || "-";
  }
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

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v.trim());
}

export default function OfferEditorPage() {
  const router = useRouter();

  const id = useMemo(
    () => (typeof router.query.id === "string" ? router.query.id : ""),
    [router.query.id]
  );

  const lang = useMemo<LangKey>(() => {
    const q = router.query.lang;
    return typeof q === "string" ? (q as LangKey) : "pl";
  }, [router.query.lang]);

  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [party, setParty] = useState<OfferParty | null>(null);

  const [images, setImages] = useState<ListingImage[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesBusy, setImagesBusy] = useState(false);

  async function loadImages(listingId: string) {
    setImagesLoading(true);
    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(listingId)}/images`);
      const j = await r.json().catch(() => null);

      if (!r.ok) {
        setImages([]);
        return;
      }

      setImages(Array.isArray(j?.rows) ? j.rows : []);
    } catch {
      setImages([]);
    } finally {
      setImagesLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;

    let active = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        const r = await fetch(`/api/offers/details?id=${encodeURIComponent(id)}`);
        const j = await r.json().catch(() => null);

        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        if (!active) return;

        const row = j?.listing ?? {};
        setParty(j?.party ?? null);

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

        await loadImages(id);
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

  function validateForm(): string | null {
    if (!form.title.trim()) return t(lang, "offerEditorValidationTitle" as any);
    if (!form.description.trim()) return t(lang, "offerEditorValidationDescription" as any);
    if (!form.property_type.trim()) return t(lang, "offerEditorValidationPropertyType" as any);

    const price = Number(form.price_amount);
    if (!Number.isFinite(price) || price <= 0) {
      return t(lang, "offerEditorValidationPrice" as any);
    }

    const area = Number(form.area_m2);
    if (!Number.isFinite(area) || area <= 0) {
      return t(lang, "offerEditorValidationArea" as any);
    }

    if (!form.city.trim()) return t(lang, "offerEditorValidationCity" as any);

    return null;
  }

  async function save() {
    if (!id) return;

    const validationError = validateForm();
    if (validationError) {
      setErr(validationError);
      setOkMsg(null);
      return;
    }

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

      setOkMsg(t(lang, "offerEditorSaved" as any));
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addImage() {
    if (!id) return;

    const url = imageUrl.trim();
    if (!url) return;
    if (!isHttpUrl(url)) {
      alert("URL zdjęcia musi zaczynać się od http:// lub https://");
      return;
    }

    setImagesBusy(true);
    setErr(null);
    setOkMsg(null);

    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(id)}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setImageUrl("");
      await loadImages(id);
    } catch (e: any) {
      setErr(e?.message ?? "Add image failed");
    } finally {
      setImagesBusy(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!id || !imageId) return;

    const confirmed = window.confirm(t(lang, "offerEditorRemoveImage" as any));
    if (!confirmed) return;

    setImagesBusy(true);
    setErr(null);
    setOkMsg(null);

    try {
      const r = await fetch(
        `/api/offers/${encodeURIComponent(id)}/images?imageId=${encodeURIComponent(imageId)}`,
        {
          method: "DELETE",
        }
      );

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      await loadImages(id);
    } catch (e: any) {
      setErr(e?.message ?? "Remove image failed");
    } finally {
      setImagesBusy(false);
    }
  }

  async function moveImage(imageId: string, direction: "left" | "right") {
    if (!id || !imageId) return;

    setImagesBusy(true);
    setErr(null);
    setOkMsg(null);

    try {
      const r = await fetch(`/api/offers/${encodeURIComponent(id)}/images`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          direction,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      await loadImages(id);
    } catch (e: any) {
      setErr(e?.message ?? "Reorder image failed");
    } finally {
      setImagesBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08131a] p-6 text-white">
        <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-white/5 p-6">
          {t(lang, "offerEditorLoading" as any)}
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{t(lang, "offerEditorTitle" as any)}</title>
      </Head>

      <div className="min-h-screen bg-[#08131a] p-6 text-white">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{t(lang, "offerEditorTitle" as any)}</h1>
              <div className="mt-1 text-sm text-white/60">ID: {form.id}</div>
            </div>

            <div className="flex gap-2">
              <Link
                href="/panel"
                className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                ← {t(lang, "offerEditorBackToPanel" as any)}
              </Link>

              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? t(lang, "offerEditorSaving" as any) : t(lang, "offerEditorSave" as any)}
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
              <h2 className="mb-4 text-lg font-semibold">
                {t(lang, "offerEditorSectionBasic" as any)}
              </h2>

              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorTitleLabel" as any)}</div>
                  <input
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorDescriptionLabel" as any)}</div>
                  <textarea
                    value={form.description}
                    onChange={(e) => setField("description", e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorTransactionTypeLabel" as any)}</div>
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
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorStatusLabel" as any)}</div>
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
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorPropertyTypeLabel" as any)}</div>
                    <input
                      value={form.property_type}
                      onChange={(e) => setField("property_type", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorMarketLabel" as any)}</div>
                    <input
                      value={form.market}
                      onChange={(e) => setField("market", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorPriceLabel" as any)}</div>
                    <input
                      value={form.price_amount}
                      onChange={(e) => setField("price_amount", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorCurrencyLabel" as any)}</div>
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
              <h2 className="mb-4 text-lg font-semibold">
                {t(lang, "offerEditorSectionParams" as any)}
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorAreaLabel" as any)}</div>
                  <input
                    value={form.area_m2}
                    onChange={(e) => setField("area_m2", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorRoomsLabel" as any)}</div>
                  <input
                    value={form.rooms}
                    onChange={(e) => setField("rooms", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorFloorLabel" as any)}</div>
                  <input
                    value={form.floor}
                    onChange={(e) => setField("floor", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorYearBuiltLabel" as any)}</div>
                  <input
                    value={form.year_built}
                    onChange={(e) => setField("year_built", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <h2 className="mb-4 text-lg font-semibold">
                {t(lang, "offerEditorSectionAddress" as any)}
              </h2>

              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorLocationTextLabel" as any)}</div>
                  <input
                    value={form.location_text}
                    onChange={(e) => setField("location_text", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorVoivodeshipLabel" as any)}</div>
                    <input
                      value={form.voivodeship}
                      onChange={(e) => setField("voivodeship", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorCityLabel" as any)}</div>
                    <input
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorDistrictLabel" as any)}</div>
                    <input
                      value={form.district}
                      onChange={(e) => setField("district", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorPostalCodeLabel" as any)}</div>
                    <input
                      value={form.postal_code}
                      onChange={(e) => setField("postal_code", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorStreetLabel" as any)}</div>
                  <input
                    value={form.street}
                    onChange={(e) => setField("street", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorLatLabel" as any)}</div>
                    <input
                      value={form.lat}
                      onChange={(e) => setField("lat", e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                    />
                  </label>

                  <label className="text-sm">
                    <div className="mb-1 text-white/70">{t(lang, "offerEditorLngLabel" as any)}</div>
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
              <h2 className="mb-4 text-lg font-semibold">
                {t(lang, "offerEditorSectionCrm" as any)}
              </h2>

              <div className="grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorContractTypeLabel" as any)}</div>
                  <input
                    value={form.contract_type}
                    onChange={(e) => setField("contract_type", e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                  />
                </label>

                <label className="text-sm">
                  <div className="mb-1 text-white/70">{t(lang, "offerEditorInternalNotesLabel" as any)}</div>
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

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Powiązany klient</h2>
              <p className="mt-1 text-sm text-white/60">
                Klient przypisany do tej oferty przez listing_parties.
              </p>
            </div>

            {!party ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-sm text-white/60">
                Brak powiązanego klienta.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {party.full_name ?? "-"}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {party.listing_party_role ? (
                          <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-100 ring-1 ring-indigo-500/20">
                            {getPartyRoleLabel(party.listing_party_role)}
                          </span>
                        ) : null}

                        {party.party_type ? (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                            {getPartyTypeLabel(party.party_type)}
                          </span>
                        ) : null}

                        {party.status ? (
                          <span className="rounded bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-100 ring-1 ring-sky-500/20">
                            {getPartyStatusLabel(party.status)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => router.push(`/panel/contacts/${party.id}`)}
                      className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      Otwórz klienta
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/45">Telefon</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {party.phone ?? "-"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/45">Email</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {party.email ?? "-"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/45">Dodano klienta</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {fmtDate(party.created_at)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/45">Ostatnia zmiana klienta</div>
                      <div className="mt-1 text-sm font-semibold text-white/85">
                        {fmtDate(party.updated_at)}
                      </div>
                    </div>
                  </div>

                  {party.listing_party_notes ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/45">Notatki powiązania</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                        {party.listing_party_notes}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-4 text-lg font-semibold">
              {t(lang, "offerEditorSectionImages" as any)}
            </h2>

            <p className="mb-4 text-sm text-white/60">
              {t(lang, "offerEditorImagesHint" as any)}
            </p>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
              <label className="text-sm">
                <div className="mb-1 text-white/70">{t(lang, "offerEditorImageUrlLabel" as any)}</div>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-white outline-none"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={addImage}
                  disabled={imagesBusy || !imageUrl.trim()}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
                >
                  {t(lang, "offerEditorAddImage" as any)}
                </button>
              </div>
            </div>

            {imagesLoading ? (
              <div className="text-sm text-white/50">{t(lang, "offerEditorLoading" as any)}</div>
            ) : images.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/50">
                {t(lang, "offerEditorNoImages" as any)}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {images.map((img, index) => (
                  <div
                    key={img.id}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40"
                  >
                    <div className="aspect-[4/3] bg-black/20">
                      <img
                        src={img.url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    <div className="space-y-3 p-3">
                      <div className="text-xs text-white/60">
                        #{index + 1}
                      </div>

                      <div className="truncate text-xs text-white/50">{img.url}</div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={imagesBusy || index === 0}
                          onClick={() => moveImage(img.id, "left")}
                          className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40"
                        >
                          {t(lang, "offerEditorMoveLeft" as any)}
                        </button>

                        <button
                          type="button"
                          disabled={imagesBusy || index === images.length - 1}
                          onClick={() => moveImage(img.id, "right")}
                          className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40"
                        >
                          {t(lang, "offerEditorMoveRight" as any)}
                        </button>

                        <button
                          type="button"
                          disabled={imagesBusy}
                          onClick={() => removeImage(img.id)}
                          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-40"
                        >
                          {t(lang, "offerEditorRemoveImage" as any)}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}