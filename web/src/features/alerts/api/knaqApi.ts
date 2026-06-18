import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "@/lib/store";
import type {
  AlertsResponse,
  AlertStats,
  DevicesResponse,
  KnaqAlert,
  UsersResponse,
} from "../types";
import type { FiltersState } from "../slices/filtersSlice";

export const knaqApi = createApi({
  reducerPath: "knaqApi",
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000",
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).session.token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Alert", "Device", "User"],
  endpoints: (build) => ({
    listAlerts: build.query<AlertsResponse, FiltersState>({
      query: (f) => {
        const params = new URLSearchParams();
        f.severity.forEach((s) => params.append("severity", s));
        f.status.forEach((s) => params.append("status", s));
        if (f.deviceId) params.set("device_id", f.deviceId);
        if (f.assignedTo != null) params.set("assigned_to", String(f.assignedTo));
        if (f.q) params.set("q", f.q);
        params.set("sort", f.sort);
        params.set("page", String(f.page));
        return `/alerts?${params}`;
      },
      providesTags: ["Alert"],
    }),

    getAlert: build.query<KnaqAlert, number>({
      query: (id) => `/alerts/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Alert", id }],
    }),

    acknowledge: build.mutation<KnaqAlert, number>({
      query: (id) => ({ url: `/alerts/${id}/acknowledge`, method: "POST" }),
      invalidatesTags: ["Alert"],
      onQueryStarted: async (id, { dispatch, queryFulfilled, getState }) => {
        const patches: ReturnType<typeof dispatch>[] = [];
        patches.push(
          dispatch(
            knaqApi.util.updateQueryData("getAlert", id, (draft) => {
              draft.status = "acknowledged";
            })
          )
        );
        try {
          await queryFulfilled;
        } catch {
          patches.forEach((p) => (p as { undo?: () => void }).undo?.());
        }
      },
    }),

    assign: build.mutation<KnaqAlert, { id: number; assigneeId: number; note?: string }>({
      query: ({ id, assigneeId, note }) => ({
        url: `/alerts/${id}/assign`,
        method: "POST",
        body: { assignee_id: assigneeId, note },
      }),
      invalidatesTags: ["Alert"],
    }),

    resolve: build.mutation<KnaqAlert, { id: number; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/alerts/${id}/resolve`, method: "POST", body }),
      invalidatesTags: ["Alert"],
    }),

    addNote: build.mutation<KnaqAlert, { id: number; note: string }>({
      query: ({ id, note }) => ({ url: `/alerts/${id}/notes`, method: "POST", body: { note } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Alert", id }],
    }),

    dismiss: build.mutation<KnaqAlert, number>({
      query: (id) => ({ url: `/alerts/${id}/dismiss`, method: "POST" }),
      invalidatesTags: ["Alert"],
    }),

    reopen: build.mutation<KnaqAlert, number>({
      query: (id) => ({ url: `/alerts/${id}/reopen`, method: "POST" }),
      invalidatesTags: ["Alert"],
    }),

    bulkAcknowledge: build.mutation<{ results: unknown[] }, number[]>({
      query: (ids) => ({ url: "/alerts/bulk/acknowledge", method: "POST", body: { ids } }),
      invalidatesTags: ["Alert"],
    }),

    bulkAssign: build.mutation<{ results: unknown[] }, { ids: number[]; assigneeId: number; note?: string }>({
      query: ({ ids, assigneeId, note }) => ({
        url: "/alerts/bulk/assign",
        method: "POST",
        body: { ids, assignee_id: assigneeId, note },
      }),
      invalidatesTags: ["Alert"],
    }),

    getStats: build.query<AlertStats, void>({
      query: () => "/alerts/stats",
      providesTags: ["Alert"],
    }),

    listDevices: build.query<DevicesResponse, void>({
      query: () => "/devices",
      providesTags: ["Device"],
    }),

    listUsers: build.query<UsersResponse, void>({
      query: () => "/users",
      providesTags: ["User"],
    }),
  }),
});

export const {
  useListAlertsQuery,
  useGetAlertQuery,
  useAcknowledgeMutation,
  useAssignMutation,
  useResolveMutation,
  useAddNoteMutation,
  useDismissMutation,
  useReopenMutation,
  useBulkAcknowledgeMutation,
  useBulkAssignMutation,
  useGetStatsQuery,
  useListDevicesQuery,
  useListUsersQuery,
} = knaqApi;
