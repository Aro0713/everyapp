import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, isLangKey, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";
import { PERMISSION_LABEL_KEY, PERMISSION_CATEGORY_KEY } from "@/lib/permissions";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

type ProfilePermRow = {
  key: string;
  category: string;
  allowed: boolean;
  profileAllowed: boolean;
  source: "profile" | "override" | "default";
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

const ROLE_LABEL_KEY: Record<string, string> = {
  agent: "teamRoleAgent",
  manager: "teamRoleManager",
  office_admin: "teamRoleOfficeAdmin",
  admin: "teamRoleAdmin",
  owner: "teamRoleOwner",
  company_admin: "teamRoleCompanyAdmin",
};

const STATUS_LABEL_KEY: Record<string, string> = {
  active: "teamStatusActive",
  pending: "teamStatusPending",
  rejected: "teamStatusRejected",
  revoked: "teamStatusRevoked",
};

function getProfileNameForRole(role: string | null | undefined) {
  if (role === "agent") return "Agent";
  if (role === "manager") return "Manager";
  if (["office_admin", "admin", "owner", "company_admin"].includes(role ?? "")) return "Office Admin";
  return "—";
}

function getSourceBadgeClasses(source: ProfilePermRow["source"]) {
  if (source === "override") {
    return "border-amber-400/40 bg-amber-400/20 text-amber-200";
  }

  if (source === "profile") {
    return "border-emerald-400/40 bg-emerald-400/20 text-emerald-200";
  }

  return "border-rose-400/40 bg-rose-400/20 text-rose-200";
}

export default function TeamView() {
  const [me, setMe] = useState<Me>({ userId: null });
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedMembershipIds, setSelectedMembershipIds] = useState<string[]>([]);

  const [profilePerms, setProfilePerms] = useState<ProfilePermRow[]>([]);
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
  const [permSaved, setPermSaved] = useState<Record<string, boolean>>({});
  const [permBusy, setPermBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchPerm, setSearchPerm] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const c = getCookie("lang");
    if (isLangKey(c)) setLang(c);
  }, []);

  const canManage = useMemo(
    () => rank(me.membershipRole) >= rank("manager"),
    [me.membershipRole]
  );

  const isSelectable = (r: MemberRow) => {
    const isSelf = r.user_id === me.userId;
    const disabled = !canManage || isSelf || rank(r.role) >= rank(me.membershipRole);
    return !disabled;
  };

  const selectableMembershipIds = useMemo(() => {
    return rows.filter(isSelectable).map((r) => r.membership_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, me.userId, me.membershipRole, canManage]);

  const selectedRows = useMemo(() => {
    const selectedSet = new Set(selectedMembershipIds);
    return rows.filter((r) => selectedSet.has(r.membership_id));
  }, [rows, selectedMembershipIds]);

  const selectedProfileSummary = useMemo(() => {
    if (selectedRows.length === 0) return "—";
    const names = Array.from(new Set(selectedRows.map((r) => getProfileNameForRole(r.role))));
    if (names.length === 1) return names[0];
    return `${t(lang, "teamSelectedCount" as any) ?? "Wybrano"}: ${selectedRows.length}`;
  }, [selectedRows, lang]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const rMe = await fetch("/api/me", { cache: "no-store" });
      const meData = await rMe.json();
      setMe(meData);

      const r = await fetch("/api/team/members", { cache: "no-store" });
      if (!r.ok) {
        throw new Error(t(lang, "teamErrorFetchMembers" as any) ?? "Failed to load team");
      }

      const data = await r.json();
      const nextRows: MemberRow[] = Array.isArray(data) ? data : [];
      setRows(nextRows);

      const allowedIds = new Set(nextRows.map((x) => x.membership_id));
      setSelectedMembershipIds((prev) => prev.filter((id) => allowedIds.has(id)));
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
    const allowed = new Set(selectableMembershipIds);
    setSelectedMembershipIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [selectableMembershipIds]);

  useEffect(() => {
    if (!successMessage) return;
    const tmr = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(tmr);
  }, [successMessage]);

  useEffect(() => {
    const first = selectedMembershipIds[0];
    if (!first) {
      setProfilePerms([]);
      setPermDraft({});
      setPermSaved({});
      return;
    }

    loadMembershipPerms(first).catch((e: any) => {
      setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMembershipIds]);

    function toggleSection(cat: string) {
    setOpenSections((s) => ({
      ...s,
      [cat]: !s[cat],
    }));
  }

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

      if (selectedMembershipIds.includes(membershipId)) {
        await loadMembershipPerms(membershipId);
      }

      setSuccessMessage(t(lang, "teamPermissionsSaved" as any) ?? "Zmiany zapisane.");
    } catch (e: any) {
      setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    } finally {
      setSavingId(null);
    }
  }

  async function savePermissions() {
    if (selectedMembershipIds.length === 0) return;

    setPermBusy(true);
    setError(null);

    try {
      if (selectedMembershipIds.length === 1) {
        const id = selectedMembershipIds[0];

        const r = await fetch(`/api/permissions/membership?id=${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: permDraft }),
        });

        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error || "Błąd zapisu uprawnień");

        await loadMembershipPerms(id);
        setSuccessMessage(t(lang, "teamPermissionsSaved" as any) ?? "Zmiany zapisane.");
        return;
      }

      const r = await fetch(`/api/permissions/memberships`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipIds: selectedMembershipIds, items: permDraft }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "Błąd zapisu uprawnień (batch)");

      await loadMembershipPerms(selectedMembershipIds[0]);
      setSuccessMessage(t(lang, "teamPermissionsSaved" as any) ?? "Zmiany zapisane.");
    } catch (e: any) {
      setError(e?.message ?? (t(lang, "teamErrorGeneric" as any) ?? "Error"));
    } finally {
      setPermBusy(false);
    }
  }

  async function loadMembershipPerms(membershipId: string) {
    setPermBusy(true);
    setError(null);

    try {
      const r = await fetch(`/api/permissions/membership?id=${encodeURIComponent(membershipId)}`, {
        cache: "no-store",
      });
      const data = await r.json().catch(() => null);

      if (!r.ok) {
        throw new Error(data?.error || "Nie udało się pobrać uprawnień");
      }

      const rows: ProfilePermRow[] = Array.isArray(data) ? data : [];
      setProfilePerms(rows);

      const map: Record<string, boolean> = {};
      for (const row of rows) map[row.key] = !!row.allowed;

      setPermDraft({ ...map });
      setPermSaved({ ...map });
    } finally {
      setPermBusy(false);
    }
  }

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-7xl">
        {/* HEADER */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              {t(lang, "teamTitle" as any) ?? "Team management"}
            </h1>

            <p className="mt-1 text-sm text-white/60">
              {me.fullName ? `${me.fullName} (${me.email})` : "—"}
              {me.officeName ? ` • ${me.officeName}` : ""}
              {me.membershipRole
                ? ` • ${t(lang, ROLE_LABEL_KEY[me.membershipRole] as any) ?? me.membershipRole}`
                : ""}
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
            onClick={load}
          >
            {t(lang, "teamRefresh" as any) ?? "Refresh"}
          </button>
        </div>

        {/* ALERTS */}
        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        {/* TEAM TABLE */}
        <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-white">
                {t(lang, "panelNavTeam" as any) ?? "Team"}
              </h2>
              <p className="mt-0.5 text-xs text-white/50">
                {t(lang, "teamSubtitle" as any) ?? "Members, roles and statuses"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/75">
              {t(lang, "teamSelectedCount" as any) ?? "Selected"}: {selectedMembershipIds.length}
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/60">
              {t(lang, "teamLoading" as any) ?? "Loading…"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-white">
                <thead className="text-left text-white/60">
                  <tr className="border-b border-white/10">
                    <th className="py-3 pr-4">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        disabled={!canManage || selectableMembershipIds.length === 0}
                        checked={
                          selectableMembershipIds.length > 0 &&
                          selectedMembershipIds.length === selectableMembershipIds.length
                        }
                        onChange={(e) => {
                          setSelectedMembershipIds(e.target.checked ? selectableMembershipIds : []);
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-transparent"
                      />
                    </th>

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
                      <tr key={r.membership_id} className="border-b border-white/10 last:border-b-0">
                        <td className="py-3 pr-4 align-top">
                          <input
                            type="checkbox"
                            aria-label="Select member"
                            disabled={disabled}
                            checked={selectedMembershipIds.includes(r.membership_id)}
                            onChange={(e) => {
                              setSelectedMembershipIds((prev) =>
                                e.target.checked
                                  ? Array.from(new Set([...prev, r.membership_id]))
                                  : prev.filter((id) => id !== r.membership_id)
                              );
                            }}
                            className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent disabled:opacity-40"
                          />
                        </td>

                        <td className="py-3 pr-4 align-top">
                          <div className="font-semibold text-white">{r.user_full_name ?? "—"}</div>
                          <div className="mt-1 text-xs text-white/45">
                            {getProfileNameForRole(r.role)}
                          </div>
                        </td>

                        <td className="py-3 pr-4 align-top text-white/80">{r.user_email ?? "—"}</td>
                        <td className="py-3 pr-4 align-top text-white/80">{r.user_phone ?? "—"}</td>

                        <td className="py-3 pr-4 align-top">
                          <select
                            className="w-56 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/30"
                            value={r.role}
                            disabled={disabled || savingId === r.membership_id}
                            onChange={(e) => updateMembership(r.membership_id, { role: e.target.value })}
                          >
                            {ROLE_OPTIONS.map((opt) => (
                              <option
                                key={opt}
                                value={opt}
                                disabled={rank(opt) >= rank(me.membershipRole)}
                                className="bg-slate-900 text-white"
                              >
                                {t(lang, (ROLE_LABEL_KEY[opt] ?? opt) as any) ?? opt}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 pr-4 align-top">
                          <select
                            className="w-40 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-white/30"
                            value={r.status}
                            disabled={disabled || savingId === r.membership_id}
                            onChange={(e) => updateMembership(r.membership_id, { status: e.target.value })}
                          >
                            {["active", "pending", "rejected", "revoked"].map((s) => (
                              <option key={s} value={s} className="bg-slate-900 text-white">
                                {t(lang, (STATUS_LABEL_KEY[s] ?? s) as any) ?? s}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 pr-0 align-top">
                          <span className="text-xs text-white/50">
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
                <div className="p-6 text-sm text-white/60">
                  {t(lang, "teamNoMembers" as any) ?? "No team members."}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* PERMISSIONS */}
        <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/55 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mt-4 flex items-center gap-3">
                  <input
                    value={searchPerm}
                    onChange={(e) => setSearchPerm(e.target.value)}
                    placeholder="Search permissions..."
                    className="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white outline-none"
                  />

                  <span className="text-xs text-white/50">
                    {profilePerms.length} permissions
                  </span>
                </div>
              <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-ew-accent/20 text-ew-accent">
                  ⚙️
                </span>
                {t(lang, "teamPermissionsTitle" as any) ?? "Permissions"}
              </h2>

              <p className="mt-1 text-sm text-white/55">
                {selectedMembershipIds.length === 0
                  ? (t(lang, "teamPermissionsSelectMembers" as any) ??
                    "Select one or more members from the table above.")
                  : selectedMembershipIds.length === 1
                  ? `${t(lang, "teamColumnRole" as any) ?? "Role"}: ${
                      t(
                        lang,
                        (ROLE_LABEL_KEY[selectedRows[0]?.role ?? ""] ?? selectedRows[0]?.role ?? "") as any
                      ) ?? selectedRows[0]?.role ?? "—"
                    } • ${t(lang, "teamPermissionsTitle" as any) ?? "Permissions profile"}: ${selectedProfileSummary}`
                  : `${t(lang, "teamSelectedCount" as any) ?? "Selected"}: ${selectedMembershipIds.length}`}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 shadow-sm">
              {selectedMembershipIds.length === 0
                ? (t(lang, "teamPermissionsSelectMembers" as any) ??
                  "Select one or more members from the table above.")
                : `${t(lang, "teamSelectedCount" as any) ?? "Selected"}: ${selectedMembershipIds.length}`}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/50">{t(lang, "teamColumnRole" as any) ?? "Role"}</p>
              <p className="mt-1 text-sm font-bold text-white">
                {selectedMembershipIds.length === 1
                  ? t(
                      lang,
                      (ROLE_LABEL_KEY[selectedRows[0]?.role ?? ""] ?? selectedRows[0]?.role ?? "") as any
                    ) ?? selectedRows[0]?.role ?? "—"
                  : "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/50">Permission profile</p>
              <p className="mt-1 text-sm font-bold text-white">{selectedProfileSummary}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/50">Edit mode</p>
              <p className="mt-1 text-sm font-bold text-white">
                {selectedMembershipIds.length > 1 ? "Batch update" : "Single member"}
              </p>
            </div>
          </div>

         {permBusy ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/60">
              {t(lang, "teamLoading" as any) ?? "Loading…"}
            </div>
          ) : selectedMembershipIds.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/60">
              {t(lang, "teamPermissionsSelectMembers" as any) ??
                "Select one or more members from the table above."}
            </div>
          ) : profilePerms.length ? (
            Object.entries(
              profilePerms
                .filter((p) => {
                  if (!searchPerm.trim()) return true;
                  const label = t(lang, (`permission.${p.key}` as any)) ?? p.key;
                  return label.toLowerCase().includes(searchPerm.toLowerCase());
                })
                .reduce<Record<string, ProfilePermRow[]>>((acc, p) => {
                  (acc[p.category] ||= []).push(p);
                  return acc;
                }, {})
            ).map(([category, items]) => (
              <div key={category} className="mt-6">
                <div
                  className="mb-3 flex cursor-pointer items-center gap-3"
                  onClick={() =>
                    setOpenSections((prev) => ({
                      ...prev,
                      [category]: prev[category] === false ? true : !prev[category],
                    }))
                  }
                >
                  <div className="h-6 w-1 rounded-full bg-ew-accent" />
                  <div className="text-sm font-extrabold uppercase tracking-wide text-white">
                    {t(lang, (PERMISSION_CATEGORY_KEY[category] ?? category) as any) ?? category}
                  </div>
                  <span className="ml-auto text-lg leading-none text-white/40">
                    {openSections[category] === false ? "+" : "−"}
                  </span>
                </div>

                {openSections[category] !== false && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((p) => {
                      const isDirty = permDraft[p.key] !== permSaved[p.key];

                      return (
                        <label
                          key={p.key}
                          className={clsx(
                            "rounded-2xl border p-4 transition",
                            "bg-white/5 hover:bg-white/8",
                            isDirty ? "border-ew-accent/50 ring-1 ring-ew-accent/20" : "border-white/10"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={!!permDraft[p.key]}
                              onChange={(e) =>
                                setPermDraft((d) => ({ ...d, [p.key]: e.target.checked }))
                              }
                              className="mt-0.5 h-5 w-5 rounded-md border-white/20 bg-transparent text-ew-accent focus:ring-ew-accent"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-white">
                                {t(lang, (`permission.${p.key}` as any)) ?? p.key}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={clsx(
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                    p.source === "override"
                                      ? "border-amber-400/40 bg-amber-400/20 text-amber-200"
                                      : p.source === "profile"
                                      ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200"
                                      : "border-slate-400/30 bg-slate-400/15 text-slate-200"
                                  )}
                                >
                                  {p.source === "override"
                                    ? "Override"
                                    : p.source === "profile"
                                    ? "Profile"
                                    : "Default"}
                                </span>

                                <span
                                  className={clsx(
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                    p.profileAllowed
                                      ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200"
                                      : "border-rose-400/40 bg-rose-400/20 text-rose-200"
                                  )}
                                >
                                  {p.profileAllowed ? "Active" : "Inactive"}
                                </span>

                                {isDirty ? (
                                  <span className="rounded-full border border-ew-accent/30 bg-ew-accent/15 px-2.5 py-1 text-[11px] font-semibold text-ew-accent">
                                    Changed
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-2 font-mono text-[11px] text-white/30">{p.key}</div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-white/60">
              {t(lang, "teamPermissionsEmpty" as any) ?? "No permissions defined."}
            </div>
          )}

          <div className="sticky bottom-0 mt-6 flex flex-col-reverse gap-3 border-t border-white/10 bg-slate-950/80 pt-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15 disabled:opacity-60"
              onClick={() => setPermDraft({ ...permSaved })}
              disabled={permBusy || selectedMembershipIds.length === 0}
            >
              {t(lang, "teamCancel" as any) ?? "Cancel"}
            </button>

            <button
              type="button"
              className="rounded-2xl bg-ew-accent px-5 py-2 text-sm font-extrabold text-ew-primary shadow-sm transition hover:opacity-95 disabled:opacity-60"
              onClick={savePermissions}
              disabled={permBusy || selectedMembershipIds.length === 0}
            >
              {t(lang, "teamSave" as any) ?? "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}