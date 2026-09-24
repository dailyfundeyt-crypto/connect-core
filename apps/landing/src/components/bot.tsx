"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type BotMood = "happy" | "thinking" | "waving" | "working" | "celebrating";

type BotProps = {
  mood?: BotMood;
  size?: number;
  className?: string;
  /** When true, the bot is animating — disable on hero (use static export). */
  animated?: boolean;
};

/**
 * Connect Bot — hand-drawn mascot.
 *
 * The character is built from rough, slightly-wobbly strokes so it reads as
 * drawn-by-hand rather than vector-perfect. Mood drives the eye shape,
 * mouth and arm gesture.
 */
export function Bot({ mood = "happy", size = 220, className, animated = true }: BotProps) {
  return (
    <motion.svg
      viewBox="0 0 220 240"
      width={size}
      height={(size * 240) / 220}
      role="img"
      aria-label={`Connect bot, ${mood}`}
      className={cn("select-none", className)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* wobbly ground shadow */}
      <ellipse
        cx="110"
        cy="226"
        rx="62"
        ry="5"
        fill="#000"
        opacity="0.08"
      />

      {/* body — slightly rounded square, drawn twice for hand-drawn feel */}
      <g
        className={cn(
          animated && "origin-bottom",
          animated && mood === "happy" && "animate-float",
        )}
      >
        <path
          d="M48 80 Q47 62 70 60 L150 58 Q172 60 172 82 L174 178 Q173 200 150 202 L70 200 Q48 198 48 178 Z"
          fill="#FBF8F3"
          stroke="#1A1A1C"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dark:fill-ink-800"
        />
        {/* offset stroke for hand-drawn wobble */}
        <path
          d="M48.8 81.5 Q48 64 70.5 62 L150.4 60 Q170.6 62 170.6 82.5 L172.4 177 Q171.5 198 150 200 L70 198.4 Q49.4 196.5 49.4 178 Z"
          fill="none"
          stroke="#1A1A1C"
          strokeWidth="0.9"
          strokeOpacity="0.35"
        />

        {/* chest panel */}
        <path
          d="M85 116 Q83 110 92 110 L130 110 Q137 112 137 120 L137 158 Q135 166 128 166 L92 166 Q85 165 85 156 Z"
          fill="#0EA5E9"
          stroke="#1A1A1C"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* chest spark */}
        <text
          x="110"
          y="148"
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fill="#FBF8F3"
        >
          ✦
        </text>

        {/* face: eyes */}
        {mood === "thinking" ? (
          <>
            <path
              d="M78 92 q4 -3 8 0"
              fill="none"
              stroke="#1A1A1C"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M138 92 q4 -3 8 0"
              fill="none"
              stroke="#1A1A1C"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <motion.g
              animate={animated && mood === "happy" ? { scaleY: [1, 1, 0.1, 1] } : undefined}
              transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.95, 1] }}
              style={{ transformOrigin: "82px 92px" }}
            >
              <circle cx="82" cy="92" r="5" fill="#1A1A1C" />
            </motion.g>
            <motion.g
              animate={animated && mood === "happy" ? { scaleY: [1, 1, 0.1, 1] } : undefined}
              transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.95, 1] }}
              style={{ transformOrigin: "142px 92px" }}
            >
              <circle cx="142" cy="92" r="5" fill="#1A1A1C" />
            </motion.g>
          </>
        )}

        {/* cheeks — warm blush */}
        <circle cx="68" cy="108" r="5" fill="#F59E0B" opacity="0.45" />
        <circle cx="156" cy="108" r="5" fill="#F59E0B" opacity="0.45" />

        {/* mouth */}
        {mood === "waving" || mood === "celebrating" ? (
          <path
            d="M94 112 Q110 130 128 112"
            fill="none"
            stroke="#1A1A1C"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ) : mood === "thinking" ? (
          <path
            d="M104 116 q6 -3 12 0"
            fill="none"
            stroke="#1A1A1C"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M100 114 Q110 124 120 114"
            fill="none"
            stroke="#1A1A1C"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        )}

        {/* antenna */}
        <line
          x1="110"
          y1="60"
          x2="110"
          y2="42"
          stroke="#1A1A1C"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <motion.circle
          cx="110"
          cy="36"
          r="6"
          fill="#0EA5E9"
          stroke="#1A1A1C"
          strokeWidth="2.2"
          animate={
            animated
              ? { scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }
              : undefined
          }
          transition={{ duration: 1.6, repeat: Infinity }}
        />

        {/* arms */}
        <Arm side="left" waving={mood === "waving"} animated={animated} />
        <Arm side="right" waving={false} working={mood === "working"} animated={animated} />

        {/* little feet */}
        <ellipse cx="78" cy="206" rx="14" ry="6" fill="#1A1A1C" />
        <ellipse cx="142" cy="206" rx="14" ry="6" fill="#1A1A1C" />
      </g>
    </motion.svg>
  );
}

function Arm({
  side,
  waving,
  working,
  animated,
}: {
  side: "left" | "right";
  waving?: boolean;
  working?: boolean;
  animated: boolean;
}) {
  const isLeft = side === "left";
  const baseX = isLeft ? 48 : 172;
  const baseY = 140;
  const restAngle = isLeft ? -10 : 10;
  const waveAngle = isLeft ? -50 : 50;

  return (
    <motion.g
      style={{ transformOrigin: `${baseX}px ${baseY}px` }}
      animate={
        animated && waving
          ? { rotate: [restAngle, waveAngle, restAngle - 10, waveAngle, restAngle] }
          : animated && working
          ? { rotate: [restAngle, restAngle + (isLeft ? -8 : 8), restAngle] }
          : undefined
      }
      transition={
        waving
          ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
      }
    >
      <path
        d={`M${baseX} ${baseY} q${isLeft ? -10 : 10} ${isLeft ? 18 : 18} ${isLeft ? -2 : 2} q4 4 8 ${isLeft ? -2 : 2}`}
        fill="none"
        stroke="#1A1A1C"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle
        cx={isLeft ? baseX - 14 : baseX + 14}
        cy={baseY + 22}
        r="6"
        fill="#FBF8F3"
        stroke="#1A1A1C"
        strokeWidth="2.2"
        className="dark:fill-ink-800"
      />
    </motion.g>
  );
}
