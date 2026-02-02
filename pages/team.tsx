import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import { PERMISSION_LABEL_KEY, PERMISSION_CATEGORY_KEY } from "@/lib/permissions";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

type Me = {
  userId: string | null;
  fullName?: string | null;
  email?: string | null;
  officeName?: string | null;
  membershipRole?: string | null;
};

type MemberRow = {
  membership_id: string;
  user_id: string;
  user_full_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  role: string;
  status: string;
  created_at: string;
};

const ROLE_OPTIONS = [
  "agent",
  "manager",
  "office_admin",
  "admin",
  "owner",
  "company_admin",
] as const;

const ROLE_RANK: Record<string, number> = {
  company_admin: 100,
  owner: 90,
  admin: 80,
  office_admin: 70,
  manager: 60,
  agent: 10,
};

function rank(role: string | null | undefined) {
  return ROLE_RANK[role ?? ""] ?? 0;
}

// map: DB role -> translations key
const ROLE_LABEL_KEY: Record<string, string> = {
  agent: "teamRoleAgent",
  manager: "teamRoleManager",
  office_admin: "teamRoleOfficeAdmin",
  admin: "teamRoleAdmin",
  owner: "teamRoleOwner",
  company_admin: "teamRoleCompanyAdmin",
};

// map: DB status -> translations key
const STATUS_LABEL_KEY: Record<string, string> = {
  active: "teamStatusActive",
  pending: "teamStatusPending",
  rejected: "teamStatusRejected",
  revoked: "teamStatusRevoked",
};

type PermissionRow = {
  key: string;
  category: string;
};
type Profile = {
  id: string;
  name: string;
  description: string | null;
  office_id?: string | null; 
};

type ProfilePermRow = { key: string; category: string; allowed: boolean };

