"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import { Provider } from "react-redux";

import ColorModeProvider from "@/lib/theme/ColorModeProvider";
import ToastProvider from "@/lib/toast/ToastProvider";
import { store } from "@/lib/store";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <Provider store={store}>
        <ColorModeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ColorModeProvider>
      </Provider>
    </AppRouterCacheProvider>
  );
}
