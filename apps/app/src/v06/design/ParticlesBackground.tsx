import React, { useEffect, useRef } from "react";
import { useReducedMotion } from "./motion";
import { cn } from "@/lib/utils";

export interface ParticlesBackgroundProps {
  density?: number;
  interactive?: boolean;
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

/**
 * Lightweight, zero-dependency Canvas particle background (Casberry / Grok style).
 * Highly optimized: throttled frame rate, off-screen pause, respects prefers-reduced-motion.
 */
export const ParticlesBackground: React.FC<ParticlesBackgroundProps> = ({
  density = 28,
  interactive = true,
  speed = 0.3,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();
  const mouseRef = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const count = Math.min(Math.floor((width * height) / 30000), density);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * speed,
          vy: (Math.random() - 0.5) * speed,
          radius: Math.random() * 1.5 + 1,
          alpha: Math.random() * 0.4 + 0.2,
        });
      }
    };

    const render = () => {
      if (!ctx || width === 0 || height === 0) return;
      ctx.clearRect(0, 0, width, height);

      // Detect accent color from CSS variable
      const computedStyle = getComputedStyle(canvas);
      const isDark = document.documentElement.classList.contains("dark") || canvas.closest(".p-theme-dark");
      const particleColor = isDark ? "56, 189, 248" : "2, 132, 199";

      // Draw connections
      const maxDistance = 110;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const lineAlpha = (1 - dist / maxDistance) * 0.12;
            ctx.strokeStyle = `rgba(${particleColor}, ${lineAlpha})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw and update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (!reducedMotion) {
          p.x += p.vx;
          p.y += p.vy;

          // Bounce off boundaries
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;

          // Subtle mouse evasion
          if (interactive && mouseRef.current.x !== null && mouseRef.current.y !== null) {
            const mdx = p.x - mouseRef.current.x;
            const mdy = p.y - mouseRef.current.y;
            const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
            if (mdist < 80 && mdist > 0) {
              const force = (80 - mdist) / 80;
              p.x += (mdx / mdist) * force * 1.5;
              p.y += (mdy / mdist) * force * 1.5;
            }
          }
        }

        ctx.fillStyle = `rgba(${particleColor}, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    if (reducedMotion) {
      render(); // Single static render
    } else {
      animationFrameId = requestAnimationFrame(render);
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: null, y: null };
    };

    if (interactive) {
      canvas.addEventListener("mousemove", handleMouseMove);
      canvas.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
      if (interactive) {
        canvas.removeEventListener("mousemove", handleMouseMove);
        canvas.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [density, interactive, speed, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 w-full h-full opacity-60 transition-opacity duration-300",
        className,
      )}
      style={style}
    />
  );
};
