/**
 * Avatar-Kachel für das Agenten-Raster (Lane A28).
 *
 * EIGENTÜMER: A28.
 *
 * Warum ein eigener Avatar statt `<BotAvatar>`?
 * ---------------------------------------------
 * A29 („Maskottchen-Engine & `<BotAvatar>`") hat seine Komponente
 * `apps/app/src/components/bot-avatar/**` noch nicht abgeliefert — in der
 * Lane liegen bisher nur `lib/bot-avatar/math.ts` und `lib/bot-avatar/profiles.ts`
 * (Stand 29.10.2026). Damit das Raster trotzdem bauen und testen kann, rendert
 * diese Datei einen **eigenen, leichten** Maskottchen-Avatar auf Basis der
 * A01-Vertragstypen (`AvatarShape`, `AvatarColor` aus `@/lib/t3/contracts`).
 *
 * Sobald A29 `<BotAvatar>` liefert, genügt ein Austausch der Rendering-Stelle
 * in `GridAvatar` — die Aufrufer kennen nur die Vertragstypen. Das ist als
 * offener Wunsch an A29 im Bericht A28 vermerkt.
 *
 * Formen sind hier bewusst vereinfacht (regelmäßige Polygone + radiale
 * Formeln). Es geht um das Raster-Layout und den Status-Punkt, nicht um die
 * Animations-Engine von A29.
 */

import { useMemo } from "react";
import type { AvatarColor, AvatarExpression, AvatarShape } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";

/** Farbwerte je Vertragsfarbe. */
const COLOR_HEX: Record<AvatarColor, string> = {
  white: "#f7f7f5",
  ink: "#23232b",
  brown: "#8a5a3b",
  red: "#e5484d",
  orange: "#f08a24",
  amber: "#f0b429",
  green: "#46a758",
  turquoise: "#2bb8b0",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  pink: "#ec6a9c",
  gray: "#9a9aa2",
  cream: "#f3e4cd",
};

const SAMPLES = 64;

/** Radius eines regelmäßigen n-Ecks in Richtung `theta` (Winkel in Radiant). */
function regularPolygon(n: number, rotation: number) {
  return (theta: number) => {
    const step = (Math.PI * 2) / n;
    const local = ((theta - rotation) % step + step) % step;
    return Math.cos(step / 2) / Math.cos(local - step / 2);
  };
}

/** Radiusfunktion je Form. Alle Werte sind normiert (1 = Radius). */
const RADIUS: Record<AvatarShape, (theta: number) => number> = {
  circle: () => 1,
  pebble: (t) => 1 - 0.06 * Math.cos(2 * t),
  squircle: (t) => {
    const n = 3.4;
    const c = Math.abs(Math.cos(t));
    const s = Math.abs(Math.sin(t));
    return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
  },
  capsule: (t) => {
    const n = 4;
    const c = Math.abs(Math.cos(t));
    const s = Math.abs(Math.sin(t));
    return 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
  },
  triangle: regularPolygon(3, -Math.PI / 2),
  hexagon: regularPolygon(6, 0),
  cloud: (t) => 0.78 + 0.22 * Math.cos(5 * t + Math.PI),
  drop: (t) => {
    // Tropfen: spitz nach oben, breit unten.
    const up = (t + Math.PI / 2) % (Math.PI * 2);
    return 0.72 + 0.28 * Math.sin(up);
  },
  diamond: regularPolygon(4, -Math.PI / 2),
  star: (t) => {
    const step = Math.PI / 5;
    const local = ((t % step) + step) % step;
    return local < step / 2 ? 1 : 0.44;
  },
  flower: (t) => 0.72 + 0.28 * Math.abs(Math.cos(3 * t)),
  pumpkin: (t) => 0.92 + 0.08 * Math.cos(4 * t),
};

/** Anisotrope Streckung je Form (x, y). */
const STRETCH: Record<AvatarShape, [number, number]> = {
  circle: [1, 1],
  pebble: [1.06, 0.94],
  squircle: [1, 1],
  capsule: [0.8, 1.12],
  triangle: [1, 1],
  hexagon: [1, 1],
  cloud: [1.06, 0.94],
  drop: [0.92, 1.08],
  diamond: [1, 1],
  star: [1, 1],
  flower: [1, 1],
  pumpkin: [1.04, 0.96],
};

/**
 * Pfad einer Form als geschlossenes Polygon.
 * 64 Stichpunkte reichen, damit die Kanten glatt wirken.
 */
export function shapePath(shape: AvatarShape): string {
  const radius = RADIUS[shape] ?? RADIUS.circle;
  const [sx, sy] = STRETCH[shape] ?? [1, 1];
  const points: string[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const theta = (i / SAMPLES) * Math.PI * 2 - Math.PI / 2;
    const r = radius(theta);
    const x = 50 + Math.cos(theta) * r * 44 * sx;
    const y = 50 + Math.sin(theta) * r * 44 * sy;
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/** Augen-Position je Ausdruck. */
const EYES: Record<AvatarExpression, { dx: number; dy: number; rx: number; ry: number }> = {
  neutral: { dx: 11, dy: 0, rx: 4.2, ry: 4.6 },
  happy: { dx: 11, dy: 1, rx: 4.6, ry: 3.6 },
  thinking: { dx: 10, dy: -1, rx: 4, ry: 4.4 },
  wink: { dx: 11, dy: 0, rx: 4.2, ry: 4.6 },
  wide: { dx: 12, dy: 0, rx: 4.8, ry: 5.2 },
  alert: { dx: 11, dy: -1.5, rx: 4.2, ry: 5 },
  sleep: { dx: 11, dy: 1.5, rx: 4.4, ry: 2.4 },
  surprised: { dx: 12, dy: 0, rx: 5, ry: 5.4 },
};

export function GridAvatar({
  shape = "circle",
  color = "orange",
  expression = "neutral",
  size = 40,
  className,
}: {
  shape?: AvatarShape;
  color?: AvatarColor;
  expression?: AvatarExpression;
  size?: number;
  className?: string;
}) {
  const path = useMemo(() => shapePath(shape), [shape]);
  const eye = EYES[expression] ?? EYES.neutral;
  const fill = COLOR_HEX[color] ?? COLOR_HEX.orange;
  const dark = color === "ink" ? "#f7f7f5" : "#23232b";
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 overflow-hidden rounded-full", className)}
      style={{ height: size, width: size }}
    >
      <svg
        fill="none"
        height={size}
        viewBox="0 0 100 100"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d={path} fill={fill} />
        <ellipse
          cx={50 - eye.dx}
          cy={50 + eye.dy}
          fill={dark}
          rx={eye.rx}
          ry={eye.ry}
        />
        <ellipse
          cx={50 + eye.dx}
          cy={50 + eye.dy}
          fill={dark}
          rx={eye.rx}
          ry={eye.ry}
        />
      </svg>
    </span>
  );
}

export default GridAvatar;
