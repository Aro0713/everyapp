import { chromium } from "playwright";

export type MorizonPhoneResult = {
  ok: boolean;
  owner_phone: string | null;
  source_url: string;
  method: "tel-link" | "dom-text" | "not-found" | "error";
  debug: {
    clickedShowPhone: boolean;
    hadTelLink: boolean;
    matchedTextPhone: boolean;
    pageTitle: string | null;
    error?: string | null;
  };
};

function normalizePhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const raw = v.trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 9) return digits;
  if (digits.length === 11 && digits.startsWith("48")) return `+${digits}`;
  if (digits.length >= 9 && digits.length <= 15) return hasPlus ? `+${digits}` : digits;

  return null;
}

function extractPhoneCandidates(text: string): string[] {
  if (!text) return [];

  const matches =
    text.match(/(?:\+48[\s-]?)?(?:\d[\s-]?){9,11}/g) ?? [];

  const out: string[] = [];

  for (const m of matches) {
    if (m.includes("...")) continue;

    const n = normalizePhone(m);
    if (!n) continue;

    const digits = n.replace(/\D/g, "");
    const local = digits.length === 11 && digits.startsWith("48")
      ? digits.slice(2)
      : digits;

    if (!/^[1-9]\d{8}$/.test(local)) continue;
    if (/^1\d{8}$/.test(local)) continue;

    out.push(n);
  }

  return [...new Set(out)];
}

function looksLikeMorizonListingUrl(sourceUrl: string): boolean {
  const url = sourceUrl.toLowerCase().trim();

  if (!url.includes("morizon.pl")) return false;

  const blocked = [
    "/blog/",
    "/poradniki/",
    "/kalkulatory/",
    "/rankingi/",
    "/kredyty/",
    "/dla-biur/",
    "/reklama/",
    "/kontakt/",
    "/szukaj",
    "/inwestycje",
  ];

  if (blocked.some((part) => url.includes(part))) return false;

  // Morizon zwykle ma pojedynczą ofertę jako długi slug bez końcówek listingowych.
  // To nie jest super idealne, ale odcina oczywiste śmieci i listingi.
  if (!url.includes("/oferta/") && !url.includes("/ogloszenie/") && !/\/[a-z0-9-]+$/i.test(url)) {
    return false;
  }

  return true;
}

async function dismissOverlays(page: any): Promise<void> {
  const selectors = [
    "#onetrust-accept-btn-handler",
    'button:has-text("Akceptuję")',
    'button:has-text("Akceptuj")',
    'button:has-text("Zgadzam się")',
    'button:has-text("Rozumiem")',
    'button:has-text("OK")',
    'button:has-text("Accept")',
    'button:has-text("Agree")',
    '[data-testid*="consent"] button',
    'button[id*="onetrust"]',
    'button[aria-label*="Akcept"]',
    'button[aria-label*="zgod"]',
  ];

  for (const selector of selectors) {
    try {
      const btn = page.locator(selector).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;

      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300).catch(() => {});
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1000).catch(() => {});
    } catch {}
  }
}

  async function clickShowPhone(page: any): Promise<boolean> {
  const panelSelectors = [
    "aside",
    '[class*="agent"]',
    '[class*="contact"]',
    '[class*="phone"]',
  ];

  for (const panelSelector of panelSelectors) {
    try {
      const panels = page.locator(panelSelector);
      const panelCount = await panels.count().catch(() => 0);
      if (panelCount === 0) continue;

      const maxPanels = Math.min(panelCount, 6);

      for (let p = 0; p < maxPanels; p++) {
        const panel = panels.nth(p);
        const panelText = await panel.innerText().catch(() => "");

        if (!panelText) continue;
        if (!/agent nieruchomości/i.test(panelText)) continue;

        const buttonCandidates = [
          panel.locator('button:has-text("POKAŻ")'),
          panel.locator('button:has-text("Pokaż")'),
          panel.locator('a:has-text("POKAŻ")'),
          panel.locator('a:has-text("Pokaż")'),
          panel.locator('[class*="phone"] button'),
          panel.locator('[class*="contact"] button'),
        ];

        for (const loc of buttonCandidates) {
          const count = await loc.count().catch(() => 0);
          if (count === 0) continue;

          const max = Math.min(count, 5);

          for (let i = 0; i < max; i++) {
            const btn = loc.nth(i);
            const visible = await btn.isVisible().catch(() => false);
            if (!visible) continue;

            const text = (await btn.innerText().catch(() => "")).trim();
            if (text && !/pokaż/i.test(text)) continue;

            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(300).catch(() => {});
            await dismissOverlays(page);

            try {
              await btn.click({ timeout: 5000 });
            } catch {
              try {
                await btn.evaluate((el: HTMLElement) => el.click());
              } catch {
                const box = await btn.boundingBox().catch(() => null);
                if (!box) continue;

                try {
                  await page.mouse.click(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                    { delay: 100 }
                  );
                } catch {
                  continue;
                }
              }
            }

            await page.waitForTimeout(3500).catch(() => {});
            return true;
          }
        }
      }
    } catch {}
  }

  return false;
}

