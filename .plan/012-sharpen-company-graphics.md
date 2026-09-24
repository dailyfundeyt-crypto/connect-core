# 012 — Company-Grafiken schärfen + leuchtendes Weiß

**Datum:** 2026-09-21

## Problem

Logos/Banner waren weiche KI-Duplikate; Banner-Weiß ~RGB(250); Profil-Hintergrund creme `#f7f5f0`.

## Fix

- Logos/Banner neu als SVG → PNG (2×, Unsharp), markante Marken je Firma
- Banner-Feld reines `#FFFFFF`
- Profil-UI: creme/blur → solid `#ffffff`
- Cache-Bust `?v=5` an Asset-URLs
- Regenerieren: `python3 scripts/generate-company-graphics.py`
