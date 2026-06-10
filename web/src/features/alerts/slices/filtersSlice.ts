import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AlertFilters, AlertStatus, Severity } from "../types";

export type SortKey = "time" | "severity" | "status";

export interface FiltersState extends AlertFilters {
  sort: SortKey;
  page: number;
}

const initialState: FiltersState = {
  severity: [],
  status: [],
  deviceId: null,
  assignedTo: null,
  q: "",
  sort: "time",
  page: 1,
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    toggleSeverity(state, action: PayloadAction<Severity>) {
      const s = action.payload;
      state.severity = state.severity.includes(s)
        ? state.severity.filter((x) => x !== s)
        : [...state.severity, s];
      state.page = 1; // any filter change can shrink the set — never strand on an empty page
    },
    toggleStatus(state, action: PayloadAction<AlertStatus>) {
      const s = action.payload;
      state.status = state.status.includes(s)
        ? state.status.filter((x) => x !== s)
        : [...state.status, s];
      state.page = 1;
    },
    setStatusOnly(state, action: PayloadAction<AlertStatus | null>) {
      state.status = action.payload ? [action.payload] : [];
      state.page = 1;
    },
    setDevice(state, action: PayloadAction<string | null>) {
      state.deviceId = action.payload;
      state.page = 1;
    },
    setAssignee(state, action: PayloadAction<number | null>) {
      state.assignedTo = action.payload;
      state.page = 1;
    },
    setQuery(state, action: PayloadAction<string>) {
      state.q = action.payload;
      state.page = 1;
    },
    setSort(state, action: PayloadAction<SortKey>) {
      state.sort = action.payload;
      state.page = 1; // re-sort reorders the whole set — page 1 keeps the top of it in view
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    clearFilters() {
      return initialState;
    },
  },
});

export const {
  toggleSeverity,
  toggleStatus,
  setStatusOnly,
  setDevice,
  setAssignee,
  setQuery,
  setSort,
  setPage,
  clearFilters,
} = filtersSlice.actions;
export default filtersSlice.reducer;
