import { chromium, type Page } from "playwright-core";
import chromiumBinary from "@sparticuz/chromium";

function normalizePhone(text: string): string {
  return text.replace(/[^\d+]/g, "");
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+48\s*)?(?:\d[\s-]?){9,}/g) ?? [];
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
      "aside",
      '[class*="contact"]',
      '[class*="phone"]',
    ].join(", ")
  ).first();

  const panelVisible = await contactPanel.isVisible().catch(() => false);
  if (!panelVisible) return false;

  await contactPanel.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await dismissOverlays(page);

  const exact = contactPanel
    .locator('[data-cy="phone-number.show-full-number-button"]')
    .first();

  const exactVisible = await exact.isVisible().catch(() => false);
  if (!exactVisible) return false;

  try {
    await exact.click({ timeout: 5000 });
    return true;
  } catch {}

  try {
    const clicked = await exact.evaluate((el) => {
      const btn = el as HTMLButtonElement;
      btn.click();
      return true;
    });
    if (clicked) return true;
  } catch {}

  const box = await exact.boundingBox().catch(() => null);
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

export async function revealOtodomPhone(url: string): Promise<string | null> {
  const executablePath = await chromiumBinary.executablePath();

  const browser = await chromium.launch({
    args: chromiumBinary.args,
    executablePath,
    headless: true,
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      locale: "pl-PL",
      viewport: { width: 1440, height: 1200 },
    });

    const page = await context.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await dismissOverlays(page);

    const clicked = await clickOtodomTopPhoneButton(page);

    if (clicked) {
      await page.waitForTimeout(3000).catch(() => {});
    }

    await page.waitForFunction(() => {
      const tel = document.querySelector('a[href^="tel:"]');
      if (tel) return true;

      const text = document.body?.innerText || "";
      return /(?:\+48\s*)?(?:\d[\s-]?){9,}/.test(text);
    }, { timeout: 10000 }).catch(() => {});

    const telText = await page
      .locator('a[href^="tel:"]')
      .first()
      .textContent()
      .catch(() => null);

    if (telText && telText.trim()) {
      return telText.trim();
    }

    const bodyAfter = await page.locator("body").innerText().catch(() => "");
    const phonesAfter = extractPhones(bodyAfter);

    return phonesAfter[0] ?? null;
  } finally {
    await browser.close().catch(() => {});
  }
}