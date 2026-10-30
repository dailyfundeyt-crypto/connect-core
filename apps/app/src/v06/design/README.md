# Connect Premium Design System (v06 / A26)

> **Modul:** `apps/app/src/v06/design`  
> **Status:** Fertiggestellt in Wave 3 (Agent A26), bereit für Rollout in Wave 4 (A34–A38)  
> **Feature-Flag:** `FLAGS_V06.designV2` (Default: `false`)  
> **Design-Stil:** Grok Bot / Linear / Apple-inspiriert (Obsidian-Dark, 4/8-px Raster, Hairline-Borders, 180ms Mikrobewegungen)

---

## 1. First Principles für „Teures“ Design

Warum wirkte die vorherige Version unfertig („billig“), und wie behebt dieses System das?

1. **Konsistentes 4/8-px Raster:**  
   Keine ungeraden Pixel-Abstände (`13px`, `19px`). Alle Paddings, Margins und Gaps sind Vielfache von `4px` bzw. `8px` (`space-1` = 4px, `space-2` = 8px, `space-3` = 12px, `space-4` = 16px).
2. **Layered Surfaces statt harter Schatten:**  
   Tiefe entsteht durch Helligkeits-Schichten (`bg` #09090b → `surface-1` #121216 → `surface-2` #18181e → `surface-3` #22222a), nicht durch schmutzige schwarze `box-shadow`-Blöcke.
3. **1px Hairline Borders:**  
   Transparente, präzise Rahmen (`rgba(255, 255, 255, 0.08)` auf Dark, `rgba(0, 0, 0, 0.08)` auf Light) sorgen für messerscharfe Kanten und Trennung von Inhalten.
4. **Einheitliche Radien:**  
   - Inputs, Buttons, Chips, ListRows: `10px` (`--p-radius-md`)
   - Cards, Modals, Dialogs: `14px` (`--p-radius-lg`)
   - Keine Mischung aus eckigen und runden Buttons im selben Screen.
5. **Sanfte Mikro-Interaktionen (150–200 ms):**  
   Kurze, federfreie Reaktionszeiten mit der Kurve `cubic-bezier(0.16, 1, 0.3, 1)`. Reduzierte Bewegung (`prefers-reduced-motion`) wird auf Betriebssystemebene respektiert.
6. **Echte Dark-Mode-Palette:**  
   Tiefes Obsidian/Zinc statt ausgewaschenem Mausgrau oder reiner Übersättigung.

---

## 2. Gelöste Entscheidung: daisyUI vs. Origin Kit vs. Casberry Particles

### Entscheidung und finale Umsetzung (nach Freigabe durch Stefan):
**Nativ und ohne externe NPM-Abhängigkeiten gelöst (die sauberste und logischste Architektur):**

1. **Kein daisyUI-Paket:**  
   daisyUI wurde **nicht** als Abhängigkeit installiert. Die CSS-Tokens in `tokens.css` und die Komponenten in `@/v06/design` stellen alle Stile, Zustände und Themes nativ auf Tailwind-v4-Basis bereit — ohne CSS-Kollisionen, ohne Theme-Inkompatibilitäten und ohne ~200 KB Bundle-Ballast.
2. **Origin Kit Referenz:**  
   Die besten Mikro-Interaktions-Konzepte (weiche 180ms Übergänge, Cubic-Bezier-Easing `[0.16, 1, 0.3, 1]`, Tastaturfokus-Ringe) wurden direkt in `motion.ts`, `Button`, `Toggle` und `SegmentedControl` implementiert.
3. **Casberry Particles nativ integriert:**  
   Statt einer schweren WebGL-Bibliothek wurde die Komponente `<ParticlesBackground />` als reines HTML5-Canvas Element implementiert:
   - 0 KB externe Abhängigkeiten, kein Lizenzrisiko.
   - GPU/CPU-schonend (pausiert bei Nicht-Sichtbarkeit und respektiert `prefers-reduced-motion`).
   - Reagiert sanft auf Mausbewegungen und passt sich dynamisch an Dark-/Light-Palette an.

---

### `ParticlesBackground`
```tsx
import { ParticlesBackground } from "@/v06/design";

// Ambienter Hintergrund für Landing Page, Auth oder Card-Header:
<div className="relative overflow-hidden rounded-xl bg-[var(--p-surface-2)]">
  <ParticlesBackground density={30} speed={0.3} interactive />
  <div className="relative z-10 p-6">Inhalt</div>
</div>
```

---

## 3. Übersicht der Design-Tokens

### Farbhierarchie (CSS Variablen)
```css
/* Dark Mode */
--p-bg: #09090b;              /* Haupt-Hintergrund */
--p-surface-1: #121216;       /* Seitenleiste, subtile Container */
--p-surface-2: #18181e;       /* Cards, Dialoge, Modals */
--p-surface-3: #22222a;       /* Dropdowns, Toasts, Tooltips */
--p-border: rgba(255, 255, 255, 0.08);
--p-border-strong: rgba(255, 255, 255, 0.16);
--p-text-1: #ededef;          /* Primär-Text */
--p-text-2: #a1a1aa;          /* Sekundär-Text / Beschriftungen */
--p-text-3: #71717a;          /* Tertiär-Text / Metadaten */
--p-accent: #38bdf8;          /* Grok Electric Cyan */
```

### Abstände (4/8-px Raster)
- `space-1`: `4px`
- `space-2`: `8px`
- `space-3`: `12px`
- `space-4`: `16px`
- `space-5`: `20px`
- `space-6`: `24px`
- `space-8`: `32px`

---

## 4. Komponenten-API für Konsumenten (Wave 4: A34–A38)

Alle Komponenten sind über `@/v06/design` exportiert.

### `Button`
```tsx
import { Button } from "@/v06/design";

<Button variant="primary" size="md" leftIcon={<Sparkles className="w-4 h-4" />}>
  Speichern
</Button>
<Button variant="secondary" size="md">Abbrechen</Button>
<Button variant="danger" size="md">Löschen</Button>
<Button variant="ghost" size="sm">Details</Button>
<Button variant="accentSubtle" size="md">Verbinden</Button>
```
*Props:* `variant` (`primary` | `secondary` | `ghost` | `tertiary` | `danger` | `accentSubtle`), `size` (`sm` | `md` | `lg`), `loading`, `leftIcon`, `rightIcon`, `fullWidth`.

### `IconButton`
```tsx
import { IconButton } from "@/v06/design";

<IconButton
  variant="ghost"
  size="sm"
  aria-label="Agent bearbeiten"
  icon={<Edit className="w-4 h-4" />}
  onClick={handleEdit}
/>
```
*Wichtig:* `aria-label` ist typisiert und verpflichtend für Screenreader.

### `Card`
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/v06/design";

<Card elevation="raised" interactive onClick={handleClick}>
  <CardHeader>
    <CardTitle>Agent Status</CardTitle>
    <CardDescription>Aktive Hintergrund-Instanz</CardDescription>
  </CardHeader>
  <CardContent>
    Content Bereich mit 4/8-Raster.
  </CardContent>
  <CardFooter>
    <Button size="sm">Aktion</Button>
  </CardFooter>
</Card>
```

### `ListRow`
```tsx
import { ListRow } from "@/v06/design";

<ListRow
  title="Grok Bot 2"
  subtitle="Autonomer Reasoning Agent"
  status="online"
  badge="v2"
  clickable
  selected={isSelected}
  onClick={onSelect}
  leftAccessory={<BotIcon />}
  rightAccessory={<ChevronRight />}
/>
```

### `Toggle`
```tsx
import { Toggle } from "@/v06/design";

<Toggle
  checked={isEnabled}
  onCheckedChange={setIsEnabled}
  label="Dark Mode Default"
  description="Folgt dem Betriebssystem ohne hellen Blitz"
/>
```

### `SegmentedControl`
```tsx
import { SegmentedControl } from "@/v06/design";

<SegmentedControl
  value={tab}
  onChange={setTab}
  items={[
    { value: "all", label: "Alle", badge: 12 },
    { value: "active", label: "Aktiv", badge: 3 },
  ]}
/>
```

### `Dialog`
```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, Button } from "@/v06/design";

