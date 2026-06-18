import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Severity, AlertStatus } from "../types";

export interface FiltersState {
  severity: Severity[];
  status: AlertStatus[];
  deviceId: string;
  assignedTo: number | null;
  q: string;
  sort: "time" | "severity" | "status";
  page: number;
}

const initialState: FiltersState = {
  severity: [],
  status: [],
  deviceId: "",
  assignedTo: null,
  q: "",
  sort: "time",
  page: 1,
};

const filtersSlice = createSlice({
  name: "filters",
  initialState,
  reducers: {
    setSeverity(state, action: PayloadAction<Severity[]>) {
      state.severity = action.payload;
      state.page = 1;
    },
    setStatus(state, action: PayloadAction<AlertStatus[]>) {
      state.status = action.payload;
      state.page = 1;
    },
    setDeviceId(state, action: PayloadAction<string>) {
      state.deviceId = action.payload;
      state.page = 1;
    },
    setAssignedTo(state, action: PayloadAction<number | null>) {
      state.assignedTo = action.payload;
      state.page = 1;
    },
    setQ(state, action: PayloadAction<string>) {
      state.q = action.payload;
      state.page = 1;
    },
    setSort(state, action: PayloadAction<"time" | "severity" | "status">) {
      state.sort = action.payload;
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    clearFilters() {
      return initialState;
    },
  },
});

export const { setSeverity, setStatus, setDeviceId, setAssignedTo, setQ, setSort, setPage, clearFilters } =
  filtersSlice.actions;
export default filtersSlice.reducer;
