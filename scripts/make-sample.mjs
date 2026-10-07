// Writes sample/leads.csv and sample/ad-spend.csv: fake leads for a recruiting funnel, with
// the mess a real form-fed sheet has (duplicate submissions, test rows, blank rows, mixed
// date formats, stage spelled several ways). Seeded, so the output is the same every run.
import { mkdirSync, writeFileSync } from "node:fs";

let seed = 20261008;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];

const first = ["James", "Maria", "Luis", "Ashley", "Tyler", "Brianna", "Marcus", "Jasmine", "Kevin", "Destiny",
  "Andre", "Kayla", "Derek", "Monica", "Trevor", "Alyssa", "Jordan", "Nicole", "Brandon", "Sofia", "Caleb", "Megan",
  "Isaiah", "Hannah", "Cody", "Rachel", "Dominic", "Lauren", "Austin", "Paige"];
const last = ["Johnson", "Garcia", "Martinez", "Brown", "Davis", "Lopez", "Wilson", "Anderson", "Thomas", "Moore",
  "Jackson", "Martin", "Lee", "Perez", "White", "Harris", "Clark", "Lewis", "Walker", "Young"];
const sources = ["Facebook Ads", "Facebook Ads", "Facebook Ads", "Indeed", "Google Ads", "Referral"];
const stageSpellings = {
  New: ["New", "new", "New Lead"],
  Contacted: ["Contacted", "contacted", "Reached out"],
  "Quiz Completed": ["Quiz Completed", "Quiz done", "quiz completed"],
  Interview: ["Interview", "Interview Booked"],
  Hired: ["Hired", "Placed"],
  Lost: ["Lost", "Disqualified"],
};

function stageFor(ageDays) {
  // Older leads have had time to move further down the funnel.
  const r = rand();
  if (ageDays < 4) return r < 0.6 ? "New" : r < 0.9 ? "Contacted" : "Quiz Completed";
  if (r < 0.12) return "New";
  if (r < 0.34) return "Contacted";
  if (r < 0.62) return "Quiz Completed";
  if (r < 0.8) return "Lost";
  if (r < 0.93) return "Interview";
  return "Hired";
}

const pad = (n) => String(n).padStart(2, "0");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(d) {
  const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  const hh = Math.floor(rand() * 14) + 8, mm = Math.floor(rand() * 60);
  switch (Math.floor(rand() * 5)) {
    case 0: return `${y}-${pad(m)}-${pad(day)} ${pad(hh)}:${pad(mm)}:00`;
    case 1: return `${m}/${day}/${y} ${hh > 12 ? hh - 12 : hh}:${pad(mm)} ${hh >= 12 ? "PM" : "AM"}`;
    case 2: return `${m}/${day}/${y}`;
    case 3: return `${pad(day)}-${MON[m - 1]}-${y}`;
    default: return `${y}-${pad(m)}-${pad(day)}`;
  }
}

const today = Date.UTC(2026, 9, 7); // Oct 7, 2026
const WEEKS = 10;
const start = today - WEEKS * 7 * 86_400_000;
const rows = [["Timestamp", "Name", "Email", "Phone", "Stage", "Quiz Score", "Source", "Quiz Date", "Interview Date", "Hired Date"]];
const people = [];
const usedPhones = new Set();
const usedEmails = new Set();

