// Fills a Google Sheet with sample/leads.csv and sample/ad-spend.csv, as the "Leads" and
// "Ad Spend" tabs. Values go in RAW, so mixed date formats stay as typed, like a form feed.
// Usage: node scripts/seed-sheet.mjs <service-account-key.json> <sheet id>
//    or: node --env-file=.env.local scripts/seed-sheet.mjs   (reads the same env vars as the app)
import { readFileSync } from "node:fs";
import { JWT } from "google-auth-library";

const [keyFile, argSheetId] = process.argv.slice(2);
const key = keyFile
  ? JSON.parse(readFileSync(keyFile, "utf8"))
  : { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") };
const sheetId = argSheetId ?? process.env.SHEET_ID;
if (!key.client_email || !key.private_key || !sheetId) throw new Error("usage: seed-sheet.mjs <key.json> <sheet id>, or set the env vars");
const auth = new JWT({ email: key.client_email, key: key.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
const api = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

const csv = (file) => readFileSync(file, "utf8").trim().split("\n").map((line) => {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
});

const meta = (await auth.request({ url: `${api}?fields=sheets.properties` })).data;
const tabs = meta.sheets.map((s) => s.properties);
const requests = [];
const first = tabs[0];
if (!tabs.some((t) => t.title === "Leads")) {
  requests.push({ updateSheetProperties: { properties: { sheetId: first.sheetId, title: "Leads", gridProperties: { frozenRowCount: 1 } }, fields: "title,gridProperties.frozenRowCount" } });
}
if (!tabs.some((t) => t.title === "Ad Spend")) {
  requests.push({ addSheet: { properties: { title: "Ad Spend", gridProperties: { frozenRowCount: 1 } } } });
}
if (requests.length) await auth.request({ url: `${api}:batchUpdate`, method: "POST", data: { requests } });

await auth.request({ url: `${api}/values:batchClear`, method: "POST", data: { ranges: ["Leads", "'Ad Spend'"] } });
const res = await auth.request({
  url: `${api}/values:batchUpdate`, method: "POST",
  data: {
    valueInputOption: "RAW",
    data: [
      { range: "Leads!A1", values: csv("sample/leads.csv") },
      { range: "'Ad Spend'!A1", values: csv("sample/ad-spend.csv") },
    ],
  },
});
console.log(`updated ${res.data.totalUpdatedRows} rows`);
