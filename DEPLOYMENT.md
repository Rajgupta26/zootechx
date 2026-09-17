# Going live

Everything in **Blockers** must be done before real client data is entered.
Everything in **Verified** has been tested against a production build and needs
no further work.

---

## Blockers

These are not code problems. Nobody but you can do them, and each one is a way
to lose money, data or credibility.

### 1. Every account still has the password `password123`

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
