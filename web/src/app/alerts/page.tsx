"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";

import AlertTable from "@/features/alerts/components/AlertTable";
import AssignDialog from "@/features/alerts/components/AssignDialog";
import FilterBar from "@/features/alerts/components/FilterBar";
import SummaryBar from "@/features/alerts/components/SummaryBar";
import { useListAlertsQuery, useListDevicesQuery } from "@/features/alerts/api/knaqApi";
import { setStatusOnly } from "@/features/alerts/slices/filtersSlice";
import type { Alert as AlertType, Severity } from "@/features/alerts/types";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { apiErrorMessage } from "@/lib/apiError";

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const STATUS_RANK: Record<string, number> = { new: 0, acknowledged: 1, resolved: 2, dismissed: 3 };

export default function AlertsPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.filters);
  const { data, isLoading, isFetching, isError, error, refetch } = useListAlertsQuery(filters);
  const { data: devicesData } = useListDevicesQuery();
  const [assignTarget, setAssignTarget] = useState<AlertType | null>(null);

  const sorted = useMemo(() => {
    const rows = [...(data?.data ?? [])];
    if (filters.sort === "severity") rows.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    else if (filters.sort === "status") rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    // "time" keeps the server's newest-first ordering.
    return rows;
  }, [data, filters.sort]);

  const activeStatus = filters.status.length === 1 ? filters.status[0] : null;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Alert Queue
      </Typography>

      <SummaryBar
        counts={data?.counts_by_status ?? { new: 0, acknowledged: 0, resolved: 0, dismissed: 0 }}
        active={activeStatus}
        onSelect={(status) => dispatch(setStatusOnly(status))}
      />

      <FilterBar devices={devicesData?.data ?? []} />

      {isError ? (
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
      ) : isLoading ? (
        <Skeleton variant="rounded" height={400} />
      ) : sorted.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>
            No alerts match your filters
          </Typography>
          <Typography color="text.secondary">Try clearing filters or selecting a different status.</Typography>
        </Paper>
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: "opacity .15s" }}>
          <AlertTable alerts={sorted} onAssign={setAssignTarget} />
        </Box>
      )}

      <AssignDialog alert={assignTarget} open={assignTarget !== null} onClose={() => setAssignTarget(null)} />
    </Box>
  );
}
