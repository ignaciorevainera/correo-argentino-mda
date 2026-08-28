import assert from "node:assert/strict";
import { matchesCurrentUser } from "../src/lib/currentUserMatch";

assert.equal(
  matchesCurrentUser("jrevainera", "Juan Revainera", "jrevainera"),
  true,
  "username match (case-insensitive)",
);
assert.equal(
  matchesCurrentUser("otro", "Juan Revainera", "jrevainera"),
  false,
  "no match when neither equals",
);
assert.equal(
  matchesCurrentUser(null, "Juan Revainera", "juan revainera"),
  true,
  "name match when username is null",
);
assert.equal(
  matchesCurrentUser("jrevainera", null, "jrevainera"),
  true,
  "username match when name is null",
);
assert.equal(
  matchesCurrentUser("jrevainera", "Juan", ""),
  false,
  "empty current user never matches",
);
assert.equal(
  matchesCurrentUser(undefined, undefined, "jrevainera"),
  false,
  "no operator data never matches",
);
assert.equal(
  matchesCurrentUser("JRevainera", "X", "jrevainera"),
  true,
  "username case-insensitive match",
);

console.log("OK current-user-match");
