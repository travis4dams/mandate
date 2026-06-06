// SPEC-WEB-6: in-meeting persuasion view — failing tests first.
// Import engine-content BEFORE any engine module so the content registry is
// populated before briefings.ts / loader.ts module-level code runs.
import "./engine-content";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PersuasionView, buildDotPlotData } from "./PersuasionView";
import type { MemberVotePreview } from "../../src/engine/fomc";

afterEach(() => {
  cleanup();
});

// ---- pure helper tests (no DOM needed) -----------------------------------

describe("buildDotPlotData", () => {
  it("returns one DotPlotDatum per member preview", () => {
    // SPEC-WEB-6
    const previews: MemberVotePreview[] = [
      { memberId: "a", nameKey: "m.a", preferred: 0.10, wouldDissent: false },
      { memberId: "b", nameKey: "m.b", preferred: 0.12, wouldDissent: true },
    ];
    const result = buildDotPlotData(previews, 0.10);
    expect(result.dots).toHaveLength(2);
  });

  it("dissentCount matches the wouldDissent flags in previews", () => {
    // SPEC-WEB-6
    const previews: MemberVotePreview[] = [
      { memberId: "a", nameKey: "m.a", preferred: 0.10, wouldDissent: false },
      { memberId: "b", nameKey: "m.b", preferred: 0.15, wouldDissent: true },
      { memberId: "c", nameKey: "m.c", preferred: 0.10, wouldDissent: false },
    ];
    const result = buildDotPlotData(previews, 0.10);
    expect(result.dissentCount).toBe(1);
  });

  it("rate range always contains the proposed rate", () => {
    // SPEC-WEB-6
    const previews: MemberVotePreview[] = [
      { memberId: "a", nameKey: "m.a", preferred: 0.09, wouldDissent: true },
      { memberId: "b", nameKey: "m.b", preferred: 0.10, wouldDissent: false },
    ];
    // proposed is above all preferred rates
    const result = buildDotPlotData(previews, 0.15);
    expect(result.rateMin).toBeLessThanOrEqual(0.09);
    expect(result.rateMax).toBeGreaterThanOrEqual(0.15);
  });

  it("dissentCount is 0 when all members approve", () => {
    // SPEC-WEB-6
    const previews: MemberVotePreview[] = Array.from({ length: 5 }, (_, i) => ({
      memberId: `m${i}`,
      nameKey: `member.m${i}`,
      preferred: 0.1075,
      wouldDissent: false,
    }));
    const result = buildDotPlotData(previews, 0.1075);
    expect(result.dissentCount).toBe(0);
  });

  it("dot memberId and wouldDissent are preserved from previews", () => {
    // SPEC-WEB-6
    const previews: MemberVotePreview[] = [
      { memberId: "hawk", nameKey: "m.hawk", preferred: 0.14, wouldDissent: true },
      { memberId: "dove", nameKey: "m.dove", preferred: 0.08, wouldDissent: true },
    ];
    const { dots } = buildDotPlotData(previews, 0.11);
    expect(dots.find((d) => d.memberId === "hawk")?.wouldDissent).toBe(true);
    expect(dots.find((d) => d.memberId === "dove")?.wouldDissent).toBe(true);
  });
});

// ---- component tests (requires jsdom + content registry) -----------------

const THREE_MEMBERS: MemberVotePreview[] = [
  { memberId: "m1", nameKey: "member.m1", preferred: 0.10, wouldDissent: false },
  { memberId: "m2", nameKey: "member.m2", preferred: 0.12, wouldDissent: true },
  { memberId: "m3", nameKey: "member.m3", preferred: 0.11, wouldDissent: false },
];

describe("PersuasionView component", () => {
  it("renders one SVG dot per member", () => {
    // SPEC-WEB-6
    render(<PersuasionView previews={THREE_MEMBERS} proposed={0.10} />);
    const dots = document.querySelectorAll("[data-testid^='dot-']");
    expect(dots.length).toBe(THREE_MEMBERS.length);
  });

  it("live dissent count matches wouldDissent from previews", () => {
    // SPEC-WEB-6
    render(<PersuasionView previews={THREE_MEMBERS} proposed={0.10} />);
    expect(screen.getByTestId("dissent-count").textContent).toBe("1");
  });

  it("renders without error when briefingId is omitted", () => {
    // SPEC-WEB-6
    expect(() =>
      render(<PersuasionView previews={THREE_MEMBERS} proposed={0.10} />)
    ).not.toThrow();
  });

  it("renders without error with a valid briefingId (degrades gracefully when loaded)", () => {
    // SPEC-WEB-6
    expect(() =>
      render(
        <PersuasionView
          previews={THREE_MEMBERS}
          proposed={0.10}
          briefingId="brief.1979_q3_stagflation"
        />
      )
    ).not.toThrow();
  });

  it("degrades gracefully when briefingId is unknown (no throw, no crash)", () => {
    // SPEC-WEB-6
    expect(() =>
      render(
        <PersuasionView
          previews={THREE_MEMBERS}
          proposed={0.10}
          briefingId="brief.does_not_exist"
        />
      )
    ).not.toThrow();
  });

  it("shows three scenario cards when a valid briefingId is provided", () => {
    // SPEC-WEB-6
    render(
      <PersuasionView
        previews={THREE_MEMBERS}
        proposed={0.10}
        briefingId="brief.1979_q3_stagflation"
      />
    );
    const cards = document.querySelectorAll("[data-testid^='scenario-card-']");
    expect(cards.length).toBe(3);
  });

  it("capital spend control renders as a placeholder (SPEC-COMM-7 not yet wired)", () => {
    // SPEC-WEB-6
    render(<PersuasionView previews={THREE_MEMBERS} proposed={0.10} />);
    expect(screen.getByTestId("chair-capital-display").textContent).toBe("—");
  });
});
