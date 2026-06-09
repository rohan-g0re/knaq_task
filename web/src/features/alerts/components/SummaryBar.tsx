"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Typography from "@mui/material/Typography";

import type { AlertStatus, CountsByStatus } from "../types";
import { STATUS_COLORS } from "@/lib/theme/theme";

const ORDER: { key: AlertStatus; label: string }[] = [
  { key: "new", label: "New" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
];

interface Props {
  counts: CountsByStatus;
  active: AlertStatus | null;
  onSelect: (status: AlertStatus | null) => void;
}

export default function SummaryBar({ counts, active, onSelect }: Props) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
      {ORDER.map(({ key, label }) => {
        const selected = active === key;
        return (
          <Card
            key={key}
            variant="outlined"
            sx={{ borderColor: selected ? STATUS_COLORS[key] : "divider", borderWidth: selected ? 2 : 1 }}
          >
            <CardActionArea onClick={() => onSelect(selected ? null : key)} sx={{ p: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, color: STATUS_COLORS[key] }}>
                {counts[key] ?? 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
}
