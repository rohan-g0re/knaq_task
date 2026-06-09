"use client";

import {
  useAcknowledgeMutation,
  useDismissMutation,
  useReopenMutation,
} from "../api/knaqApi";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";

// Simple status mutations (no body). acknowledge is optimistic with rollback (see knaqApi);
// dismiss/reopen are pessimistic. All surface success/error and reconcile to server truth.
export function useAlertActions() {
  const [acknowledge, ackState] = useAcknowledgeMutation();
  const [dismiss, dismissState] = useDismissMutation();
  const [reopen, reopenState] = useReopenMutation();
  const { showSuccess, showError } = useToast();

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showSuccess(ok);
    } catch (err) {
      showError(apiErrorMessage(err));
    }
  };

  return {
    onAcknowledge: (id: number) => run(() => acknowledge(id).unwrap(), "Alert acknowledged."),
    onDismiss: (id: number) => run(() => dismiss(id).unwrap(), "Alert dismissed."),
    onReopen: (id: number) => run(() => reopen(id).unwrap(), "Alert reopened."),
    busy: ackState.isLoading || dismissState.isLoading || reopenState.isLoading,
  };
}
