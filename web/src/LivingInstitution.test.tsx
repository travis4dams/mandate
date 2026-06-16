// SPEC-WEB-15: living-institution UI — escalations in-tray, dismiss/fire button,
// operating-budget hire cost label, and committee legend.
// Import engine-content BEFORE any engine module so the content registry is
// populated (node:fs is stubbed in the web test environment).
import "./engine-content";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { EscalationsPanel } from "./EscalationsPanel";
import { InstitutionPanel } from "./InstitutionPanel";
import { PersuasionView } from "./PersuasionView";
import { useSession } from "./useSession";
import type { MemberVotePreview } from "../../src/engine/fomc";
import type { GameEvent } from "../../src/content/events";
import { t } from "./loc";

afterEach(() => cleanup());

// ---- helpers ----

function InstitutionHarness(props: {
  scenarioId: string;
  seed: number;
  committeeId: string;
}): JSX.Element {
  const { session, current } = useSession(props.scenarioId, props.seed, props.committeeId);
  return <InstitutionPanel session={session} current={current} />;
}

function renderInstitution(): ReturnType<typeof render> {
  return render(
    <InstitutionHarness
      scenarioId="scen.1979_stagflation"
      seed={42}
      committeeId="comm.fomc_1979"
    />,
  );
}

// Fake session stub for EscalationsPanel tests — keeps tests isolated from
// engine event logic and avoids requiring real escalation firing.
function makeEscalationSession(events: GameEvent[]): Parameters<typeof EscalationsPanel>[0]["session"] {
  return {
    escalations: () => events,
    resolveEscalation: vi.fn(),
  } as unknown as Parameters<typeof EscalationsPanel>[0]["session"];
}

// ---- SPEC-WEB-15: EscalationsPanel tests ----

describe("SPEC-WEB-15: EscalationsPanel", () => {
  it("renders the empty-state message when no escalations are pending", () => {
    // SPEC-WEB-15
    const session = makeEscalationSession([]);
    render(<EscalationsPanel session={session} />);
    expect(screen.getByText(t("ui.escalations.empty"))).toBeDefined();
  });

  it("renders an escalation card with testid escalation-<id>", () => {
    // SPEC-WEB-15
    const evt: GameEvent = {
      id: "evt.test_event",
      category: "exogenous",
      title: "evt.test_event.title",
      options: [
        { id: "opt_a", name: "evt.test_event.opt.opt_a", effects: [] },
      ],
    };
    const session = makeEscalationSession([evt]);
    render(<EscalationsPanel session={session} />);
    expect(screen.getByTestId("escalation-evt.test_event")).toBeDefined();
  });

  it("renders one option button per option with testid escalation-opt-<id>-<optId>", () => {
    // SPEC-WEB-15
    const evt: GameEvent = {
      id: "evt.multi_opt",
      category: "endogenous",
      title: "evt.multi_opt.title",
      options: [
        { id: "opt_a", name: "evt.multi_opt.opt.opt_a", effects: [] },
        { id: "opt_b", name: "evt.multi_opt.opt.opt_b", effects: [] },
      ],
    };
    const session = makeEscalationSession([evt]);
    render(<EscalationsPanel session={session} />);
    expect(screen.getByTestId("escalation-opt-evt.multi_opt-opt_a")).toBeDefined();
    expect(screen.getByTestId("escalation-opt-evt.multi_opt-opt_b")).toBeDefined();
  });

  it("clicking an option button calls resolveEscalation with the correct ids", () => {
    // SPEC-WEB-15
    const evt: GameEvent = {
      id: "evt.resolve_test",
      category: "exogenous",
      title: "evt.resolve_test.title",
      options: [{ id: "opt_yes", name: "evt.resolve_test.opt.opt_yes", effects: [] }],
    };
    const resolveFn = vi.fn();
    const session = {
      escalations: () => [evt],
      resolveEscalation: resolveFn,
    } as unknown as Parameters<typeof EscalationsPanel>[0]["session"];

    render(<EscalationsPanel session={session} />);
    fireEvent.click(screen.getByTestId("escalation-opt-evt.resolve_test-opt_yes"));
    expect(resolveFn).toHaveBeenCalledWith("evt.resolve_test", "opt_yes");
  });
});

