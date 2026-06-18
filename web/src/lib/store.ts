import { configureStore } from "@reduxjs/toolkit";
import { knaqApi } from "@/features/alerts/api/knaqApi";
import filtersReducer from "@/features/alerts/slices/filtersSlice";
import sessionReducer from "@/features/session/sessionSlice";

export const store = configureStore({
  reducer: {
    [knaqApi.reducerPath]: knaqApi.reducer,
    filters: filtersReducer,
    session: sessionReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(knaqApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
