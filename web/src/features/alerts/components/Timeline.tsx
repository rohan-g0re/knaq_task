"use client";

import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import NoteIcon from "@mui/icons-material/StickyNote2";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import ReplayIcon from "@mui/icons-material/Replay";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { TimelineEntry } from "../types";
import dayjs from "@/lib/dayjs";

const ICONS: Record<string, React.ReactNode> = {
  created: <RadioButtonCheckedIcon fontSize="small" />,
  acknowledged: <CheckCircleIcon fontSize="small" />,
  assigned: <AssignmentIndIcon fontSize="small" />,
  resolved: <TaskAltIcon fontSize="small" />,
  note: <NoteIcon fontSize="small" />,
  dismissed: <BlockIcon fontSize="small" />,
  reopened: <ReplayIcon fontSize="small" />,
};

const ACTION_LABEL: Record<string, string> = {
  created: "Alert created",
  acknowledged: "Acknowledged",
  assigned: "Assigned",
  resolved: "Resolved",
  note: "Note added",
  dismissed: "Dismissed",
  reopened: "Reopened",
};

export default function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Box>
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        return (
          <Box key={i} sx={{ display: "flex", gap: 2 }}>
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "action.selected",
                  color: "secondary.main",
                }}
              >
                {ICONS[e.action] ?? <RadioButtonCheckedIcon fontSize="small" />}
              </Box>
              {!last && <Box sx={{ flexGrow: 1, width: 2, bgcolor: "divider", my: 0.5 }} />}
            </Box>
            <Box sx={{ pb: last ? 0 : 3, flexGrow: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {ACTION_LABEL[e.action] ?? e.action}
                {e.user ? ` · ${e.user}` : ""}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dayjs.utc(e.timestamp).format("MMM D, YYYY HH:mm")} UTC · {dayjs.utc(e.timestamp).fromNow()}
              </Typography>
              {e.details && (
                <Typography variant="body2" color="text.secondary">
                  {e.details}
                </Typography>
              )}
              {e.note && (
                <Typography
                  variant="body2"
                  sx={{ mt: 0.5, p: 1, bgcolor: "action.hover", borderRadius: 1, fontStyle: "italic" }}
                >
                  “{e.note}”
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
