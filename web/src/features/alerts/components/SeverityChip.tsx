"use client";

import Chip from "@mui/material/Chip";

import type { Severity } from "../types";
import { SEVERITY_COLORS } from "@/lib/theme/theme";

export default function SeverityChip({ severity, size = "small" }: { severity: Severity; size?: "small" | "medium" }) {
  const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;
  return (
    <Chip
      size={size}
      label={severity}
      sx={{
        textTransform: "capitalize",
        fontWeight: 600,
        color: "#fff",
        backgroundColor: color,
      }}
    />
  );
}
