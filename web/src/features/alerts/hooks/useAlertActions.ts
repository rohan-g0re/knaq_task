"use client";

import { useAcknowledgeMutation } from "../api/knaqApi";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/lib/toast/ToastProvider";

// Pessimistic acknowledge: await the server, surface success/error, let RTK Query
// invalidation refetch the truth. The UI never flips status on its own.
export function useAlertActions() {
  const [acknowledge, ackState] = useAcknowledgeMutation();
  const { showSuccess, showError } = useToast();

  const onAcknowledge = async (id: number) => {
    try {
      await acknowledge(id).unwrap();
      showSuccess("Alert acknowledged.");
    } catch (err) {
      showError(apiErrorMessage(err));
    }
  };

  return { onAcknowledge, acknowledging: ackState.isLoading };
}
