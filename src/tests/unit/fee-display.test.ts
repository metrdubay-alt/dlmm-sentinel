import { describe, expect, it } from "vitest";
import { feeDisplay } from "../../renderer/lib/fee-display";

describe("fee display", () => {
  it("rounds only presentation and retains the exact threshold value", () => {
    const m = { value: 149.75, display: "149.75" };
    expect(feeDisplay(m)).toBe("150");
    expect(m.value).toBe(149.75);
    expect(m.value < 150).toBe(true);
    expect(feeDisplay({ value: 150.49, display: "150.49" })).toBe("150");
    expect(feeDisplay({ value: 150.5, display: "150.5" })).toBe("151");
    expect(feeDisplay({ value: 0, display: "0" })).toBe("0");
  });
  it("keeps unparsed source text and missing values distinct from zero", () => {
    expect(feeDisplay({ value: null, display: "<1 SOL" })).toBe("<1 SOL");
    expect(feeDisplay({ value: null, display: "" })).toBe("Нет данных");
  });
});
