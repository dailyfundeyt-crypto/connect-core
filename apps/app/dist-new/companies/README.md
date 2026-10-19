# Company graphics

Logos (`<id>.png`) and banners (`<id>-banner.png`) are generated from SVG
sources in `svg/` for sharp edges and luminous white banner fields (`#FFFFFF`).

Regenerate:

```bash
python3 scripts/generate-company-graphics.py
```

Ids must match `app/src/lib/companies/catalog.ts`.
