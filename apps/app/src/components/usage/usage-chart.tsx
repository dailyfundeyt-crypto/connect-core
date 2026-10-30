import React from "react";
import { cn } from "@/lib/utils";
import type { TimeSeriesPoint } from "./types";
import { formatTokens } from "./usage-table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { IconChartAreaLine } from "@tabler/icons-react";

export interface UsageChartProps {
  data: TimeSeriesPoint[];
  className?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((acc, curr) => acc + (curr.value || 0), 0);

  return (
    <div className="rounded-lg border border-white/10 bg-[#16161c]/95 p-3 text-xs shadow-xl backdrop-blur-md">
      <p className="font-semibold text-white mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name === "codexTokens"
                ? "OpenAI Codex"
                : entry.name === "claudeTokens"
                ? "Claude Code"
                : "Andere CLIs"}
            </span>
            <span className="font-mono font-medium text-white">
              {formatTokens(entry.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.08] mt-2 pt-1.5 flex justify-between gap-4 font-semibold text-sky-400">
        <span>Gesamt</span>
        <span className="font-mono">{formatTokens(total)}</span>
      </div>
    </div>
  );
}

export function UsageChart({ data, className }: UsageChartProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm flex flex-col gap-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
            <IconChartAreaLine className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Token-Verlauf (Zeitreihe)
            </h3>
            <p className="text-xs text-zinc-400">
              Token-Volumen nach CLI über die Zeit
            </p>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 sm:h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorCodex" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorClaude" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorOther" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.05)"
              vertical={false}
            />

            <XAxis
              dataKey="formattedTime"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "rgba(255, 255, 255, 0.08)" }}
            />

            <YAxis
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatTokens(v)}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ paddingBottom: 8, fontSize: 11 }}
              formatter={(value) => {
                if (value === "codexTokens") return "OpenAI Codex";
                if (value === "claudeTokens") return "Claude Code";
                return "Andere (Shared)";
              }}
            />

            <Area
              type="monotone"
              dataKey="codexTokens"
              name="codexTokens"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorCodex)"
            />

            <Area
              type="monotone"
              dataKey="claudeTokens"
              name="claudeTokens"
              stroke="#f59e0b"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorClaude)"
            />

            <Area
              type="monotone"
              dataKey="otherTokens"
              name="otherTokens"
              stroke="#38bdf8"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorOther)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
