import { chromium } from "playwright";

export type OdWlascicielaPhoneResult = {
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

function looksLikeOdWlascicielaListingUrl(sourceUrl: string): boolean {
  const url = sourceUrl.toLowerCase().trim();

  if (!url.includes("odwlasciciela.pl")) return false;

  const blocked = [
    "/blog",
    "/kontakt",
    "/regulamin",
    "/polityka-prywatnosci",
    "/o-nas",
    "/reklama",
    "/pomoc",
    "/faq",
  ];

  if (blocked.some((part) => url.includes(part))) return false;

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
  const candidates = [
    'button:has-text("Pokaż numer")',
    'button:has-text("Pokaż")',
    'a:has-text("Pokaż numer")',
    'a:has-text("Pokaż")',
    '[data-testid*="phone"] button',
    '[data-testid*="contact"] button',
    '[class*="phone"] button',
    '[class*="contact"] button',
    '[class*="phone"] a',
    '[class*="contact"] a',
  ];

  for (const selector of candidates) {
    try {
      const loc = page.locator(selector);
      const count = await loc.count().catch(() => 0);
      if (count === 0) continue;

      const max = Math.min(count, 10);

      for (let i = 0; i < max; i++) {
        const btn = loc.nth(i);
        const visible = await btn.isVisible().catch(() => false);
        if (!visible) continue;

        const text = (await btn.innerText().catch(() => "")).trim();

        if (
          text &&
          !/pokaż/i.test(text) &&
          !/numer/i.test(text) &&
          !/telefon/i.test(text)
        ) {
          continue;
        }

        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(400).catch(() => {});
        await dismissOverlays(page);

        try {
          await btn.click({ timeout: 4000 });
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
                { delay: 80 }
              );
            } catch {
              continue;
            }
          }
        }

        await page.waitForTimeout(3000).catch(() => {});
        return true;
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

export async function revealOdWlascicielaPhone(sourceUrl: string): Promise<OdWlascicielaPhoneResult> {
  let browser: any = null;
  let clickedShowPhone = false;
  let hadTelLink = false;
  let matchedTextPhone = false;
  let pageTitle: string | null = null;

  try {
    if (!looksLikeOdWlascicielaListingUrl(sourceUrl)) {
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
          error: "URL is not an odwlasciciela listing",
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
          document.querySelectorAll("aside, [class*='contact'], [class*='phone']")
        )
          .map((el) => (el.textContent || "").trim())
          .filter(Boolean);

        return texts.some((txt) => {
          if (txt.includes("...")) return false;
          const matches = txt.match(/(?:\+48[\s-]?)?(?:\d[\s-]?){9,11}/g) ?? [];
          return matches.length > 0;
        });
      }, { timeout: 5000 }).catch(() => {});
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
      .locator('aside, [data-testid*="contact"], [data-testid*="phone"], [class*="contact"], [class*="phone"]')
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

    console.log("ODWLASCICIELA_PHONE_DEBUG", {
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

export default revealOdWlascicielaPhone;