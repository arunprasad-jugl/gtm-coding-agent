# Chapter 11: Build Your Own GTM Dashboard

**The best GTM dashboard is the one you built. You understand every query, every metric, and every number on the screen. When something looks wrong, you know exactly which table to check. When you need a new view, you add it in 20 minutes instead of submitting a feature request and waiting 6 weeks.**

---

## Why Build Instead of Buy

I use HubSpot. I use Instantly. This is not about replacing those tools.

It's about the fact that I'm already building my database, writing my signal logic, designing my segments. The dashboard is just the visual layer on top of work I'm already doing. It's literally in sync with the data I'm creating. Why wouldn't I build the view alongside it?

The other reason: when you build the dashboard yourself, you understand every query, every number, every chart. When something looks off, you know which table to check. When you need a new view, you add it in 20 minutes instead of waiting on a feature request.

This is not a finished product. What you see today will look different next week when I start sending email campaigns. That's the point. I'm sharing it as it grows because the building process is the learning.

---

## See It Running

https://github.com/shawnla90/gtm-coding-agent/releases/download/v0.2.0/dashboard-demo.mp4

---

## The Architecture

Three layers. Each one is replaceable.

```
[Supabase Postgres]  →  [Next.js API Routes]  →  [React + Recharts]
     (data)                  (queries)               (display)
```

**Supabase** is the database. Postgres under the hood, JavaScript client on top. You run SQL to create tables, and the client handles the rest.

**Next.js API routes** sit between your database and your frontend. Each route runs a Supabase query (or several in parallel), aggregates the results, and returns JSON. This keeps your database credentials server-side.

**React pages** fetch from those API routes on a polling interval (every 15-30 seconds) and render charts, tables, and KPI cards.

Why this stack:
- **You already know the pieces.** If you've touched React or written a SQL query, you can build this.
- **Type-safe throughout.** TypeScript from database query to rendered component.
- **Deployable in minutes.** Push to GitHub, connect Vercel, add two environment variables.
- **No vendor lock-in.** Supabase is Postgres. Next.js is open source. You can move everything.

---

## Setting Up Supabase

