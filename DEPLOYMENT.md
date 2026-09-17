# Going live

The backend is written. What follows is the work of putting it on real
infrastructure — provisioning, accounts and credentials, most of which only you
can do because it needs your Razorpay account, your Meta business account and
your domain.

Everything in **Verified** has been tested against a production build.

---

## The order to do it in

Each step is checkable, and later steps assume the earlier ones.

### 1. A real database

Provision managed PostgreSQL — Neon, Supabase, RDS, whatever you prefer — with
automated backups switched on and a retention window you have actually read.
Point `DATABASE_URL` at it and create the schema:

```bash
npm run db:deploy      # prisma migrate deploy — never `db push` in production
```

Do not run `npm run db:seed` against it. The seed deletes every row before it
writes, and it now refuses any database that is not on localhost.

### 2. The first account

An empty database has no users, so there is no way in through the sign-in page.

```bash
npm run bootstrap
```

It asks for a name, an email and a password (12 characters minimum, typed not
pasted), creates one Super admin, writes an audit entry, and then refuses to
run ever again on that database. Everyone else is added through Admin → Team,
where it is authorised and logged.

### 3. The company profile

Sign in and fill in Settings → Company before issuing anything: legal name,
GSTIN, PAN, the full address with the GST state code, and bank details. A
placeholder profile is created on first read and it says *XCC Technologies
Private Limited* with a Mumbai address — an invoice carrying that is wrong in a
way a client will notice and a tax filing will not forgive.

### 4. Secrets

```bash
openssl rand -base64 32      # AUTH_SECRET
openssl rand -base64 32      # VAULT_MASTER_KEY
openssl rand -base64 24      # CRON_SECRET
```

Put them in the host's secrets manager, not in the repository.
**`VAULT_MASTER_KEY` cannot be recovered.** Lose it and every stored credential
is permanently unreadable — there is no reset, because that is the point of it.
Keep a copy somewhere you would still have after losing the laptop.

### 5. Providers

Each falls back to a mock that logs to the console and reports success, so
nothing fails loudly when it is not configured:

| Set | To | Notes |
|---|---|---|
| `STORAGE_PROVIDER` | `s3` or `r2` | Required on any container host: local files are lost on the next deploy |
| `EMAIL_PROVIDER` | `sendgrid` or `smtp` | Verify your sending domain first or everything lands in spam |
| `PAYMENTS_PROVIDER` | `razorpay` (INR) or `auto` | `auto` adds Stripe for USD export invoices |
| `WHATSAPP_PROVIDER` | `meta` | **Start this early** — business-initiated messages need Meta-approved templates and review takes days |

### 6. Deploy

Set `NEXT_PUBLIC_APP_URL` and `AUTH_URL` to the real https domain. The app
checks its own environment at startup and **refuses to boot** in production
with a missing `AUTH_SECRET`, a `VAULT_MASTER_KEY` that is not 32 bytes, a
`DATABASE_URL` still pointing at localhost, or a non-https `NEXT_PUBLIC_APP_URL`
— it lists every problem at once rather than failing on one at a time.

Point the host's health check at `/api/health`. It touches the database and
answers 503 when it cannot, which a TCP check does not.

### 7. Schedule the daily job

`GET /api/cron/daily` with `Authorization: Bearer $CRON_SECRET`, once a day,
early morning IST. It sets overdue flags, sends dunning reminders and follow-up
nudges, and issues recurring retainer invoices. Without `CRON_SECRET` the
endpoint answers 401 to everything and none of that happens.

### 8. Check before you open it up

```bash
npm run accounts audit     # every account, and whether any still has a demo password
npm run db:backup          # a JSON export you can restore into an empty database
```

Take a backup before every migration. The managed provider's point-in-time
backups are the real protection; `db:backup` is the thing you run first when
you are about to do something you might regret.

---

## Historical blockers

Kept because they describe how the app behaves, not because they are outstanding.

### 1. Seeded accounts use the password `password123`

All nine seeded accounts, including the Super Admin. They are real rows, not
fixtures — the app will let anyone in who knows the pattern.

```sql
-- see who exists
SELECT email, role, status FROM "User" ORDER BY role;
```

Delete the ones you do not need, and change the password on the rest. The six
demo accounts are also printed on the sign-in page; that panel hides itself when
`NODE_ENV=production`, but the accounts behind it do not disappear with it.

