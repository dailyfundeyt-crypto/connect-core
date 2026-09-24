/**
 * Draw / show selection rectangles over the company-site iframe.
 * Cross-origin safe — coordinates only, no DOM access inside the frame.
 */

import { useRef, useState } from "react";
import {
  addSiteMark,
  type SiteMarkRect,
} from "@/lib/companies/site-mark";
import { cn } from "@/lib/utils";

export function SiteMarkOverlay({
  companyId,
  marking,
  marks,
  className,
}: {
  companyId: string;
  marking: boolean;
  marks: SiteMarkRect[];
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<SiteMarkRect | null>(null);
  const drag = useRef<{ x0: number; y0: number } | null>(null);

  const toPct = (clientX: number, clientY: number) => {
    const el = boxRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / Math.max(1, r.width)) * 100,
      y: ((clientY - r.top) / Math.max(1, r.height)) * 100,
    };
  };

  return (
    <div
      className={cn(
        "absolute inset-0 z-[5]",
        marking ? "cursor-crosshair" : "pointer-events-none",
        className,
      )}
      ref={boxRef}
      onPointerDown={(event) => {
        if (!marking) return;
        event.preventDefault();
        const p = toPct(event.clientX, event.clientY);
        drag.current = { x0: p.x, y0: p.y };
        setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current || !marking) return;
        const p = toPct(event.clientX, event.clientY);
        setDraft({
          x: drag.current.x0,
          y: drag.current.y0,
          w: p.x - drag.current.x0,
          h: p.y - drag.current.y0,
        });
      }}
      onPointerUp={(event) => {
        if (!drag.current || !marking) return;
        const p = toPct(event.clientX, event.clientY);
        const raw = {
          x: drag.current.x0,
          y: drag.current.y0,
          w: p.x - drag.current.x0,
          h: p.y - drag.current.y0,
        };
        drag.current = null;
        setDraft(null);
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* already released */
        }
        if (Math.abs(raw.w) < 1 && Math.abs(raw.h) < 1) return;
        addSiteMark(companyId, raw);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDraft(null);
      }}
    >
      {marks.map((m, i) => (
        <MarkBox key={`mark-${i}`} mark={m} solid />
      ))}
      {draft ? <MarkBox mark={draft} solid={false} /> : null}
      {marking ? (
        <p className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-neutral-950 px-3 py-1.5 text-[11px] text-white shadow-lg">
          Bereich auf der Seite umfahren — dann Auftrag schreiben
        </p>
      ) : null}
    </div>
  );
}

function MarkBox({ mark, solid }: { mark: SiteMarkRect; solid: boolean }) {
  let { x, y, w, h } = mark;
  if (w < 0) {
    x += w;
    w = Math.abs(w);
  }
  if (h < 0) {
    y += h;
    h = Math.abs(h);
  }
  return (
    <div
      aria-hidden
      className={cn(
        "absolute rounded-md border-2 border-sky-500",
        solid ? "bg-sky-500/15" : "bg-sky-400/10 border-dashed",
      )}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${w}%`,
        height: `${h}%`,
      }}
    />
  );
}
