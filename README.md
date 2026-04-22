# FastTrackr AI — Wealth Management Dashboard

A full-stack application that parses client data from Excel spreadsheets, transcribes and extracts actionable insights from advisor–client audio conversations, and provides an AI-powered natural language query interface over the structured data.

> **Live deployment:** [[https://fasttrackr-production.up.railway.app](https://fasttrackr-ai-assignment-production.up.railway.app/)]

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Approach](#approach)
- [Assumptions](#assumptions)
- [Project Structure](#project-structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router) with React 19 |
| **Language** | TypeScript 5 |
| **Database** | PostgreSQL (Supabase-hosted) |
| **ORM** | Prisma 7 with `@prisma/adapter-pg` (driver adapter) |
| **AI / LLM** | Google Gemini (`gemini-3.1-pro-preview`) via `@google/generative-ai` |
| **Audio Transcription** | Gemini Multimodal (inline audio → transcript) |
| **Excel Parsing** | ExcelJS |
| **Charts** | Recharts |
| **Animations** | Framer Motion |
| **Observability** | LangSmith tracing (all LLM calls traced) |
| **Deployment** | Railway (Nixpacks builder) |

---

## Setup Instructions

### Prerequisites

- **Node.js** ≥ 20.19 (or ≥ 22.12 / ≥ 24.0)
- **npm** (bundled with Node)
- A **PostgreSQL** database (e.g., Supabase, Neon, or local)
- A **Google Gemini API key** (get one at [aistudio.google.com](https://aistudio.google.com/))

### 1. Clone and install

```bash
git clone <repo-url>
cd fasttrackr
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root with the following:

```env
# PostgreSQL connection string (pooled, for runtime)
DATABASE_URL="postgresql://<user>:<password>@<host>:6543/<db>?pgbouncer=true"

# Direct connection (for Prisma migrations / db push)
DIRECT_URL="postgresql://<user>:<password>@<host>:5432/<db>"

# Google Gemini API Key
GEMINI_API_KEY="your-gemini-api-key"

# LangSmith Tracing (optional)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_API_KEY=your-langsmith-api-key
LANGSMITH_PROJECT=Fasttrackr
```

### 3. Push the database schema

```bash
npx prisma db push
```

This creates all tables (`Household`, `Member`, `FinancialAccount`, `BankDetail`, `Beneficiary`, `CustomEntity`, `GoalOrPreference`, `ChangelogEntry`) in your PostgreSQL database.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Test the app

1. Navigate to `/upload` and upload the provided `Master Client Info - Take Home Assignment.xlsx` file
2. Optionally upload the `Sample Conversation.mp3` audio file in the same form
3. Browse parsed households at `/households`
4. View aggregate insights and charts at `/insights`
5. Ask natural language questions at `/ai-insights`

---

## Approach

### High-Level Architecture

The application is a monolithic Next.js app with API routes handling all backend logic. Data flows through a three-stage pipeline:

```
Excel / Audio File  →  Parse & Extract  →  Normalize & Upsert  →  PostgreSQL
                                                                       ↓
                                                              Dashboard / Charts
                                                                       ↓
                                                         AI Insights (NL → SQL)
```

### 1. Excel Ingestion Pipeline

The Excel parser handles arbitrarily structured spreadsheets through a two-phase approach:

- **AI-powered column mapping** (`columnMapper.ts`): The system reads all Excel column headers and sends them to Gemini, which maps each header to the appropriate database table and field by introspecting the Prisma schema at runtime. This makes the parser resilient to column name variations, typos, and reordering. A deterministic fallback mapping is provided if the AI is unavailable.
- **Row-level parsing** (`parser.ts`): Rows are grouped by household name. Each row is decomposed into Household, Member, FinancialAccount, BankDetail, and Beneficiary records. The parser handles multi-member and multi-account households by detecting when fields repeat across rows.

### 2. Audio Conversation Processing

Audio processing is a two-step AI pipeline:

- **Transcription**: The raw audio buffer is sent to Gemini's multimodal API as inline base64 data. The model produces a speaker-attributed transcript (Wealth Manager / Client).
- **Structured extraction** (`extractor.ts`): The transcript is sent to Gemini with the list of existing households and their members. The LLM identifies which household the conversation pertains to and extracts actionable updates classified into five types:
  - `FIELD_UPDATE` — updates to existing fields (e.g., new phone number)
  - `NEW_KNOWN_ENTITY` — new members, accounts, or bank details
  - `NEW_CUSTOM_ENTITY` — novel entity types not in the schema (e.g., insurance policies, real estate)
  - `GOAL_OR_PREFERENCE` — client goals and wishes
  - `CORRECTION` — fixes to previously incorrect data

  Each extraction includes a confidence score for auditability.

### 3. Upsert Logic

All data (Excel and audio) flows through a unified upsert pipeline (`processor.ts`):

- Households are matched by name (unique constraint)
- Members are matched by `(householdId, firstName, lastName)` composite unique
- Accounts are matched by `(householdId, memberId, accountType, accountTypeDetail)`
- Non-null incoming values overwrite existing values; null values preserve existing data
- Every mutation is logged to the `ChangelogEntry` table with source type (`excel` / `audio`), change type, and affected field

### 4. AI Insights Agent

The `/ai-insights` page provides a conversational interface powered by an agentic SQL generation loop (`agent.ts`):

1. **Schema introspection**: The agent reads the Prisma schema file at runtime to build a human-readable description of all tables, columns, types, and relationships.
2. **SQL generation**: The user's natural language question (plus conversation history) is sent to Gemini, which generates a PostgreSQL `SELECT` query.
3. **Execution & retry loop**: The generated SQL is validated (read-only, no mutations, no multi-statement), executed via `prisma.$queryRawUnsafe`, and if it fails, the error is fed back to the LLM for self-correction (up to 10 iterations).
4. **Multi-query orchestration**: For complex questions requiring data from multiple tables, the agent can issue sequential queries and aggregate the results.
5. **Answer synthesis**: All query results are passed to Gemini, which produces a formatted markdown answer with tables, currency formatting, and key insights.

### 5. Insights Dashboard

The `/insights` page displays pre-computed aggregate visualizations via Recharts:

- Net worth by household (liquid vs. illiquid)
- Annual income by household
- Account type distribution (pie chart)
- Tax bracket distribution (pie chart)
- Members and accounts per household
- Investment objective distribution

### 6. Observability

All LLM calls (column mapping, transcription, extraction, SQL generation, answer synthesis) are wrapped with LangSmith tracing via `traceable()`, providing full observability into latencies, token usage, and prompt/response pairs.

---

## Assumptions

1. **Household name is unique** — used as the primary key for deduplication. Re-uploading the same Excel file updates existing records rather than creating duplicates.

2. **Member identity = (firstName, lastName) within a household** — two members in the same household with the same first and last name are treated as the same person.

3. **Excel structure** — the spreadsheet has a single header row followed by data rows. Each row represents one member–account combination. Multiple rows can belong to the same household, and Excel is used to create or update household data.

4. **Audio conversations reference existing households** — the audio pipeline enriches data for households already in the database. If no matching household is found, audio extractions are skipped.

5. **Read-only AI queries** — the AI Insights agent is restricted to `SELECT` statements only. All mutation keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, etc.) are blocked at the validation layer.

8. **Household income aggregation** — `annualIncome` on the `Household` model is the sum of individual `annualIncome` values from all members in that household, deduplicated at the member level.

---

## Project Structure

```
fasttrackr/
├── prisma/
│   └── schema.prisma            # Database schema (8 models)
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout with Navbar
│   │   ├── page.tsx              # Landing page
│   │   ├── upload/page.tsx       # File upload UI (Excel + Audio)
│   │   ├── households/page.tsx   # Household listing & detail
│   │   ├── insights/page.tsx     # Aggregate charts dashboard
│   │   ├── ai-insights/page.tsx  # Conversational AI query interface
│   │   └── api/
│   │       ├── upload/route.ts   # POST /api/upload — file processing
│   │       ├── households/       # GET /api/households — list & detail
│   │       ├── insights/         # GET /api/insights — chart data
│   │       └── ai-insights/      # POST /api/ai-insights — NL query
│   ├── components/
│   │   └── layout/Navbar.tsx     # Navigation bar
│   └── lib/
│       ├── db.ts                 # Prisma client singleton
│       ├── ai/
│       │   ├── gemini.ts         # Gemini client + LangSmith tracing
│       │   └── agent.ts          # Agentic SQL generation loop
│       ├── excel/
│       │   ├── parser.ts         # Excel → structured data
│       │   └── columnMapper.ts   # AI + fallback column mapping
│       ├── audio/
│       │   └── extractor.ts      # Audio transcription + extraction
│       ├── pipeline/
│       │   └── processor.ts      # Unified upsert orchestrator
│       └── utils/
│           └── formatters.ts     # Currency/number formatters
├── railway.json                  # Railway deployment config
├── nixpacks.toml                 # Nixpacks build config
├── package.json
└── tsconfig.json
```