// ---- SPEC-WEB-15: InstitutionPanel — no hawk/dove label ----

describe("SPEC-WEB-15: InstitutionPanel staffing changes", () => {
  it("does not show hawk/dove lean label on candidate cards", () => {
    // SPEC-WEB-15: lean must not be surfaced in the candidate slate.
    renderInstitution();
    // Neither the label key text nor hawk/dove words should appear in candidate rows.
    expect(screen.queryByText(t("ui.institution.lean_label"))).toBeNull();
    // "Hawk" and "Dove" should not appear as candidate attributes.
    // (They may legitimately appear in the culture section as policyLean — so we scope
    // to candidate rows by checking candidate-fit testids are present without lean text.)
    const researchCard = screen.getByTestId("division-research");
    expect(researchCard.textContent).not.toContain(t("ui.institution.lean_label"));
    expect(researchCard.textContent).not.toContain("Lean:");
  });

  it("Dismiss button is present on a staffed division and calls session.fire", () => {
    // SPEC-WEB-15
    renderInstitution();
    // Hire research first so it is staffed.
    act(() => {
      fireEvent.click(screen.getByTestId("hire-research-0"));
    });
    // Dismiss button must now be visible.
    const dismissBtn = screen.getByTestId("fire-research");
    expect(dismissBtn).toBeDefined();

    // Click dismiss — research should become unstaffed.
    act(() => {
      fireEvent.click(dismissBtn);
    });
    const researchCard = screen.getByTestId("division-research");
    expect(researchCard.textContent).toContain(t("ui.institution.unstaffed_badge"));
  });

  it("hire cost is labelled as operating-budget cost, not plain hire cost", () => {
    // SPEC-WEB-15
    renderInstitution();
    // The new budget-cost label must appear.
    expect(screen.getAllByText(t("ui.institution.hire_cost_budget_label")).length).toBeGreaterThan(0);
  });
});

// ---- SPEC-WEB-15: PersuasionView — committee legend + above/below labels ----

const PREVIEWS: MemberVotePreview[] = [
  { memberId: "m1", nameKey: "member.m1", preferred: 0.12, wouldDissent: true },
  { memberId: "m2", nameKey: "member.m2", preferred: 0.09, wouldDissent: false },
];

describe("SPEC-WEB-15: PersuasionView legend and position labels", () => {
  it("renders the committee-legend caption", () => {
    // SPEC-WEB-15
    render(<PersuasionView previews={PREVIEWS} proposed={0.10} />);
    expect(screen.getByTestId("committee-legend")).toBeDefined();
    expect(screen.getByTestId("committee-legend").textContent).toContain(
      t("ui.persuasion.legend").slice(0, 40),
    );
  });

  it("labels members whose preferred rate is above the proposal as 'above your proposal'", () => {
    // SPEC-WEB-15: m1 prefers 0.12 > proposed 0.10 → above label
    render(<PersuasionView previews={PREVIEWS} proposed={0.10} />);
    expect(screen.getByTestId("member-position-label-m1").textContent).toBe(
      t("ui.persuasion.above_proposed"),
    );
  });

  it("labels members whose preferred rate is below the proposal as 'below your proposal'", () => {
    // SPEC-WEB-15: m2 prefers 0.09 < proposed 0.10 → below label
    render(<PersuasionView previews={PREVIEWS} proposed={0.10} />);
    expect(screen.getByTestId("member-position-label-m2").textContent).toBe(
      t("ui.persuasion.below_proposed"),
    );
  });

  it("labels a member at exactly the proposed rate as 'above your proposal' (>= boundary)", () => {
    // SPEC-WEB-15: preferred === proposed uses the >= branch → above label
    const atProposal: MemberVotePreview[] = [
      { memberId: "mx", nameKey: "member.mx", preferred: 0.10, wouldDissent: false },
    ];
    render(<PersuasionView previews={atProposal} proposed={0.10} />);
    expect(screen.getByTestId("member-position-label-mx").textContent).toBe(
      t("ui.persuasion.above_proposed"),
    );
  });
});
