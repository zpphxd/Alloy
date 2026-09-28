/**
 * Owners we skip outright: too big, a waste of time, or locked up. Paul:
 * "A whole bunch of them are gonna be tied to people we don't want, like BP
 * Wind and Solar. Who cares?"
 *
 * Matching is a case-insensitive whole-word match on the owner name, its
 * aliases, and its parent. Edit freely; this list is a starting point.
 */
export const EXCLUDED_OWNERS: string[] = [
  "bp", "lightsource bp", "nextera", "florida power", "engie", "enel", "aes", "invenergy",
  "rwe", "edf", "orsted", "ørsted", "duke energy", "shell", "totalenergies", "iberdrola",
  "avangrid", "brookfield", "vistra", "nrg", "calpine", "constellation", "dominion",
  "southern power", "xcel", "berkshire hathaway", "exxon", "chevron", "oncor", "centerpoint",
  "luminant", "tesla",
];
