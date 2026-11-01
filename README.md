Fin-Tracker is a personal finance app on Next.js, Plaid and Supabase that pulls my bank and investment accounts into one place, with a tax-aware rebalancer that suggests contribution-only trades.

![Overview page](docs/overview.png)

## Features

- **Account linking via Plaid.** Connect checking, savings, credit card, loan, brokerage and retirement accounts through Plaid Link. Access tokens are exchanged and encrypted on the server, connections re-sync automatically when they are more than 6 hours old, and a connection can be unlinked at any time.
- **Transaction sync with a spending taxonomy.** Transactions come in through Plaid's cursor-based `/transactions/sync`. Each one is mapped into a spending taxonomy, and the Spending page shows spend by category, a monthly trend, and a paginated transaction list with a period filter.
- **Investments sync and allocation.** Holdings and securities come from `/investments/holdings/get`, grouped by account on the Assets page, with an asset-allocation breakdown across the whole portfolio.
- **Net worth with backfilled history.** Every sync records a net-worth snapshot. Past days are backfilled by walking transactions backward (and marked as estimates), and the series is rebuilt when the set of linked accounts changes. Liabilities get their own breakdown.
- **Tax-aware rebalancing with a configurable single-stock cap.** Holdings are classified into sleeves (US blend, growth, dividend, international, bonds and CDs, cash, target-date) and split into taxable and tax-advantaged buckets. In taxable accounts the rebalancer keeps a cash reserve, caps any single stock you name at a percentage of the whole portfolio, and funds underweight sleeves with new money before suggesting any sale of an appreciated position. Targets, reserve and cap are editable per user.

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router, Server Actions, TypeScript in strict mode)
- [React 19](https://react.dev/)
- [Supabase](https://supabase.com/): Postgres, Auth (email and password, optional Google OAuth) and row-level security
- [Plaid](https://plaid.com/) for bank, credit and investment account aggregation
- [Tailwind CSS 4](https://tailwindcss.com/) and [shadcn/ui](https://ui.shadcn.com/) components
- [Recharts](https://recharts.org/) for charts

## Getting started

### Prerequisites

- Node.js 20.9 or newer, and npm
- A [Supabase](https://supabase.com/) project
- A [Plaid](https://dashboard.plaid.com/) developer account (the sandbox is free)

### 1. Install

```bash
git clone https://github.com/gentsk77/fin-tracker.git
cd fin-tracker
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_...`), used only on the server |
| `PLAID_CLIENT_ID` | Plaid client ID |
| `PLAID_SECRET` | Plaid secret for the environment below |
| `PLAID_ENV` | `sandbox`, `development` or `production` |
| `PLAID_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key used to encrypt Plaid access tokens |
| `NEXT_PUBLIC_APP_URL` | Base URL of the app, e.g. `http://localhost:3000` (used for the OAuth callback) |

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Apply the database migrations

The schema lives in `supabase/migrations/`. Apply the five files in order, `001` to `005`, either by pasting each one into the Supabase SQL editor and running it, or with `psql`:

```bash
for f in supabase/migrations/00{1,2,3,4,5}_*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

`DATABASE_URL` is the Postgres connection string from your Supabase project settings.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, then go to **Accounts** and click **Link Account**. With `PLAID_ENV=sandbox`, pick any institution and log in with username `user_good` and password `pass_good`. Sandbox balances and transactions are fake, so nothing real is exposed.

## Architecture

The app uses the Next.js App Router, with signed-in pages under the `src/app/(app)` route group and every write going through a Server Action. All Plaid calls run on the server (`src/server/plaid`); the browser only handles Plaid's short-lived Link and public tokens, never an access token. Plaid access tokens are encrypted with AES-256-GCM (random IV plus auth tag, key from `PLAID_TOKEN_ENCRYPTION_KEY`) before they are stored. Every user-owned table has row-level security keyed on `auth.uid() = user_id`, and server queries filter by user as well. Pure logic such as the spending taxonomy and sleeve classification lives in `src/domain`, separate from I/O.

## Project structure

```
.
├── docs/                 # Screenshots for this README
├── public/               # Static assets
├── src/
│   ├── app/              # App Router: landing, auth pages, (app) route group
│   ├── components/       # Layout, theme and shared UI primitives
│   ├── domain/           # Pure logic: money, spending taxonomy, sleeves, rebalance defaults
│   ├── features/         # Feature components: accounts, dashboard, investments, net-worth, rebalancing, spending
│   ├── lib/              # Formatting, hooks, Supabase clients
│   ├── server/           # Server-only code: auth, db queries, Plaid, rebalancing actions
│   ├── types/            # Shared TypeScript types
│   └── proxy.ts          # Redirects signed-out users (Next 16 middleware)
├── supabase/
│   └── migrations/       # 001 to 005, applied in order
├── .env.example
├── package.json
└── README.md
```

## License

MIT. See [LICENSE](LICENSE).
