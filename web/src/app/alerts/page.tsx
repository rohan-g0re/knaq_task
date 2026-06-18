"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useSelector } from "react-redux";

import type { RootState } from "@/lib/store";
import AlertTable from "@/features/alerts/components/AlertTable";
import FilterBar from "@/features/alerts/components/FilterBar";
import SummaryBar from "@/features/alerts/components/SummaryBar";
import { useListAlertsQuery, useListDevicesQuery, useListUsersQuery } from "@/features/alerts/api/knaqApi";
import type { AlertStatus } from "@/features/alerts/types";

const EMPTY_COUNTS: Record<AlertStatus, number> = { new: 0, acknowledged: 0, resolved: 0, dismissed: 0 };

export default function AlertsPage() {
  const filters = useSelector((s: RootState) => s.filters);

  const { data, isLoading, isError, refetch } = useListAlertsQuery(filters);
  const { data: devicesData } = useListDevicesQuery();
  const { data: usersData } = useListUsersQuery();

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={2}>
        Alert Queue
      </Typography>
      <SummaryBar counts={data?.counts_by_status ?? EMPTY_COUNTS} />
      <FilterBar devices={devicesData?.data ?? []} users={usersData?.data ?? []} />
      <AlertTable
        alerts={data?.data ?? []}
        total={data?.total ?? 0}
        pageSize={data?.page_size ?? 10}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
      />
    </Box>
  );
}
