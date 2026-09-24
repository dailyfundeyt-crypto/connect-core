"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

/**
 * SingularityField — a tiny canvas where particles fall inward in spirals,
 * converging on the dark core (the Connect logo). Black-hole energy without
 * being literal: warm orange drift, dusty paper grain, soft glow.
 */
export function SingularityField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let cx = 0;
    let cy = 0;
    let dpr = 1;

    type P = {
      angle: number;
      radius: number;
      speed: number;
      drift: number;
      size: number;
      hue: number;
      alpha: number;
    };

    let particles: P[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      cx = w / 2;
      cy = h / 2;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const spawn = (): P => {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.max(w, h) * 0.45 + Math.random() * 60;
      return {
        angle,
        radius,
        speed: 0.0012 + Math.random() * 0.0014,
        drift: 0.6 + Math.random() * 0.9,
        size: 0.7 + Math.random() * 1.6,
        // orange-leaning palette: 18–38°
        hue: 18 + Math.random() * 24,
        alpha: 0.25 + Math.random() * 0.55,
      };
    };

    const reset = (): P => {
      // Re-spawn from outside once it gets too close
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.max(w, h) * 0.45 + Math.random() * 80;
      return {
        angle,
        radius,
        speed: 0.0012 + Math.random() * 0.0014,
        drift: 0.6 + Math.random() * 0.9,
        size: 0.7 + Math.random() * 1.6,
        hue: 18 + Math.random() * 24,
        alpha: 0.25 + Math.random() * 0.55,
      };
    };

    const init = () => {
      resize();
      particles = Array.from({ length: 140 }, spawn);
    };

    let frame = 0;
    const draw = () => {
      // Soft paper-grain trail — wipe with translucent fill instead of clear
      ctx.fillStyle = "rgba(255, 252, 247, 0.18)";
      ctx.fillRect(0, 0, w, h);

      frame++;

      // Central halo glow that pulses gently
      const pulse = 1 + Math.sin(frame * 0.012) * 0.06;
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220 * pulse);
      halo.addColorStop(0, "rgba(249, 115, 22, 0.22)");
      halo.addColorStop(0.45, "rgba(249, 115, 22, 0.08)");
      halo.addColorStop(1, "rgba(249, 115, 22, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Particles — spiral in
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.angle += p.speed * 1.4;
        p.radius -= p.drift;

        if (p.radius < 8) {
          particles[i] = reset();
          continue;
        }

        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius * 0.85; // slight vertical squash

        // Long trail along the spiral direction
        const tx = cx + Math.cos(p.angle - 0.18) * (p.radius + 6);
        const ty = cy + Math.sin(p.angle - 0.18) * (p.radius + 6) * 0.85;

        const grd = ctx.createLinearGradient(tx, ty, x, y);
        grd.addColorStop(0, `hsla(${p.hue}, 90%, 60%, 0)`);
        grd.addColorStop(1, `hsla(${p.hue}, 92%, 58%, ${p.alpha})`);
        ctx.strokeStyle = grd;
        ctx.lineWidth = p.size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Bright tip
        ctx.fillStyle = `hsla(${p.hue}, 95%, 62%, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Inner dark disc — the event horizon
      const disc = ctx.createRadialGradient(cx, cy, 0, cx, cy, 36);
      disc.addColorStop(0, "rgba(20, 14, 8, 1)");
      disc.addColorStop(0.7, "rgba(20, 14, 8, 0.95)");
      disc.addColorStop(1, "rgba(20, 14, 8, 0)");
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    init();
    draw();

    const onResize = () => {
      init();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <Image
          src="/img/connect-logo.png"
          alt="Connect — the singularity where agents converge"
          width={120}
          height={120}
          className="h-28 w-28 drop-shadow-[0_8px_28px_rgba(249,115,22,0.35)] dark:invert"
          priority
        />
      </div>
    </div>
  );
}
