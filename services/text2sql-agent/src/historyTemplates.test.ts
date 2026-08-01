import assert from "node:assert/strict";
import test from "node:test";
import { matchHistorySql } from "./historyTemplates";

test("matchHistorySql returns yesterday template", () => {
  const sql = matchHistorySql("What did I eat yesterday?");
  assert.ok(sql);
  assert.match(sql!, /CURRENT_DATE - INTERVAL '1 day'/);
  assert.match(sql!, /JOIN meal_items/);
});

test("matchHistorySql returns today template", () => {
  const sql = matchHistorySql("How many calories today?");
  assert.ok(sql);
  assert.match(sql!, /meal_datetime >= CURRENT_DATE/);
});

test("matchHistorySql returns null for open-ended questions", () => {
  assert.equal(matchHistorySql("What is my average protein intake?"), null);
});
