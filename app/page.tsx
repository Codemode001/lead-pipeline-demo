import { loadDashboard } from "@/lib/dashboard.ts";
import { STAGES } from "@/lib/clean.ts";
import WeeklyChart from "./weekly-chart.tsx";

// Re-read the sheet at most every 5 minutes.
export const revalidate = 300;

const usd = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const pacific = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function Page() {
  let data;
  try {
    data = await loadDashboard();
  } catch (err) {
    console.error(err);
    return (
      <main>
        <h1>Lead Pipeline</h1>
        <p className="error">Couldn't read the sheet. Check the service account has access and the env vars are set.</p>
      </main>
    );
  }
  const { totals, weeks, stageCounts, report } = data;
  const stageMax = Math.max(...Object.values(stageCounts), 1);
  const chartData = weeks.map((w) => ({ week: w.week, label: shortDate(w.week), leads: w.leads, hired: w.hired, spend: w.spend }));

  return (
    <main>
      <header className="top">
        <div>
          <h1>Lead Pipeline</h1>
          <div className="sub">Recruiting leads, read live from a Google Sheet and counted by week (Monday to Sunday, Pacific time)</div>
        </div>
        <div className="muted">Fetched {pacific(data.fetchedAt)}</div>
      </header>

      <section className="tiles">
        <div className="tile"><div className="label">Leads</div><div className="value">{totals.leads}</div>
          <div className="note">after cleaning</div></div>
        <div className="tile"><div className="label">Reached the quiz</div><div className="value">{pct(totals.quizRate)}</div>
          <div className="note">of leads passed the quiz</div></div>
        <div className="tile"><div className="label">Hired</div><div className="value">{totals.hired}</div>
          <div className="note">{totals.leads ? pct(totals.hired / totals.leads) : "—"} of leads</div></div>
        <div className="tile"><div className="label">Cost per lead</div><div className="value">{usd(totals.costPerLead)}</div>
          <div className="note">{usd(totals.spend)} ad spend</div></div>
        <div className="tile"><div className="label">Cost per hire</div><div className="value">{usd(totals.costPerHire)}</div>
          <div className="note">ad spend ÷ hires</div></div>
      </section>

      <section className="grid2">
        <div className="card">
          <h2>New leads per week</h2>
          <WeeklyChart data={chartData} />
        </div>
        <div className="card">
          <h2>Where every lead is now</h2>
          <div className="stages">
            {[...STAGES, "Lost" as const].map((s) => (
              <div key={s} className={`stage${s === "Lost" ? " lost" : ""}`}>
                <span>{s}</span>
                <div className="bar" style={{ width: `${(stageCounts[s] / stageMax) * 100}%` }} />
                <span className="n">{stageCounts[s]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Week by week</h2>
        <p className="muted" style={{ margin: "-6px 0 10px" }}>Leads and Lost count in the week the lead came in. Passed quiz, Interviews and Hired count in the week they happened, even for a lead from an earlier week.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week of</th><th>Leads</th><th>Lost</th><th>Passed quiz</th><th>Interviews</th><th>Hired</th>
                <th>Ad spend</th><th>Cost / lead</th>
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((w) => (
                <tr key={w.week}>
                  <td>{shortDate(w.week)}</td><td>{w.leads}</td><td>{w.lost}</td>
                  <td>{w.passedQuiz}</td><td>{w.interviews}</td><td>{w.hired}</td>
                  <td>{usd(w.spend)}</td>
                  <td>{w.spend === null || !w.leads ? "—" : usd(w.spend / w.leads)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                {(["leads", "lost", "passedQuiz", "interviews", "hired"] as const).map((k) => (
                  <th key={k}>{weeks.reduce((sum, w) => sum + w[k], 0)}</th>
                ))}
                <th>{usd(totals.spend)}</th><th>{usd(totals.costPerLead)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>What cleaning removed</h2>
        <div className="cleaning">
          <span><b>{report.rawRows}</b> rows in the sheet</span>
          <span><b>{report.duplicates}</b> duplicate submissions merged</span>
          <span><b>{report.testRows}</b> test rows dropped</span>
          <span><b>{report.blankRows}</b> blank rows skipped</span>
          <span><b>{report.badDates}</b> unreadable dates</span>
          {report.unknownStages.length > 0 && <span>Unknown stages: {report.unknownStages.join(", ")}</span>}
        </div>
      </section>

      <footer>
        Source: {data.source}. All data is fake, generated for this demo. Built by Harold Rhey Pisos ·{" "}
        <a href="https://github.com/Codemode001/lead-pipeline-demo">source code</a>
      </footer>
    </main>
  );
}
