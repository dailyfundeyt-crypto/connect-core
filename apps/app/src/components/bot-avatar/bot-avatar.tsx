/**
 * A29 – `<BotAvatar>`: das Maskottchen als React-Komponente.
 *
 * EIGENTUEMER: A29.
 *
 * Portions of this software are derived from bloub / Grokbot-animations
 * Copyright (c) 2026 Jérémy Perret
 * Licensed under the MIT License. See docs/third-party/bloub-MIT.txt
 *
 * Das Aussehen imitiert das x.ai-Design (nicht lizenziert); der Code ist MIT.
 * Siehe docs/third-party/bloub-MIT.txt und docs/t3/reports/A29.md.
 *
 * Aufbau:
 * - Der Koerper ist das radiale Profil der gewaehlten Form (64 Winkel).
 * - Die Augen sind echte Luecken in diesem Koerper: sie werden als Maske
 *   ausgeschnitten, nicht als helle Formen darauf gelegt. Dadurch schneidet
 *   die Silhouette sie automatisch ab, sobald sie zum Rand wandern.
 * - `frozen` schaltet jede Animation ab. Fuer Listen mit vielen Avataren ist
 *   das Pflicht: 40 animierte Avatare wuerden ohne Mehrwert Last erzeugen.
 *
 * Die Geometrie liegt in `lib/bot-avatar/markup.ts`. Die Komponente rendert
 * dasselbe SVG, nur mit React-Attributen - so koennen die Snapshot-Tests ohne
 * DOM laufen und die Komponente kann nicht davon abweichen.
 */

import { useEffect, useId, useMemo, useState } from "react";
import {
  type AvatarColor,
  type AvatarExpression,
  type BotAvatarShape,
  type MascotState,
  mascotGeometry,
  VIEWBOX_HALF,
} from "@/lib/bot-avatar";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";

export interface BotAvatarProps {
  /** Form des Maskottchens. */
  shape?: BotAvatarShape;
  /** Farbe des Koerpers. */
  color?: AvatarColor;
  /** Groesse in Pixel. */
  size?: number;
  /** Zustaendigkeit des Maskottchens. */
  state?: MascotState;
  /**
   * Keine Animation. Fuer Listen, in denen viele Avatare gleichzeitig stehen.
   */
  frozen?: boolean;
  /** Ausdruck des Gesichts. */
  expression?: AvatarExpression;
  /** Sichtbarer Name, fuer Screenreader und Tooltip. */
  name?: string;
  className?: string;
}

export function BotAvatar({
  shape = "circle",
  color = "orange",
  size = 64,
  state = "idle",
  frozen = false,
  expression = "neutral",
  name,
  className,
}: BotAvatarProps) {
  const [enabled] = useState(() => getT3Flag("mascot"));
  const [time, setTime] = useState(0);
  const uid = useId();

  /**
   * Ohne `frozen` laeuft die Uhr. Sonst bleibt das Bild stehen - und es wird
   * gar kein Frame neu berechnet, solange sich nichts aendert.
   */
  useEffect(() => {
    if (frozen) return;
    let raf = 0;
    const started = performance.now();
    const tick = () => {
      setTime((performance.now() - started) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen]);

  const geometry = useMemo(
    () =>
      mascotGeometry({
        shape,
        color,
        state,
        expression,
        time: frozen ? 0 : time,
        frozen,
      }),
    [color, expression, frozen, shape, state, time],
  );

  /**
   * Ohne Flag bleibt Connect unveraendert: dann wird nichts gerendert, und die
   * Aufruferin entscheidet selbst ueber ihren Fallback.
   */
  if (!enabled) return null;

  const maskId = `bot-avatar-${uid}`;

  return (
    <span
      className={cn("inline-flex shrink-0", className)}
      style={{ height: size, width: size }}
      {...(name
        ? { role: "img", "aria-label": name }
        : { role: "presentation", "aria-hidden": true })}
    >
      <svg
        aria-hidden="true"
        height={size}
        viewBox={geometry.viewBox}
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/*
            Die Augen sind echte LOCHER im Koerper, keine hellen Formen darauf.
            Sie werden deshalb von der Silhouette beschnitten, sobald sie zum
            Rand wandern, ohne jeden Sonderfall.
          */}
          <mask
            height={VIEWBOX_HALF * 2}
            id={maskId}
            maskUnits="userSpaceOnUse"
            width={VIEWBOX_HALF * 2}
            x={-VIEWBOX_HALF}
            y={-VIEWBOX_HALF}
          >
            <path d={geometry.bodyPath} fill="#fff" />
            {geometry.eyes.map((eye) => (
              <path
                d={eye.d}
                fill="#000"
                key={eye.matrix}
                opacity={eye.alpha}
                transform={eye.matrix}
              />
            ))}
          </mask>
        </defs>

        {/*
          Der Koerper bekommt zuerst einen deckenden Hintergrund in der
          Augenfarbe, dann die Koerperfarbe durch die Maske darueber. So
          zeigen die Augen die Augenfarbe und nicht den Seitenhintergrund.
        */}
        <path d={geometry.bodyPath} fill={geometry.eye} />
        <g mask={`url(#${maskId})`}>
          <rect
            fill={geometry.fill}
            height={VIEWBOX_HALF * 2}
            width={VIEWBOX_HALF * 2}
            x={-VIEWBOX_HALF}
            y={-VIEWBOX_HALF}
          />
        </g>
      </svg>
    </span>
  );
}

export default BotAvatar;
