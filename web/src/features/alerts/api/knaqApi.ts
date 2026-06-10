import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  Alert,
  AlertListResponse,
  AssignPayload,
  BulkAssignPayload,
  BulkResponse,
  Device,
  NotePayload,
  ResolvePayload,
  Stats,
  TeamUser,
} from "../types";
import type { FiltersState } from "../slices/filtersSlice";

export const PAGE_SIZE = 10;

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000",
  prepareHeaders: (headers) => {
    const token = process.env.NEXT_PUBLIC_API_TOKEN;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

function buildAlertQuery(filters: FiltersState): string {
  const params = new URLSearchParams();
  filters.severity.forEach((s) => params.append("severity", s));
  filters.status.forEach((s) => params.append("status", s));
  if (filters.deviceId) params.set("device_id", filters.deviceId);
  if (filters.assignedTo != null) params.set("assigned_to", String(filters.assignedTo));
  if (filters.q.trim()) params.set("q", filters.q.trim());
  // Server-side paging + sort: keeps paging consistent with filters/sort across the whole set.
  params.set("sort", filters.sort);
  params.set("page", String(filters.page));
  params.set("page_size", String(PAGE_SIZE));
  return `/alerts?${params.toString()}`;
}

export const knaqApi = createApi({
  reducerPath: "knaqApi",
  baseQuery,
  tagTypes: ["Alert", "Device", "User"],
  endpoints: (build) => ({
    listAlerts: build.query<AlertListResponse, FiltersState>({
      query: buildAlertQuery,
      providesTags: ["Alert"],
    }),
    getStats: build.query<Stats, void>({
      query: () => "/alerts/stats",
      providesTags: ["Alert"], // refreshes after any alert mutation (acknowledge/resolve/dismiss)
    }),
    getAlert: build.query<Alert, number>({
      query: (id) => `/alerts/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Alert", id }],
    }),
    listDevices: build.query<{ data: Device[] }, void>({
      query: () => "/devices",
      providesTags: ["Device"],
    }),
    listUsers: build.query<{ data: TeamUser[] }, void>({
      query: () => "/users",
      providesTags: ["User"],
    }),

    // Mutations are pessimistic by default: await the server, then invalidate so queue + detail
    // refetch. acknowledge is additionally optimistic (see onQueryStarted) and rolls back on error.
    acknowledge: build.mutation<Alert, number>({
      query: (id) => ({ url: `/alerts/${id}/acknowledge`, method: "POST" }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          knaqApi.util.updateQueryData("getAlert", id, (draft) => {
            draft.status = "acknowledged";
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo(); // server rejected -> reconcile the UI back to truth
        }
      },
      invalidatesTags: (_r, _e, id) => ["Alert", { type: "Alert", id }],
    }),
    dismiss: build.mutation<Alert, number>({
      query: (id) => ({ url: `/alerts/${id}/dismiss`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => ["Alert", { type: "Alert", id }],
    }),
    reopen: build.mutation<Alert, number>({
      query: (id) => ({ url: `/alerts/${id}/reopen`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => ["Alert", { type: "Alert", id }],
    }),
    assign: build.mutation<Alert, AssignPayload>({
      query: ({ id, ...body }) => ({ url: `/alerts/${id}/assign`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => ["Alert", { type: "Alert", id }],
    }),
    resolve: build.mutation<Alert, ResolvePayload>({
      query: ({ id, ...body }) => ({ url: `/alerts/${id}/resolve`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => ["Alert", { type: "Alert", id }],
    }),
    addNote: build.mutation<Alert, NotePayload>({
      query: ({ id, note }) => ({ url: `/alerts/${id}/notes`, method: "POST", body: { note } }),
      invalidatesTags: (_r, _e, { id }) => ["Alert", { type: "Alert", id }],
    }),

    // Bulk: one request, server applies per-id and returns per-id outcomes (some may 409/404).
    bulkAcknowledge: build.mutation<BulkResponse, number[]>({
      query: (ids) => ({ url: "/alerts/bulk/acknowledge", method: "POST", body: { ids } }),
      invalidatesTags: ["Alert"],
    }),
    bulkAssign: build.mutation<BulkResponse, BulkAssignPayload>({
      query: (body) => ({ url: "/alerts/bulk/assign", method: "POST", body }),
      invalidatesTags: ["Alert"],
    }),
  }),
});

export const {
  useListAlertsQuery,
  useGetStatsQuery,
  useGetAlertQuery,
  useListDevicesQuery,
  useListUsersQuery,
  useAcknowledgeMutation,
  useAssignMutation,
  useResolveMutation,
  useAddNoteMutation,
  useDismissMutation,
  useReopenMutation,
  useBulkAcknowledgeMutation,
  useBulkAssignMutation,
} = knaqApi;
