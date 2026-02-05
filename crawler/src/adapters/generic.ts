import { chromium, type Page } from "playwright";
import type { EverybotSource, ImportItem } from "../types.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(minMs: number, maxMs: number) {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

async function autoScroll(page: Page, steps: number) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 1800);
    await sleep(jitter(700, 1400));
  }
}

function absolutize(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

export async function harvestGeneric(source: EverybotSource): Promise<ImportItem[]> {
  const meta = source.meta ?? {};
  const linkSelector: string = meta.linkSelector ?? "a[href]";
  const hrefMustInclude: string | null = meta.hrefMustInclude ?? null;
  const maxLinks: number = meta.maxLinks ?? 120;
  const scrollSteps: number = meta.scrollSteps ?? 6;

  const headless = (process.env.HEADLESS ?? "true") !== "false";

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  // Dobre praktyki: mała równoległość + umiarkowane timeouty
  page.setDefaultTimeout(20000);

  try {
    await page.goto(source.base_url, { waitUntil: "domcontentloaded" });
    await sleep(jitter(900, 1600));

    if (source.strategy === "scroll") {
      await autoScroll(page, scrollSteps);
    }

    const hrefs = await page.$$eval(linkSelector, (els) =>
      els
        .map((e) => (e as HTMLAnchorElement).href || (e as HTMLAnchorElement).getAttribute("href") || "")
        .filter(Boolean)
    );

    const uniq = new Set<string>();
    for (const h of hrefs) {
      const abs = absolutize(source.base_url, h);
      if (hrefMustInclude && !abs.toLowerCase().includes(String(hrefMustInclude).toLowerCase())) continue;
      uniq.add(abs);
      if (uniq.size >= maxLinks) break;
    }

    const items: ImportItem[] = Array.from(uniq).map((url) => ({
      url,
      source: source.adapter === "generic" ? undefined : source.adapter,
      importedFrom: `crawler:${source.name}`,
    }));

    return items;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
