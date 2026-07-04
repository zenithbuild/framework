import { describe, expect, test } from "bun:test";
import { findEmptyRequiredCategories } from "../scripts/gates/shared.mjs";

const REQUIRED = ["getting-started"];

describe("docs structure gate: required non-empty categories", () => {
  test("passes when a required category has a public page", () => {
    const records = [
      { category: "getting-started", public: true },
      { category: "routing", public: true },
    ];

    expect(findEmptyRequiredCategories(records, REQUIRED)).toEqual([]);
  });

  test("fails when a required category has only non-public pages", () => {
    const records = [
      { category: "getting-started", public: false },
      { category: "routing", public: true },
    ];

    expect(findEmptyRequiredCategories(records, REQUIRED)).toEqual(["getting-started"]);
  });

  test("fails when a required category has no pages at all", () => {
    const records = [{ category: "routing", public: true }];

    expect(findEmptyRequiredCategories(records, REQUIRED)).toEqual(["getting-started"]);
  });

  test("ignores top-level docs when computing category coverage", () => {
    const records = [
      { category: null, public: true },
      { category: "getting-started", public: true },
    ];

    expect(findEmptyRequiredCategories(records, REQUIRED)).toEqual([]);
  });
});
