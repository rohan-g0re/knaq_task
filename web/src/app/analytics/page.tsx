"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import ReactECharts from "echarts-for-react";
import { useTheme } from "@mui/material/styles";

import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/theme/ColorModeProvider";
import { useGetStatsQuery } from "@/features/alerts/api/knaqApi";

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h4" fontWeight={700}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

const SLA: Record<string, number> = { critical: 240, warning: 1440 };

export default function AnalyticsPage() {
  const { data, isLoading } = useGetStatsQuery();
  const theme = useTheme();

  if (isLoading || !data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const open = data.openBySeverity;
  const totalOpen = (open.critical ?? 0) + (open.warning ?? 0) + (open.info ?? 0);
  const mttr = data.mttrMinutes != null ? `${data.mttrMinutes} min` : "—";

  const donutOption = {
    tooltip: { trigger: "item" },
    series: [{
      type: "pie",
      radius: ["40%", "70%"],
      data: Object.entries(data.statusCounts).map(([name, value]) => ({
        name,
        value,
        itemStyle: { color: STATUS_COLORS[name] ?? "#999" },
      })),
      label: { color: theme.palette.text.primary },
    }],
  };

  const resBySev = data.resolutionBySeverity;
  const sevKeys = ["critical", "warning", "info"];
  const barOption = {
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: sevKeys.map((s) => s.charAt(0).toUpperCase() + s.slice(1)) },
    yAxis: { type: "value", name: "Minutes" },
    series: [
      {
        type: "bar",
        data: sevKeys.map((s) => resBySev[s as keyof typeof resBySev] ?? 0),
        itemStyle: { color: ({ dataIndex }: { dataIndex: number }) => SEVERITY_COLORS[sevKeys[dataIndex]] },
        markLine: {
          data: sevKeys
            .filter((s) => SLA[s] != null)
            .map((s) => ({ yAxis: SLA[s], name: `${s} SLA`, lineStyle: { type: "dashed" } })),
        },
      },
    ],
  };

  const trend = data.volumeTrend;
  const trendOption = {
    tooltip: { trigger: "axis" },
    legend: { data: ["Critical", "Warning", "Info"] },
    xAxis: { type: "category", data: trend.map((t) => t.date) },
    yAxis: { type: "value" },
    series: [
      { name: "Critical", type: "bar", stack: "total", data: trend.map((t) => t.critical), itemStyle: { color: SEVERITY_COLORS.critical } },
      { name: "Warning", type: "bar", stack: "total", data: trend.map((t) => t.warning), itemStyle: { color: SEVERITY_COLORS.warning } },
      { name: "Info", type: "bar", stack: "total", data: trend.map((t) => t.info), itemStyle: { color: SEVERITY_COLORS.info } },
    ],
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Analytics</Typography>

      <Grid container spacing={2} mb={3}>
        <Grid item xs={6} sm={3}><MetricCard label="MTTR" value={mttr} /></Grid>
        <Grid item xs={6} sm={3}><MetricCard label="Open alerts" value={totalOpen} /></Grid>
        <Grid item xs={6} sm={3}><MetricCard label="Resolved this week" value={data.resolvedThisWeek} /></Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard label="Dismissal rate" value={`${(data.dismissalRate * 100).toFixed(0)}%`} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" mb={1}>Status breakdown</Typography>
              <ReactECharts option={donutOption} style={{ height: 260 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" mb={1}>Avg resolution time by severity (min) — dashed = SLA</Typography>
              <ReactECharts option={barOption} style={{ height: 260 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" mb={1}>Alert volume trend</Typography>
              <ReactECharts option={trendOption} style={{ height: 260 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
