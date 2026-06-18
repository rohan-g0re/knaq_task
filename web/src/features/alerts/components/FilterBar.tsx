"use client";

import ClearIcon from "@mui/icons-material/Clear";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "@/lib/store";
import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/theme/ColorModeProvider";
import {
  clearFilters,
  setAssignedTo,
  setDeviceId,
  setQ,
  setSeverity,
  setSort,
  setStatus,
} from "../slices/filtersSlice";
import type { AlertStatus, KnaqUser, Device, Severity } from "../types";

const SEVERITIES: Severity[] = ["critical", "warning", "info"];
const STATUSES: AlertStatus[] = ["new", "acknowledged", "resolved", "dismissed"];

interface Props {
  devices: Device[];
  users: KnaqUser[];
}

export default function FilterBar({ devices, users }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const filters = useSelector((s: RootState) => s.filters);

  function toggleSeverity(sev: Severity) {
    const next = filters.severity.includes(sev)
      ? filters.severity.filter((s) => s !== sev)
      : [...filters.severity, sev];
    dispatch(setSeverity(next));
  }

  function toggleStatus(st: AlertStatus) {
    const next = filters.status.includes(st)
      ? filters.status.filter((s) => s !== st)
      : [...filters.status, st];
    dispatch(setStatus(next));
  }

  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
      {SEVERITIES.map((sev) => (
        <Chip
          key={sev}
          label={sev}
          onClick={() => toggleSeverity(sev)}
          variant={filters.severity.includes(sev) ? "filled" : "outlined"}
          sx={{
            borderColor: SEVERITY_COLORS[sev],
            color: filters.severity.includes(sev) ? "#fff" : SEVERITY_COLORS[sev],
            bgcolor: filters.severity.includes(sev) ? SEVERITY_COLORS[sev] : undefined,
            textTransform: "capitalize",
            cursor: "pointer",
          }}
        />
      ))}
      {STATUSES.map((st) => (
        <Chip
          key={st}
          label={st}
          onClick={() => toggleStatus(st)}
          variant={filters.status.includes(st) ? "filled" : "outlined"}
          sx={{
            borderColor: STATUS_COLORS[st],
            color: filters.status.includes(st) ? "#fff" : STATUS_COLORS[st],
            bgcolor: filters.status.includes(st) ? STATUS_COLORS[st] : undefined,
            textTransform: "capitalize",
            cursor: "pointer",
          }}
        />
      ))}

      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Device</InputLabel>
        <Select
          value={filters.deviceId}
          label="Device"
          onChange={(e) => dispatch(setDeviceId(e.target.value))}
        >
          <MenuItem value="">All devices</MenuItem>
          {devices.map((d) => (
            <MenuItem key={d.deviceId} value={d.deviceId}>
              {d.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>Assignee</InputLabel>
        <Select
          value={filters.assignedTo ?? ""}
          label="Assignee"
          onChange={(e) => dispatch(setAssignedTo(e.target.value === "" ? null : Number(e.target.value)))}
        >
          <MenuItem value="">All assignees</MenuItem>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel>Sort</InputLabel>
        <Select
          value={filters.sort}
          label="Sort"
          onChange={(e) => dispatch(setSort(e.target.value as "time" | "severity" | "status"))}
        >
          <MenuItem value="time">Time</MenuItem>
          <MenuItem value="severity">Severity</MenuItem>
          <MenuItem value="status">Status</MenuItem>
        </Select>
      </FormControl>

      <TextField
        size="small"
        placeholder="Search…"
        value={filters.q}
        onChange={(e) => dispatch(setQ(e.target.value))}
        sx={{ minWidth: 180 }}
      />

      <Tooltip title="Clear filters">
        <IconButton onClick={() => dispatch(clearFilters())}>
          <ClearIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
