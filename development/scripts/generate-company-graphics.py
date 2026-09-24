#!/usr/bin/env python3
"""Rasterize company SVG logos/banners to sharp PNGs with luminous white banners."""
from __future__ import annotations

import io
import math
from pathlib import Path

import cairosvg
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app" / "public" / "companies"
SVG_OUT = OUT / "svg"

BRANDS = {
    "nordwind": {"bot": "#0f766e", "mid": "#0d9488", "top": "#042f2e", "mark": "wind"},
    "lumen": {"bot": "#8b5cf6", "mid": "#7c3aed", "top": "#1e1033", "mark": "spark"},
    "helm": {"bot": "#eab308", "mid": "#ca8a04", "top": "#1c1408", "mark": "helm"},
    "pulse": {"bot": "#0ea5e9", "mid": "#0369a1", "top": "#0b1a2e", "mark": "pulse"},
}


def logo_svg(b: dict) -> str:
    marks = {
        "wind": """
      <g transform="translate(512 512) rotate(-38)">
        <rect x="-220" y="-100" width="310" height="82" rx="41" fill="#FFFFFF"/>
        <rect x="-95" y="22" width="310" height="82" rx="41" fill="#FFFFFF"/>
      </g>""",
        "spark": """
      <g transform="translate(512 512)">
        <path d="M0 -230 L48 -48 L230 0 L48 48 L0 230 L-48 48 L-230 0 L-48 -48 Z" fill="#FFFFFF"/>
      </g>""",
        "helm": """
      <g transform="translate(512 512)">
        <path d="M0 -235 L190 -145 L175 75 L0 235 L-175 75 L-190 -145 Z" fill="#FFFFFF"/>
      </g>""",
        "pulse": """
      <g transform="translate(512 512)" fill="none" stroke="#FFFFFF" stroke-width="76" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="-270,12 -150,12 -90,-170 -15,200 75,-220 150,35 270,12"/>
      </g>""",
    }
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" shape-rendering="geometricPrecision">
  <defs>
    <radialGradient id="orb" cx="36%" cy="30%" r="70%">
      <stop offset="0%" stop-color="{b["bot"]}"/>
      <stop offset="50%" stop-color="{b["mid"]}"/>
      <stop offset="100%" stop-color="{b["top"]}"/>
    </radialGradient>
    <radialGradient id="spec" cx="30%" cy="26%" r="32%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.65"/>
      <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="#000000"/>
  <circle cx="512" cy="512" r="434" fill="url(#orb)"/>
  <circle cx="512" cy="512" r="434" fill="url(#spec)"/>
  <circle cx="512" cy="512" r="434" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="4"/>
  {marks[b["mark"]]}
</svg>
"""


def banner_svg() -> str:
    cx, cy = 900, 300
    arcs = []
    for i in range(18):
        r = 268 - i * 11
        if r < 88:
            break
        start = (i * 20) % 360
        sweep = 58
        a0, a1 = math.radians(start), math.radians(start + sweep)
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        sw = 12 if i % 2 == 0 else 8
        arcs.append(
            f'<path d="M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}" '
            f'fill="none" stroke="#050505" stroke-width="{sw}" stroke-linecap="round"/>'
        )
    arcs_xml = "\n".join(arcs)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="600" viewBox="0 0 1800 600" shape-rendering="geometricPrecision">
  <rect width="1800" height="600" fill="#FFFFFF"/>
  <g>{arcs_xml}</g>
  <circle cx="900" cy="300" r="84" fill="#FFFFFF"/>
</svg>
"""


def rasterize(svg: str, path: Path, *, force_white_field: bool = False) -> None:
    png = cairosvg.svg2png(bytestring=svg.encode(), scale=2)
    im = Image.open(io.BytesIO(png)).convert("RGB")
    im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=90, threshold=1))
    if force_white_field:
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b = px[x, y]
                if r + g + b > 700:
                    px[x, y] = (255, 255, 255)
    im.save(path, optimize=True)


def main() -> None:
    SVG_OUT.mkdir(parents=True, exist_ok=True)
    shared_banner = banner_svg()
    (SVG_OUT / "_banner-shared.svg").write_text(shared_banner)
    for bid, brand in BRANDS.items():
        lsvg = logo_svg(brand)
        (SVG_OUT / f"{bid}.svg").write_text(lsvg)
        rasterize(lsvg, OUT / f"{bid}.png")
        rasterize(shared_banner, OUT / f"{bid}-banner.png", force_white_field=True)
        print("wrote", bid)
    Image.open(OUT / "nordwind.png").save(OUT / "_logo-template.png", optimize=True)
    Image.open(OUT / "nordwind-banner.png").save(OUT / "_banner-template.png", optimize=True)


if __name__ == "__main__":
    main()