export default function TeamPage() {
  const [me, setMe] = useState<Me>({ userId: null });
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

const [profiles, setProfiles] = useState<Profile[]>([]);
const [selectedProfileId, setSelectedProfileId] = useState<string>("");

const [profilePerms, setProfilePerms] = useState<ProfilePermRow[]>([]);
const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
const [permSaved, setPermSaved] = useState<Record<string, boolean>>({});
const [permBusy, setPermBusy] = useState(false);

  // lang from cookie
  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rMe = await fetch("/api/me");
      const meData = await rMe.json();
      setMe(meData);

      const r = await fetch("/api/team/members");
      if (!r.ok) throw new Error(t(lang, "teamErrorFetchMembers" as any) ?? "Failed to load team");
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
            // --- permission profiles (do selecta) ---
      const rProfiles = await fetch("/api/permissions/profiles");
      if (!rProfiles.ok) {
        throw new Error(
          t(lang, "teamErrorFetchProfiles" as any) ??
            "Failed to load permission profiles"
        );
      }
      const profilesData = await rProfiles.json();
      const list: Profile[] = Array.isArray(profilesData) ? profilesData : [];
      setProfiles(list);

           // auto-select: ustaw pierwszy profil dopiero po tym jak lista faktycznie się załaduje
      setSelectedProfileId((prev) => (prev ? prev : list[0]?.id ?? ""));

    } catch (e: any) {
      setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    useEffect(() => {
    if (!selectedProfileId) return;

    loadProfilePerms(selectedProfileId).catch((e: any) => {
      setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId]);

  const canManage = useMemo(() => rank(me.membershipRole) >= rank("manager"), [me.membershipRole]);

  async function updateMembership(membershipId: string, patch: { role?: string; status?: string }) {
    setSavingId(membershipId);
    setError(null);
    try {
      const r = await fetch("/api/team/update-membership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, ...patch }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || (t(lang, "teamErrorSave" as any) ?? "Save failed"));
      await load();
    } catch (e: any) {
      setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    } finally {
      setSavingId(null);
    }
  }
async function savePermissions() {
  if (!selectedProfileId) return;

  setPermBusy(true);
  setError(null);

  try {

    const r = await fetch(`/api/permissions/profile?id=${encodeURIComponent(selectedProfileId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
     body: JSON.stringify({ items: permDraft }),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) {
      throw new Error(j?.error || "Błąd zapisu uprawnień");
    }

    // po zapisie: utrwal jako saved (klon)
    setPermSaved({ ...permDraft });

    // opcjonalnie: jeśli backend zwraca aktualny stan, możesz zsynchronizować draft
    // setPermDraft({ ...permDraft });
  } catch (e: any) {
    setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
  } finally {
    setPermBusy(false);
  }
}


async function loadProfilePerms(profileId: string) {
  setPermBusy(true);
  setError(null);
  try {
    const r = await fetch(`/api/permissions/profile?id=${encodeURIComponent(profileId)}`);
    const data = await r.json().catch(() => null);

    if (!r.ok) {
      throw new Error(data?.error || "Nie udało się pobrać uprawnień profilu");
    }

    const rows: ProfilePermRow[] = Array.isArray(data) ? data : [];
    setProfilePerms(rows);

    const map: Record<string, boolean> = {};
    for (const row of rows) map[row.key] = !!row.allowed;

    // klony => Cancel zawsze wraca do stanu “zapisany”
    setPermDraft({ ...map });
    setPermSaved({ ...map });
  } catch (e: any) {
    setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    // opcjonalnie: rethrow jeśli chcesz łapać wyżej
    throw e;
  } finally {
    setPermBusy(false);
  }
}

function cancelPermissions() {
  // rollback do ostatnio “saved”
  setPermDraft({ ...permSaved });
}


  return (
  <main className="min-h-screen bg-ew-bg p-6 text-ew-primary">
    <div className="mx-auto max-w-6xl">
      {/* HEADER */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t(lang, "teamTitle" as any) ?? "Team management"}
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            {me.fullName ? `${me.fullName} (${me.email})` : "—"}{" "}
            {me.officeName ? `• ${me.officeName}` : ""}
            {me.membershipRole
              ? ` • ${t(lang, ROLE_LABEL_KEY[me.membershipRole] as any) ?? me.membershipRole}`
              : ""}
          </p>
        </div>

        <button
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-ew-accent/10"
          onClick={load}
        >
          {t(lang, "teamRefresh" as any) ?? "Refresh"}
        </button>
      </div>

      {/* ERROR */}
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* TEAM TABLE */}
      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
        {loading ? (
          <div className="p-6 text-sm text-gray-600">
            {t(lang, "teamLoading" as any) ?? "Loading…"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-600">
                <tr className="border-b">
                  <th className="py-3 pr-4">{t(lang, "teamColumnAgent" as any) ?? "Agent"}</th>
                  <th className="py-3 pr-4">{t(lang, "teamColumnEmail" as any) ?? "Email"}</th>
                  <th className="py-3 pr-4">{t(lang, "teamColumnPhone" as any) ?? "Phone"}</th>
                  <th className="py-3 pr-4">{t(lang, "teamColumnRole" as any) ?? "Role"}</th>
                  <th className="py-3 pr-4">{t(lang, "teamColumnStatus" as any) ?? "Status"}</th>
                  <th className="py-3 pr-0">{t(lang, "teamColumnActions" as any) ?? "Actions"}</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => {
                  const isSelf = r.user_id === me.userId;
                  const disabled = !canManage || isSelf || rank(r.role) >= rank(me.membershipRole);

                  return (
                    <tr key={r.membership_id} className="border-b last:border-b-0">
                      <td className="py-3 pr-4 font-semibold">{r.user_full_name ?? "—"}</td>
                      <td className="py-3 pr-4">{r.user_email ?? "—"}</td>
                      <td className="py-3 pr-4">{r.user_phone ?? "—"}</td>

                      <td className="py-3 pr-4">
                        <select
                          className="w-56 rounded-xl border border-gray-200 bg-white px-3 py-2"
                          value={r.role}
                          disabled={disabled || savingId === r.membership_id}
                          onChange={(e) => updateMembership(r.membership_id, { role: e.target.value })}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} disabled={rank(opt) >= rank(me.membershipRole)}>
                              {t(lang, (ROLE_LABEL_KEY[opt] ?? opt) as any) ?? opt}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 pr-4">
                        <select
                          className="w-40 rounded-xl border border-gray-200 bg-white px-3 py-2"
                          value={r.status}
                          disabled={disabled || savingId === r.membership_id}
                          onChange={(e) => updateMembership(r.membership_id, { status: e.target.value })}
                        >
                         {["active", "pending", "rejected", "revoked"].map((s) => (
                            <option key={s} value={s}>
                              {t(lang, (STATUS_LABEL_KEY[s] ?? s) as any) ?? s}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 pr-0">
                        <span className="text-xs text-gray-500">
                          {isSelf
                            ? t(lang, "teamSelfLabel" as any) ?? "You"
                            : disabled
                            ? t(lang, "teamNoPermissions" as any) ?? "No permissions"
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!rows.length ? (
              <div className="p-6 text-sm text-gray-600">
                {t(lang, "teamNoMembers" as any) ?? "No team members."}
              </div>
            ) : null}
          </div>
        )}
      </div>
              {/* PERMISSIONS (PROFILE-BASED) */}
      <div className="mt-6 rounded-3xl border border-ew-accent/30 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold tracking-tight text-ew-primary flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-ew-accent/20 text-ew-accent">
              ⚙️
            </span>
            {t(lang, "teamPermissionsTitle" as any) ?? "Uprawnienia"}
          </h2>

          {/* Profile select */}
         {/* Profile select */}
            <select
            className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm"
            value={selectedProfileId}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            disabled={permBusy}
            title={t(lang, "teamPermissionsProfile" as any) ?? "Profil uprawnień"}
            >
            {/* placeholder – ważne */}
            {profiles.length === 0 ? (
                <option value="">
                    {t(lang, "teamLoading" as any) ?? "Loading…"}
                </option>
                ) : (
                <>
                    <option value="">
                    {t(lang, "teamPermissionsSelectProfile" as any) ?? "— wybierz profil —"}
                    </option>

                    {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                    ))}
                </>
                )}
            </select>
        </div>

            {permBusy ? (
            <div className="p-4 text-sm text-gray-600">
                {t(lang, "teamLoading" as any) ?? "Ładuję…"}
            </div>
            ) : !selectedProfileId ? (
            <div className="p-4 text-sm text-gray-600">
                {t(lang, "teamPermissionsSelectProfile" as any) ?? "— wybierz profil —"}
            </div>
            ) : profilePerms.length ? (

          Object.entries(
            profilePerms.reduce<Record<string, ProfilePermRow[]>>((acc, p) => {
              (acc[p.category] ||= []).push(p);
              return acc;
            }, {})
          ).map(([category, items]) => (
            <div key={category} className="mt-5">
              <div className="flex items-center gap-3">
                <div className="h-6 w-1 rounded-full bg-ew-accent" />
                <div className="text-sm font-extrabold text-ew-primary uppercase tracking-wide">
                  {t(lang, (PERMISSION_CATEGORY_KEY[category] ?? category) as any) ?? category}
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {items.map((p) => (
                  <label
                    key={p.key}
                    className="flex items-center gap-3 rounded-2xl border border-ew-accent/30 bg-ew-accent/5 px-4 py-3 transition hover:bg-ew-accent/10"
                  >
                    <input
                      type="checkbox"
                      checked={!!permDraft[p.key]}
                      onChange={(e) =>
                        setPermDraft((d) => ({ ...d, [p.key]: e.target.checked }))
                      }
                      className="h-5 w-5 rounded-md border-gray-300 text-ew-accent focus:ring-ew-accent"
                    />
                    <span className="text-sm font-semibold text-ew-primary">
                      {t(lang, (PERMISSION_LABEL_KEY[p.key] ?? p.key) as any) ?? p.key}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-sm text-gray-600">
            {t(lang, "teamPermissionsEmpty" as any) ?? "Brak zdefiniowanych uprawnień."}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-ew-primary shadow-sm transition hover:bg-ew-accent/10 disabled:opacity-60"
            onClick={cancelPermissions}
            disabled={permBusy}
          >
            {t(lang, "teamCancel" as any) ?? "Anuluj"}
          </button>

          <button
            type="button"
            className="rounded-2xl bg-ew-accent px-5 py-2 text-sm font-extrabold text-ew-primary shadow-sm transition hover:opacity-95 disabled:opacity-60"
            onClick={savePermissions}
            disabled={permBusy || !selectedProfileId}
          >
            {t(lang, "teamSave" as any) ?? "Zapisz zmiany"}
          </button>
        </div>
      </div>

    
    </div>
  </main>
);
}
