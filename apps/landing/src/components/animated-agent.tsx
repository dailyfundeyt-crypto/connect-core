"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/cn";

type AgentMood = "happy" | "thinking" | "waving" | "working" | "celebrating";

type AgentProps = {
  mood?: AgentMood;
  size?: number;
  className?: string;
  /** Show floating animation. */
  animated?: boolean;
  /** Path to the PNG. Defaults to /img/agent-character.png */
  src?: string;
};

/**
 * Connect Agent — real PNG mascot with subtle motion overlaid.
 *
 * The PNG is the source of truth for the character (your real Leo), and we add
 * a few non-intrusive animations: floating, head-tilt, antenna-glow ring.
 */
export function AnimatedAgent({
  mood = "happy",
  size = 140,
  className,
  animated = true,
  src = "/img/agent-character.png",
}: AgentProps) {
  return (
    <motion.div
      className={cn("relative inline-block select-none", className)}
      style={{ width: size, height: size }}
      animate={
        animated
          ? {
              y:
                mood === "celebrating"
                  ? [0, -10, 0, -6, 0]
                  : mood === "thinking"
                  ? [0, -2, 0]
                  : [0, -5, 0],
              rotate:
                mood === "waving"
                  ? [0, -3, 3, -3, 0]
                  : mood === "celebrating"
                  ? [0, -4, 4, -4, 0]
                  : 0,
            }
          : undefined
      }
      transition={{
        duration:
          mood === "celebrating" ? 0.8 : mood === "thinking" ? 2.4 : 3.2,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* Glow halo behind the agent */}
      <motion.div
        className="absolute inset-0 rounded-full bg-sky-300/40 blur-2xl"
        animate={
          animated
            ? { scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }
            : undefined
        }
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      {/* Real PNG of your character */}
      <Image
        src={src}
        alt="Connect agent"
        width={size}
        height={size}
        priority
        className="relative z-10 h-full w-full object-contain"
      />

      {/* Antenna sparkle — sits on top of the head area */}
      <motion.div
        className="absolute left-1/2 top-[6%] z-20 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-400 shadow-[0_0_12px_3px_rgba(56,189,248,0.7)]"
        animate={
          animated
            ? { scale: [1, 1.6, 1], opacity: [0.9, 0.4, 0.9] }
            : undefined
        }
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden
      />

      {/* Mood bubble — small contextual cue */}
      {mood === "thinking" && (
        <motion.div
          className="absolute -right-1 -top-1 z-20 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700 shadow-sm ring-1 ring-sky-200 dark:bg-ink-800 dark:text-sky-300 dark:ring-sky-800"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          thinking…
        </motion.div>
      )}
      {mood === "celebrating" && (
        <motion.div
          className="absolute -right-1 -top-1 z-20 text-2xl"
          animate={{ rotate: [0, 15, -15, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          aria-hidden
        >
          ✦
        </motion.div>
      )}
    </motion.div>
  );
}
