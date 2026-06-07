// SPEC-HEAR-1
import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveHearing,
  loadHearing,
  loadHearingCatalog,
  _resetHearingCatalogCache,
  HearingAnswerNotFoundError,
  HearingNoScenariosError,
  HearingNotFoundError,
  type HearingEntry,
} from "../src/content/hearings";

const HEARING_ID = "hearing.confirmation";

// Minimal in-memory hearing for isolated unit tests (no disk I/O).
const sampleHearing: HearingEntry = {
  id: "hearing.test",
  name: "hearing.test.name",
  desc: "hearing.test.desc",
  questions: [
    {
      id: "hearing.q.alpha",
      text: "hearing.q.alpha.text",
      answers: [
        {
          id: "hearing.a.alpha_hawkish",
          text: "hearing.a.alpha_hawkish.text",
          scenario_weights: { "scen.a": 3, "scen.b": 1 },
          state_modifiers: [{ target: "credibility", delta: 5 }],
        },
        {
          id: "hearing.a.alpha_dovish",
          text: "hearing.a.alpha_dovish.text",
          scenario_weights: { "scen.a": 1, "scen.b": 3 },
          state_modifiers: [{ target: "credibility", delta: -2 }],
        },
      ],
    },
    {
      id: "hearing.q.beta",
      text: "hearing.q.beta.text",
      answers: [
        {
          id: "hearing.a.beta_orthodox",
          text: "hearing.a.beta_orthodox.text",
          scenario_weights: { "scen.a": 2, "scen.b": 0 },
        },
        {
          id: "hearing.a.beta_activist",
          text: "hearing.a.beta_activist.text",
          scenario_weights: { "scen.a": 0, "scen.b": 2 },
        },
      ],
    },
  ],
};

describe("resolveHearing — scenario selection", () => {
  it("// SPEC-HEAR-1 selects the scenario with highest total weight", () => {
    // alpha_hawkish (+3 scen.a) + beta_orthodox (+2 scen.a) → scen.a total=5, scen.b total=1
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"],
      sampleHearing,
    );
    expect(result.scenarioId).toBe("scen.a");
  });

  it("// SPEC-HEAR-1 different answers produce a different scenario selection", () => {
    // alpha_dovish (+3 scen.b) + beta_activist (+2 scen.b) → scen.b total=5, scen.a total=1
    const result = resolveHearing(
      ["hearing.a.alpha_dovish", "hearing.a.beta_activist"],
      sampleHearing,
    );
    expect(result.scenarioId).toBe("scen.b");
  });

  it("// SPEC-HEAR-1 tiebreak is alphabetical by scenario id", () => {
    const tieHearing: HearingEntry = {
      id: "hearing.tie_test",
      name: "hearing.tie_test.name",
      desc: "hearing.tie_test.desc",
      questions: [
        {
          id: "hearing.q.tie",
          text: "hearing.q.tie.text",
          answers: [
            {
              id: "hearing.a.tie_pick",
              text: "hearing.a.tie_pick.text",
              // scen.aaa and scen.zzz both score 2; alphabetical → scen.aaa wins
              scenario_weights: { "scen.zzz": 2, "scen.aaa": 2 },
            },
            {
              id: "hearing.a.tie_other",
              text: "hearing.a.tie_other.text",
              scenario_weights: { "scen.aaa": 1 },
            },
          ],
        },
      ],
    };
    const result = resolveHearing(["hearing.a.tie_pick"], tieHearing);
    expect(result.scenarioId).toBe("scen.aaa");
  });
});

describe("resolveHearing — state modifiers", () => {
  it("// SPEC-HEAR-1 collects state_modifiers from the chosen answer", () => {
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"],
      sampleHearing,
    );
    expect(result.modifiers).toHaveLength(1);
    expect(result.modifiers[0]).toEqual({ target: "credibility", delta: 5 });
  });

  it("// SPEC-HEAR-1 accumulates modifiers from all chosen answers", () => {
    // Add a modifier to beta_orthodox for this test
    const hearingWithTwoMods: HearingEntry = {
      ...sampleHearing,
      questions: [
        sampleHearing.questions[0],
        {
          ...sampleHearing.questions[1],
          answers: [
            {
              ...sampleHearing.questions[1].answers[0],
              state_modifiers: [{ target: "policy_rate", delta: 0.005 }],
            },
            sampleHearing.questions[1].answers[1],
          ],
        },
      ],
    };
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"],
      hearingWithTwoMods,
    );
    expect(result.modifiers).toHaveLength(2);
    expect(result.modifiers[0]).toEqual({ target: "credibility", delta: 5 });
    expect(result.modifiers[1]).toEqual({ target: "policy_rate", delta: 0.005 });
  });

  it("// SPEC-HEAR-1 returns empty modifiers when no answer has state_modifiers", () => {
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_activist"],
      sampleHearing,
    );
    // beta_activist has no state_modifiers; only alpha_hawkish contributes one
    expect(result.modifiers).toHaveLength(1);
  });
});

