# Navigation stability — company switch + settings

## Problem
CatchBoundary showed "Something went wrong!" when switching companies or opening Settings from the sidebar user menu. Link-as-`DropdownMenuItem` remounted the Base UI menu portal while the `_app` shell unmounted (settings lives outside `_app`), and a plain header `div` sat inside `Menu.Group`.

## Fix
- User menu: navigate via `onClick` + `navigate()`, not `render={<Link />}`.
- User header block moved outside `DropdownMenuGroup`.
- Company switcher: controlled open state; close menu, then navigate on the next tick.
- Settings sidebar: Connected accounts + Components gallery links.
- Admin: Identity providers reachable from overview + sidebar.
- Soften company search validation (`.catch` on optional fields).
- Router `defaultErrorComponent` shows message + Try again.

## Verify
- Switch Nordwind → Lumen via company switcher.
- Open Settings / Usage / Timer from user menu.
- Visit settings connected-accounts, components-gallery, admin identity-providers.
