import "server-only";
import { cleanLeads, parseSpend, weekly, STAGES, type Stage } from "./clean.ts";
import { getSource } from "./source.ts";

export async function loadDashboard() {
  const source = getSource();
  const [leadRows, spendRows] = await Promise.all([source.leadRows(), source.spendRows()]);
  const { leads, report } = cleanLeads(leadRows);
  const weeks = weekly(leads, parseSpend(spendRows));

  const stageCounts = Object.fromEntries([...STAGES, "Lost"].map((s) => [s, 0])) as Record<Stage, number>;
  for (const l of leads) stageCounts[l.stage]++;

  const totalSpend = weeks.reduce((sum, w) => sum + (w.spend ?? 0), 0);
  const hired = stageCounts.Hired;
  const reachedQuiz = leads.filter((l) => l.quizDate).length;

  return {
    source: source.name,
    fetchedAt: new Date().toISOString(),
    report,
    weeks,
    stageCounts,
    totals: {
      leads: leads.length,
      hired,
      quizRate: leads.length ? reachedQuiz / leads.length : 0,
      spend: totalSpend,
      costPerLead: leads.length ? totalSpend / leads.length : null,
      costPerHire: hired ? totalSpend / hired : null,
    },
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;
