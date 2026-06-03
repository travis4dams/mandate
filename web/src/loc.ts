// SPEC-CONTENT-2: tiny localization helper. All player-facing strings in web/
// must come through `t(key)` against content/localization/en.json (the same
// bundle the engine uses for member names, scenario titles, etc.).
//
// The current implementation is single-locale. A future spec will swap the
// imported file based on a runtime locale; the call sites stay identical.

import en from "../../content/localization/en.json";

const table = en as Record<string, string | undefined>;

export function t(key: string): string {
  const value = table[key];
  if (value === undefined) {
    // Returning the key itself surfaces missing translations in the UI without
    // crashing the dashboard — easier to spot during dev than a silent blank.
    return key;
  }
  return value;
}
