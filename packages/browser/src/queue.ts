import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import pLimit from 'p-limit';
import { readFileSync } from 'node:fs';

const MAX_CONCURRENT = 2;
const limit = pLimit(MAX_CONCURRENT);
const RSS_THRESHOLD_MB = 512;

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

function browserRssMb(browser: Browser): number | null {
  try {
    const proc = typeof (browser as any).process === "function" ? (browser as any).process() : null;
    const pid = (proc as { pid?: number } | null)?.pid;
    if (!pid) return null;
    const statm = readFileSync(`/proc/${pid}/statm`, 'utf8');
    const residentPages = Number(statm.trim().split(/\s+/)[1]);
    if (!Number.isFinite(residentPages)) return null;
    return (residentPages * 4096) / (1024 * 1024);
  } catch {
    return null;
  }
}

export interface FetchViaBrowserOptions {
  browser?: Browser;
  getBrowser?: () => Promise<Browser>;
}

export async function fetchViaBrowser(
  url: string,
  options?: FetchViaBrowserOptions,
): Promise<string> {
  const resolveBrowser =
    options?.getBrowser ?? (options?.browser ? async () => options.browser as Browser : getBrowser);

  return limit(async () => {
    let ctx: BrowserContext | null = null;
    let browser: Browser;
    try {
      browser = await resolveBrowser();
      const rss = browserRssMb(browser);
      if (rss !== null && rss > RSS_THRESHOLD_MB) {
        console.warn(`[browser] RSS ${rss.toFixed(1)}MB exceeds ${RSS_THRESHOLD_MB}MB; recycling`);
        try {
          await browser.close();
        } catch {
          // ignore
        }
        browserPromise = null;
        browser = await getBrowser();
      }
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
        try {
          await ctx.close();
        } catch {
          // ignore close errors
        }
      }
    }
  });
}

export async function shutdown(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      // ignore
    }
    browserPromise = null;
  }
}

export { MAX_CONCURRENT };