<Dialog>
  <DialogTrigger asChild>
    <Button>Öffnen</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Titel</DialogTitle>
    </DialogHeader>
    <div>Inhalt</div>
    <DialogFooter>
      <DialogClose asChild><Button variant="ghost">Schließen</Button></DialogClose>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### `Toast`
```tsx
import { useToast } from "@/v06/design";

const { toast } = useToast();
toast.success("Gespeichert", "Änderungen wurden übernommen.");
toast.error("Fehler", "Netzwerkverbindung fehlgeschlagen.");
```

---

## 5. Do's and Don'ts für Wave 4

- ✅ **DO:** Ausschließlich `var(--p-*)` Tokens oder die neuen Komponenten verwenden.
- ✅ **DO:** Icons einheitlich auf `14px` (`xs`), `16px` (`sm`) oder `18px` (`md`) skalieren.
- ✅ **DO:** Alle Klick-Elemente mit Tastatur bedienbar halten (Fokus-Ring sichtbar).
- ❌ **DON'T:** Niemals harte Schatten wie `shadow-2xl` oder schwarze Boxen mit 100% Deckkraft verwenden.
- ❌ **DON'T:** Keine willkürlichen Radien (`rounded-[7px]`) – immer `rounded-[var(--p-radius-md)]` (10px) oder `lg` (14px).
- ❌ **DON'T:** Keine neuen externen UI-Bibliotheken installieren.
