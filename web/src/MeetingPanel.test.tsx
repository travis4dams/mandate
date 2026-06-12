// SPEC-WEB-8: MeetingPanel threads the Chair-capital spend map into both
// committeeBriefing (live widened-band preview) and proposeRate (the vote),
// clamping spends client-side so engine overdraw errors are unreachable.
// Import engine-content BEFORE any engine module so the content registry is
// populated (node:fs is stubbed in the web test environment).
import "./engine-content";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { MeetingPanel } from "./MeetingPanel";
import { Session } from "../../src/engine/session";
import { loadChairCapitalParams } from "../../src/engine/chair-capital";

afterEach(() => {
  cleanup();
});

function makeSession(): Session {
  // 1979-08 is a meeting month, so the panel boots with the vote flow enabled.
  return Session.fromScenario("scen.1979_stagflation", 42, "comm.fomc_1979");
}

function firstMemberId(session: Session): string {
  const rate = session.current.vars.policy_rate ?? 0;
  const previews = session.committeeBriefing(rate).previews;
  const id = previews[0]?.memberId;
  if (id === undefined) throw new Error("committee has no members");
  return id;
}

describe("MeetingPanel chair-capital wiring", () => {
  it("displays the budget computed from chair-capital params and credibility", () => {
    // SPEC-WEB-8
    const session = makeSession();
    render(<MeetingPanel session={session} />);
    const params = loadChairCapitalParams();
    const cred = session.current.vars.credibility ?? 0;
    const expected = params.base_capital + Math.floor(params.credibility_weight * cred);
    expect(expected).toBe(session.chairCapital());
    expect(screen.getByTestId("chair-capital-display").textContent).toBe(String(expected));
  });

  it("re-invokes committeeBriefing with the spend map when a member spend changes", () => {
    // SPEC-WEB-8
    const session = makeSession();
    const memberId = firstMemberId(session);
    const spy = vi.spyOn(session, "committeeBriefing");
    render(<MeetingPanel session={session} />);
    act(() => {
      fireEvent.change(screen.getByTestId(`capital-spend-${memberId}`), {
        target: { value: "2" },
      });
    });
    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall?.[1]).toEqual({ [memberId]: 2 });
  });

  it("passes the spend map to proposeRate and clears it after the vote", () => {
    // SPEC-WEB-8
    const session = makeSession();
    const memberId = firstMemberId(session);
    const spy = vi.spyOn(session, "proposeRate");
    render(<MeetingPanel session={session} />);
    act(() => {
      fireEvent.change(screen.getByTestId(`capital-spend-${memberId}`), {
        target: { value: "1" },
      });
    });
    act(() => {
      fireEvent.click(screen.getByTestId("propose-rate-btn"));
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toEqual({ [memberId]: 1 });
    const input = screen.getByTestId(`capital-spend-${memberId}`) as HTMLInputElement;
    expect(input.value).toBe("0");
  });

  it("clamps spend to the per-member max and to the remaining budget", () => {
    // SPEC-WEB-8
    const session = makeSession();
    const rate = session.current.vars.policy_rate ?? 0;
    const previews = session.committeeBriefing(rate).previews;
    const m0 = previews[0]?.memberId;
    const m1 = previews[1]?.memberId;
    if (m0 === undefined || m1 === undefined) throw new Error("need two members");
    const params = loadChairCapitalParams();
    const budget = session.chairCapital();
    render(<MeetingPanel session={session} />);

    // Per-member cap binds first.
    act(() => {
      fireEvent.change(screen.getByTestId(`capital-spend-${m0}`), {
        target: { value: "99" },
      });
    });
    const firstClamp = Math.min(params.max_spend_per_member, budget);
    expect((screen.getByTestId(`capital-spend-${m0}`) as HTMLInputElement).value).toBe(
      String(firstClamp),
    );

    // Remaining-budget cap binds for the second member.
    act(() => {
      fireEvent.change(screen.getByTestId(`capital-spend-${m1}`), {
        target: { value: "99" },
      });
    });
    const remaining = budget - firstClamp;
    const secondClamp = Math.min(params.max_spend_per_member, remaining);
    expect((screen.getByTestId(`capital-spend-${m1}`) as HTMLInputElement).value).toBe(
      String(secondClamp),
    );
  });
});
