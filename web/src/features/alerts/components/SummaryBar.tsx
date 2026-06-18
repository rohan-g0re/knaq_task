"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { useDispatch } from "react-redux";

import { STATUS_COLORS } from "@/lib/theme/ColorModeProvider";
import type { AppDispatch } from "@/lib/store";
import { setStatus } from "../slices/filtersSlice";
import type { AlertStatus } from "../types";

interface Props {
  counts: Record<AlertStatus, number>;
}

const BUCKETS: { key: AlertStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
];

export default function SummaryBar({ counts }: Props) {
  const dispatch = useDispatch<AppDispatch>();

  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
      {BUCKETS.map(({ key, label }) => (
        <Chip
          key={key}
          label={`${label}: ${counts[key] ?? 0}`}
          onClick={() => dispatch(setStatus([key]))}
          sx={{
            borderColor: STATUS_COLORS[key],
            color: STATUS_COLORS[key],
            fontWeight: 600,
            cursor: "pointer",
          }}
          variant="outlined"
        />
      ))}
    </Box>
  );
}
