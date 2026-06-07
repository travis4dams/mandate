import { join } from "node:path";
import { loadValidated } from "./loader.js";

// Hearing content type — mirrors schemas/hearing.schema.json.
// Each hearing carries an ordered list of questions; each question has answer
// choices that contribute scenario weights and optional state modifiers.
// The resolver is pure and deterministic. SPEC-HEAR-1.

/** The five state variables a hearing answer is allowed to modify (mirrors the schema enum). */
export type HearingModifierTarget =
  | "credibility"
  | "policy_rate"
  | "inflation"
  | "unemployment"
  | "expectations_anchor";

export interface HearingStateModifier {
  readonly target: HearingModifierTarget;
  readonly delta: number;
}

export interface HearingAnswer {
  readonly id: string;
  readonly text: string;
  readonly scenario_weights?: Readonly<Record<string, number>>;
  readonly state_modifiers?: readonly HearingStateModifier[];
}

export interface HearingQuestion {
  readonly id: string;
  readonly text: string;
  readonly answers: readonly HearingAnswer[];
}

export interface HearingEntry {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
  readonly questions: readonly HearingQuestion[];
}

export interface HearingResult {
  readonly scenarioId: string;
  readonly modifiers: readonly HearingStateModifier[];
}

// Thrown when no hearing with the requested id is found.
export class HearingNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Hearing "${id}" not found in content/hearings/`);
    this.name = "HearingNotFoundError";
  }
}

// Thrown when an answer id is not found in the expected question.
export class HearingAnswerNotFoundError extends Error {
  constructor(
    public readonly answerId: string,
    public readonly questionId: string,
  ) {
    super(`Answer "${answerId}" not found in question "${questionId}"`);
    this.name = "HearingAnswerNotFoundError";
  }
}

// Thrown when no scenario weights were accumulated (all answers lacked scenario_weights).
export class HearingNoScenariosError extends Error {
  constructor() {
    super(
      "Hearing produced no scenario weights — at least one answer must specify scenario_weights",
    );
    this.name = "HearingNoScenariosError";
  }
}

const DEFAULT_HEARINGS_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/hearings",
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/hearing.schema.json",
);

const _cache = new Map<string, HearingEntry[]>();

export function loadHearingCatalog(dir: string = DEFAULT_HEARINGS_DIR): HearingEntry[] {
  const cached = _cache.get(dir);
  if (cached !== undefined) return cached;
  const entries = loadValidated<HearingEntry>(SCHEMA_PATH, dir);
  _cache.set(dir, entries);
  return entries;
}

export function _resetHearingCatalogCache(): void {
  _cache.clear();
}

export function loadHearing(id: string, dir?: string): HearingEntry {
  const hearings = loadHearingCatalog(dir);
  const hearing = hearings.find((h) => h.id === id);
  if (!hearing) throw new HearingNotFoundError(id);
  return hearing;
}

/**
 * Given one answer id per question (in question order), returns the selected
 * starting scenario id and the accumulated state modifiers.
 *
 * Scenario selection: each chosen answer contributes its scenario_weights
 * additively; the scenario with the highest total wins. Alphabetical tiebreak
 * on scenario id ensures determinism.
 */
export function resolveHearing(
  answers: readonly string[],
  hearing: HearingEntry,
): HearingResult {
  if (answers.length !== hearing.questions.length) {
    throw new Error(
      `resolveHearing: expected ${hearing.questions.length} answer(s) for hearing "${hearing.id}", got ${answers.length}`,
    );
  }

  const scores: Record<string, number> = {};
  const modifiers: HearingStateModifier[] = [];

  for (let i = 0; i < hearing.questions.length; i++) {
    const question = hearing.questions[i];
    const answerId = answers[i];
    const answer = question.answers.find((a) => a.id === answerId);
    if (!answer) throw new HearingAnswerNotFoundError(answerId, question.id);

    for (const [scenarioId, weight] of Object.entries(answer.scenario_weights ?? {})) {
      scores[scenarioId] = (scores[scenarioId] ?? 0) + weight;
    }
    for (const mod of answer.state_modifiers ?? []) {
      modifiers.push(mod);
    }
  }

  const candidates = Object.keys(scores).sort();
  if (candidates.length === 0) throw new HearingNoScenariosError();

  const scenarioId = candidates.reduce((best, id) =>
    scores[id] > scores[best] ? id : best,
  );

  return { scenarioId, modifiers };
}
