import type { ComponentType, ReactNode } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for the Dashboard and Analytics pages, so both stay
 * visually consistent. Colors are driven by the app theme tokens (see index.css)
 * rather than hardcoded, so charts follow the CRM's palette automatically.
 */

export const CHART = {
  blue: "var(--color-chart-1)",
  teal: "var(--color-chart-2)",
  green: "var(--color-chart-3)",
  amber: "var(--color-chart-4)",
  purple: "var(--color-chart-5)",
  red: "var(--color-destructive)",
} as const;

/** Default categorical series order for multi-slice charts. */
export const SERIES = [CHART.blue, CHART.teal, CHART.green, CHART.amber, CHART.purple];

export const AXIS = "var(--color-muted-foreground)";
export const GRID = "var(--color-border)";

export type Accent = "blue" | "teal" | "green" | "amber" | "purple" | "red";

const ACCENT: Record<Accent, { chip: string; bar: string; value: string }> = {
  blue: { chip: "bg-chart-1/10 text-chart-1", bar: "from-chart-1/70", value: "text-foreground" },
  teal: { chip: "bg-chart-2/10 text-chart-2", bar: "from-chart-2/70", value: "text-foreground" },
  green: { chip: "bg-chart-3/10 text-chart-3", bar: "from-chart-3/70", value: "text-chart-3" },
  amber: { chip: "bg-chart-4/10 text-chart-4", bar: "from-chart-4/70", value: "text-foreground" },
  purple: { chip: "bg-chart-5/10 text-chart-5", bar: "from-chart-5/70", value: "text-foreground" },
  red: { chip: "bg-destructive/10 text-destructive", bar: "from-destructive/70", value: "text-destructive" },
};

/** A KPI tile: label, big number, optional icon chip + context hint. */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "blue",
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: Accent;
}) {
  const a = ACCENT[accent];
  return (
    <Card className="relative overflow-hidden border-border bg-card p-5 transition-colors hover:border-muted-foreground/30">
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r to-transparent", a.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-muted-foreground">{label}</div>
          <div className={cn("mt-1 text-2xl font-bold tabular-nums", a.value)}>{value}</div>
          {hint != null && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", a.chip)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
}

/** A titled panel that holds a chart. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Small section divider with a title + optional description. */
export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Themed tooltip used across all charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: ReactNode;
  formatter?: (value: any, name: any) => ReactNode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-xl">
      {label != null && label !== "" && (
        <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill || p.fill }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground">
              {formatter ? formatter(p.value, p.name) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centered placeholder shown when a chart has no data. */
export function EmptyState({ height = 240, children = "No data yet" }: { height?: number; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      {children}
    </div>
  );
}

/**
 * Donut chart with the total shown in the middle and a labelled legend below.
 * `data` is an array of { name, value }.
 */
export function Donut({
  data,
  centerLabel,
  height = 220,
  formatValue,
  colors,
}: {
  data: { name: string; value: number }[];
  centerLabel?: string;
  height?: number;
  formatValue?: (value: number) => ReactNode;
  colors?: string[];
}) {
  const palette = colors ?? SERIES;
  const total = data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  if (total <= 0) return <EmptyState height={height}>No data yet</EmptyState>;
  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={Math.round(height * 0.28)}
              outerRadius={Math.round(height * 0.42)}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              content={<ChartTooltip formatter={(v: any) => (formatValue ? formatValue(Number(v)) : v)} />}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold tabular-nums text-foreground">
            {formatValue ? formatValue(total) : total.toLocaleString()}
          </div>
          {centerLabel && <div className="text-xs text-muted-foreground">{centerLabel}</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ background: palette[i % palette.length] }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatValue ? formatValue(d.value) : d.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact peso formatter for axis ticks, e.g. ₱1.2M / ₱850k. */
export function pesoCompact(v: number): string {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₱${(n / 1_000).toFixed(0)}k`;
  return `₱${n}`;
}
