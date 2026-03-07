import { chromium, type Page, type Locator } from "playwright";

const url = process.argv[2];

if (!url) {
  console.error("Usage: npx tsx src/test-otodom-phone.ts <otodom-url>");
  process.exit(1);
}

type LoggedResponse = {
  url: string;
  status: number | null;
  method?: string | null;
  contentType?: string | null;
  body?: unknown;
};

function normalizePhone(text: string): string {
  return text.replace(/[^\d+]/g, "");
}

function extractPhones(text: string): string[] {
  const matches = text.match(/\+?\d[\d\s-]{7,}\d/g) ?? [];
  const uniq = new Set<string>();

  for (const raw of matches) {
    const normalized = normalizePhone(raw);
    const digitsOnly = normalized.replace(/\D/g, "");

    if (digitsOnly.length >= 9 && digitsOnly.length <= 11) {
      uniq.add(raw.trim());
    }
  }

  return [...uniq];
}

async function dismissOverlays(page: Page): Promise<void> {
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
        await page.waitForTimeout(600);
      }
    } catch {}
  }

  // jeśli panel nadal siedzi na stronie, spróbuj kliknąć reject/close
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
        await page.waitForTimeout(500);
      }
    } catch {}
  }

  // poczekaj aż overlay przestanie przechwytywać kliknięcia
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

async function clickOtodomTopPhoneButton(page: Page): Promise<boolean> {
  const topSection = page.locator("main").first();

  const contactPanel = topSection.locator(
    [
      '[data-cy*="ad-contact"]',
      '[data-testid*="contact"]',
      'aside',
      '[class*="contact"]',
      '[class*="phone"]',
    ].join(", ")
  ).first();

  const panelVisible = await contactPanel.isVisible().catch(() => false);
  if (!panelVisible) {
    console.log(JSON.stringify({ kind: "top-contact-panel", found: false }));
    return false;
  }

  await contactPanel.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // najpierw zamknij warstwy zgód, bo to one blokują klik
  await dismissOverlays(page);

  const exact = contactPanel
    .locator('[data-cy="phone-number.show-full-number-button"]')
    .first();

  const exactVisible = await exact.isVisible().catch(() => false);

  if (!exactVisible) {
    console.log(JSON.stringify({
      kind: "top-phone-button",
      selector: '[data-cy="phone-number.show-full-number-button"]',
      found: false,
    }));
    return false;
  }

  const txt = await exact.innerText().catch(() => "");
  const disabled = await exact.isDisabled().catch(() => false);
  const box = await exact.boundingBox().catch(() => null);

  console.log(JSON.stringify({
    kind: "top-phone-button",
    selector: '[data-cy="phone-number.show-full-number-button"]',
    text: txt,
    found: true,
    disabled,
    box,
  }));

    try {
    await exact.click({ timeout: 5000 });
    return true;
  } catch (e) {
    console.log(JSON.stringify({
      kind: "top-phone-button-click-failed",
      error: e instanceof Error ? e.message : String(e),
    }));

    await dismissOverlays(page);
    await page.waitForTimeout(500);
  }

  // fallback: click przez evaluate na elemencie
  try {
    const clicked = await exact.evaluate((el) => {
      const btn = el as HTMLButtonElement;
      btn.click();
      return true;
    });
    if (clicked) return true;
  } catch {}

  // ostatni normalny fallback: click po współrzędnych
  if (box) {
    try {
      await page.mouse.click(
        box.x + box.width / 2,
        box.y + box.height / 2,
        { delay: 80 }
      );
      return true;
    } catch {}
  }

  return false;
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 250,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    locale: "pl-PL",
    viewport: { width: 1440, height: 1200 },
  });

  const page = await context.newPage();

  const responses: LoggedResponse[] = [];

  page.on("response", async (resp) => {
  try {
    const u = resp.url();
    const headers = resp.headers();
    const ct = headers["content-type"] || null;

    const isOtodom = u.includes("otodom.pl");
    const isRelevant =
      /reply_phone_show|phone|contact|lead|seller|agency|reply|owner/i.test(u) ||
      u.includes("GetAdOwnerQuery");

    if (!isOtodom || !isRelevant) return;

    let body: unknown = null;

    if (
      ct &&
      (
        ct.includes("application/json") ||
        ct.includes("application/graphql-response+json") ||
        ct.includes("+json")
      )
    ) {
      body = await resp.json().catch(() => null);
    }

    responses.push({
      url: u,
      status: resp.status(),
      method: resp.request().method(),
      contentType: ct,
      body,
    });
  } catch {}
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
await dismissOverlays(page);
await page.waitForTimeout(800);

  const pageTitle = await page.title().catch(() => null);

  const bodyBefore = await page.locator("body").innerText().catch(() => "");
  const phonesBefore = extractPhones(bodyBefore);

const topSection = page.locator("main").first();

const contactRoot = topSection
  .locator(
    [
      '[data-cy*="ad-contact"]',
      '[data-testid*="contact"]',
      'aside',
      '[class*="contact"]',
      '[class*="phone"]',
    ].join(", ")
  )
  .first();

const contactHtmlBefore = await contactRoot.innerHTML().catch(() => null);

const clickSucceeded = await clickOtodomTopPhoneButton(page);

if (clickSucceeded) {
  await page.waitForTimeout(3000).catch(() => {});

  await page.screenshot({ path: "otodom-after-click.png", fullPage: true }).catch(() => {});

  await page.waitForTimeout(5000).catch(() => {});
}

  await page
    .waitForFunction(() => {
      const tel = document.querySelector('a[href^="tel:"]');
      if (tel) return true;

      const text = document.body?.innerText || "";
      return /(?:\+48\s*)?(?:\d[\s-]?){9,}/.test(text);
    }, { timeout: 10000 })
    .catch(() => {});

  const telLinks = await page
    .locator('a[href^="tel:"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        href: (el as HTMLAnchorElement).href,
        text: (el.textContent || "").trim(),
        ariaLabel: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
      }))
    )
    .catch(() => []);

  const bodyAfter = await page.locator("body").innerText().catch(() => "");
  const phonesAfter = extractPhones(bodyAfter);

 const contactTexts = await topSection
  .locator(
    '[data-cy*="ad-contact"], [data-testid*="contact"], aside, [class*="contact"], [class*="phone"]'
  )
  .allInnerTexts()
  .catch(() => []);

  const contactHtmlAfter = await contactRoot.innerHTML().catch(() => null);

  console.log(
    JSON.stringify(
      {
        pageTitle,
        clickedShowPhone: clickSucceeded,
        phonesBefore,
        phonesAfter,
        telLinks,
        contactTexts,
        contactHtmlBefore,
        contactHtmlAfter,
        responses,
      },
      null,
      2
    )
  );

  await page.screenshot({ path: "otodom-phone-debug.png", fullPage: true }).catch(() => {});
  console.log("Saved screenshot: otodom-phone-debug.png");

  await browser.close().catch(() => {});
})();