"use client";

import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";

import type { AlertStatus } from "../types";
import { STATUS_COLORS } from "@/lib/theme/theme";

const LABELS: Record<AlertStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export default function StatusBadge({ status }: { status: AlertStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <Chip
      size="small"
      variant="outlined"
      label={LABELS[status]}
      sx={{ fontWeight: 600, color, borderColor: color, backgroundColor: alpha(color, 0.12) }}
    />
  );
}
