import { join } from "node:path";
import { loadValidated } from "./loader.js";

// Committee content type — mirrors schemas/committee.schema.json.
// A Committee defines the voting members of an FOMC-style body: their policy
// lean, competence score, and localization-key name. No engine logic here.

export interface CommitteeMember {
  id: string;
  name: string;
  lean: "hawkish" | "dovish" | "neutral";
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
