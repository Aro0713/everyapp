import { useEffect, useMemo, useState } from "react";
import { t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

type ContactRow = {
  id: string;
  office_id: string;
  party_type: string | null;
  full_name: string | null;
  pesel: string | null;
  nip: string | null;
  krs: string | null;
  created_at: string | null;
  phone_primary?: string | null;
  email_primary?: string | null;
  phone_fallback?: string | null;
  email_fallback?: string | null;
  phone?: string | null;
  email?: string | null;
  contacts_count?: number | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleDateString();
}

function normalizePartyTypeLabel(lang: LangKey, partyType?: string | null) {
  const v = (partyType ?? "").toLowerCase();

  if (v === "person") return t(lang, "contactsTypePerson" as any) ?? "Osoba";
  if (v === "company") return t(lang, "contactsTypeCompany" as any) ?? "Firma";

  return partyType || "-";
}

export default function ContactsView({ lang }: { lang: LangKey }) {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [partyType, setPartyType] = useState("");

  async function load(next?: { q?: string; partyType?: string }) {
    setLoading(true);
    setError(null);

    try {
      const qs = new URLSearchParams();

      const qValue = (next?.q ?? q).trim();
      const typeValue = (next?.partyType ?? partyType).trim();

      if (qValue.length >= 2) qs.set("q", qValue);
      if (typeValue) qs.set("partyType", typeValue);
      qs.set("limit", "100");

      const r = await fetch(`/api/contacts/list?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);

      setRows(Array.isArray(j?.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const empty = !loading && !error && rows.length === 0;

  const summary = useMemo(() => {
    const persons = rows.filter((r) => (r.party_type ?? "").toLowerCase() === "person").length;
    const companies = rows.filter((r) => (r.party_type ?? "").toLowerCase() === "company").length;

    return {
      total: rows.length,
      persons,
      companies,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-white">
              {t(lang, "panelNavClients" as any)}
            </h2>
            <p className="mt-0.5 text-xs text-white/50">
              {t(lang, "panelContactsSub" as any)}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={() => load()}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-white/15"
            >
              {t(lang, "offersRefresh" as any)}
            </button>

            <button
              type="button"
              onClick={() => alert("TODO: create contact")}
              className="rounded-xl bg-ew-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:opacity-95"
            >
              + {t(lang, "contactsNew" as any) ?? "Nowy kontakt"}
            </button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(lang, "contactsSearchPlaceholder" as any) ?? "Szukaj po nazwie, telefonie, emailu, PESEL, NIP, KRS"}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
          />

          <select
            value={partyType}
            onChange={(e) => setPartyType(e.target.value)}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
          >
            <option value="">{t(lang, "contactsFilterAllTypes" as any) ?? "Wszystkie typy"}</option>
            <option value="person">{t(lang, "contactsTypePerson" as any) ?? "Osoba"}</option>
            <option value="company">{t(lang, "contactsTypeCompany" as any) ?? "Firma"}</option>
          </select>

          <button
            type="button"
            onClick={() => load({ q, partyType })}
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
          >
            {t(lang, "contactsSearch" as any) ?? "Szukaj"}
          </button>
        </div>

        {/* SUMMARY */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            {(t(lang, "contactsSummaryTotal" as any) ?? "Łącznie") + `: ${summary.total}`}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            {(t(lang, "contactsSummaryPersons" as any) ?? "Osoby") + `: ${summary.persons}`}
          </span>
          <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
            {(t(lang, "contactsSummaryCompanies" as any) ?? "Firmy") + `: ${summary.companies}`}
          </span>
        </div>
      </div>

      {/* LIST */}
      <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 shadow-2xl backdrop-blur-xl">
        {loading ? (
          <div className="text-xs text-white/50">
            {t(lang, "contactsLoading" as any) ?? "Ładowanie kontaktów..."}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
            {(t(lang, "contactsLoadError" as any) ?? "Nie udało się pobrać kontaktów") + `: ${error}`}
          </div>
        ) : empty ? (
          <div className="flex h-44 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
            <p className="text-xs text-white/60">
              {t(lang, "contactsEmpty" as any) ?? "Brak kontaktów."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {rows.map((r) => {
              const phone = r.phone ?? r.phone_primary ?? r.phone_fallback ?? null;
              const email = r.email ?? r.email_primary ?? r.email_fallback ?? null;

              return (
                <div key={r.id} className="p-3 transition hover:bg-white/5">
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(170px,0.8fr)_minmax(220px,1fr)_minmax(220px,1fr)_auto]">
                    {/* LEFT */}
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={clsx(
                            "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15",
                            (r.party_type ?? "").toLowerCase() === "company"
                              ? "bg-sky-400"
                              : "bg-emerald-400"
                          )}
                        />
                        <div className="truncate text-sm font-semibold text-white">
                          {r.full_name ?? "-"}
                        </div>
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-white/10">
                          {normalizePartyTypeLabel(lang, r.party_type)}
                        </span>

                        {r.pesel ? (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                            PESEL: {r.pesel}
                          </span>
                        ) : null}

                        {r.nip ? (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                            NIP: {r.nip}
                          </span>
                        ) : null}

                        {r.krs ? (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-white/75 ring-1 ring-white/10">
                            KRS: {r.krs}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* TYPE */}
                    <div className="text-[11px] text-white/70">
                      <div className="text-white/45">{t(lang, "contactsColumnType" as any) ?? "Typ"}</div>
                      <div className="mt-1 font-semibold text-white/85">
                        {normalizePartyTypeLabel(lang, r.party_type)}
                      </div>
                    </div>

                    {/* PHONE */}
                    <div className="min-w-0 text-[11px] text-white/70">
                      <div className="text-white/45">{t(lang, "contactsColumnPhone" as any) ?? "Telefon"}</div>
                      <div className="mt-1 truncate font-semibold text-white/85">
                        {phone ? (
                          <a href={`tel:${phone}`} className="text-ew-accent underline">
                            {phone}
                          </a>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>

                    {/* EMAIL */}
                    <div className="min-w-0 text-[11px] text-white/70">
                      <div className="text-white/45">{t(lang, "contactsColumnEmail" as any) ?? "Email"}</div>
                      <div className="mt-1 truncate font-semibold text-white/85">
                        {email ? (
                          <a href={`mailto:${email}`} className="text-ew-accent underline">
                            {email}
                          </a>
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="text-[11px] text-white/45">
                        {(t(lang, "contactsColumnCreatedAt" as any) ?? "Dodano") + `: ${fmtDate(r.created_at)}`}
                      </div>

                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => alert(`TODO: open contact ${r.id}`)}
                          className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                        >
                          {t(lang, "listingOpen" as any) ?? "Otwórz"}
                        </button>

                        <button
                          type="button"
                          onClick={() => alert(`TODO: edit contact ${r.id}`)}
                          className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-white/15"
                        >
                          {t(lang, "listingEdit" as any) ?? "Edytuj"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}