import assert from "node:assert/strict";
import test from "node:test";
import { matchHistorySql, matchHistoryTemplate } from "./historyTemplates";
import { SUPPORTED_RESPONSE_LANGUAGES } from "@nutriagent/shared";

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

// Regression: only English and Hebrew were listed, so Russian fell through to
// the LLM and its schema-qualified SQL was rejected — surfacing as a 500 for
// "Что я ел вчера?" while the English question worked.
test("every supported language reaches the yesterday template", () => {
  const questions: Record<string, string> = {
    en: "What did I eat yesterday?",
    he: "מה אכלתי אתמול?",
    ru: "Что я ел вчера?",
  };

  for (const lang of SUPPORTED_RESPONSE_LANGUAGES) {
    const template = matchHistoryTemplate(questions[lang]);
    assert.ok(template, `no template matched for ${lang}`);
    assert.equal(template!.kind, "meals");
    assert.match(template!.sql, /CURRENT_DATE - INTERVAL '1 day'/);
  }
});

test("every supported language reaches the today template", () => {
  for (const q of ["What did I eat today?", "מה אכלתי היום?", "Что я ел сегодня?"]) {
    const template = matchHistoryTemplate(q);
    assert.ok(template, `no template matched for: ${q}`);
    assert.equal(template!.kind, "meals");
    assert.match(template!.sql, /meal_datetime >= CURRENT_DATE\b/);
  }
});

test("every supported language reaches the week template", () => {
  for (const q of ["What did I eat this week?", "מה אכלתי השבוע?", "Что я ел за неделю?"]) {
    const template = matchHistoryTemplate(q);
    assert.ok(template, `no template matched for: ${q}`);
    assert.match(template!.sql, /INTERVAL '7 days'/);
  }
});

test("steps questions return the steps template, not a meal list", () => {
  for (const q of ["How many steps today?", "כמה צעדים היום?", "Сколько шагов сегодня?"]) {
    const template = matchHistoryTemplate(q);
    assert.ok(template, `no template matched for: ${q}`);
    assert.equal(template!.kind, "steps");
    assert.match(template!.sql, /activity\.daily_steps/);
    assert.doesNotMatch(template!.sql, /meal_items/);
  }
});

// "How many steps yesterday?" mentions a period AND steps. Steps must win —
// answering with a meal list would be a confidently wrong answer.
test("steps takes precedence over the period keyword", () => {
  const template = matchHistoryTemplate("How many steps did I walk yesterday?");
  assert.ok(template);
  assert.equal(template!.kind, "steps");
  assert.match(template!.sql, /CURRENT_DATE - INTERVAL '1 day'/);
});

test("bare 'what did I eat' defaults to today, not yesterday", () => {
  const template = matchHistoryTemplate("What did I eat?");
  assert.ok(template);
  assert.match(template!.sql, /meal_datetime >= CURRENT_DATE\b/);
  assert.doesNotMatch(template!.sql, /CURRENT_DATE - INTERVAL '1 day'/);
});