async function collectContactTexts(page: any): Promise<string[]> {
  const selectors = [
    '[data-testid*="contact"]',
    '[data-testid*="phone"]',
    '[class*="contact"]',
    '[class*="phone"]',
    "aside",
  ];

  const texts: string[] = [];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      if (count === 0) continue;

      const max = Math.min(count, 8);
      for (let i = 0; i < max; i++) {
        const txt = await loc.nth(i).innerText().catch(() => "");
        if (!txt || !txt.trim()) continue;
        texts.push(txt.trim());
      }
    } catch {}
  }

  return [...new Set(texts)];
}

async function extractPhoneFromTel(page: any): Promise<string | null> {
  try {
    const href = await page.locator('a[href^="tel:"]').first().getAttribute("href");
    return normalizePhone(typeof href === "string" ? href.replace(/^tel:/i, "") : null);
  } catch {
    return null;
  }
}

async function extractPhoneFromAttrs(page: any): Promise<string | null> {
  try {
    const handles = await page
      .locator('[href^="tel:"], [data-testid*="phone"], [class*="phone"], [class*="contact"]')
      .elementHandles();

    for (const h of handles) {
      try {
        const href = await h.getAttribute("href").catch(() => null);
        const text = await h.textContent().catch(() => null);

        const fromHref = normalizePhone(
          typeof href === "string" ? href.replace(/^tel:/i, "") : null
        );
        if (fromHref) return fromHref;

        const candidates = extractPhoneCandidates(text ?? "");
        if (candidates.length > 0) return candidates[0];
      } catch {}
    }
  } catch {}

  return null;
}
async function extractPhoneFromMorizonAgentPanel(page: any): Promise<string | null> {
  const selectors = [
    "aside",
    '[class*="agent"]',
    '[class*="contact"]',
    '[class*="phone"]',
  ];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      if (count === 0) continue;

      const max = Math.min(count, 6);

      for (let i = 0; i < max; i++) {
        const text = await loc.nth(i).innerText().catch(() => "");
        if (!text) continue;

        if (!/agent nieruchomości/i.test(text)) continue;

        const phones = extractPhoneCandidates(text);
        if (phones.length > 0) return phones[0];
      }
    } catch {}
  }

  return null;
}

async function extractPhoneNearContactArea(page: any): Promise<string | null> {
  const selectors = [
    '[data-testid*="contact"]',
    '[data-testid*="phone"]',
    '[class*="contact"]',
    '[class*="phone"]',
    "aside",
  ];

  for (const sel of selectors) {
    try {
      const locator = page.locator(sel);
      const count = await locator.count().catch(() => 0);
      if (count === 0) continue;

      const max = Math.min(count, 8);

      for (let i = 0; i < max; i++) {
        const text = await locator.nth(i).innerText().catch(() => "");
        if (!text) continue;

        const phones = extractPhoneCandidates(text);
        if (phones.length > 0) return phones[0];
      }
    } catch {}
  }

  return null;
}

async function extractPhoneFromDom(page: any): Promise<string | null> {
  const texts = await collectContactTexts(page);

  for (const txt of texts) {
    const phones = extractPhoneCandidates(txt);
    if (phones.length > 0) return phones[0];
  }

  return null;
}

