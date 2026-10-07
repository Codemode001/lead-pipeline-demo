import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { JWT } from "google-auth-library";

// Every page reads data through this interface, so swapping Google Sheets for another
// source (a CRM API, a database) means writing one new LeadSource, not touching the pages.
export interface LeadSource {
  name: string;
  /** Leads tab: header row first, then one row per form submission. */
  leadRows(): Promise<string[][]>;
  /** Ad Spend tab: header row first, then "Week Start", "Spend". */
  spendRows(): Promise<string[][]>;
}

class GoogleSheetSource implements LeadSource {
  name = "Google Sheets API (service account)";
  private auth: JWT;
  private cache: Promise<Record<string, string[][]>> | null = null;

  constructor(private sheetId: string, email: string, privateKey: string) {
    // The key lives in a server-side env var only. It never reaches the browser: this module
    // imports "server-only", so a client component that imports it fails the build.
    this.auth = new JWT({
      email,
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  private ranges() {
    this.cache ??= (async () => {
      const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values:batchGet`);
      url.searchParams.append("ranges", "Leads!A:G");
      url.searchParams.append("ranges", "'Ad Spend'!A:B");
      url.searchParams.set("valueRenderOption", "FORMATTED_VALUE");
      const res = await this.auth.request<{ valueRanges: { values?: string[][] }[] }>({ url: url.toString() });
      const [leads, spend] = res.data.valueRanges;
      return { leads: leads.values ?? [], spend: spend.values ?? [] };
    })();
    return this.cache;
  }

  async leadRows() { return (await this.ranges()).leads; }
  async spendRows() { return (await this.ranges()).spend; }
}

/** Local development without credentials: the same fake data the live sheet holds. */
class SampleCsvSource implements LeadSource {
  name = "Local sample CSV (development only)";
  private async csv(file: string) {
    const text = await readFile(path.join(process.cwd(), "sample", file), "utf8");
    return text.trim().split("\n").map(parseCsvLine);
  }
  leadRows() { return this.csv("leads.csv"); }
  spendRows() { return this.csv("ad-spend.csv"); }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function getSource(): LeadSource {
  const { SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    return new GoogleSheetSource(SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
  }
  if (process.env.NODE_ENV !== "production") return new SampleCsvSource();
  throw new Error("SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY must be set");
}
