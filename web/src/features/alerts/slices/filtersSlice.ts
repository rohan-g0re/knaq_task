import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AlertFilters, AlertStatus, Severity } from "../types";

export type SortKey = "time" | "severity" | "status";

interface FiltersState extends AlertFilters {
  sort: SortKey;
}

const initialState: FiltersState = {
  severity: [],
  status: [],
  deviceId: null,
  assignedTo: null,
  q: "",
  sort: "time",
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
    },
    toggleStatus(state, action: PayloadAction<AlertStatus>) {
      const s = action.payload;
      state.status = state.status.includes(s)
        ? state.status.filter((x) => x !== s)
        : [...state.status, s];
    },
    setStatusOnly(state, action: PayloadAction<AlertStatus | null>) {
      state.status = action.payload ? [action.payload] : [];
    },
    setDevice(state, action: PayloadAction<string | null>) {
      state.deviceId = action.payload;
    },
    setAssignee(state, action: PayloadAction<number | null>) {
      state.assignedTo = action.payload;
    },
    setQuery(state, action: PayloadAction<string>) {
      state.q = action.payload;
    },
    setSort(state, action: PayloadAction<SortKey>) {
      state.sort = action.payload;
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
  clearFilters,
} = filtersSlice.actions;
export default filtersSlice.reducer;
