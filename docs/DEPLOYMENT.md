# Deployment

## Before you go live

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # VAULT_MASTER_KEY
openssl rand -hex 32      # CRON_SECRET
```

- [ ] `AUTH_SECRET`, `VAULT_MASTER_KEY` and `CRON_SECRET` set to fresh values
- [ ] `NEXT_PUBLIC_APP_URL` and `AUTH_URL` set to the real HTTPS origin
- [ ] `STORAGE_PROVIDER` is **not** `local` on serverless
- [ ] Payment webhooks registered and their secrets set
- [ ] SPF and DKIM configured on the sending domain
- [ ] WhatsApp templates submitted and approved
- [ ] Company profile completed in Settings — GSTIN, state code, bank details
- [ ] Every seeded demo account deleted or its password changed
- [ ] Database backups scheduled

`VAULT_MASTER_KEY` is not recoverable. If you lose it, every stored secret is
unreadable. Keep it in a secrets manager, not in the repository.

## Vercel

```bash
vercel --prod
```

`vercel.json` registers both cron schedules. Set every variable from
`.env.example` in the project settings.

Serverless caveats:
- Use S3 or R2 for storage — the filesystem is ephemeral.
- Use a pooled Postgres connection (Neon, Supabase pooler, or PgBouncer);
  `DATABASE_URL` should point at the pooler.

## Docker / VPS

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json prisma ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

Cron on a VPS:

```
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/dispatch
30 1 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/daily
```

## Migrations

```bash
npx prisma migrate deploy
```

Never run `db:push` or `migrate dev` against production — both can drop data.

## Key rotation

To rotate the vault key without downtime: move the current
`VAULT_MASTER_KEY` into `VAULT_PREVIOUS_KEYS` (newest first), set a new
`VAULT_MASTER_KEY`, and deploy. Old secrets stay readable; new writes use the
new key. Re-saving a credential re-encrypts it under the current key.

## Financial-year rollover

Invoice series reset automatically on 1 April — `InvoiceSequence` is keyed by FY
label, so the first invoice of the new year becomes `XCC/27-28/0001` with no
intervention. Do not delete `InvoiceSequence` rows; they are what keeps the
series gapless, which GST law requires.
