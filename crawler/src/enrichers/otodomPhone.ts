import { chromium } from "playwright";

export type OtodomPhoneResult = {
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
    const n = normalizePhone(m);
    if (!n) continue;

    const digits = n.replace(/\D/g, "");

    // tylko realistyczne PL numery:
    // 9 cyfr lokalnie albo 11 cyfr z prefiksem 48
    if (digits.length === 9 || (digits.length === 11 && digits.startsWith("48"))) {
      out.push(n);
    }
  }

  return [...new Set(out)];
}

async function tryClickConsent(page: any): Promise<void> {
  const labels = [
    /akceptuj/i,
    /zgadzam/i,
    /rozumiem/i,
    /jasne/i,
    /zamknij/i,
    /accept/i,
    /agree/i,
  ];

  for (const rx of labels) {
    try {
      const btn = page.getByText(rx).first();
      const count = await btn.count().catch(() => 0);
      if (count > 0) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(500).catch(() => {});
      }
    } catch {}
  }
}

async function dismissOverlays(page: any): Promise<void> {
  const selectors = [
    "#onetrust-accept-btn-handler",
    'button[aria-label*="Akcept"]',
    'button[aria-label*="zgod"]',
    'button:has-text("Akceptuję")',
    'button:has-text("Akceptuj")',
    'button:has-text("Zgadzam się")',
    'button:has-text("Rozumiem")',
    'button:has-text("Jasne")',
    'button:has-text("OK")',
    'button:has-text("Zamknij")',
  ];

  for (const selector of selectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(600).catch(() => {});
      }
    } catch {}
  }

  const fallbackSelectors = [
    "#onetrust-reject-all-handler",
    ".onetrust-close-btn-handler",
    'button[aria-label*="Close"]',
  ];

  for (const selector of fallbackSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(500).catch(() => {});
      }
    } catch {}
  }

  await page.waitForFunction(() => {
    const sdk = document.querySelector("#onetrust-consent-sdk");
    if (!sdk) return true;

    const dark = document.querySelector(".onetrust-pc-dark-filter") as HTMLElement | null;
    const banner = document.querySelector("#onetrust-banner-sdk") as HTMLElement | null;

    const hidden = (el: HTMLElement | null) =>
      !el ||
      el.style.display === "none" ||
      el.style.visibility === "hidden" ||
      el.getAttribute("aria-hidden") === "true";

    return hidden(dark) && hidden(banner);
  }, { timeout: 5000 }).catch(() => {});
}

async function clickShowPhone(page: any): Promise<boolean> {
  const topSection = page.locator("main").first();

  const contactPanel = topSection.locator(
    [
      '[data-cy*="ad-contact"]',
      '[data-testid*="contact"]',
      "aside",
      '[class*="contact"]',
      '[class*="phone"]',
    ].join(", ")
  ).first();

  const panelVisible = await contactPanel.isVisible().catch(() => false);
  if (!panelVisible) {
    return false;
  }

  await contactPanel.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500).catch(() => {});

  await dismissOverlays(page);

  const exact = contactPanel
    .locator('[data-cy="phone-number.show-full-number-button"]')
    .first();

  const exactVisible = await exact.isVisible().catch(() => false);
  if (!exactVisible) {
    return false;
  }

  try {
    await exact.click({ timeout: 5000 });
  } catch {
    await dismissOverlays(page);
    await page.waitForTimeout(500).catch(() => {});

    try {
      const clicked = await exact.evaluate((el: HTMLElement) => {
        const btn = el as HTMLButtonElement;
        btn.click();
        return true;
      });
      if (!clicked) return false;
    } catch {
      const box = await exact.boundingBox().catch(() => null);
      if (!box) return false;

      try {
        await page.mouse.click(
          box.x + box.width / 2,
          box.y + box.height / 2,
          { delay: 80 }
        );
      } catch {
        return false;
      }
    }
  }

  await page.waitForTimeout(3000).catch(() => {});
  await page.waitForTimeout(5000).catch(() => {});

  return true;
}

async function collectContactTexts(page: any): Promise<string[]> {
  const selectors = [
    "aside",
    '[data-cy*="contact"]',
    '[data-testid*="contact"]',
    '[class*="contact"]',
    '[class*="phone"]',
    "main",
  ];

  const texts: string[] = [];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count().catch(() => 0);
      if (count === 0) continue;

      const max = Math.min(count, 5);
      for (let i = 0; i < max; i++) {
        const txt = await loc.nth(i).innerText().catch(() => "");
        if (txt && txt.trim()) texts.push(txt.trim());
      }
    } catch {}
  }

  return texts;
}

async function extractPhoneFromTel(page: any): Promise<string | null> {
  try {
    const href = await page.locator('a[href^="tel:"]').first().getAttribute("href");
    return normalizePhone(typeof href === "string" ? href.replace(/^tel:/i, "") : null);
  } catch {
    return null;
  }
}

async function extractPhoneFromContactRoot(page: any): Promise<string | null> {
  const roots = [
    page.locator("aside"),
    page.locator('[data-cy*="contact"]'),
    page.locator('[data-testid*="contact"]'),
    page.locator('[class*="contact"]'),
  ];

  for (const root of roots) {
    try {
      const count = await root.count().catch(() => 0);
      if (count === 0) continue;

      const text = await root.first().innerText().catch(() => "");
      if (!text) continue;

      const phones = extractPhoneCandidates(text);
      if (phones.length > 0) return phones[0];
    } catch {}
  }

  return null;
}

async function extractPhoneNearContactArea(page: any): Promise<string | null> {
  const selectors = [
    "aside",
    '[data-cy*="contact"]',
    '[data-testid*="contact"]',
    '[class*="contact"]',
    '[class*="phone"]',
  ];

  for (const sel of selectors) {
    try {
      const locator = page.locator(sel).first();
      const count = await locator.count().catch(() => 0);
      if (count === 0) continue;

      const text = await locator.innerText().catch(() => "");
      if (!text) continue;

      const phones = extractPhoneCandidates(text);
      if (phones.length > 0) return phones[0];
    } catch {}
  }

  return null;
}

async function extractPhoneFromAttrs(page: any): Promise<string | null> {
  try {
    const handles = await page
      .locator('[href^="tel:"], [data-testid*="phone"], [data-cy*="phone"]')
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

// celowo BEZ skanowania całego body — to dawało false positive
async function extractPhoneFromDom(page: any): Promise<string | null> {
  const texts = await collectContactTexts(page);

  for (const txt of texts) {
    const phones = extractPhoneCandidates(txt);
    if (phones.length > 0) return phones[0];
  }

  return null;
}

export async function revealOtodomPhone(sourceUrl: string): Promise<OtodomPhoneResult> {
  let browser: any = null;
  let clickedShowPhone = false;
  let hadTelLink = false;
  let matchedTextPhone = false;
  let pageTitle: string | null = null;

  try {
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
    await page.waitForTimeout(800);

    pageTitle = await page.title().catch(() => null);

    await dismissOverlays(page);
    await page.waitForTimeout(800).catch(() => {});
    clickedShowPhone = await clickShowPhone(page);

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
    
    const fromContactRoot = await extractPhoneFromContactRoot(page);
    if (fromContactRoot) {
      matchedTextPhone = true;
      return {
        ok: true,
        owner_phone: fromContactRoot,
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
        .locator('[data-cy*="ad-contact"], [data-testid*="contact"], aside, [class*="contact"], [class*="phone"]')
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

      console.log("OTODOM_PHONE_DEBUG", {
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

export default revealOtodomPhone;