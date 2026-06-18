"use client";

import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { createContext, useCallback, useContext, useState } from "react";

type Severity = "success" | "error" | "info" | "warning";
interface ToastCtx { toast: (message: string, severity?: Severity) => void; }

const ToastContext = createContext<ToastCtx>({ toast: () => {} });
export function useToast() { return useContext(ToastContext); }

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sev, setSev] = useState<Severity>("info");

  const toast = useCallback((message: string, severity: Severity = "info") => {
    setMsg(message);
    setSev(severity);
    setOpen(true);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={4000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={sev} onClose={() => setOpen(false)} variant="filled" sx={{ minWidth: 300 }}>
          {msg}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}
