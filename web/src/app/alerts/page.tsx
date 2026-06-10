"use client";

import CheckIcon from "@mui/icons-material/Check";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Pagination from "@mui/material/Pagination";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useState } from "react";

import AlertTable from "@/features/alerts/components/AlertTable";
import AssignDialog from "@/features/alerts/components/AssignDialog";
import FilterBar from "@/features/alerts/components/FilterBar";
import SummaryBar from "@/features/alerts/components/SummaryBar";
import { summarizeBulk } from "@/features/alerts/bulkSummary";
import {
  PAGE_SIZE,
  useBulkAcknowledgeMutation,
  useListAlertsQuery,
  useListDevicesQuery,
} from "@/features/alerts/api/knaqApi";
import { setPage, setStatusOnly } from "@/features/alerts/slices/filtersSlice";
import type { Alert as AlertType } from "@/features/alerts/types";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";

export default function AlertsPage() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((s) => s.filters);
  const { data, isLoading, isFetching, isError, error, refetch } = useListAlertsQuery(filters);
  const { data: devicesData } = useListDevicesQuery();
  const [bulkAcknowledge, { isLoading: bulkAcking }] = useBulkAcknowledgeMutation();
  const { showSuccess, showError } = useToast();

  const [assignTarget, setAssignTarget] = useState<AlertType | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  // Server sorts + paginates now — render the page rows as-is.
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (filters.page - 1) * PAGE_SIZE + rows.length;

  const activeStatus = filters.status.length === 1 ? filters.status[0] : null;

  const clearSelection = () => setSelectedIds([]);
  const toggle = (id: number) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const toggleAll = () =>
    setSelectedIds((ids) => (ids.length === rows.length ? [] : rows.map((a) => a.id)));

  const handlePage = (page: number) => {
    clearSelection(); // selections are per-page — ids on other pages shouldn't linger
    dispatch(setPage(page));
  };

  const handleBulkAcknowledge = async () => {
    try {
      const res = await bulkAcknowledge(selectedIds).unwrap();
      const { message, allOk } = summarizeBulk(res, "acknowledged");
      allOk ? showSuccess(message) : showError(message);
      clearSelection();
    } catch (err) {
      showError(apiErrorMessage(err));
    }
  };

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

      {selectedIds.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            mb: 2, px: 2, py: 1, display: "flex", alignItems: "center", gap: 1,
            borderColor: "primary.main", bgcolor: "action.hover",
          }}
        >
          <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>{selectedIds.length} selected</Typography>
          <Button size="small" startIcon={<CheckIcon />} disabled={bulkAcking} onClick={handleBulkAcknowledge}>
            Acknowledge
          </Button>
          <Button size="small" startIcon={<PersonAddIcon />} onClick={() => setBulkAssignOpen(true)}>
            Assign
          </Button>
          <Button size="small" color="inherit" onClick={clearSelection}>
            Clear
          </Button>
        </Paper>
      )}

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
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>
            No alerts match your filters
          </Typography>
          <Typography color="text.secondary">Try clearing filters or selecting a different status.</Typography>
        </Paper>
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: "opacity .15s" }}>
          <AlertTable
            alerts={rows}
            onAssign={setAssignTarget}
            selectedIds={selectedIds}
            onToggle={toggle}
            onToggleAll={toggleAll}
          />
          <Box
            sx={{
              mt: 2, display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Showing {rangeStart}–{rangeEnd} of {total}
            </Typography>
            {pageCount > 1 && (
              <Pagination
                count={pageCount}
                page={filters.page}
                onChange={(_, p) => handlePage(p)}
                color="primary"
                shape="rounded"
              />
            )}
          </Box>
        </Box>
      )}

      <AssignDialog alert={assignTarget} open={assignTarget !== null} onClose={() => setAssignTarget(null)} />
      <AssignDialog
        alert={null}
        bulkIds={selectedIds}
        open={bulkAssignOpen}
        onClose={() => {
          setBulkAssignOpen(false);
          clearSelection();
        }}
      />
    </Box>
  );
}
