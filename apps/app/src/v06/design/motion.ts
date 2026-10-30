/**
 * Premium Micro-Interactions & Motion Primitives (v06)
 * Strict 150-200ms bounds with reduced motion accessibility
 */

import { useEffect, useState } from "react";

export const MOTION = {
  duration: {
    fast: 0.12, // 120ms - tooltips, toggle snaps
    base: 0.18, // 180ms - buttons, cards, list rows, tabs
    slow: 0.26, // 260ms - dialog enter/exit, sheet slide
  },
  durationMs: {
    fast: 120,
    base: 180,
    slow: 260,
  },
  ease: [0.16, 1, 0.3, 1] as const, // calm deceleration curve (no bouncy overshoot)
  easeString: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/**
 * Standard CSS transition strings
 */
export const transitions = {
  fast: `all ${MOTION.duration.fast}s ${MOTION.easeString}`,
  base: `all ${MOTION.duration.base}s ${MOTION.easeString}`,
  slow: `all ${MOTION.duration.slow}s ${MOTION.easeString}`,
  color: `color ${MOTION.duration.base}s ${MOTION.easeString}, background-color ${MOTION.duration.base}s ${MOTION.easeString}, border-color ${MOTION.duration.base}s ${MOTION.easeString}`,
  transform: `transform ${MOTION.duration.base}s ${MOTION.easeString}`,
} as const;

/**
 * Hook to respect OS-level prefers-reduced-motion preference.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReduced;
}

/**
 * Returns empty motion props if user prefers reduced motion, or full animation config if allowed.
 */
export function safeTransition(baseSec = MOTION.duration.base, isReduced = false) {
  if (isReduced) {
    return { duration: 0 };
  }
  return {
    duration: baseSec,
    ease: MOTION.ease,
  };
}
