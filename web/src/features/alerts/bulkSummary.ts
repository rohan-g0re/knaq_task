import type { BulkResponse } from "./types";

// Turn per-id bulk results into one human sentence, e.g. "3 acknowledged, 1 failed".
export function summarizeBulk(res: BulkResponse, verb: string): { message: string; allOk: boolean } {
  const ok = res.results.filter((r) => r.ok).length;
  const failed = res.results.length - ok;
  const allOk = failed === 0;
  const message = allOk
    ? `${ok} ${verb}.`
    : `${ok} ${verb}, ${failed} failed (already in a state that can't be ${verb}).`;
  return { message, allOk };
}
