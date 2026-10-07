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

test("leads count by creation week, later events by the week they happened", () => {
  const { leads } = cleanLeads([
    ["Timestamp", "Name", "Email", "Stage", "Quiz Date", "Interview Date", "Hired Date"],
    ["2026-09-29", "Ana", "a@x.io", "Interview", "9/30/2026", "Oct 7, 2026", ""], // like the spec's example: lead one week, interview the next
    ["2026-10-06", "Ben", "b@x.io", "Hired", "2026-10-06", "2026-10-08", "12-Oct-2026"],
    ["2026-10-04", "Cy", "c@x.io", "Lost", "", "", ""], // Sunday -> week of Sep 28
    ["2026-10-07", "Ben again", "b@x.io", "New", "", "", ""], // duplicate keeps Ben's dates
  ]);
  const spend = parseSpend([["Week Start", "Spend"], ["10/6/2026", "$1,200"]]);
  const rows = weekly(leads, spend);
  assert.deepEqual(rows.map((r) => [r.week, r.leads, r.lost, r.passedQuiz, r.interviews, r.hired, r.spend]), [
    ["2026-09-28", 2, 1, 1, 0, 0, null],
    ["2026-10-05", 1, 0, 1, 2, 0, 1200],
    ["2026-10-12", 0, 0, 0, 0, 1, null],
  ]);
  assert.equal(leads.find((l) => l.email === "b@x.io")!.stage, "Hired");
});
