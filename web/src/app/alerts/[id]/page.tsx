"use client";

import CheckIcon from "@mui/icons-material/Check";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import UndoIcon from "@mui/icons-material/Undo";
import BlockIcon from "@mui/icons-material/Block";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/theme/ColorModeProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { apiErrorMessage } from "@/lib/apiError";
import {
  useGetAlertQuery,
  useAcknowledgeMutation,
  useDismissMutation,
  useReopenMutation,
  useAddNoteMutation,
} from "@/features/alerts/api/knaqApi";
import ResolveDialog from "@/features/alerts/components/ResolveDialog";
import AssignDialog from "@/features/alerts/components/AssignDialog";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const alertId = Number(id);
  const router = useRouter();
  const { toast } = useToast();

  const { data: alert, isLoading, isError } = useGetAlertQuery(alertId);
  const [acknowledge] = useAcknowledgeMutation();
  const [dismiss] = useDismissMutation();
  const [reopen] = useReopenMutation();
  const [addNote] = useAddNoteMutation();

  const [showResolve, setShowResolve] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [note, setNote] = useState("");

  async function handleAck() {
    try { await acknowledge(alertId).unwrap(); toast("Acknowledged", "success"); }
    catch (e) { toast(apiErrorMessage(e), "error"); }
  }

  async function handleDismiss() {
    try { await dismiss(alertId).unwrap(); toast("Dismissed", "success"); }
    catch (e) { toast(apiErrorMessage(e), "error"); }
  }

  async function handleReopen() {
    try { await reopen(alertId).unwrap(); toast("Reopened", "success"); }
    catch (e) { toast(apiErrorMessage(e), "error"); }
  }

  async function handleNote() {
    if (!note.trim()) return;
    try {
      await addNote({ id: alertId, note: note.trim() }).unwrap();
      setNote("");
      toast("Note added", "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (isError || !alert) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography color="error">Alert not found.</Typography>
        <Button sx={{ mt: 2 }} onClick={() => router.push("/alerts")}>Back to queue</Button>
      </Box>
    );
  }

  const isTerminal = alert.status === "resolved" || alert.status === "dismissed";

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mb: 3 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>
          {alert.title}
        </Typography>
        <Chip
          label={alert.severity}
          size="small"
          sx={{ bgcolor: SEVERITY_COLORS[alert.severity], color: "#fff", textTransform: "capitalize", fontWeight: 600 }}
        />
        <Chip
          label={alert.status}
          size="small"
          sx={{ bgcolor: STATUS_COLORS[alert.status], color: "#fff", textTransform: "capitalize", fontWeight: 600 }}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Device:</strong> {alert.deviceName} ({alert.deviceId})
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Location:</strong> {alert.location}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Triggered:</strong> {dayjs(alert.ts).fromNow()} ({new Date(alert.ts).toLocaleString()})
        </Typography>
      </Box>

      {alert.readingValue != null && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, display: "inline-flex", gap: 4 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Reading ({alert.readingName})</Typography>
            <Typography variant="h4" fontWeight={700} color={SEVERITY_COLORS[alert.severity]}>
              {alert.readingValue}
            </Typography>
          </Box>
          {alert.threshold != null && (
            <Box>
              <Typography variant="caption" color="text.secondary">Threshold</Typography>
              <Typography variant="h4" fontWeight={700}>{alert.threshold}</Typography>
            </Box>
          )}
        </Paper>
      )}

      <Box sx={{ display: "flex", gap: 1, mb: 3, flexWrap: "wrap" }}>
        {alert.status === "new" && (
          <Button variant="contained" startIcon={<CheckIcon />} onClick={handleAck}>
            Acknowledge
          </Button>
        )}
        {alert.status === "acknowledged" && (
          <Button variant="contained" color="success" startIcon={<CheckIcon />} onClick={() => setShowResolve(true)}>
            Resolve
          </Button>
        )}
        {!isTerminal && (
          <Button variant="outlined" startIcon={<BlockIcon />} onClick={handleDismiss}>
            Dismiss
          </Button>
        )}
        {isTerminal && (
          <Button variant="outlined" startIcon={<UndoIcon />} onClick={handleReopen}>
            Reopen
          </Button>
        )}
        {!isTerminal && (
          <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setShowAssign(true)}>
            {alert.assignedTo ? "Reassign" : "Assign"}
          </Button>
        )}
      </Box>

      {alert.assignedTo && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" mb={0.5}>Assigned to</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: "secondary.main" }}>
              {initials(alert.assignedTo.name)}
            </Avatar>
            <Box>
              <Typography variant="body2">{alert.assignedTo.name}</Typography>
              <Typography variant="caption" color="text.secondary">{alert.assignedTo.role}</Typography>
            </Box>
          </Box>
        </Box>
      )}

      {alert.resolution && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" mb={1}>Resolution</Typography>
          <Typography variant="body2"><strong>Type:</strong> {alert.resolution.type.replace("_", " ")}</Typography>
          <Typography variant="body2"><strong>Root cause:</strong> {alert.resolution.rootCause}</Typography>
          <Typography variant="body2"><strong>Action taken:</strong> {alert.resolution.actionTaken}</Typography>
          {alert.resolution.preventiveMeasures && (
            <Typography variant="body2"><strong>Preventive measures:</strong> {alert.resolution.preventiveMeasures}</Typography>
          )}
          {alert.resolution.timeSpentMinutes != null && (
            <Typography variant="body2"><strong>Time spent:</strong> {alert.resolution.timeSpentMinutes} min</Typography>
          )}
        </Paper>
      )}

      <Divider sx={{ mb: 2 }} />

      <Typography variant="subtitle1" fontWeight={700} mb={2}>Timeline</Typography>
      <Box sx={{ mb: 3 }}>
        {(alert.timeline ?? []).map((event, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1.5, mb: 1.5, position: "relative" }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: "primary.main",
                mt: 0.7,
                flexShrink: 0,
              }}
            />
            <Box>
              <Typography variant="body2">
                <strong>{event.user}</strong> — {event.action}
                {event.details && ` — ${event.details}`}
              </Typography>
              {event.note && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  "{event.note}"
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {dayjs(event.timestamp).fromNow()} ({new Date(event.timestamp).toLocaleString()})
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {!isTerminal && (
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Add a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNote(); } }}
          />
          <Button variant="outlined" disabled={!note.trim()} onClick={handleNote}>
            Add Note
          </Button>
        </Box>
      )}

      {showResolve && <ResolveDialog alertId={alertId} onClose={() => setShowResolve(false)} />}
      {showAssign && <AssignDialog ids={[alertId]} onClose={() => setShowAssign(false)} />}
    </Box>
  );
}
