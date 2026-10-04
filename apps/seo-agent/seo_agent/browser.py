"""Browser control through Playwright, driving a separate, headless Helium profile.

Never Stefan's own Helium profile and never the Helium bundled with the Connect app: the profile
lives in %LOCALAPPDATA%\\ConnectSEO\\helium-profile and the browser runs headless, so no window
appears. Page content is data for the analysis, never instructions.
"""
from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from pathlib import Path

from . import config
from .netguard import BlockedURL, check_url, is_allowed_request

FACTS_JS = r"""
() => {
  const q = (s) => document.querySelector(s);
  const all = (s) => Array.from(document.querySelectorAll(s));
  const meta = (n) => (q(`meta[name="${n}"]`) || q(`meta[property="${n}"]`) || {}).content || null;
  const host = location.host;
  const links = all('a[href]').map(a => a.href).filter(h => h.startsWith('http'));
  const ld = all('script[type="application/ld+json"]').flatMap(s => {
    try { const j = JSON.parse(s.textContent); const arr = Array.isArray(j) ? j : (j['@graph'] || [j]);
          return arr.map(x => x && x['@type']).filter(Boolean).flat(); } catch (e) { return ['(ungültiges JSON-LD)']; }
  });
  const text = (document.body && document.body.innerText) || '';
  return {
    url: location.href, title: document.title || null, lang: document.documentElement.lang || null,
    meta_description: meta('description'), robots: meta('robots'),
    canonical: (q('link[rel="canonical"]') || {}).href || null,
    og_title: meta('og:title'), og_image: meta('og:image'), viewport: meta('viewport'),
    h1: all('h1').map(h => h.innerText.trim()).filter(Boolean).slice(0, 5),
    h2: all('h2').map(h => h.innerText.trim()).filter(Boolean).slice(0, 12),
    words: (text.match(/\S+/g) || []).length,
    links_internal: links.filter(h => { try { return new URL(h).host === host } catch (e) { return false } }).length,
    links_external: links.filter(h => { try { return new URL(h).host !== host } catch (e) { return false } }).length,
    images: all('img').length, images_without_alt: all('img').filter(i => !i.getAttribute('alt')).length,
    structured_data: Array.from(new Set(ld)).slice(0, 15),
    hreflang: all('link[rel="alternate"][hreflang]').map(l => l.hreflang).slice(0, 10),
  };
}
"""


class BrowserSession:
    def __init__(self, thread_id: str, page):
        self.thread_id = thread_id
        self.page = page
        self.visits: list[dict] = []
        self.shots: list[Path] = []
        self.status: int | None = None


