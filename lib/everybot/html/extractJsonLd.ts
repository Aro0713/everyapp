// lib/everybot/html/extractJsonLd.ts

export function extractJsonLd(html: string): any[] {
  const matches = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
  );
  if (!matches) return [];

  const out: any[] = [];

  for (const block of matches) {
    const m = block.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i
    );
    if (!m) continue;

    try {
      const parsed = JSON.parse(m[1]);
      out.push(parsed);
    } catch {
      continue;
    }
  }

  return out;
}
