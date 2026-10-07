# Lead Pipeline Dashboard

A recruiting-funnel dashboard that reads leads from a Google Sheet, cleans them, and counts
them week by week. Next.js (App Router) on Vercel. All data in the sheet is fake.

## What it does

- Reads two tabs, **Leads** and **Ad Spend**, through the Google Sheets API with a service account.
- Cleans the rows before counting:
  - merges duplicate submissions (same email, or same phone number), keeping the earliest date
    and the furthest stage reached
  - drops test rows (`test`, `dummy`, `asdf`, `@example.com`) and blank rows
  - reads mixed date formats: `2026-08-03`, `8/3/2026 2:22 PM`, `03-Aug-2026`, `Aug 3, 2026`,
    and Sheets serial numbers
  - maps stage spellings (`Quiz done`, `Interview Booked`, `Placed`, ...) onto one list
- Counts by two rules, like a dispo-dated stats sheet: leads (and lost leads) count in the week
  they came in; passed quiz, interviews and hires count in the week each one happened, even for
  a lead from an earlier week. Weeks run Monday to Sunday, Pacific time.
- Shows cost per lead and per hire against weekly ad spend.
- Works on a phone.

## Credentials

The service account key lives only in server-side environment variables (`SHEET_ID`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`), set in Vercel and never prefixed
`NEXT_PUBLIC_`. The module that reads them imports `server-only`, so it can't be bundled into
client code. The browser only ever receives counts: no names, emails or phone numbers leave
the server, not even through `/api/leads`. The service account has access to this one sheet
and nothing else.

## Swapping the data source

Pages read through the `LeadSource` interface in `lib/source.ts`. Moving to a CRM API means
writing one new class that returns the same rows; the cleaning, counting and pages don't change.

## Run it

```bash
npm install
npm run dev        # without credentials, reads sample/*.csv
npm test           # cleaning and counting rules
```

`node scripts/make-sample.mjs` regenerates the fake data;
`node scripts/seed-sheet.mjs <key.json> <sheet id>` loads it into a sheet.
