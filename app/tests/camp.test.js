import test from "node:test";
import assert from "node:assert/strict";
import { campOf } from "../lib/portal.js";

test("a person's camp: enrollment location first, then Portal - Location, else Little Elm", () => {
  assert.deepEqual(campOf({ wc26__camp_location: "Dallas – 8494 Stults Rd" }), { key: "dallas", name: "Dallas" });
  assert.deepEqual(campOf({ wc26__camp_location: "Little Elm – 520 Lobo Lane", portal__location: "Dallas" }), { key: "littleelm", name: "Little Elm" });
  assert.deepEqual(campOf({ portal__location: "Dallas" }), { key: "dallas", name: "Dallas" });
  assert.deepEqual(campOf({ portal__location: "Plano" }), { key: "littleelm", name: "Little Elm" });
  assert.deepEqual(campOf({}), { key: "littleelm", name: "Little Elm" });
});
