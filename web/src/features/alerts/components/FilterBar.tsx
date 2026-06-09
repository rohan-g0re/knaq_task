"use client";

import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

import type { AlertStatus, Device, Severity } from "../types";
import { useListUsersQuery } from "../api/knaqApi";
import {
  clearFilters,
  setAssignee,
  setDevice,
  setQuery,
  setSort,
  toggleSeverity,
  toggleStatus,
  type SortKey,
} from "../slices/filtersSlice";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { SEVERITY_COLORS, STATUS_COLORS } from "@/lib/theme/theme";

const SEVERITIES: Severity[] = ["critical", "warning", "info"];
const STATUSES: { value: AlertStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

export default function FilterBar({ devices }: { devices: Device[] }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.filters);
  const { data: usersData } = useListUsersQuery();
  const users = usersData?.data ?? [];

  return (
    <Stack spacing={1.5} sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Severity
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
            {SEVERITIES.map((sev) => {
              const on = filters.severity.includes(sev);
              return (
                <Chip
                  key={sev}
                  label={sev}
                  size="small"
                  clickable
                  onClick={() => dispatch(toggleSeverity(sev))}
                  variant={on ? "filled" : "outlined"}
                  sx={{
                    textTransform: "capitalize",
                    ...(on ? { bgcolor: SEVERITY_COLORS[sev], color: "#fff" } : { borderColor: SEVERITY_COLORS[sev] }),
                  }}
                />
              );
            })}
          </Box>
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Status
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 0.5 }}>
            {STATUSES.map(({ value, label }) => {
              const on = filters.status.includes(value);
              const color = STATUS_COLORS[value];
              return (
                <Chip
                  key={value}
                  label={label}
                  size="small"
                  clickable
                  onClick={() => dispatch(toggleStatus(value))}
                  variant={on ? "filled" : "outlined"}
                  sx={{
                    fontWeight: 600,
                    color: on ? "#fff" : color,
                    borderColor: color,
                    ...(on ? { bgcolor: color } : { bgcolor: alpha(color, 0.08) }),
                  }}
                />
              );
            })}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Search title or device…"
          value={filters.q}
          onChange={(e) => dispatch(setQuery(e.target.value))}
          sx={{ flexGrow: 1, minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          label="Device"
          value={filters.deviceId ?? ""}
          onChange={(e) => dispatch(setDevice(e.target.value || null))}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">All devices</MenuItem>
          {devices.map((d) => (
            <MenuItem key={d.deviceId} value={d.deviceId}>
              {d.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Assignee"
          value={filters.assignedTo ?? ""}
          onChange={(e) => dispatch(setAssignee(e.target.value === "" ? null : Number(e.target.value)))}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="">Anyone</MenuItem>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              {u.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Sort by"
          value={filters.sort}
          onChange={(e) => dispatch(setSort(e.target.value as SortKey))}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="time">Newest</MenuItem>
          <MenuItem value="severity">Severity</MenuItem>
          <MenuItem value="status">Status</MenuItem>
        </TextField>
        <Button startIcon={<ClearIcon />} onClick={() => dispatch(clearFilters())}>
          Clear
        </Button>
      </Box>
    </Stack>
  );
}
