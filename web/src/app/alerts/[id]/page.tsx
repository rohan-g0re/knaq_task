"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import AddNoteForm from "@/features/alerts/components/AddNoteForm";
import AssigneeCell from "@/features/alerts/components/AssigneeCell";
import AssignDialog from "@/features/alerts/components/AssignDialog";
import MetricCard from "@/features/alerts/components/MetricCard";
import ResolveDialog from "@/features/alerts/components/ResolveDialog";
import SeverityChip from "@/features/alerts/components/SeverityChip";
import StatusBadge from "@/features/alerts/components/StatusBadge";
import Timeline from "@/features/alerts/components/Timeline";
import { useGetAlertQuery } from "@/features/alerts/api/knaqApi";
import { useAlertActions } from "@/features/alerts/hooks/useAlertActions";
import { apiErrorMessage } from "@/lib/apiError";

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data: alert, isLoading, isError, error, refetch } = useGetAlertQuery(id);
  const { onAcknowledge, acknowledging } = useAlertActions();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const back = (
    <Button component={Link} href="/alerts" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
      Back to queue
    </Button>
  );

  if (isLoading) {
    return (
      <Box>
        {back}
        <Skeleton variant="rounded" height={500} />
      </Box>
    );
  }
  if (isError || !alert) {
    return (
      <Box>
        {back}
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
      </Box>
    );
  }

  const isNew = alert.status === "new";
  const isAck = alert.status === "acknowledged";
  const terminal = alert.status === "resolved" || alert.status === "dismissed";

  return (
    <Box>
      {back}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 0.5 }}>
        <SeverityChip severity={alert.severity} size="medium" />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {alert.title}
        </Typography>
        <StatusBadge status={alert.status} />
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {alert.deviceName} · {alert.location}
      </Typography>

      {/* Contextual actions — backend is the source of truth; buttons are a hint. */}
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        {isNew && (
          <Button variant="contained" disabled={acknowledging} onClick={() => onAcknowledge(alert.id)}>
            Acknowledge
          </Button>
        )}
        {isAck && (
          <Button variant="contained" color="success" onClick={() => setResolveOpen(true)}>
            Resolve
          </Button>
        )}
        {!terminal && (
          <Button variant="outlined" onClick={() => setAssignOpen(true)}>
            {alert.assignedTo ? "Reassign" : "Assign"}
          </Button>
        )}
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <Stack spacing={2}>
            <MetricCard alert={alert} />

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Assignment
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <AssigneeCell user={alert.assignedTo} />
                {!terminal && (
                  <Button size="small" onClick={() => setAssignOpen(true)}>
                    Change
                  </Button>
                )}
              </Box>
            </Paper>

            {alert.resolution && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Resolution
                </Typography>
                <Typography variant="body2">
                  <b>Type:</b> {alert.resolution.type}
                </Typography>
                <Typography variant="body2">
                  <b>Root cause:</b> {alert.resolution.rootCause}
                </Typography>
                <Typography variant="body2">
                  <b>Action taken:</b> {alert.resolution.actionTaken}
                </Typography>
                {alert.resolution.preventiveMeasures && (
                  <Typography variant="body2">
                    <b>Preventive:</b> {alert.resolution.preventiveMeasures}
                  </Typography>
                )}
                {alert.resolution.timeSpentMinutes != null && (
                  <Typography variant="body2">
                    <b>Time spent:</b> {alert.resolution.timeSpentMinutes} min
                  </Typography>
                )}
              </Paper>
            )}
          </Stack>
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Timeline
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Timeline entries={alert.timeline ?? []} />
            <AddNoteForm alertId={alert.id} />
          </Paper>
        </Grid>
      </Grid>

      <ResolveDialog alertId={alert.id} open={resolveOpen} onClose={() => setResolveOpen(false)} />
      <AssignDialog alert={alert} open={assignOpen} onClose={() => setAssignOpen(false)} />
    </Box>
  );
}