class Browser:
    """One headless Helium for the whole service; one tab per Connect conversation."""

    def __init__(self):
        self._pw = None
        self._ctx = None
        self._lock = asyncio.Lock()
        self.sessions: "OrderedDict[str, BrowserSession]" = OrderedDict()
        self._last_used = time.monotonic()
        self._watchdog = None

    async def _idle_watch(self):
        """Close the headless browser after IDLE_SECONDS without use (frees RAM, no stray processes)."""
        while self._ctx is not None:
            await asyncio.sleep(30)
            if time.monotonic() - self._last_used > config.BROWSER_IDLE_SECONDS:
                async with self._lock:
                    if time.monotonic() - self._last_used > config.BROWSER_IDLE_SECONDS:
                        await self._shutdown()
                return

    async def _context(self):
        if self._ctx is None:
            from playwright.async_api import async_playwright

            config.PROFILE_DIR.mkdir(parents=True, exist_ok=True)
            self._pw = await async_playwright().start()
            self._ctx = await self._pw.chromium.launch_persistent_context(
                str(config.PROFILE_DIR),
                executable_path=config.HELIUM,
                headless=True,
                accept_downloads=False,
                locale="de-DE",
                viewport={"width": 1366, "height": 900},
                args=["--no-first-run", "--no-default-browser-check", "--disable-extensions"],
            )

            async def guard(route):
                if is_allowed_request(route.request.url):
                    await route.continue_()
                else:
                    await route.abort("blockedbyclient")

            await self._ctx.route("**/*", guard)
            self._watchdog = asyncio.get_running_loop().create_task(self._idle_watch())
            # The persistent context opens one blank tab; it is not used.
        return self._ctx

    async def session(self, thread_id: str) -> BrowserSession:
        async with self._lock:
            self._last_used = time.monotonic()
            s = self.sessions.get(thread_id)
            if s and not s.page.is_closed():
                self.sessions.move_to_end(thread_id)
                return s
            ctx = await self._context()
            page = await ctx.new_page()
            s = BrowserSession(thread_id, page)
            self.sessions[thread_id] = s
            while len(self.sessions) > 4:
                _, old = self.sessions.popitem(last=False)
                try:
                    await old.page.close()
                except Exception:  # noqa: BLE001
                    pass
            return s

    async def _settle(self, page):
        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:  # noqa: BLE001  busy pages never go idle; what loaded is the evidence
            pass

    async def _shot(self, s: BrowserSession, full_page: bool = False) -> Path:
        folder = config.SHOTS_DIR / _safe(s.thread_id)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{time.strftime('%Y%m%d-%H%M%S')}-{len(s.shots) + 1:02d}.png"
        await s.page.screenshot(path=str(path), full_page=full_page, timeout=30000)
        s.shots.append(path)
        return path

    async def facts(self, s: BrowserSession) -> dict:
        f = await s.page.evaluate(FACTS_JS)
        f["http_status"] = s.status
        return f

    async def open(self, thread_id: str, url: str) -> dict:
        url = check_url(url)
        s = await self.session(thread_id)
        resp = await s.page.goto(url, wait_until="domcontentloaded", timeout=45000)
        s.status = resp.status if resp else None
        await self._settle(s.page)
        f = await self.facts(s)
        shot = await self._shot(s)
        f["screenshot"] = str(shot)
        s.visits.append({k: f.get(k) for k in ("url", "http_status", "title", "meta_description", "h1", "words", "structured_data")} | {"screenshot": str(shot)})
        return f

    async def click(self, thread_id: str, target: str) -> dict:
        s = await self.session(thread_id)
        page = s.page
        if page.url in ("about:blank", ""):
            raise ValueError("Es ist noch keine Seite offen. Öffne zuerst eine URL.")
        candidates = [page.get_by_role("link", name=target), page.get_by_role("button", name=target), page.get_by_text(target)]
        if any(ch in target for ch in "#.[>="):
            candidates.insert(0, page.locator(target))
        el = None
        for c in candidates:
            try:
                if await c.count() > 0:
                    el = c.first
                    break
            except Exception:  # noqa: BLE001  an invalid selector is just not a match
                continue
        if el is None:
            raise ValueError(f"Kein klickbares Element für '{target}' gefunden.")
        risky = await el.evaluate("e => !!(e.closest('form') && (e.type === 'submit' || e.tagName === 'INPUT'))")
        if risky:
            raise ValueError("Das ist ein Formular-Absendeknopf. Formulare schicke ich nicht ab.")
        href = await el.evaluate("e => (e.closest('a') || {}).href || null")
        if href:
            check_url(href)
        await el.click(timeout=10000)
        await self._settle(page)
        f = await self.facts(s)
        shot = await self._shot(s)
        f["screenshot"] = str(shot)
        s.visits.append({k: f.get(k) for k in ("url", "title", "h1", "words")} | {"screenshot": str(shot), "via_click": target})
        return f

    async def screenshot(self, thread_id: str, full_page: bool = False) -> dict:
        s = await self.session(thread_id)
        shot = await self._shot(s, full_page=full_page)
        return {"url": s.page.url, "screenshot": str(shot)}

    async def extract(self, thread_id: str, kind: str = "text", max_chars: int = 4000) -> dict:
        s = await self.session(thread_id)
        page = s.page
        max_chars = max(500, min(int(max_chars or 4000), 12000))
        if kind == "links":
            links = await page.evaluate("() => Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map(a => [a.innerText.trim().slice(0, 80), a.href])")
            return {"url": page.url, "links": links}
        if kind == "headings":
            hs = await page.evaluate("() => Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 60).map(h => h.tagName + ': ' + h.innerText.trim().slice(0, 120))")
            return {"url": page.url, "headings": hs}
        if kind == "meta":
            return await self.facts(s)
        if kind == "dom":
            try:
                snap = await page.locator("body").aria_snapshot(timeout=15000)
            except Exception:  # noqa: BLE001
                snap = await page.evaluate("() => document.body ? document.body.outerHTML : ''")
            return {"url": page.url, "dom_snapshot": snap[:max_chars], "truncated": len(snap) > max_chars}
        text = await page.evaluate("() => document.body ? document.body.innerText : ''")
        return {"url": page.url, "text": text[:max_chars], "truncated": len(text) > max_chars}

    async def _shutdown(self):
        ctx, pw = self._ctx, self._pw
        self._ctx = self._pw = None
        self.sessions.clear()
        try:
            if ctx:
                await ctx.close()
        except Exception:  # noqa: BLE001
            pass
        finally:
            if pw:
                try:
                    await pw.stop()
                except Exception:  # noqa: BLE001
                    pass

    async def close(self):
        if self._watchdog:
            self._watchdog.cancel()
        await self._shutdown()


def _safe(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value)[:80] or "default"


__all__ = ["Browser", "BlockedURL"]