Create a project at [supabase.com](https://supabase.com). Note your project URL and service role key (Settings > API).

The starter includes three SQL files. Run them in order in the Supabase SQL Editor:

**`schema/01_core.sql`** creates four tables:

- **companies** — Your target accounts. Name, domain, ICP score (0-100), stage (prospect through customer), industry, employee count. This is your master list.
- **company_contacts** — Decision makers at each company. Max 3 ranked contacts per company (enforced by a database trigger). Each contact has a unified score (0-100) combining title relevance, seniority, email quality, and ICP fit.
- **contact_overflow** — Excess contacts beyond the top 3. Stored for reference but never pushed to CRM.
- **company_signals** — Intent signals mapped to companies. Each signal has a type (pain_point, tool_evaluation, hiring_signal, etc.), a source (LinkedIn, Reddit, engagement), a snippet, and a score.

The 3-contact limit is a design decision, not a technical limitation. It forces you to rank your contacts by quality instead of dumping every email into a sequence. The trigger `enforce_contact_limit` raises an error if you try to add a 4th ranked contact.

**`schema/02_campaigns.sql`** adds outbound infrastructure:

- **sending_domains** — Your email domains with warmup status, daily limits, bounce/reply rates, and reputation scores.
- **campaigns** — Campaign definitions with sequence steps, send windows, A/B test config, and aggregate performance metrics.
- **send_queue** — Individual email sends with full status tracking (queued through replied/bounced).
- **email_responses** — Incoming replies classified by type (hot_lead, meeting_request, not_interested, auto_responder).

A trigger auto-pauses any domain that exceeds 2% bounce rate. Another trigger recomputes campaign stats whenever a send status changes. Your dashboard numbers are always current.

**`schema/03_seed_data.sql`** inserts sample data so you see the dashboard working immediately.

---

## The Signal Model

Signals are the core of the dashboard. A signal is evidence that a company might be ready to buy.

### 16 Intent Signal Types

| Signal Type | Weight | What It Means |
|-------------|--------|---------------|
| tool_evaluation | 10 | Actively comparing tools in your category |
| vendor_switch | 10 | Switching away from a competitor |
| tech_stack_change | 9 | Changing infrastructure you integrate with |
| hiring_signal | 8 | Hiring for roles that use your product |
| expansion_signal | 8 | Growing the team that would buy |
| pain_expression | 7 | Publicly frustrated with current solution |
| budget_mention | 6 | Discussing budget for your category |
| competitor_mention | 5 | Mentioning a competitor by name |
| community_active | 4 | Active in communities where your buyers hang out |
| content_engagement | 3 | Engaging with content relevant to your product |

Weights are configurable in `pipeline/config.py`. Tune them for your market.

### Exponential Decay Scoring

A signal from yesterday is more valuable than a signal from 3 months ago. The scoring engine uses exponential decay with a 14-day half-life:

```python
recency_factor = e^(-lambda * days_old)
# lambda = ln(2) / 14 = 0.0495

# Examples:
# Today:     1.00
# 7 days:    0.71
# 14 days:   0.50
# 30 days:   0.23
# 60 days:   0.05
```

A signal's contribution = `weight * source_reliability * recency_factor`, capped at 20 points per signal type to prevent one type from dominating.

Diversity bonuses reward breadth: +2 per distinct signal type, +3 per distinct source. A company with 3 signal types from 2 sources scores higher than a company with 10 signals all of the same type from one source.

### Signal Sources

Signals come from three places in the starter:

- **LinkedIn intent** — People at target companies engaging with relevant content or posting about relevant problems.
- **Reddit intent** — Posts and comments in subreddits where your buyers hang out. Pain expressions, tool evaluations, vendor switch discussions.
- **Engagement** — People who have engaged with your own content (website visits, email opens, social interactions).

The `pipeline/` directory has scripts for discovering companies via the Exa API and scoring their signals. See the Pipeline section below.

---

## Building the Dashboard

The starter includes 5 pages. Each page fetches from one or more API routes and renders the data.

### Page 1: Campaigns (Home)

The operations overview. Shows:
- 6 KPI cards: companies, active campaigns, sent today, replies, bounce rate, active domains
- 24-hour volume chart (hourly send breakdown)
- Domain health grid (warmup status, daily limits, reputation)
- Active campaigns table (performance metrics per campaign)

Polls `/api/stats` every 15 seconds.

### Page 2: Database Intelligence

Your data quality scorecard. Shows:
- 6 KPI cards: total companies, contacts, ranked contacts, ICP %, email coverage, signal coverage
- Enrichment coverage bars (how complete is your data across dimensions)
- Pipeline stage distribution (pie chart)
- Score distribution (bar chart of ICP score ranges)
- Top 20 companies by ICP score

### Page 3: Accounts Browser

The workhorse page. Searchable, filterable table of every company. Click a row to expand and see:
- Ranked contacts with unified scores, titles, email status
- Mapped signals with type badges, snippets, authors, and scores

Filter by stage (prospect, qualified, opportunity, customer). Search by name or domain. Paginated at 30 per page.

### Page 4: Signals

Signal intelligence. Shows:
- 4 KPI cards: total signals, companies with signals, average per company, top signal type
- Signal type distribution bar chart
- Signal source breakdown pie chart
- Top 30 signal-rich companies table

### Page 5: Segments

Live-computed campaign segments. Each segment is a query against your data:
- X followers (from social discovery)
- LinkedIn network connections
- Engagement warm (recent content interaction)
- High ICP + signals (qualified companies with active intent)
- Multi-source (signals from 2+ different sources)
- Ready for outreach (high ICP, signals, verified email)

Each segment card shows the count and an expandable preview table.

### The Polling Pattern

Every page uses a custom `usePoll` hook:

```typescript
const { data, loading, error } = usePoll<StatsType>("/api/stats", 15000);
```

Fetches on mount, then every N milliseconds. Returns `{ data, loading, error, refetch }`. No WebSockets needed. For a dashboard that refreshes every 15-30 seconds, polling is simpler and cheaper.

### The API Route Pattern

Every API route follows the same structure:

```typescript
export const dynamic = "force-dynamic";

export async function GET() {
  const [companies, contacts, signals] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("company_contacts").select("*", { count: "exact", head: true }),
    supabase.from("company_signals").select("*"),
  ]);

  // Aggregate in JavaScript
  const stats = { /* ... */ };
  return NextResponse.json(stats);
}
```

Parallel queries with `Promise.all()`. Head-only queries for counts (no data transfer). Aggregation in JavaScript for complex calculations. This pattern handles 15K+ companies without performance issues.

---

## Deploying It

### Vercel (recommended)

1. Push your starter to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add environment variables: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
4. Deploy

That's it. Every push to main auto-deploys. Preview URLs for branches.

### Local Development

```bash
cd starters/signals-dashboard
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## The Signal Pipeline

The `pipeline/` directory has Python scripts for feeding data into your dashboard.

### 1. Discover Companies

```bash
cd pipeline
python discover_companies.py --vertical salestech
# or discover across all verticals:
python discover_companies.py
# preview without calling APIs:
python discover_companies.py --dry-run
```

Uses the Exa API to find companies by vertical and intent signals. Outputs to CSV. Customize the query templates in the script for your market.

### 2. Score Signals

```bash
python score_signals.py --input data/signals.csv
```

Reads a CSV of signals (columns: `company_domain, signal_type, source, detected_at`) and scores each company using the exponential decay formula. Prints the top companies by intent score.

### 3. Load to Supabase

```bash
python load_to_supabase.py --companies data/discovered_companies.csv --signals data/signals.csv
```

Upserts companies and signals into Supabase. Deduplicates companies by domain. Matches signals to companies by domain lookup.

The pipeline is intentionally simple: CSV in, Supabase out. You can swap the discovery source (use Apollo, Clay, or manual lists instead of Exa) and the scoring still works.

---

## Connecting Your Data

The dashboard is the last mile, not the first. It visualizes whatever is in your Supabase tables. Here's how data gets there:

1. **Discover** companies (Exa, Apollo, Clay, manual research, or CSV import)
2. **Enrich** with contact data (Apollo, LinkedIn, or manual)
3. **Score** contacts (the unified scoring formula ranks your contacts)
4. **Map signals** (Reddit scraping, LinkedIn monitoring, engagement tracking)
5. **Score signals** (the intent scoring engine in `pipeline/`)
6. **Load** to Supabase (pipeline scripts or direct CSV upload via Supabase UI)
7. **View** on the dashboard

You don't need all of these running to use the dashboard. Start with the seed data, then replace it with real data one source at a time.

---

## Exercise

1. Clone the starter: `cd starters/signals-dashboard`
2. Set up a free Supabase project and run the 3 schema files
3. Copy `.env.example` to `.env.local` and add your credentials
4. Run `npm install && npm run dev`
5. Open `http://localhost:3000` and explore all 5 pages with the seed data
6. **Challenge:** Add a custom stat card to the home page that shows "Companies with Signals" count. You'll need to add a query to `/api/stats/route.ts` and a new `<StatCard>` in `page.tsx`.

---

## Key Takeaways

- **A dashboard is just queries + charts.** If you can write a SQL query and a React component, you can build a dashboard. The starter gives you the patterns.
- **Build it alongside your database.** If you're already creating your data and writing your logic, the dashboard is just the visual layer on top. It stays in sync because you built both.
- **Signal scoring is the brain.** The exponential decay formula, signal weights, and diversity bonuses turn raw data into actionable intelligence. Tune the weights for your market.
- **The 3-contact-per-company constraint is a feature.** It forces quality over quantity in your outreach.
- **Polling beats WebSockets for dashboards.** A 15-second refresh is fine for operational data. Simpler to build, debug, and deploy.
- **The pipeline is modular.** Swap any data source. The dashboard doesn't care where the data came from, only that it's in the right tables.

---

**Next:** Fork the starter. Customize the scoring. Add your own data sources. Make it yours. If you build something cool, open a PR.
