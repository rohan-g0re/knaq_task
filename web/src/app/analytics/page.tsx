"use client";

import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import RemoveIcon from "@mui/icons-material/Remove";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import ReactECharts from "echarts-for-react";

import { useGetStatsQuery } from "@/features/alerts/api/knaqApi";
import type { Severity, Stats } from "@/features/alerts/types";
import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/theme/theme";
import { apiErrorMessage } from "@/lib/apiError";

// SLA resolution targets (minutes). Critical = 4h is the assignment's own example;
// Warning = 24h is our stated assumption. Documented in SOLUTION.md.
const SLA_TARGETS: Record<Severity, number | null> = { critical: 240, warning: 1440, info: null };

const SEVERITIES: Severity[] = ["critical", "warning", "info"];

// MTTR / resolution times are measured from human-logged time_spent_minutes (see SOLUTION.md),
// so they're real minutes — render them as "Xh Ym" / "Ym".
function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function Trend({ now, prev }: { now: number; prev: number }) {
  const delta = now - prev;
  const color = delta > 0 ? "success.main" : delta < 0 ? "error.main" : "text.secondary";
  const Icon = delta > 0 ? ArrowUpwardIcon : delta < 0 ? ArrowDownwardIcon : RemoveIcon;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, color }}>
      <Icon sx={{ fontSize: 16 }} />
      <Typography variant="caption" sx={{ color }}>
        {delta === 0 ? "no change" : `${Math.abs(delta)} vs last week`}
      </Typography>
    </Box>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && <Box sx={{ mt: 0.5 }}>{sub}</Box>}
    </Paper>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

export default function AnalyticsPage() {
  const theme = useTheme();
  const { data, isLoading, isError, error, refetch } = useGetStatsQuery();

  const text = theme.palette.text.primary;
  const muted = theme.palette.text.secondary;
  const line = theme.palette.divider;
  // Shared bits so every chart stays legible across light/dark theme.
  const axis = {
    axisLabel: { color: muted },
    axisLine: { lineStyle: { color: line } },
    splitLine: { lineStyle: { color: line } },
  };
  const tooltipBg = theme.palette.background.paper;

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        {apiErrorMessage(error)}
      </Alert>
    );
  }

  if (isLoading || !data) {
    return (
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Analytics
        </Typography>
        <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={360} />
      </Box>
    );
  }

  const s: Stats = data;
  const openTotal = SEVERITIES.reduce((sum, sev) => sum + (s.openBySeverity[sev] ?? 0), 0);

  // --- Alerts by Status (donut) ---
  const statusOption = {
    tooltip: { trigger: "item", backgroundColor: tooltipBg, borderColor: line, textStyle: { color: text } },
    legend: { bottom: 0, textStyle: { color: muted } },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: theme.palette.background.paper, borderWidth: 2 },
        label: { color: text },
        data: (Object.keys(s.statusCounts) as (keyof typeof s.statusCounts)[]).map((k) => ({
          name: k,
          value: s.statusCounts[k],
          itemStyle: { color: STATUS_COLORS[k] },
        })),
      },
    ],
  };

  // --- Resolution Time by Severity (bar + SLA markLines) ---
  const resData = SEVERITIES.map((sev) => ({
    value: s.resolutionBySeverity[sev],
    itemStyle: { color: SEVERITY_COLORS[sev] },
  }));
  const resolutionOption = {
    tooltip: {
      trigger: "axis",
      backgroundColor: tooltipBg,
      borderColor: line,
      textStyle: { color: text },
      valueFormatter: (v: number | null) => fmtMinutes(v),
    },
    grid: { left: 8, right: 16, bottom: 8, top: 24, containLabel: true },
    xAxis: { type: "category", data: SEVERITIES, ...axis },
    yAxis: { type: "value", name: "minutes", nameTextStyle: { color: muted }, ...axis },
    series: [
      {
        type: "bar",
        data: resData,
        barWidth: "45%",
        label: { show: true, position: "top", color: text, formatter: (p: { value: number | null }) => fmtMinutes(p.value) },
        markLine: {
          symbol: "none",
          data: [
            { yAxis: SLA_TARGETS.critical, name: "Critical SLA", lineStyle: { color: SEVERITY_COLORS.critical, type: "dashed" }, label: { formatter: "Critical SLA 4h", color: muted, position: "insideEndTop" } },
            { yAxis: SLA_TARGETS.warning, name: "Warning SLA", lineStyle: { color: SEVERITY_COLORS.warning, type: "dashed" }, label: { formatter: "Warning SLA 24h", color: muted, position: "insideEndTop" } },
          ],
        },
      },
    ],
  };

  // --- Alert Volume Trend (stacked area, one series per severity) ---
  const dates = s.volumeTrend.map((p) => p.date.slice(5)); // MM-DD
  const volumeOption = {
    tooltip: { trigger: "axis", backgroundColor: tooltipBg, borderColor: line, textStyle: { color: text } },
    legend: { top: 0, textStyle: { color: muted } },
    grid: { left: 8, right: 16, bottom: 8, top: 32, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: dates, ...axis },
    yAxis: { type: "value", ...axis },
    series: SEVERITIES.map((sev) => ({
      name: sev,
      type: "line",
      stack: "total",
      areaStyle: { opacity: 0.25 },
      smooth: true,
      showSymbol: false,
      lineStyle: { color: SEVERITY_COLORS[sev] },
      itemStyle: { color: SEVERITY_COLORS[sev] },
      data: s.volumeTrend.map((p) => p[sev]),
    })),
  };

  const chartStyle = { height: 320 };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Analytics
      </Typography>

      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Mean time to resolve" value={fmtMinutes(s.mttrMinutes)} sub={<Typography variant="caption" color="text.secondary">from logged time spent</Typography>} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Open alerts"
            value={String(openTotal)}
            sub={
              <Typography variant="caption" color="text.secondary">
                {s.openBySeverity.critical} critical · {s.openBySeverity.warning} warning · {s.openBySeverity.info} info
              </Typography>
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Resolved this week" value={String(s.resolvedThisWeek)} sub={<Trend now={s.resolvedThisWeek} prev={s.resolvedLastWeek} />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Dismissal rate" value={`${Math.round(s.dismissalRate * 100)}%`} sub={<Typography variant="caption" color="text.secondary">of closed alerts dismissed</Typography>} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <ChartCard title="Alerts by Status">
            <ReactECharts option={statusOption} style={chartStyle} notMerge />
          </ChartCard>
        </Grid>
        <Grid item xs={12} md={7}>
          <ChartCard title="Resolution Time by Severity">
            <ReactECharts option={resolutionOption} style={chartStyle} notMerge />
          </ChartCard>
        </Grid>
        <Grid item xs={12}>
          <ChartCard title="Alert Volume Trend">
            <ReactECharts option={volumeOption} style={chartStyle} notMerge />
          </ChartCard>
        </Grid>
      </Grid>
    </Box>
  );
}