describe("resolveHearing — determinism and purity", () => {
  it("// SPEC-HEAR-1 is deterministic — same inputs produce same result", () => {
    const answers = ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"] as const;
    const r1 = resolveHearing(answers, sampleHearing);
    const r2 = resolveHearing(answers, sampleHearing);
    expect(r1.scenarioId).toBe(r2.scenarioId);
    expect(r1.modifiers).toEqual(r2.modifiers);
  });

  it("// SPEC-HEAR-1 does not mutate the input hearing", () => {
    const snapshot = JSON.stringify(sampleHearing);
    resolveHearing(["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"], sampleHearing);
    expect(JSON.stringify(sampleHearing)).toBe(snapshot);
  });
});

describe("resolveHearing — error cases", () => {
  it("// SPEC-HEAR-1 throws HearingAnswerNotFoundError for an unknown answer id", () => {
    expect(() =>
      resolveHearing(["hearing.a.does_not_exist", "hearing.a.beta_orthodox"], sampleHearing),
    ).toThrow(HearingAnswerNotFoundError);
  });

  it("// SPEC-HEAR-1 HearingAnswerNotFoundError carries answerId and questionId", () => {
    let err: HearingAnswerNotFoundError | undefined;
    try {
      resolveHearing(["hearing.a.bad", "hearing.a.beta_orthodox"], sampleHearing);
    } catch (e) {
      err = e as HearingAnswerNotFoundError;
    } finally {
      expect(err).toBeInstanceOf(HearingAnswerNotFoundError);
      expect(err?.answerId).toBe("hearing.a.bad");
      expect(err?.questionId).toBe("hearing.q.alpha");
    }
  });

  it("// SPEC-HEAR-1 throws HearingNoScenariosError when no answer contributes scenario_weights", () => {
    const noWeightsHearing: HearingEntry = {
      id: "hearing.no_weights",
      name: "hearing.no_weights.name",
      desc: "hearing.no_weights.desc",
      questions: [
        {
          id: "hearing.q.empty",
          text: "hearing.q.empty.text",
          answers: [
            { id: "hearing.a.empty_1", text: "hearing.a.empty_1.text" },
            { id: "hearing.a.empty_2", text: "hearing.a.empty_2.text" },
          ],
        },
      ],
    };
    expect(() =>
      resolveHearing(["hearing.a.empty_1"], noWeightsHearing),
    ).toThrow(HearingNoScenariosError);
  });
});

describe("loadHearing — disk content", () => {
  beforeEach(() => {
    _resetHearingCatalogCache();
  });

  it("// SPEC-HEAR-1 loadHearing loads the confirmation hearing by id", () => {
    const hearing = loadHearing(HEARING_ID);
    expect(hearing.id).toBe(HEARING_ID);
    expect(hearing.questions.length).toBeGreaterThanOrEqual(1);
  });

  it("// SPEC-HEAR-1 each question has at least 2 answer choices", () => {
    const hearing = loadHearing(HEARING_ID);
    for (const q of hearing.questions) {
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("// SPEC-HEAR-1 loadHearing throws HearingNotFoundError for unknown id", () => {
    expect(() => loadHearing("hearing.nonexistent")).toThrow(HearingNotFoundError);
  });

  it("// SPEC-HEAR-1 resolveHearing with disk content returns a non-empty scenario id", () => {
    const hearing = loadHearing(HEARING_ID);
    const answers = hearing.questions.map((q) => q.answers[0].id);
    const result = resolveHearing(answers, hearing);
    expect(typeof result.scenarioId).toBe("string");
    expect(result.scenarioId.length).toBeGreaterThan(0);
    expect(Array.isArray(result.modifiers)).toBe(true);
  });

  it("// SPEC-HEAR-1 loadHearingCatalog is cached — same reference on repeated calls", () => {
    const first = loadHearingCatalog();
    const second = loadHearingCatalog();
    expect(first).toBe(second);
  });
});
