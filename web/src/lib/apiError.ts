import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

function isFetchBaseQueryError(e: unknown): e is FetchBaseQueryError {
  return typeof e === "object" && e !== null && "status" in e;
}

// Pull a human message out of our { error: { code, message } } envelope, with
// sensible fallbacks for network/parse failures. Accepts unknown so callers can
// pass a caught error or an RTK Query error without casting.
export function apiErrorMessage(err: unknown): string {
  if (isFetchBaseQueryError(err)) {
    if (err.status === "FETCH_ERROR") return "Cannot reach the server. Is the API running?";
    const data = err.data as { error?: { message?: string } } | undefined;
    if (data?.error?.message) return data.error.message;
    if (err.status === 401) return "Unauthorized — check your bearer token.";
    if (err.status === 409) return "Action not allowed in the current status.";
    return `Request failed (${err.status}).`;
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Something went wrong.";
}
