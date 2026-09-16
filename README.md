# XCC CRM

CRM, operations, digital marketing and project delivery, with an automated
GST-compliant billing engine that turns **a client and an amount** into a sent,
payable invoice.

Built with Next.js 15 (App Router), TypeScript, PostgreSQL + Prisma, Auth.js v5,
Tailwind CSS and Radix primitives.

---

## Quick start

You need **Node 20+**. A PostgreSQL server is optional — an embedded one is
included for getting started.

```bash
npm install && cp .env.example .env
```

Generate the two secrets `.env` needs:

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)"; echo "VAULT_MASTER_KEY=$(openssl rand -base64 32)"
```

### Database

**Option A — embedded, nothing to install.** In its own terminal:

```bash
npm run db:local
```

That starts PGlite (Postgres compiled to WebAssembly) on port 5432 behind a real
wire-protocol socket, so Prisma treats it as ordinary Postgres. Use this
`DATABASE_URL`:

```
postgresql://postgres:postgres@127.0.0.1:5432/postgres?connection_limit=1&pgbouncer=true
```

Both parameters are required. PGlite serves **one connection at a time**
(`connection_limit=1`), and its socket server does not scope prepared statements
per session (`pgbouncer=true` tells Prisma not to use them). The single
connection also means you cannot run `db:seed`, `db:studio` or any other script
while `npm run dev` is running — stop the dev server first. It is a development
convenience, not a production database.

**Option B — a real PostgreSQL 14+.** Point `DATABASE_URL` at it and skip
`db:local` entirely. Do this before deploying.

### Then

```bash
npm run db:migrate && npm run db:seed && npm run dev
```

Open http://localhost:3000 and sign in. Every seeded account uses the password
`password123`:

| Email | Role | What you'll see |
|---|---|---|
| `admin@xcc.test` | Super Admin | Command Centre — full financial and operational view |
| `ops@xcc.test` | Sub Admin | Operations Desk — same, minus Super Admin administration |
| `sales@xcc.test` | Sales | Sales Radar — only their own leads and follow-ups |
| `dev@xcc.test` | Developer | Dev Pulse — only projects they're a member of |
| `marketing@xcc.test` | Marketing | Marketing Overview — campaigns, ROAS, ad studio |
| `client@northwind.test` | Client | The external portal, fenced to one company's data |

No third-party accounts are required. Payments, email, WhatsApp and storage all
run against local mock adapters until you add real credentials.

---

## The 2-field billing engine

The **Quick invoice** button in the header opens a modal with two inputs —
client and total amount. Everything below is derived server-side and previewed
live as you type.

### What the two fields produce

| Derived | From |
|---|---|
| Invoice number | Gapless, FY-scoped counter (`XCC/26-27/0001`) |
| Tax treatment | Company state vs client's place of supply |
| CGST/SGST or IGST | The treatment above |
| Taxable value, tax, round-off, total | The tax engine, in integer paise |
| TDS and net receivable | Client's TDS setting, on the **taxable** value |
| Due date | Client's payment terms |
| Company details, terms, bank details | Snapshotted onto the invoice at issue |
| PDF | Rendered on send and stored |
| Payment link | Razorpay (INR) or Stripe (USD) |

### Amount basis

`Total Amount` is **exclusive of GST by default** — ₹100,000 entered produces
₹100,000 taxable + ₹18,000 GST = **₹118,000 payable**. Toggle the modal to
inclusive (or change the default in Settings) to reverse-calculate instead:
₹100,000 entered → ₹84,745.76 taxable + ₹15,254.24 GST.

### Tax treatment is derived, not guessed

| Company state | Client | Result |
|---|---|---|
| 27 (Maharashtra) | 27 (Maharashtra) | CGST 9% + SGST 9% |
| 27 (Maharashtra) | 29 (Karnataka) | IGST 18% |
| India | United States, LUT held | Zero-rated export, no IGST |
| India | United States, no LUT | Export with IGST paid |
| any | `taxTreatmentOverride` set | That override (e.g. SEZ) |

A client with no state set falls back to intra-state, the safe assumption for an
unregistered local buyer.

### Things that are easy to get wrong, and how they're handled

- **Money never touches a float.** Every calculation runs in integer paise
  (`src/lib/billing/money.ts`). `0.1 + 0.2` is a display bug in most apps and a
  compliance defect in an invoice.
- **Invoice numbers can't collide or gap.** `count() + 1` lets two concurrent
  requests produce the same number. Allocation is an atomic `UPDATE` on a
  counter row inside the same transaction as the insert, so a failed insert
  never burns a number and a concurrent one blocks instead of duplicating.
- **Issued invoices are immutable.** Sending locks the record. Corrections go
  through a credit note in its own `CN` series — which is what GST law requires.
- **TDS is computed on the taxable value**, not the GST-inclusive total (CBDT
  Circular 23/2017). Getting this wrong is why AR stops reconciling: the client
  pays ₹1,08,000 against a ₹1,18,000 invoice and it never closes.
- **Webhooks are idempotent twice over.** `WebhookEvent(provider, eventId)` is
  unique, and `Payment.gatewayPaymentId` is unique — so a replayed delivery is a
  no-op even if it arrives under a fresh event id.
- **Partial payments settle correctly.** TDS withheld counts toward settling the
  invoice, because it's paid to the government on your behalf.

---

## Roles

Permissions live in one matrix (`src/lib/rbac.ts`) that the sidebar, server
actions and route middleware all read. A link can never appear for a page the
user would be blocked from, and hiding a button is never the actual control —
every server action re-checks.

| Role | Scope |
|---|---|
| **Super Admin** | Everything, including team administration, audit and settings |
| **Sub Admin** | Day-to-day operations; cannot create Super Admins or see them in Team |
| **Sales** | Own leads and follow-ups, client directory, quotations, SOWs, invoicing |
| **Developer** | Only projects they're a member of; progress logs, issues, permitted secrets |
| **Marketing** | Own brands and campaigns, creative studio, lead sync into the CRM |
| **Client** | `/portal` only, fenced to their own company by `clientId` on every query |

`scopeFilter()` returns the Prisma `where` fragment for a role, so list
endpoints can't forget to scope. The client portal's filter returns
`{ id: '__no_access__' }` for anything not explicitly allowed — it fails closed.

Per-record exceptions (one developer, one staging secret) live in
`PermissionGrant` and layer on top.

---

## Security

- **Vault** — AES-256-GCM with a per-secret IV and authenticated ciphertext, so
  tampering fails to decrypt rather than returning garbage. Secrets are excluded
  from every list query and only leave the database one at a time through
  `revealSecretAction`.
- **Sudo mode** — secrets marked `CRITICAL` require re-entering your password
  within the last 10 minutes. The window is stored server-side, so a stolen JWT
  alone can't dump the vault.
- **Access logging** — every reveal *and* every copy writes both a
  `CredentialAccess` row and an audit entry, with IP and user agent.
- **Key rotation** — `VAULT_PREVIOUS_KEYS` keeps retired keys readable while new
  writes use the current key.
- **Audit log** — append-only and hash-chained: each entry hashes the one before
  it, so a deleted or edited row breaks the chain. The audit page replays and
  reports it.
- **E-signatures** — capture signer name, email, IP, user agent, an explicit
  consent statement, and a SHA-256 of the exact document content. The hash is
  what proves *what* was agreed, since the SOW text could otherwise be edited
  afterwards.
- **Share links** — tokenised, auto-expiring (30 days by default) and manually
  revocable. Expired, revoked and non-existent tokens are reported distinctly to
  the user but never confirm whether a token was ever valid.
- **Timing-safe comparison** for every webhook signature; Stripe deliveries
  older than 5 minutes are rejected as replays.
- **Login** always runs a bcrypt comparison even for a missing user, so response
  time doesn't enumerate accounts.

---

## Commands

```bash
npm run dev          # development server
npm run build        # production build (runs prisma generate first)
npm run typecheck    # tsc --noEmit
npm test             # vitest — tax engine and crypto
npm run db:migrate   # apply migrations
npm run db:seed      # realistic demo data for all six roles
npm run db:studio    # Prisma Studio
```

---

## Further reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — directory layout, data model, request flow
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — wiring Razorpay, Stripe, WhatsApp, email, S3
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — going to production, cron, backups
