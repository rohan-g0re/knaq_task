"use client";

import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import type { Alert } from "../types";

export default function MetricCard({ alert }: { alert: Alert }) {
  const hasMetric = alert.readingValue != null && alert.threshold != null;

  if (!hasMetric) {
    return (
      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 1.5, alignItems: "center" }}>
        <WarningAmberIcon color="warning" />
        <Box>
          <Typography variant="subtitle2">Device-detected fault</Typography>
          <Typography variant="body2" color="text.secondary">
            No metric reading reported with this alert.
          </Typography>
        </Box>
      </Paper>
    );
  }

  const over = (alert.readingValue as number) > (alert.threshold as number);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary">
        {alert.readingName ?? "reading"}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: over ? "error.main" : "text.primary" }}>
          {alert.readingValue}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          threshold {alert.threshold}
        </Typography>
      </Box>
      <Typography variant="caption" color={over ? "error.main" : "text.secondary"}>
        {over ? "Above threshold" : "Within threshold"}
      </Typography>
    </Paper>
  );
}
