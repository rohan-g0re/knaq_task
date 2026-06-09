import { configureStore } from "@reduxjs/toolkit";

import { knaqApi } from "@/features/alerts/api/knaqApi";
import filtersReducer from "@/features/alerts/slices/filtersSlice";

export const store = configureStore({
  reducer: {
    [knaqApi.reducerPath]: knaqApi.reducer,
    filters: filtersReducer,
  },
  middleware: (getDefault) => getDefault().concat(knaqApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
