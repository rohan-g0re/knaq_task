"use client";

import CheckIcon from "@mui/icons-material/Check";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import VisibilityIcon from "@mui/icons-material/Visibility";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "next/link";

import type { Alert } from "../types";
import AssigneeCell from "./AssigneeCell";
import RelativeTime from "./RelativeTime";
import SeverityChip from "./SeverityChip";
import StatusBadge from "./StatusBadge";
import { useAlertActions } from "../hooks/useAlertActions";

interface Props {
  alerts: Alert[];
  onAssign: (alert: Alert) => void;
}

export default function AlertTable({ alerts, onAssign }: Props) {
  const { onAcknowledge, busy } = useAlertActions();

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Severity</TableCell>
            <TableCell>Alert</TableCell>
            <TableCell>Device</TableCell>
            <TableCell>Triggered</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Assignee</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {alerts.map((a) => (
            <TableRow key={a.id} hover>
              <TableCell>
                <SeverityChip severity={a.severity} />
              </TableCell>
              <TableCell>
                <Typography
                  component={Link}
                  href={`/alerts/${a.id}`}
                  variant="body2"
                  sx={{ fontWeight: 600, color: "text.primary", textDecoration: "none", "&:hover": { color: "secondary.main" } }}
                >
                  {a.title}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{a.deviceName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.location}
                </Typography>
              </TableCell>
              <TableCell>
                <RelativeTime iso={a.ts} tz={a.deviceTimezone} />
              </TableCell>
              <TableCell>
                <StatusBadge status={a.status} />
              </TableCell>
              <TableCell>
                <AssigneeCell user={a.assignedTo} />
              </TableCell>
              <TableCell align="right">
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  {a.status === "new" && (
                    <Tooltip title="Acknowledge">
                      <span>
                        <IconButton size="small" disabled={busy} onClick={() => onAcknowledge(a.id)}>
                          <CheckIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  {a.status !== "resolved" && a.status !== "dismissed" && (
                    <Tooltip title="Assign">
                      <IconButton size="small" onClick={() => onAssign(a)}>
                        <PersonAddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="View detail">
                    <IconButton size="small" component={Link} href={`/alerts/${a.id}`}>
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
