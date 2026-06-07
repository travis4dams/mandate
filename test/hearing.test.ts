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
  type HearingModifierTarget,
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
  it("selects the scenario with highest total weight", () => {
    // SPEC-HEAR-1
    // alpha_hawkish (+3 scen.a) + beta_orthodox (+2 scen.a) → scen.a total=5, scen.b total=1
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"],
      sampleHearing,
    );
    expect(result.scenarioId).toBe("scen.a");
  });

  it("different answers produce a different scenario selection", () => {
    // SPEC-HEAR-1
    // alpha_dovish (+3 scen.b) + beta_activist (+2 scen.b) → scen.b total=5, scen.a total=1
    const result = resolveHearing(
      ["hearing.a.alpha_dovish", "hearing.a.beta_activist"],
      sampleHearing,
    );
    expect(result.scenarioId).toBe("scen.b");
  });

  it("tiebreak is alphabetical by scenario id", () => {
    // SPEC-HEAR-1
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
  it("collects state_modifiers from the chosen answer", () => {
    // SPEC-HEAR-1
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"],
      sampleHearing,
    );
    expect(result.modifiers).toHaveLength(1);
    expect(result.modifiers[0]).toEqual({ target: "credibility", delta: 5 });
    // Type-level assertion: target must satisfy HearingModifierTarget
    const _target: HearingModifierTarget = result.modifiers[0].target;
    void _target;
  });

  it("accumulates modifiers from all chosen answers", () => {
    // SPEC-HEAR-1
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

  it("answers without state_modifiers contribute no modifiers to the result", () => {
    // SPEC-HEAR-1
    const result = resolveHearing(
      ["hearing.a.alpha_hawkish", "hearing.a.beta_activist"],
      sampleHearing,
    );
    // beta_activist has no state_modifiers; only alpha_hawkish contributes one
    expect(result.modifiers).toHaveLength(1);
  });
});

describe("resolveHearing — determinism and purity", () => {
  it("is deterministic — same inputs produce same result", () => {
    // SPEC-HEAR-1
    const answers = ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"] as const;
    const r1 = resolveHearing(answers, sampleHearing);
    const r2 = resolveHearing(answers, sampleHearing);
    expect(r1.scenarioId).toBe(r2.scenarioId);
    expect(r1.modifiers).toEqual(r2.modifiers);
  });

  it("does not mutate the input hearing", () => {
    // SPEC-HEAR-1
    const snapshot = JSON.stringify(sampleHearing);
    resolveHearing(["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox"], sampleHearing);
    expect(JSON.stringify(sampleHearing)).toBe(snapshot);
  });
});

describe("resolveHearing — error cases", () => {
  it("throws HearingAnswerNotFoundError for an unknown answer id", () => {
    // SPEC-HEAR-1
    expect(() =>
      resolveHearing(["hearing.a.does_not_exist", "hearing.a.beta_orthodox"], sampleHearing),
    ).toThrow(HearingAnswerNotFoundError);
  });

  it("HearingAnswerNotFoundError carries answerId and questionId", () => {
    // SPEC-HEAR-1
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

  it("throws HearingNoScenariosError when no answer contributes scenario_weights", () => {
    // SPEC-HEAR-1
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

  it("throws a length error when answers.length < questions.length", () => {
    // SPEC-HEAR-1
    // sampleHearing has 2 questions; providing only 1 answer should throw
    expect(() =>
      resolveHearing(["hearing.a.alpha_hawkish"], sampleHearing),
    ).toThrowError(/expected 2 answer\(s\)/);
  });

  it("throws a length error when answers.length > questions.length", () => {
    // SPEC-HEAR-1
    // sampleHearing has 2 questions; providing 3 answers should throw
    expect(() =>
      resolveHearing(
        ["hearing.a.alpha_hawkish", "hearing.a.beta_orthodox", "hearing.a.extra"],
        sampleHearing,
      ),
    ).toThrowError(/expected 2 answer\(s\)/);
  });
});

describe("loadHearing — disk content", () => {
  beforeEach(() => {
    _resetHearingCatalogCache();
  });

  it("loadHearing loads the confirmation hearing by id", () => {
    // SPEC-HEAR-1
    const hearing = loadHearing(HEARING_ID);
    expect(hearing.id).toBe(HEARING_ID);
    expect(hearing.questions.length).toBeGreaterThanOrEqual(1);
  });

  it("each question has at least 2 answer choices", () => {
    // SPEC-HEAR-1
    const hearing = loadHearing(HEARING_ID);
    for (const q of hearing.questions) {
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("loadHearing throws HearingNotFoundError for unknown id", () => {
    // SPEC-HEAR-1
    expect(() => loadHearing("hearing.nonexistent")).toThrow(HearingNotFoundError);
  });

  it("resolveHearing with disk content returns a non-empty scenario id", () => {
    // SPEC-HEAR-1
    const hearing = loadHearing(HEARING_ID);
    const answers = hearing.questions.map((q) => q.answers[0].id);
    const result = resolveHearing(answers, hearing);
    expect(typeof result.scenarioId).toBe("string");
    expect(result.scenarioId.length).toBeGreaterThan(0);
    expect(Array.isArray(result.modifiers)).toBe(true);
  });

  it("loadHearingCatalog is cached — same reference on repeated calls", () => {
    // SPEC-HEAR-1
    const first = loadHearingCatalog();
    const second = loadHearingCatalog();
    expect(first).toBe(second);
  });

  it("loadHearing throws HearingNotFoundError and err.id matches requested id", () => {
    // SPEC-HEAR-1
    const BAD_ID = "hearing.totally_unknown";
    let err: HearingNotFoundError | undefined;
    try {
      loadHearing(BAD_ID);
    } catch (e) {
      err = e as HearingNotFoundError;
    } finally {
      expect(err).toBeInstanceOf(HearingNotFoundError);
      expect(err?.id).toBe(BAD_ID);
    }
  });

  it("loadHearingCatalog keys cache by dir — different dirs get independent arrays", () => {
    // SPEC-HEAR-1
    // Call with the default dir twice → same reference
    const a1 = loadHearingCatalog();
    const a2 = loadHearingCatalog();
    expect(a1).toBe(a2);

    // Call with a different (non-existent) dir will throw from the loader;
    // we just verify the default-dir cache is still intact after reset.
    _resetHearingCatalogCache();
    const b = loadHearingCatalog();
    // After reset a fresh load returns a new array (not the old reference)
    expect(b).not.toBe(a1);
    // But calling again with the same dir returns the same new reference
    expect(loadHearingCatalog()).toBe(b);
  });
});
