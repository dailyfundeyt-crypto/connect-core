# Edit companies in Settings

## Goal

Edit company name, description, and profile logo from Settings, reachable from the company switcher.

## Done

- Settings → Companies panel lists every company with Edit → name, description, logo (file → data URL).
- `updateCompany` persists seed + custom companies in `localStorage` (`connect.companies.custom`).
- Company switcher → **Manage companies** → `/settings#companies`.
- Edit form resets when switching companies (`key` + `useEffect`).
- Settings scrolls to `#companies` (and other hashes) on load / hashchange.
