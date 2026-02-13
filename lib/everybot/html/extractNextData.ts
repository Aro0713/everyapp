// lib/everybot/html/extractNextData.ts

export function extractNextData(html: string): any | null {
  const m = html.match(
    /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return null;

  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
