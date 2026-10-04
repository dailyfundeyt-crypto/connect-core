"""Run jev-seo (MIT, Agrici Daniel) with the local Laya judge and build the German report.md."""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from . import config
from .netguard import check_url

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)

PRIO = {"P1": "Hoch", "P2": "Mittel", "P3": "Niedrig"}
EFFORT = {0: "Minuten", 1: "Stunden", 2: "ca. 1 Tag", 3: "mehrere Tage", 4: "Wochen"}
CATEGORY_DE = {
    "crawl": "Crawling & Indexierung", "onpage": "On-Page", "content": "Inhaltsqualität", "links": "Links & Struktur",
    "structured": "Strukturierte Daten", "ai": "KI-Suche", "performance": "Performance", "security": "Sicherheit",
    "visibility": "Sichtbarkeit",
}


def report_dir_for(url: str) -> Path:
    host = (urlparse(url).hostname or "site").lower()
    host = re.sub(r"[^a-z0-9.-]", "-", host.removeprefix("www."))
    base = config.REPORT_ROOT / f"{host}-{datetime.now():%Y-%m-%d}"
    out, n = base, 2
    while out.exists():
        out = base.with_name(f"{base.name}-{n}")
        n += 1
    return out


def report_url(path: Path) -> str:
    rel = path.relative_to(config.REPORT_ROOT).as_posix()
    return f"{config.PUBLIC_BASE}/reports/{rel}"


STEP_DE = {"Crawl": "Crawl", "Rule checks": "Regelprüfung (52 Regeln)", "DataForSEO": "DataForSEO (übersprungen)",
           "Jev judgments": "Seitenbewertung mit Laya", "PageSpeed": "PageSpeed (übersprungen)", "Scoring": "Bewertung",
           "Render": "Bericht"}


async def run_jevseo(url: str, max_pages: int, progress) -> tuple[Path, list[str]]:
    url = check_url(url)
    out = report_dir_for(url)
    out.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.update({
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
        "JEVSEO_JEV_URL": config.LAYA_URL,
        "JEVSEO_JEV_KEY": config.secret("LAYA_API_KEY") or "local",
        "JEVSEO_USD_PER_MTOK": "0",
        "JEVSEO_JUDGE_NAME": "Laya (lokal)",
        "JEVSEO_CHROMIUM_PATH": config.HELIUM,
        "JEVSEO_JEV_WORKERS": str(config.JEV_WORKERS),
        "JEVSEO_JEV_TIMEOUT": str(config.JEV_TIMEOUT),
    })
    pages = max(3, min(int(max_pages or config.DEFAULT_MAX_PAGES), 100))
    cmd = [sys.executable, "-m", "jevseo", "run", url, "--out", str(out), "--no-psi", "--formats", "md,xlsx",
           "--max-pages", str(pages), "--jev-pages", str(min(pages, config.JEV_PAGES)), "--time-budget", "420"]
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=str(config.JEVSEO_DIR), env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        creationflags=CREATE_NO_WINDOW,
    )
    log: list[str] = []
    assert proc.stdout

    async def pump():
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            text = line.decode("utf-8", "replace").rstrip()
            log.append(text)
            m = re.search(r"== (\d)/7 (.+)", text)
            if m:
                await progress(f"Audit Schritt {m.group(1)}/7: {STEP_DE.get(m.group(2).split(':')[0].strip(), m.group(2).split(':')[0])}")
            m = re.search(r"Jev: (\d+)/(\d+) pages judged", text)
            if m:
                await progress(f"Laya bewertet Seiten: {m.group(1)}/{m.group(2)}")

    try:
        await asyncio.wait_for(pump(), timeout=config.AUDIT_TIMEOUT)
        code = await asyncio.wait_for(proc.wait(), timeout=60)
    except (asyncio.TimeoutError, asyncio.CancelledError) as err:
        # A hung audit or a closed chat must not leave jev-seo running in the background.
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        if isinstance(err, asyncio.CancelledError):
            raise
        log.append(f"[seo-agent] Abbruch nach {config.AUDIT_TIMEOUT} s")
        code = -1
    (out / "jevseo.log").parent.mkdir(parents=True, exist_ok=True)
    (out / "jevseo.log").write_text("\n".join(log), encoding="utf-8")
    if code != 0 or not (out / "audit.json").is_file():
        tail = "\n".join(log[-6:])
        raise RuntimeError(f"jev-seo ist mit Code {code} beendet:\n{tail}")
    return out, log


def _cell(value) -> str:
    return str(value if value is not None else "").replace("|", "\\|").replace("\n", " ").replace("<", "&lt;").replace(">", "&gt;").strip()


def _short(text: str, n: int) -> str:
    text = _cell(text)
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def summarize(out: Path) -> dict:
    d = json.loads((out / "audit.json").read_text(encoding="utf-8"))
    s = d["scores"]
    site_host = urlparse(d["site"]["final_url"]).netloc
    rel = lambda u: (urlparse(u).path or "/") if urlparse(u).netloc == site_host else u  # noqa: E731
    actions = [
        {
            "id": a["action_id"], "prio": a["priority"], "impact": a["impact"], "effort": a["effort"],
            "area": CATEGORY_DE.get(a["category"], a["category"]), "title": a["title"], "fix": a["fix"],
            "count": a["count"], "urls": [rel(u) for u in a["urls"][:5]], "evidence": a["evidence"],
            "review": bool(a.get("needs_review")), "heuristic": a.get("heuristic"),
        }
        for a in d["actions"]
    ]
    pages = [p for p in d["pages"] if p.get("kind") == "page" and p.get("status") == 200]
    ledger = (d.get("jev") or {}).get("ledger") or {}
    return {
        "domain": d["site"]["domain"], "final_url": d["site"]["final_url"], "overall": s["overall"], "grade": s["grade"],
        "partial": s.get("partial") or [], "categories": {CATEGORY_DE.get(c, s["category_names"][c]): v for c, v in s["categories"].items()},
        "pages_crawled": len(d["pages"]), "html_pages": len(pages), "actions": actions,
        "judge": {"requests": ledger.get("requests"), "failed": ledger.get("failed"), "endpoint": ledger.get("endpoint")},
    }


