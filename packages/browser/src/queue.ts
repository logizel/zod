import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import pLimit from 'p-limit';

const limit = pLimit(2);

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--blink-settings=imagesEnabled=false', '--mute-audio', '--disable-dev-shm-usage'],
    });
  }
  return browserPromise;
}

export async function fetchViaBrowser(url: string): Promise<string> {
  return limit(async () => {
    let ctx: BrowserContext | null = null;
    try {
      const browser = await getBrowser();
      ctx = await browser.newContext({ javaScriptEnabled: true });
      await ctx.route(
        '**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,webm}',
        (route) => route.abort(),
      );
      const page: Page = await ctx.newPage();
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
      return await page.content();
    } finally {
      if (ctx) {
        await ctx.close();
      }
    }
  });
}

export async function shutdown(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
