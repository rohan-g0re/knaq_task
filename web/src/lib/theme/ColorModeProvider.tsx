"use client";

import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { createContext, useContext, useMemo, useState } from "react";

type ColorMode = "light" | "dark";
interface ColorModeCtx { mode: ColorMode; toggle: () => void; }

const ColorModeContext = createContext<ColorModeCtx>({ mode: "light", toggle: () => {} });
export function useColorMode() { return useContext(ColorModeContext); }

export const STATUS_COLORS: Record<string, string> = {
  new: "#EFC01A",
  acknowledged: "#ed6c02",
  resolved: "#2e7d32",
  dismissed: "#757575",
};

export const SEVERITY_COLORS: Record<string, string> = {
  critical: "#d32f2f",
  warning: "#ed6c02",
  info: "#0288d1",
};

export default function ColorModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ColorMode>("light");
  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: "#EFC01A" },
          secondary: { main: "#4B8189" },
        },
      }),
    [mode]
  );

  return (
    <ColorModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