def write_report(out: Path, summary: dict, visits: list[dict], shots: list[Path], agent_summary: str | None = None) -> Path:
    """report.md = German summary and action table, browser check, then jev-seo's full report."""
    original = out / "report.md"
    full = out / "report-jevseo.md"
    if original.is_file() and not full.is_file():
        original.replace(full)
    shot_dir = out / "screenshots"
    shot_rel: dict[str, str] = {}
    for p in shots:
        if p.is_file():
            shot_dir.mkdir(exist_ok=True)
            target = shot_dir / p.name
            shutil.copy2(p, target)
            shot_rel[str(p)] = f"screenshots/{p.name}"

    lines = [f"# SEO-Bericht: {summary['domain']}", ""]
    lines.append(f"Erstellt am {datetime.now():%d.%m.%Y %H:%M} vom **SEO-Agent** in Connect. Läuft komplett lokal: "
                 f"Crawl und Regeln mit jev-seo, Seiten-Bewertung mit Laya, Text mit {config.MODEL} (Ollama), Browser Helium über Playwright.")
    lines.append("")
    lines.append(f"**Gesamtwert: {summary['overall']}/100 (Note {summary['grade']})** · {summary['pages_crawled']} URLs geprüft, {summary['html_pages']} HTML-Seiten")
    if summary["partial"]:
        lines.append("")
        lines.append("> Teil-Audit: " + "; ".join("PageSpeed/Core Web Vitals sind aus (Google-Clouddienst), die Ladezeit stammt nur aus Crawl-Messungen" if "PageSpeed" in str(x) else str(x) for x in summary["partial"]))
    lines.append("")
    lines.append("## Zusammenfassung des Agenten")
    lines.append("")
    lines.append(agent_summary.strip() if agent_summary else "_Wird nach der Analyse ergänzt._")
    lines.append("")
    lines.append("## Maßnahmen")
    lines.append("")
    lines.append("| # | ID | Priorität | Bereich | Problem | Betroffene Seiten | Lösung | Aufwand | Wirkung |")
    lines.append("|---:|---|---|---|---|---|---|---|---:|")
    for i, a in enumerate(summary["actions"], 1):
        pages = ", ".join(a["urls"]) + (f" (+{a['count'] - len(a['urls'])})" if a["count"] > len(a["urls"]) else "")
        flag = " (prüfen)" if a["review"] else ""
        lines.append(f"| {i} | {a['id']} | {PRIO.get(a['prio'], a['prio'])} | {_cell(a['area'])} | {_short(a['title'], 90)}{flag} | {_short(pages, 80)} | {_short(a['fix'], 140)} | {EFFORT.get(a['effort'], a['effort'])} | {a['impact']} |")
    if not summary["actions"]:
        lines.append("| – | – | – | – | Keine Maßnahmen gefunden | – | – | – | – |")
    lines.append("")
    lines.append("„(prüfen)“ heißt: Laya war sich nicht sicher genug; als Hinweis lesen, nicht als Urteil.")
    lines.append("")
    lines.append("## Bewertung nach Bereich")
    lines.append("")
    lines.append("| Bereich | Wert |")
    lines.append("|---|---:|")
    for name, value in summary["categories"].items():
        lines.append(f"| {_cell(name)} | {value if value is not None else 'n/a'} |")
    lines.append("")
    if visits:
        lines.append("## Browser-Prüfung (Helium)")
        lines.append("")
        lines.append("| Seite | Status | Titel | H1 | Wörter | Strukturierte Daten |")
        lines.append("|---|---:|---|---|---:|---|")
        for v in visits:
            lines.append(f"| {_short(v.get('url'), 70)} | {v.get('http_status') or ''} | {_short(v.get('title') or '', 60)} | {_short('; '.join(v.get('h1') or []), 60)} | {v.get('words') or ''} | {_short(', '.join(map(str, v.get('structured_data') or [])), 50)} |")
        lines.append("")
        for v in visits:
            rel_path = shot_rel.get(v.get("screenshot") or "")
            if rel_path:
                lines.append(f"**{_cell(v.get('title') or v.get('url'))}**  ")
                lines.append(f"![Screenshot]({rel_path})")
                lines.append("")
    lines.append("## Dateien")
    lines.append("")
    lines.append("- Ausführlicher jev-seo-Bericht (Englisch): [report-jevseo.md](report-jevseo.md)")
    if (out / "report.xlsx").is_file():
        lines.append("- Maßnahmen-Tracker für Excel: [report.xlsx](report.xlsx)")
    lines.append("- Rohdaten: [audit.json](audit.json), [digest.md](digest.md)")
    lines.append("")
    lines.append("## Quellen und Lizenzen")
    lines.append("")
    lines.append("- jev-seo von Agrici Daniel, MIT-Lizenz, https://github.com/AgriciDaniel/jev-seo (für den lokalen Laya-Richter angepasst)")
    lines.append("- Laya von Convai Innovations / NandhaKishorM, Apache-2.0, https://github.com/NandhaKishorM/laya")
    lines.append(f"- Ollama (MIT) mit dem Modell {config.MODEL}; Playwright (Apache-2.0); Helium-Browser")
    lines.append("- Werte ordnen die Arbeit nach Wichtigkeit. Sie sagen keine Rankings oder Besucherzahlen voraus.")
    path = out / "report.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path
