# Architecture

## Directory layout

```
prisma/
  schema.prisma              # Full data model, ~40 models
  migrations/                # Generated SQL
  seed.ts / seed-delivery.ts # Demo data for all six roles

src/
  app/
    (app)/                   # Internal app — sidebar shell, staff only
      dashboard/             # One route, six role-specific workspaces
      leads/ clients/ follow-ups/ quotations/ sows/
      projects/ issues/ progress-logs/ tasks/
      invoices/ payments/ expenses/
      marketing/{brands,campaigns,studio}/
      vault/ team/ audit/ settings/
    portal/                  # Client portal — separate shell, CLIENT role only
    sign/[token]/            # Public SOW review + e-signature (no login)
    pay/                     # Public payment + invoice view (no login)
    api/
      auth/[...nextauth]/
      webhooks/{razorpay,stripe}/
      cron/{dispatch,daily}/
      invoices/[id]/pdf/  files/[key]/  search/  notifications/
    layout.tsx  login/  error.tsx  not-found.tsx

  components/
    ui/                      # shadcn-style primitives on Radix
    layout/                  # Shell, sidebar, search, notifications
    billing/                 # Quick-invoice modal
    dashboard/               # Stat cards, revenue chart

  lib/
    billing/
      money.ts               # Integer-paise arithmetic, amount-in-words
      gst.ts                 # Tax engine — pure and fully testable
      invoice-number.ts      # Gapless FY-scoped allocation
      fiscal-year.ts         # Indian FY (Apr–Mar)
      invoice-service.ts     # Lifecycle: create, issue, pay, credit, cancel
      dispatch.ts            # PDF + payment link + queue + lock
    integrations/            # Provider adapters, all with mocks
    jobs/                    # Outbound queue, recurring invoices, reminders
    pdf/                     # React-PDF invoice template
    webhooks/                # Idempotent payment handler
    auth.ts / auth.config.ts # Auth.js, split for edge-safe middleware
    session.ts               # requireAuth / requirePermission / requireSudo
    rbac.ts                  # The permission matrix
    audit.ts                 # Hash-chained log
    crypto.ts                # AES-256-GCM vault, HMAC, tokens
    validators/              # Zod schemas shared by forms and actions

  server/actions/            # Server actions, grouped by domain
  middleware.ts              # Auth + role routing at the edge
```

## Request flow

```
Browser
  → middleware.ts          Session check, role-based route fencing
  → Server Component       requirePermission(resource, action)
                           scopeFilter(user, resource) → Prisma where
  → Server Action          Re-checks permission independently
                           Zod validation
                           prisma.$transaction (business change + audit entry)
                           revalidatePath
  → Response
```

The important property: **the UI hiding a control is never the access control.**
Every server action calls `requirePermission` itself. Every list query composes
`scopeFilter`, so a new list endpoint can't silently leak other users' records.

## Data model

Lead → Client → SOW → Project → Milestone → Invoice → Payment is the spine.

- **Lead** carries dedupe columns (normalised email, last-10-digit phone) and
  `externalId` (unique) for idempotent marketing sync.
- **Client** holds place of supply and TDS settings — the two fields that make
  the 2-field invoice engine possible.
- **Sow** has milestones, a signature record, and tokenised share links.
- **Project** derives `progressPct` from milestone completion; it is never typed
  in, so the client portal can't drift from reality.
- **Invoice** snapshots the client *and* company details at issue time.
  Reprinting a two-year-old invoice must show the GSTIN and address in force
  then, not today's.
- **AuditLog** is append-only with `prevHash`/`hash`.

## Money

Every calculation runs in integer paise via `bigint`. Prisma stores
`Decimal(14,2)`. The boundary conversions are `toMinor()` and
`toDecimalString()` — nothing in between uses a float.

`splitHalves()` gives the odd paisa to CGST, matching common accounting
software, so CGST + SGST always equals the tax total exactly.

## Background work

Two cron endpoints, both secret-gated:

| Route | Cadence | Does |
|---|---|---|
| `/api/cron/dispatch` | every 5 min | Drains the outbound email/WhatsApp queue with backoff |
| `/api/cron/daily` | daily | Flags overdue invoices, sends dunning at 1/7/14/30 days, nudges overdue follow-ups, generates recurring retainer invoices |

`vercel.json` schedules both. On a VPS, use crontab with an
`Authorization: Bearer $CRON_SECRET` header.

## Performance

- Server-side pagination at 20 rows; totals are aggregated over the filtered set
  rather than the page.
- Composite indexes on the hot paths: `Lead(status, ownerId)`,
  `Invoice(status, dueDate)`, `Invoice(fyLabel, seq)`,
  `AuditLog(actorId, createdAt)`, `FollowUp(assigneeId, status, dueAt)`.
- `getCurrentUser` is wrapped in React `cache` so it resolves once per render.
- Notifications poll every 30s rather than holding a socket, which keeps the app
  deployable to serverless. Swap for SSE if you move to a stateful host.
