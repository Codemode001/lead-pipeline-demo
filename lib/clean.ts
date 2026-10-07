// Turns raw sheet rows into clean leads. Pure functions, no I/O, so the rules can be tested
// against the same cases the sheet throws at us: duplicates, test rows, mixed date formats.

export const STAGES = ["New", "Contacted", "Quiz Completed", "Interview", "Hired"] as const;
export type Stage = (typeof STAGES)[number] | "Lost";

export interface Lead {
  name: string;
  email: string;
  phone: string;
  stage: Stage;
  quizScore: number | null;
  source: string;
  created: Date; // UTC midnight of the day the lead came in
}

export interface CleanReport {
  rawRows: number;
  kept: number;
  duplicates: number;
  testRows: number;
  blankRows: number;
  badDates: number;
  unknownStages: string[];
}

const STAGE_ALIASES: Record<string, Stage> = {
  new: "New",
  "new lead": "New",
  contacted: "Contacted",
  "reached out": "Contacted",
  quiz: "Quiz Completed",
  "quiz done": "Quiz Completed",
  "quiz completed": "Quiz Completed",
  interview: "Interview",
  "interview booked": "Interview",
  hired: "Hired",
  placed: "Hired",
  lost: "Lost",
  disqualified: "Lost",
};

export function normalizeStage(raw: string): Stage | null {
  return STAGE_ALIASES[raw.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function utc(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

// Accepts what people and form tools actually put in a sheet:
// 2026-08-03, 2026-08-03 14:22:10, 8/3/2026, 8/3/2026 2:22 PM, 03-Aug-2026, Aug 3, 2026,
// and a bare Sheets serial number (days since 1899-12-30). Slashed dates read as US month/day
// unless the first number can't be a month.
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (m) return utc(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    return a > 12 ? utc(y, b, a) : utc(y, a, b);
  }

  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month ? utc(+m[3], month, +m[1]) : null;
  }

  m = s.match(/^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return month ? utc(+m[3], month, +m[2]) : null;
  }

  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(+s);
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    return date;
  }

  return null;
}

function isTestRow(name: string, email: string): boolean {
  const text = `${name} ${email}`.toLowerCase();
  return /\btest\b|\bdummy\b|do not use|asdf/.test(text) || /@(example|test)\.(com|org)$/.test(email.toLowerCase());
}

const stageRank = (s: Stage) => (s === "Lost" ? -1 : STAGES.indexOf(s));

/**
 * rows: the Leads tab as a header row plus data rows, as the Sheets API returns them.
 * Duplicates (same email, or same phone digits) collapse into one lead: it keeps the
 * earliest date it came in and the furthest stage it reached.
 */
export function cleanLeads(rows: string[][]): { leads: Lead[]; report: CleanReport } {
  const [header = [], ...data] = rows;
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const idx = {
    date: col("timestamp"),
    name: col("name"),
    email: col("email"),
    phone: col("phone"),
    stage: col("stage"),
    quiz: col("quiz score"),
    source: col("source"),
  };
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").toString().trim() : "");

  const report: CleanReport = {
    rawRows: data.length, kept: 0, duplicates: 0, testRows: 0, blankRows: 0, badDates: 0, unknownStages: [],
  };
  const byKey = new Map<string, Lead>();
  const unknown = new Set<string>();

  for (const row of data) {
    const name = get(row, idx.name);
    const email = get(row, idx.email).toLowerCase();
    const phone = get(row, idx.phone).replace(/\D/g, "").slice(-10);
    if (!name && !email && !phone) { report.blankRows++; continue; }
    if (isTestRow(name, email)) { report.testRows++; continue; }

    const created = parseDate(get(row, idx.date));
    if (!created) { report.badDates++; continue; }

    const rawStage = get(row, idx.stage);
    const stage = normalizeStage(rawStage || "new");
    if (!stage) unknown.add(rawStage);

    const quizRaw = get(row, idx.quiz).replace("%", "");
    const lead: Lead = {
      name,
      email,
      phone,
      stage: stage ?? "New",
      quizScore: quizRaw && !Number.isNaN(+quizRaw) ? +quizRaw : null,
      source: get(row, idx.source) || "Unknown",
      created,
    };

    const key = email || `phone:${phone}`;
    const existing = byKey.get(key) ?? (phone ? byKey.get(`phone:${phone}`) : undefined);
    if (existing) {
      report.duplicates++;
      if (lead.created < existing.created) existing.created = lead.created;
      if (stageRank(lead.stage) > stageRank(existing.stage) || lead.stage === "Lost") existing.stage = lead.stage;
      existing.quizScore ??= lead.quizScore;
      continue;
    }
    byKey.set(key, lead);
    if (phone) byKey.set(`phone:${phone}`, lead);
  }

  const leads = [...new Set(byKey.values())].sort((a, b) => +a.created - +b.created);
  report.kept = leads.length;
  report.unknownStages = [...unknown];
  return { leads, report };
}

/** Monday (UTC) of the week a date falls in. */
export function weekStart(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The Ad Spend tab: "Week Start" and "Spend", one row per week. */
export function parseSpend(rows: string[][]): Map<string, number> {
  const spend = new Map<string, number>();
  for (const row of rows.slice(1)) {
    const date = parseDate(row[0] ?? "");
    const amount = +(row[1] ?? "").toString().replace(/[$,\s]/g, "");
    if (!date || Number.isNaN(amount)) continue;
    const key = isoDay(weekStart(date));
    spend.set(key, (spend.get(key) ?? 0) + amount);
  }
  return spend;
}

export interface WeekRow {
  week: string; // Monday, YYYY-MM-DD
  leads: number;
  byStage: Record<Stage, number>;
  reachedQuiz: number;
  hired: number;
  spend: number | null;
}

/**
 * Counting rule: a lead belongs to the week it came in (Monday start), whatever stage it is
 * at now. "Reached quiz" counts leads at Quiz Completed or further.
 */
export function weekly(leads: Lead[], spend: Map<string, number>): WeekRow[] {
  const weeks = new Map<string, WeekRow>();
  const empty = () => Object.fromEntries([...STAGES, "Lost"].map((s) => [s, 0])) as Record<Stage, number>;
  for (const lead of leads) {
    const key = isoDay(weekStart(lead.created));
    let w = weeks.get(key);
    if (!w) {
      w = { week: key, leads: 0, byStage: empty(), reachedQuiz: 0, hired: 0, spend: spend.get(key) ?? null };
      weeks.set(key, w);
    }
    w.leads++;
    w.byStage[lead.stage]++;
    if (stageRank(lead.stage) >= STAGES.indexOf("Quiz Completed")) w.reachedQuiz++;
    if (lead.stage === "Hired") w.hired++;
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}
