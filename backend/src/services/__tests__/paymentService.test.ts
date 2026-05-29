import { describe, it, expect } from "vitest";
import { PLANS } from "../paymentService";

describe("Payment Service - Plan Validation", () => {
  it("should have correct plan amounts and currencies for Telegram Stars", () => {
    expect(PLANS.m1.amount).toBe(100);
    expect(PLANS.m1.currency).toBe("XTR");
    expect(PLANS.m3.amount).toBe(250);
    expect(PLANS.m3.currency).toBe("XTR");
  });

  it("should have valid plan metadata", () => {
    expect(PLANS.m1.title).toBeTruthy();
    expect(PLANS.m1.description).toBeTruthy();
    expect(PLANS.m3.title).toBeTruthy();
    expect(PLANS.m3.description).toBeTruthy();
  });

  it("should export all expected plan keys", () => {
    const planKeys = Object.keys(PLANS);
    expect(planKeys).toContain("m1");
    expect(planKeys).toContain("m3");
    expect(planKeys.length).toBe(2);
  });
});
