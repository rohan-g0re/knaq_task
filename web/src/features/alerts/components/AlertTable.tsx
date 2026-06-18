"use client";

import CheckIcon from "@mui/icons-material/Check";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Pagination from "@mui/material/Pagination";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/theme/ColorModeProvider";
import { useToast } from "@/lib/toast/ToastProvider";
import { apiErrorMessage } from "@/lib/apiError";
import type { AppDispatch, RootState } from "@/lib/store";
import { setPage } from "../slices/filtersSlice";
import type { KnaqAlert } from "../types";
import { useAcknowledgeMutation, useBulkAcknowledgeMutation } from "../api/knaqApi";
import AssignDialog from "./AssignDialog";

interface Props {
  alerts: KnaqAlert[];
  total: number;
  pageSize: number;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export default function AlertTable({ alerts, total, pageSize, loading, error, onRetry }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const page = useSelector((s: RootState) => s.filters.page);
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [assignTarget, setAssignTarget] = useState<number[] | null>(null);
  const router = useRouter();

  const [acknowledge] = useAcknowledgeMutation();
  const [bulkAcknowledge] = useBulkAcknowledgeMutation();

  async function handleAck(id: number) {
    try {
      await acknowledge(id).unwrap();
      toast("Alert acknowledged", "success");
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  }

  async function handleBulkAck() {
    try {
      const result = await bulkAcknowledge(selected).unwrap();
      const ok = (result.results as {ok: boolean}[]).filter((r) => r.ok).length;
      toast(`${ok} acknowledged`, "success");
      setSelected([]);
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const pageCount = Math.ceil(total / pageSize);

  if (error) {
    return (
      <Box sx={{ textAlign: "center", py: 6 }}>
        <Typography color="error" mb={2}>Failed to load alerts.</Typography>
        <Button variant="outlined" onClick={onRetry}>Retry</Button>
      </Box>
    );
  }

  return (
    <Paper variant="outlined">
      {selected.length > 0 && (
        <Box sx={{ px: 2, py: 1, display: "flex", gap: 1, alignItems: "center", bgcolor: "action.selected" }}>
          <Typography variant="body2">{selected.length} selected</Typography>
          <Button size="small" startIcon={<CheckIcon />} onClick={handleBulkAck}>Acknowledge</Button>
          <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setAssignTarget(selected)}>Assign</Button>
          <Button size="small" onClick={() => setSelected([])}>Clear</Button>
        </Box>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Severity</TableCell>
            <TableCell>Alert</TableCell>
            <TableCell>Device</TableCell>
            <TableCell>Triggered</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Assignee</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton /></TableCell>
                  ))}
                </TableRow>
              ))
            : alerts.length === 0
            ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
                  No alerts match the current filters.
                </TableCell>
              </TableRow>
            )
            : alerts.map((alert) => (
              <TableRow
                key={alert.id}
                hover
                selected={selected.includes(alert.id)}
                onClick={() => router.push(`/alerts/${alert.id}`)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.includes(alert.id)}
                    onChange={() => toggleSelect(alert.id)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: SEVERITY_COLORS[alert.severity],
                      display: "inline-block",
                      mr: 0.5,
                    }}
                  />
                  <Typography variant="caption" sx={{ textTransform: "capitalize" }}>
                    {alert.severity}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{alert.title}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{alert.deviceName}</Typography>
                  <Typography variant="caption" color="text.secondary">{alert.location}</Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title={new Date(alert.ts).toLocaleString()}>
                    <Typography variant="caption">{dayjs(alert.ts).fromNow()}</Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Chip
                    label={alert.status}
                    size="small"
                    sx={{
                      bgcolor: STATUS_COLORS[alert.status],
                      color: "#fff",
                      textTransform: "capitalize",
                      fontWeight: 600,
                    }}
                  />
                </TableCell>
                <TableCell>
                  {alert.assignedTo ? (
                    <Tooltip title={alert.assignedTo.name}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: 11, bgcolor: "secondary.main" }}>
                        {initials(alert.assignedTo.name)}
                      </Avatar>
                    </Tooltip>
                  ) : (
                    <Typography variant="caption" color="text.disabled">Unassigned</Typography>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    {alert.status === "new" && (
                      <Tooltip title="Acknowledge">
                        <IconButton size="small" onClick={() => handleAck(alert.id)}>
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Assign">
                      <IconButton size="small" onClick={() => setAssignTarget([alert.id])}>
                        <PersonAddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="View">
                      <IconButton size="small" component={Link} href={`/alerts/${alert.id}`}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={(_e, v) => dispatch(setPage(v))}
            color="primary"
          />
        </Box>
      )}
      {assignTarget && (
        <AssignDialog ids={assignTarget} onClose={() => setAssignTarget(null)} />
      )}
    </Paper>
  );
}
