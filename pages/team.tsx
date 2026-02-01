import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, t } from "@/utils/i18n";
import type { LangKey } from "@/utils/translations";

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

export default function TeamPage() {
  const [me, setMe] = useState<Me>({ userId: null });
  const [lang, setLang] = useState<LangKey>(DEFAULT_LANG);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rMe = await fetch("/api/me");
      const meData = await rMe.json();
      setMe(meData);

      const r = await fetch("/api/team/members");
      if (!r.ok) throw new Error("Nie udało się pobrać zespołu");
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Błąd");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
      if (!r.ok) throw new Error(j?.error || "Błąd zapisu");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Błąd");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-ew-bg p-6 text-ew-primary">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Zarządzanie zespołem</h1>
            <p className="mt-1 text-sm text-gray-600">
              {me.fullName ? `${me.fullName} (${me.email})` : "—"}{" "}
              {me.officeName ? `• ${me.officeName}` : ""}
              {me.membershipRole ? ` • rola: ${me.membershipRole}` : ""}
            </p>
          </div>
          <button
            className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-ew-accent/10"
            onClick={load}
          >
            Odśwież
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
          {loading ? (
            <div className="p-6 text-sm text-gray-600">Ładuję…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr className="border-b">
                    <th className="py-3 pr-4">Agent</th>
                    <th className="py-3 pr-4">Email</th>
                    <th className="py-3 pr-4">Telefon</th>
                    <th className="py-3 pr-4">Rola</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-0">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isSelf = r.user_id === me.userId;
                    const disabled =
                      !canManage ||
                      isSelf ||
                      rank(r.role) >= rank(me.membershipRole);

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
                              <option
                                key={opt}
                                value={opt}
                                disabled={rank(opt) >= rank(me.membershipRole)}
                              >
                                {opt}
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
                            <option value="active">active</option>
                            <option value="pending">pending</option>
                            <option value="blocked">blocked</option>
                          </select>
                        </td>

                        <td className="py-3 pr-0">
                          <span className="text-xs text-gray-500">
                            {isSelf ? "To Ty" : disabled ? "Brak uprawnień" : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!rows.length ? (
                <div className="p-6 text-sm text-gray-600">Brak członków zespołu.</div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
