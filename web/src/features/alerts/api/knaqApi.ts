import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  Alert,
  AlertFilters,
  AlertListResponse,
  AssignPayload,
  Device,
  NotePayload,
  ResolvePayload,
  TeamUser,
} from "../types";

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000",
  prepareHeaders: (headers) => {
    const token = process.env.NEXT_PUBLIC_API_TOKEN;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

function buildAlertQuery(filters: AlertFilters): string {
  const params = new URLSearchParams();
  filters.severity.forEach((s) => params.append("severity", s));
  filters.status.forEach((s) => params.append("status", s));
  if (filters.deviceId) params.set("device_id", filters.deviceId);
  if (filters.assignedTo != null) params.set("assigned_to", String(filters.assignedTo));
  if (filters.q.trim()) params.set("q", filters.q.trim());
  const qs = params.toString();
  return qs ? `/alerts?${qs}` : "/alerts";
}

export const knaqApi = createApi({
  reducerPath: "knaqApi",
  baseQuery,
  tagTypes: ["Alert", "Device", "User"],
  endpoints: (build) => ({
    listAlerts: build.query<AlertListResponse, AlertFilters>({
      query: buildAlertQuery,
      providesTags: ["Alert"],
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
  }),
});

export const {
  useListAlertsQuery,
  useGetAlertQuery,
  useListDevicesQuery,
  useListUsersQuery,
  useAcknowledgeMutation,
  useAssignMutation,
  useResolveMutation,
  useAddNoteMutation,
  useDismissMutation,
  useReopenMutation,
} = knaqApi;
