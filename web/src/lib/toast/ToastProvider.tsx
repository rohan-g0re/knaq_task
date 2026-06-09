"use client";

import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { createContext, useContext, useMemo, useState } from "react";

type Severity = "success" | "error" | "info";
interface Toast {
  message: string;
  severity: Severity;
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showSuccess: () => {},
  showError: () => {},
});

export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const ctx = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (message) => setToast({ message, severity: "success" }),
      showError: (message) => setToast({ message, severity: "error" }),
    }),
    [],
  );

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <Snackbar
        open={toast !== null}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
