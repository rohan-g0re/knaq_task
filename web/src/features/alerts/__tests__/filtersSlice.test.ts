import { describe, expect, it } from "vitest";

import reducer, {
  clearFilters,
  setPage,
  setSort,
  setStatusOnly,
  toggleSeverity,
} from "../slices/filtersSlice";

const initial = reducer(undefined, { type: "@@INIT" });

describe("filtersSlice", () => {
  it("toggles a severity on and back off", () => {
    const added = reducer(initial, toggleSeverity("critical"));
    expect(added.severity).toEqual(["critical"]);
    expect(reducer(added, toggleSeverity("critical")).severity).toEqual([]);
  });

  it("resets page to 1 whenever a filter changes (so you never strand on an empty page)", () => {
    const onPage3 = reducer(initial, setPage(3));
    expect(onPage3.page).toBe(3);
    expect(reducer(onPage3, toggleSeverity("warning")).page).toBe(1);
    expect(reducer(onPage3, setStatusOnly("resolved")).page).toBe(1);
  });

  it("resets page to 1 when the sort changes (re-sort reorders the whole set)", () => {
    const onPage2 = reducer(initial, setPage(2));
    const sorted = reducer(onPage2, setSort("severity"));
    expect(sorted.sort).toBe("severity");
    expect(sorted.page).toBe(1);
  });

  it("setPage moves the page without disturbing filters", () => {
    const withFilter = reducer(initial, toggleSeverity("info"));
    const paged = reducer(withFilter, setPage(2));
    expect(paged.page).toBe(2);
    expect(paged.severity).toEqual(["info"]);
  });

  it("clearFilters returns to the initial state", () => {
    const dirty = reducer(reducer(initial, toggleSeverity("critical")), setPage(4));
    expect(reducer(dirty, clearFilters())).toEqual(initial);
  });
});
