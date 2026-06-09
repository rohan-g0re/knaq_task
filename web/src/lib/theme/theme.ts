import { createTheme, type Theme } from "@mui/material/styles";

import type { AlertStatus, Severity } from "@/features/alerts/types";

// Brand + semantic colors from the assignment.
export const STATUS_COLORS: Record<AlertStatus, string> = {
  new: "#F44336", // error
  acknowledged: "#FFA726", // warning
  resolved: "#66BB6A", // success
  dismissed: "#9E9E9E", // grey
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "#F44336",
  warning: "#FFA726",
  info: "#29B6F6",
};

export function buildTheme(mode: "light" | "dark"): Theme {
  return createTheme({
    palette: {
      mode,
      primary: { main: "#EFC01A" },
      secondary: { main: "#4B8189" },
      error: { main: "#F44336" },
      warning: { main: "#FFA726" },
      info: { main: "#29B6F6" },
      success: { main: "#66BB6A" },
      ...(mode === "light"
        ? { background: { default: "#F5F6F8", paper: "#FFFFFF" } }
        : { background: { default: "#121417", paper: "#1B1E24" } }),
    },
    shape: { borderRadius: 10 },
    typography: { fontWeightMedium: 600 },
    components: {
      MuiButton: { defaultProps: { disableElevation: true } },
    },
  });
}
