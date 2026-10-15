import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './strip.js';

function heavyPage(extra = ''): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Event</title>
  <style>body { margin: 0; padding: 0; } .x { color: red; } ${'/*css*/'.repeat(200)}</style>
  <script>window.x = function(){${'var y=1;'.repeat(200)}};</script></head><body>
  <nav><a href="/a">Home</a><a href="/b">About</a></nav>
  <header><h1>Banner</h1></header>
  <main><h2>Hackathon 2026</h2><p>Join the hackathon with cash prize.</p>
  <p>${'Lorem ipsum dolor sit amet. '.repeat(20)}</p>${extra}</main>
  <footer><p>© 2026</p></footer>
  <aside class="sidebar">related</aside>
  <script>${'console.log(1);'.repeat(200)}</script></body></html>`;
}

describe('byte-proof drill (ING-06)', () => {
  it('page 1 capped bytes <= 15% of raw HTML bytes', () => {
    const raw = heavyPage();
    const res = sanitizeHtml(raw);
    const rawBytes = Buffer.byteLength(raw, 'utf8');
    const capBytes = Buffer.byteLength(res.markdown, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`byte-proof: raw=${rawBytes} capped=${capBytes} ratio=${(capBytes / rawBytes).toFixed(4)}`);
    expect(capBytes).toBeLessThanOrEqual(0.15 * rawBytes);
  });

  it('page 2 js-gated aggregator card (media heavy)', () => {
    const raw = heavyPage('<div class="card">' + '<img src="x.png" alt="y">'.repeat(50) + '</div>');
    const res = sanitizeHtml(raw);
    const rawBytes = Buffer.byteLength(raw, 'utf8');
    const capBytes = Buffer.byteLength(res.markdown, 'utf8');
    console.log(`byte-proof: raw=${rawBytes} capped=${capBytes} ratio=${(capBytes / rawBytes).toFixed(4)}`);
    expect(capBytes).toBeLessThanOrEqual(0.15 * rawBytes);
  });

  it('page 3 minimal event page still under cap', () => {
    const raw = heavyPage();
    const res = sanitizeHtml(raw);
    expect(res.markdown.length).toBeLessThanOrEqual(8000);
  });
});