export async function revealMorizonPhone(sourceUrl: string): Promise<MorizonPhoneResult> {
  let browser: any = null;
  let clickedShowPhone = false;
  let hadTelLink = false;
  let matchedTextPhone = false;
  let pageTitle: string | null = null;

  try {
    if (!looksLikeMorizonListingUrl(sourceUrl)) {
      return {
        ok: false,
        owner_phone: null,
        source_url: sourceUrl,
        method: "not-found",
        debug: {
          clickedShowPhone: false,
          hadTelLink: false,
          matchedTextPhone: false,
          pageTitle: null,
          error: "URL is not a Morizon single listing",
        },
      };
    }

    browser = await chromium.launch({
      headless: false,
      slowMo: 250,
    });

    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
      locale: "pl-PL",
      viewport: { width: 1440, height: 1200 },
    });

    await page.goto(sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000).catch(() => {});

    pageTitle = await page.title().catch(() => null);

    await dismissOverlays(page);
    await page.waitForTimeout(700).catch(() => {});
    clickedShowPhone = await clickShowPhone(page);

      if (clickedShowPhone) {
      await page.waitForFunction(() => {
        const texts = Array.from(
          document.querySelectorAll("aside, [class*='agent'], [class*='contact'], [class*='phone']")
        )
          .map((el) => (el.textContent || "").trim())
          .filter(Boolean);

        return texts.some((txt) => {
          if (!/agent nieruchomości/i.test(txt)) return false;
          if (txt.includes("...")) return false;

          const matches = txt.match(/(?:\+48[\s-]?)?(?:\d[\s-]?){9,11}/g) ?? [];
          return matches.length > 0;
        });
      }, { timeout: 7000 }).catch(() => {});
    }

    const fromTel = await extractPhoneFromTel(page);
    if (fromTel) {
      hadTelLink = true;
      return {
        ok: true,
        owner_phone: fromTel,
        source_url: sourceUrl,
        method: "tel-link",
        debug: {
          clickedShowPhone,
          hadTelLink,
          matchedTextPhone,
          pageTitle,
          error: null,
        },
      };
    }

      const fromMorizonAgentPanel = await extractPhoneFromMorizonAgentPanel(page);
    if (fromMorizonAgentPanel) {
      matchedTextPhone = true;
      return {
        ok: true,
        owner_phone: fromMorizonAgentPanel,
        source_url: sourceUrl,
        method: "dom-text",
        debug: {
          clickedShowPhone,
          hadTelLink,
          matchedTextPhone,
          pageTitle,
          error: null,
        },
      };
    }

        const fromAgentPanel = await extractPhoneFromMorizonAgentPanel(page);
    if (fromAgentPanel) {
      matchedTextPhone = true;
      return {
        ok: true,
        owner_phone: fromAgentPanel,
        source_url: sourceUrl,
        method: "dom-text",
        debug: {
          clickedShowPhone,
          hadTelLink,
          matchedTextPhone,
          pageTitle,
          error: null,
        },
      };
    }

    const fromNearContact = await extractPhoneNearContactArea(page);
    if (fromNearContact) {
      matchedTextPhone = true;
      return {
        ok: true,
        owner_phone: fromNearContact,
        source_url: sourceUrl,
        method: "dom-text",
        debug: {
          clickedShowPhone,
          hadTelLink,
          matchedTextPhone,
          pageTitle,
          error: null,
        },
      };
    }

    const fromAttrs = await extractPhoneFromAttrs(page);
    if (fromAttrs) {
      matchedTextPhone = true;
      return {
        ok: true,
        owner_phone: fromAttrs,
        source_url: sourceUrl,
        method: "dom-text",
        debug: {
          clickedShowPhone,
          hadTelLink,
          matchedTextPhone,
          pageTitle,
          error: null,
        },
      };
    }

    const fromDom = await extractPhoneFromDom(page);
    if (fromDom) {
      matchedTextPhone = true;
      return {
        ok: true,
        owner_phone: fromDom,
        source_url: sourceUrl,
        method: "dom-text",
        debug: {
          clickedShowPhone,
          hadTelLink,
          matchedTextPhone,
          pageTitle,
          error: null,
        },
      };
    }

      const contactTexts = await page
    .locator('aside, [data-testid*="contact"], [data-testid*="phone"], [class*="contact"], [class*="phone"], body')
    .allInnerTexts()
    .catch(() => []);

    const telLinks = await page
      .locator('a[href^="tel:"]')
      .evaluateAll((els: HTMLAnchorElement[]) =>
        els.map((el) => ({
          href: el.href,
          text: (el.textContent || "").trim(),
        }))
      )
      .catch(() => []);

    console.log("MORIZON_PHONE_DEBUG", {
      sourceUrl,
      clickedShowPhone,
      pageTitle,
      telLinks,
      contactTexts,
    });

    return {
      ok: false,
      owner_phone: null,
      source_url: sourceUrl,
      method: "not-found",
      debug: {
        clickedShowPhone,
        hadTelLink,
        matchedTextPhone,
        pageTitle,
        error: null,
      },
    };
  } catch (e: any) {
    return {
      ok: false,
      owner_phone: null,
      source_url: sourceUrl,
      method: "error",
      debug: {
        clickedShowPhone,
        hadTelLink,
        matchedTextPhone,
        pageTitle,
        error: e?.message ?? "Unknown error",
      },
    };
  } finally {
    try {
      await browser?.close();
    } catch {}
  }
}

export default revealMorizonPhone;