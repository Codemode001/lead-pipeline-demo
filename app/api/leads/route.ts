import { loadDashboard } from "@/lib/dashboard.ts";

export const revalidate = 300;

/** The same numbers the dashboard shows, as JSON. No names, emails or phones leave the server. */
export async function GET() {
  try {
    const { source, fetchedAt, report, weeks, stageCounts, totals } = await loadDashboard();
    return Response.json({ source, fetchedAt, totals, stageCounts, weeks, cleaning: report });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't read the sheet" }, { status: 502 });
  }
}
