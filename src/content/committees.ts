import { join } from "node:path";
import { loadValidated } from "./loader.js";

// Committee content type — mirrors schemas/committee.schema.json.
// SPEC-COMM-3: each member carries continuous Taylor-rule reaction coefficients
// rather than the old hawkish/dovish/neutral trichotomy. Empirical anchors and
// the rationale for the coefficient ranges are in
// docs/research/2026-06-02-fomc-empirical-anchors.md.

export interface CommitteeMember {
  id: string;
  name: string;
  /** Per-member weight on the inflation gap (target ≈ 1.7, hawks 1.8-2.0, doves 1.4-1.6). */
  inflation_coef: number;
  /** Per-member weight on the unemployment-gap term. memberPreferred subtracts
   *  `output_coef * (unemployment - target_unemployment)`, which is direction-
   *  equivalent to the classical Taylor rule's output-gap term. */
  output_coef: number;
  /** Smoothing on lagged policy rate (empirical 0.85-0.92). High inertia is what makes the dots cluster. */
  inertia: number;
  competence: number;
}

export interface Committee {
  id: string;
  name: string;
  desc: string;
  members: CommitteeMember[];
}

// Thrown when no committee with the requested id is found in the search dir.
export class CommitteeNotFoundError extends Error {
  constructor(id: string, dir: string) {
    super(`Committee "${id}" not found in ${dir}`);
    this.name = "CommitteeNotFoundError";
  }
}

// Thrown when a committee has duplicate member ids — the schema can't express this.
export class CommitteeDuplicateMemberError extends Error {
  constructor(
    public readonly committeeId: string,
    public readonly duplicateMemberId: string,
  ) {
    super(`Committee "${committeeId}": duplicate member id "${duplicateMemberId}".`);
    this.name = "CommitteeDuplicateMemberError";
  }
}

const DEFAULT_COMMITTEES_DIR = join(new URL(".", import.meta.url).pathname, "../../content/committees");
const SCHEMA_PATH = join(new URL(".", import.meta.url).pathname, "../../schemas/committee.schema.json");

export function loadCommittee(id: string, dir: string = DEFAULT_COMMITTEES_DIR): Committee {
  const committees = loadValidated<Committee>(SCHEMA_PATH, dir);
  const committee = committees.find((c) => c.id === id);
  if (!committee) throw new CommitteeNotFoundError(id, dir);
  const seen = new Set<string>();
  for (const m of committee.members) {
    if (seen.has(m.id)) throw new CommitteeDuplicateMemberError(committee.id, m.id);
    seen.add(m.id);
  }
  return committee;
}