### 2. The company GSTIN is a placeholder

`27AABCX1234M1Z5` is not a real number. Every invoice raised so far carries it.
Set the real one in **Admin → Settings** before issuing anything else, and
reissue anything already sent to a client.

### 3. Six of eleven clients have no place of supply

Meridian Labs, IT dev, Testriq, Waree Engineers, BSE, Vishal Sonography.

Without a state the tax engine assumes intra-state and charges CGST + SGST. The
total is the same at the same rate, but the heads are wrong for anyone outside
Maharashtra, and the heads are what gets filed and what your client claims
credit against. The invoice screen now warns when it is guessing; fixing the
client records removes the guess.

### 4. Demo data is mixed in with real data

`IT dev` and `Testriq` look like test clients. Four proposals were signed during
testing with signatures like `bdid` and `wrer`. Two staff records — Divya Nair
and Ananya Rao — were never real people.

Decide what is real before anyone else sees this. Note that `npm run db:seed`
**deletes everything** and re-creates the demo set; never run it against a
database that holds real records.

### 5. Providers are all mocks

```
PAYMENTS_PROVIDER=mock    EMAIL_PROVIDER=mock
WHATSAPP_PROVIDER=mock    STORAGE_PROVIDER=local
```

No invoice has actually been emailed, no payment actually taken. Supply real
credentials — the keys are already listed in `.env.example` — and send one real
invoice to yourself before sending one to a client.

### 6. Secrets, and the one that cannot be recovered

`AUTH_SECRET` and `CRON_SECRET` should be regenerated for production:
`openssl rand -base64 32`.

`VAULT_MASTER_KEY` is different. **If you lose it, every secret in the vault is
unreadable — there is no recovery.** Keep it in a password manager or a secrets
manager, never in the repository, and retire old keys through
`VAULT_PREVIOUS_KEYS` rather than replacing it outright.

### 7. The bundled database is for development only

`npm run db:local` runs an embedded PostgreSQL into `.pgdata`. It has no
backups, no replication and no durability guarantees. Point `DATABASE_URL` at a
managed PostgreSQL instance, and take a backup before the first real invoice.

### 8. The sign-in backdrop is stock footage

`public/brand/login-loop.mp4`. Confirm the licence covers commercial use before
this is public.

---

## Verified

Tested against `next build` + `next start`, not the dev server.

| | |
|---|---|
| Production build | compiles, 33 pages generated |
| Route crawl | 23 routes × 6 roles, **zero 500s** |
| Permission boundary | Sales refused 12 routes, Developer 13, Marketing 13, all with 403 |
| Portal isolation | a client is redirected out of all 20 internal routes |
| Stored files | a client reads their own invoice and proposal, and is refused three other clients' |
| Signed links | valid link serves anonymously; tampered, expired and unsigned all refused |
| Sign-in throttle | eight failures locks the address; the correct password is refused while it holds |
| Security headers | frame-ancestors none, nosniff, referrer, permissions, HSTS |
| Cron endpoint | 401 without the secret, and closed by default in production |
| Webhooks | signatures verified with a constant-time compare |
| Passwords | bcrypt, cost 12 |
| Money | integer paise throughout; 85 unit tests, including 29 on GST |
| Audit log | hash-chained, `verifyAuditChain()` replays it |

---

## Known gaps, not blockers

- **No Content-Security-Policy beyond `frame-ancestors`.** A real one needs
  nonces threaded through Next's inline bootstrap scripts. A policy with
  `unsafe-inline` would look like protection and provide none.
- **The sign-in throttle is per-process.** Correct for one instance; behind
  several replicas each gets its own window. Move it to Redis before scaling out.
- **No error tracking.** `src/app/error.tsx` logs to the console and has a note
  where Sentry would go.
- **No automated end-to-end tests.** The crawl in this audit was run by hand.
- **`db:backup` is a logical export, not a backup strategy.** It writes every
  row to JSON and restores into an empty database in one transaction, with the
  circular foreign keys reconnected in a second pass and the audit sequence
  reset so the chain continues. Round-tripped and verified — 120 rows out, 120
  rows in, `verifyAuditChain()` still valid. It is what you run before a risky
  change; your database provider's point-in-time backups are what saves you
  when the machine is gone.
