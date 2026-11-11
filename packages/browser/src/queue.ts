import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import pLimit from 'p-limit';
import { readFileSync } from 'node:fs';
import { validateUrl } from '@zod/sanitize/fetch';

const MAX_CONCURRENT = 2;
const limit = pLimit(MAX_CONCURRENT);
const RSS_THRESHOLD_MB = 512;

/**
 * Non-headless UA: X/LinkedIn gate the default `HeadlessChrome` UA far more
 * aggressively than a normal desktop Chrome string.
 */
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

/** Exported session-cookie shape (matches the browser-export JSON format). */
export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
}

export interface FetchViaBrowserOptions {
  browser?: Browser;
  getBrowser?: () => Promise<Browser>;
  /** Session cookies attached to the context before navigation. */
  cookies?: BrowserCookie[];
  /** CSS selector to wait for after navigation (miss = proceed with current HTML). */
  waitForSelector?: string;
  /** Extra hydration time after navigation/selector (ms). Default 0. */
  settleMs?: number;
  /** Navigation timeout (ms). Default 30000. */
  timeoutMs?: number;
  /** Optional UA override (defaults to a desktop Chrome UA). */
  userAgent?: string;
  /**
   * When the final URL after redirects matches, stop immediately (skip the
   * selector wait) and flag `loginWall`. Used for expired-session redirects.
   */
  loginWallUrl?: RegExp;
}

/** Detailed result so callers can distinguish a login wall from a real render. */
export interface BrowserFetchResult {
  html: string;
  /** HTTP status of the main document navigation (0 when unavailable). */
  status: number;
  /** Final URL after redirects. */
  finalUrl: string;
  /** True when no selector was requested or the selector appeared. */
  selectorFound: boolean;
  /** True when `loginWallUrl` matched the final URL (session rejected). */
  loginWall: boolean;
}

export async function fetchViaBrowserResult(
  url: string,
  options?: FetchViaBrowserOptions,
): Promise<BrowserFetchResult> {
  // SSRF guard: refuse private/loopback/link-local hosts and non-default ports
  // before navigation, regardless of caller.
  try {
    validateUrl(url);
  } catch {
    throw new Error(
      'fetchViaBrowser: private/loopback host or non-default port refused (SSRF guard)',
    );
  }

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
      ctx = await browser.newContext({
        javaScriptEnabled: true,
        userAgent: options?.userAgent ?? DEFAULT_USER_AGENT,
        viewport: { width: 1280, height: 900 },
      });
      if (options?.cookies?.length) {
        await ctx.addCookies(
          options.cookies.map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path ?? '/',
            secure: true,
            httpOnly: true,
            sameSite: 'Lax' as const,
          })),
        );
      }
      await ctx.route(
        '**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,ttf,mp4,webm}',
        (route) => route.abort(),
      );
      const page: Page = await ctx.newPage();
      const timeoutMs = options?.timeoutMs ?? 30_000;
      const response = await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
      const finalUrl = page.url();
      // Expired sessions redirect to /login (or /authwall); waiting for feed
      // selectors there only burns 10s and yields no posts.
      const loginWall = options?.loginWallUrl ? options.loginWallUrl.test(finalUrl) : false;
      let selectorFound = !options?.waitForSelector;
      if (!loginWall && options?.waitForSelector) {
        selectorFound = await page
          .waitForSelector(options.waitForSelector, {
            timeout: Math.min(timeoutMs, 10_000),
          })
          .then(() => true)
          .catch(() => false);
      }
      if (!loginWall && options?.settleMs && options.settleMs > 0) {
        await page.waitForTimeout(options.settleMs);
      }
      return {
        html: await page.content(),
        status: response?.status() ?? 0,
        finalUrl,
        selectorFound,
        loginWall,
      };
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

/** Backwards-compatible HTML-only entrypoint used by the sanitize facade. */
export async function fetchViaBrowser(
  url: string,
  options?: FetchViaBrowserOptions,
): Promise<string> {
  return (await fetchViaBrowserResult(url, options)).html;
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
