import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLeads, parseDate, parseSpend, weekly, isoDay } from "./clean.ts";

test("parseDate reads the formats the sheet mixes", () => {
  const want = "2026-08-03";
  for (const s of ["2026-08-03", "2026-08-03 14:22:10", "8/3/2026", "8/3/2026 2:22 PM", "03-Aug-2026", "Aug 3, 2026", "46237"]) {
    assert.equal(isoDay(parseDate(s)!), want, s);
  }
  assert.equal(isoDay(parseDate("25/8/2026")!), "2026-08-25"); // can't be a month, so day first
  assert.equal(parseDate("2/30/2026"), null);
  assert.equal(parseDate("soon"), null);
});

test("cleanLeads drops test and blank rows and merges duplicates", () => {
  const rows = [
    ["Timestamp", "Name", "Email", "Phone", "Stage", "Quiz Score", "Source"],
    ["8/3/2026", "Ana Cruz", "ana@acme.io", "(555) 010-1111", "new", "", "Facebook"],
    ["2026-08-05", "Ana Cruz", "ANA@acme.io ", "", "Interview booked", "82", "Facebook"],
    ["2026-08-04", "Ben Ortiz", "ben@acme.io", "555-010-2222", "Contacted", "", "Google"],
    ["2026-08-06", "B. Ortiz", "", "+1 555 010 2222", "Hired", "", "Google"],
    ["2026-08-04", "Test Lead", "test@example.com", "", "New", "", ""],
    ["", "", "", "", "", "", ""],
    ["next week", "Cara Lim", "cara@acme.io", "", "New", "", ""],
  ];
  const { leads, report } = cleanLeads(rows);
  assert.equal(report.kept, 2);
  assert.equal(report.duplicates, 2);
  assert.equal(report.testRows, 1);
  assert.equal(report.blankRows, 1);
  assert.equal(report.badDates, 1);
  const ana = leads.find((l) => l.email === "ana@acme.io")!;
  assert.equal(ana.stage, "Interview");
  assert.equal(isoDay(ana.created), "2026-08-03");
  assert.equal(ana.quizScore, 82);
  assert.equal(leads.find((l) => l.phone === "5550102222")!.stage, "Hired");
});

test("weekly counts each lead in the Monday week it came in", () => {
  const { leads } = cleanLeads([
    ["Timestamp", "Name", "Email", "Stage"],
    ["2026-08-02", "Sun", "a@x.io", "Hired"], // Sunday -> week of Jul 27
    ["2026-08-03", "Mon", "b@x.io", "Quiz Completed"],
    ["2026-08-09", "Sun2", "c@x.io", "New"],
  ]);
  const spend = parseSpend([["Week Start", "Spend"], ["2026-08-03", "$1,200"]]);
  const rows = weekly(leads, spend);
  assert.deepEqual(rows.map((r) => [r.week, r.leads, r.reachedQuiz, r.hired, r.spend]), [
    ["2026-07-27", 1, 1, 1, null],
    ["2026-08-03", 2, 1, 0, 1200],
  ]);
});
