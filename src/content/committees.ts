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

// Thrown when no committee with the requested id is found.
export class CommitteeNotFoundError extends Error {
  constructor(id: string) {
    super(`Committee "${id}" not found in content/committees/`);
    this.name = "CommitteeNotFoundError";
  }
}

const DEFAULT_COMMITTEES_DIR = join(
  new URL(".", import.meta.url).pathname,
  "../../content/committees"
);
const SCHEMA_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../schemas/committee.schema.json"
);

// Load a committee by id.
// @param id  - The committee id, e.g. "comm.fomc_1979".
// @param dir - Optional override of the content directory (used by tests).
// @throws CommitteeNotFoundError when no committee with the id is present in dir.
export function loadCommittee(id: string, dir: string = DEFAULT_COMMITTEES_DIR): Committee {
  const committees = loadValidated<Committee>(SCHEMA_PATH, dir);
  const committee = committees.find((c) => c.id === id);
  if (!committee) {
    throw new CommitteeNotFoundError(id);
  }
  return committee;
}
