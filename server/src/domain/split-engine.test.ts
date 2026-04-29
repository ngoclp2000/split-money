import { describe, expect, it } from "vitest";
import { computeBalances, simplifyDebts } from "./balances.js";
import { computeSplit } from "./split-engine.js";

describe("split engine", () => {
  it("splits remainders without losing money", () => {
    const shares = computeSplit(100000, "equal", [
      { memberId: "a" },
      { memberId: "b" },
      { memberId: "c" }
    ]);

    expect(shares.map((share) => share.computedAmountMinor)).toEqual([33334, 33333, 33333]);
    expect(shares.reduce((sum, share) => sum + share.computedAmountMinor, 0)).toBe(100000);
  });

  it("validates exact totals", () => {
    expect(() =>
      computeSplit(100, "exact", [
        { memberId: "a", value: 40 },
        { memberId: "b", value: 59 }
      ])
    ).toThrow("Exact split amounts must equal");
  });

  it("creates minimal settlement suggestions after payments", () => {
    const expenses = [
      {
        id: "e1",
        groupId: "g1",
        title: "Dinner",
        amountMinor: 900000,
        currency: "VND",
        paidByMemberId: "a",
        splitMethod: "equal" as const,
        expenseDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        participants: [
          { id: "p1", expenseId: "e1", memberId: "a", computedAmountMinor: 300000 },
          { id: "p2", expenseId: "e1", memberId: "b", computedAmountMinor: 300000 },
          { id: "p3", expenseId: "e1", memberId: "c", computedAmountMinor: 300000 }
        ]
      }
    ];

    const balances = computeBalances(["a", "b", "c"], expenses, [
      {
        id: "pay1",
        groupId: "g1",
        fromMemberId: "b",
        toMemberId: "a",
        amountMinor: 100000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    expect(simplifyDebts(balances)).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 300000 },
      { fromMemberId: "b", toMemberId: "a", amountMinor: 200000 }
    ]);
  });
});