for (let t = start; t <= today; t += 86_400_000) {
  const weekIndex = Math.floor((t - start) / (7 * 86_400_000));
  const perDay = 2 + Math.floor(rand() * 4) + Math.floor(weekIndex / 3); // ad spend ramps up
  for (let i = 0; i < perDay; i++) {
    const f = pick(first), l = pick(last);
    let email;
    do email = `${f}.${l}${Math.floor(rand() * 90) + 10}@${pick(["gmail.com", "yahoo.com", "outlook.com", "icloud.com"])}`.toLowerCase();
    while (usedEmails.has(email));
    usedEmails.add(email);
    let phone;
    do phone = `(${pick(["512", "602", "813", "469", "720"])}) 555-${String(Math.floor(rand() * 9000) + 1000)}`;
    while (usedPhones.has(phone)); // two different people must never share a number
    usedPhones.add(phone);
    let stage = stageFor((today - t) / 86_400_000);
    // Each later event happens some days after the one before. Anything that would land after
    // today hasn't happened yet, so the lead stays at the earlier stage.
    const later = (from, min, span) => from + (min + Math.floor(rand() * span)) * 86_400_000;
    const tookQuiz = ["Quiz Completed", "Interview", "Hired"].includes(stage) || (stage === "Lost" && rand() < 0.5);
    let quizAt = tookQuiz ? later(t, 0, 3) : null;
    let interviewAt = quizAt && ["Interview", "Hired"].includes(stage) ? later(quizAt, 2, 6) : null;
    let hiredAt = interviewAt && stage === "Hired" ? later(interviewAt, 3, 7) : null;
    if (hiredAt && hiredAt > today) { hiredAt = null; stage = "Interview"; }
    if (interviewAt && interviewAt > today) { interviewAt = null; stage = "Quiz Completed"; }
    if (quizAt && quizAt > today) { quizAt = null; stage = "Contacted"; }
    const quiz = quizAt ? String(Math.floor(rand() * 45) + 55) : "";
    const day = (ms) => (ms ? formatDate(new Date(ms)).replace(/ .*$/, "") : "");
    const row = [formatDate(new Date(t)), `${f} ${l}`, email, phone, pick(stageSpellings[stage]), quiz, pick(sources),
      day(quizAt), day(interviewAt), day(hiredAt)];
    rows.push(row);
    people.push(row);
  }
}

// Duplicate submissions: same person fills the form again a day or two later.
for (let i = 0; i < 18; i++) {
  const p = pick(people);
  const again = [...p];
  again[0] = formatDate(new Date(today - Math.floor(rand() * WEEKS * 7) * 86_400_000));
  if (rand() < 0.5) again[2] = again[2].toUpperCase();
  if (rand() < 0.3) again[2] = ""; // matched on phone instead
  again[4] = pick(stageSpellings.New);
  again[7] = again[8] = again[9] = ""; // a resubmitted form has no outcomes yet
  rows.splice(1 + Math.floor(rand() * (rows.length - 1)), 0, again);
}
// Test rows and blank rows from setting up the form.
const testRows = [
  ["2026-08-01", "Test Lead", "test@example.com", "", "New", "", "Facebook Ads", "", "", ""],
  ["8/2/2026", "TEST - do not use", "owner@demo-recruiting.com", "", "New", "", "", "", "", ""],
  ["2026-08-15 09:00:00", "asdf", "asdf@test.com", "", "Contacted", "", "", "", "", ""],
  ["9/10/2026", "Dummy Candidate", "dummy@example.org", "(512) 555-0000", "Hired", "100", "Referral", "9/11/2026", "9/14/2026", "9/18/2026"],
];
for (const r of testRows) rows.splice(1 + Math.floor(rand() * (rows.length - 1)), 0, r);
for (let i = 0; i < 5; i++) rows.splice(1 + Math.floor(rand() * (rows.length - 1)), 0, Array(10).fill(""));

const csv = (rs) => rs.map((r) => r.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
mkdirSync("sample", { recursive: true });
writeFileSync("sample/leads.csv", csv(rows));

const spend = [["Week Start", "Spend"]];
for (let w = 0; w <= WEEKS; w++) {
  const d = new Date(start + w * 7 * 86_400_000);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  spend.push([`${monday.getUTCMonth() + 1}/${monday.getUTCDate()}/${monday.getUTCFullYear()}`, `$${(900 + w * 120 + Math.floor(rand() * 200)).toLocaleString("en-US")}`]);
}
writeFileSync("sample/ad-spend.csv", csv(spend));
console.log(`leads.csv: ${rows.length - 1} rows · ad-spend.csv: ${spend.length - 1} weeks`);
