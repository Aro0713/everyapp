import { chromium } from "playwright";

export type GratkaPhoneResult = {
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

  // nie próbujemy dopasowywać, jeśli tekst zawiera maskowanie numeru
  if (text.includes("...")) {
    // ale nie wychodzimy od razu - sprawdzamy pełne liczby w innych fragmentach
  }

  const matches =
    text.match(/(?:\+48[\s-]?)?(?:\d[\s-]?){9,11}/g) ?? [];

  const out: string[] = [];

  for (const m of matches) {
    // odrzucamy maskowane kawałki typu 50220...
    if (m.includes("...")) continue;

    const n = normalizePhone(m);
    if (!n) continue;

    const digits = n.replace(/\D/g, "");

    // tylko realistyczne PL numery komórkowe / krajowe
    if (digits.length === 9 || (digits.length === 11 && digits.startsWith("48"))) {
      // odrzucamy ewidentne śmieci zaczynające się od 0 lub 1
      const local = digits.length === 11 && digits.startsWith("48")
        ? digits.slice(2)
        : digits;

      if (!/^[1-9]\d{8}$/.test(local)) continue;
      if (/^1\d{8}$/.test(local)) continue;

      out.push(n);
    }
  }

  return [...new Set(out)];
}

function looksLikeGratkaListingUrl(sourceUrl: string): boolean {
  const url = sourceUrl.toLowerCase().trim();

  if (!url.includes("gratka.pl")) return false;
  if (!url.includes("/nieruchomosci/")) return false;

  // tylko pojedyncze ogłoszenia
  const isSingleListing =
    /\/ob\/\d+(?:[/?#]|$)/i.test(url) ||
    /\/oi\/\d+(?:[/?#]|$)/i.test(url);

  if (!isSingleListing) return false;

  const blocked = [
    "/blog/",
    "/firmy/",
    "/formularz-ogloszenia/",
    "/oferta-dla-biur-nieruchomosci/",
    "/oferta-dla-deweloperow/",
    "/reklama/",
    "/inwestycje-deweloperskie",
  ];

  return !blocked.some((part) => url.includes(part));
}

async function dismissOverlays(page: any): Promise<void> {
  const primarySelectors = [
    'button:has-text("PRZEJDŹ DO SERWISU")',
    'a:has-text("PRZEJDŹ DO SERWISU")',
    'button:has-text("Przejdź do serwisu")',
    'a:has-text("Przejdź do serwisu")',
    'button:has-text("Akceptuję")',
    'button:has-text("Akceptuj")',
    'button:has-text("Zgadzam się")',
    'button:has-text("Accept")',
    "#onetrust-accept-btn-handler",
  ];

  for (const selector of primarySelectors) {
    try {
      const btn = page.locator(selector).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;

      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300).catch(() => {});
      await btn.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1200).catch(() => {});
    } catch {}
  }

  const fallbackSelectors = [
    'button[aria-label*="zamkn"]',
    'button[aria-label*="close"]',
    ".onetrust-close-btn-handler",
    "#onetrust-reject-all-handler",
  ];

  for (const selector of fallbackSelectors) {
    try {
      const btn = page.locator(selector).first();
      const visible = await btn.isVisible().catch(() => false);
      if (!visible) continue;

      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(800).catch(() => {});
    } catch {}
  }

  await page.waitForFunction(() => {
    const textMatchers = [
      "PRZEJDŹ DO SERWISU",
      "Przejdź do serwisu",
      "USTAWIENIA ZAAWANSOWANE",
      "Ustawienia zaawansowane",
      "Szanowna Użytkowniczko",
      "Szanowny Użytkowniku",
    ];

    const all = Array.from(document.querySelectorAll("button, a, div, section")) as HTMLElement[];

    const overlayVisible = all.some((el) => {
      const txt = (el.innerText || "").trim();
      if (!txt) return false;

      const hit = textMatchers.some((m) => txt.includes(m));
      if (!hit) return false;

      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    return !overlayVisible;
  }, { timeout: 6000 }).catch(() => {});
}

async function clickShowPhone(page: any): Promise<boolean> {
  const candidates = [
    '[data-testid*="phone"] button',
    '[data-testid*="contact"] button',
    '[class*="contact"] button',
    '[class*="phone"] button',
    'button:has-text("Pokaż numer")',
    'button:has-text("Wyświetl numer")',
    'button:has-text("Zobacz numer")',
    'a:has-text("Pokaż numer")',
    'a:has-text("Wyświetl numer")',
  ];

  for (const selector of candidates) {
    try {
      const btn = page.locator(selector).first();
      if (!(await btn.isVisible().catch(() => false))) continue;

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

          await page.mouse.click(
            box.x + box.width / 2,
            box.y + box.height / 2,
            { delay: 80 }
          ).catch(() => {});
        }
      }

      await page.waitForTimeout(2500).catch(() => {});
      return true;
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

      const max = Math.min(count, 6);
      for (let i = 0; i < max; i++) {
        const txt = await loc.nth(i).innerText().catch(() => "");
        if (!txt || !txt.trim()) continue;

        // tylko sekcje kontaktowe, nie całe listingi
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

      const max = Math.min(count, 6);

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

export async function revealGratkaPhone(sourceUrl: string): Promise<GratkaPhoneResult> {
  let browser: any = null;
  let clickedShowPhone = false;
  let hadTelLink = false;
  let matchedTextPhone = false;
  let pageTitle: string | null = null;

  try {
    if (!looksLikeGratkaListingUrl(sourceUrl)) {
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
          error: "URL is not a Gratka property listing",
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
    await page.waitForTimeout(600).catch(() => {});
    clickedShowPhone = await clickShowPhone(page);
  
    if (clickedShowPhone) {
    await page.waitForFunction(() => {
      const texts = Array.from(
        document.querySelectorAll('[class*="contact"], [class*="phone"], [data-testid*="contact"], [data-testid*="phone"], aside')
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
      .locator('[data-testid*="contact"], [data-testid*="phone"], [class*="contact"], [class*="phone"], aside')
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

    console.log("GRATKA_PHONE_DEBUG", {
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

export default revealGratkaPhone;