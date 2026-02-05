import type { ImportItem } from "./types.js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function importBatch(officeId: string, items: ImportItem[]) {
  const baseUrl = mustEnv("EVERYAPP_BASE_URL").replace(/\/+$/, "");
  const key = process.env.EVERYAPP_API_KEY || process.env.CRON_SECRET;
  if (!key) throw new Error("Missing EVERYAPP_API_KEY or CRON_SECRET for x-everyapp-key");

  const r = await fetch(`${baseUrl}/api/everybot/import-batch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-everyapp-key": key,
    },
    body: JSON.stringify({ officeId, items }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? `Import failed (${r.status})`);
  return j;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
