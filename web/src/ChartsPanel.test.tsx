// SPEC-WEB-3
import { describe, it, expect } from "vitest";
import { buildChartData, fogHalfWidth } from "./ChartsPanel";
// buildChartData and fogHalfWidth are pure functions you will export

describe("SPEC-WEB-3 chart data", () => {
  const snapshot = {
    date: "1979-08",
    vars: {
      inflation: 0.11,
      unemployment: 0.06,
      policy_rate: 0.105,
      credibility: 8.2,
    },
  };
  const trajectory = [snapshot];

  it("builds one data point per snapshot for each series", () => {
    const data = buildChartData(trajectory);
    expect(data.inflation).toHaveLength(1);
    expect(data.unemployment).toHaveLength(1);
    expect(data.policy_rate).toHaveLength(1);
    expect(data.credibility).toHaveLength(1);
  });

  it("data points carry date and value", () => {
    const data = buildChartData(trajectory);
    expect(data.inflation[0]).toEqual({ date: "1979-08", value: 0.11 });
    expect(data.credibility[0]).toEqual({ date: "1979-08", value: 8.2 });
  });

  it("fog half-width matches noise_scale from fog params", () => {
    // inflation noise_scale = 0.002, unemployment = 0.001, policy_rate = 0, credibility = 0 (not in fog.json — use 0)
    expect(fogHalfWidth("inflation")).toBeCloseTo(0.002);
    expect(fogHalfWidth("unemployment")).toBeCloseTo(0.001);
    expect(fogHalfWidth("policy_rate")).toBe(0);
  });
});
