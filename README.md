# Sentinel

Operational layer on top of INVENSHOES, the legacy desktop ERP of a family shoe retail business (Grupo del Llano). The legacy system can't answer basic questions like what's actually in stock per store and size, so Sentinel takes the Excel reports it already exports and builds a reliable inventory and sales picture from them.

In production on Fly.io, behind a password.

## How it works

```
INVENSHOES (legacy ERP)
   │  Excel exports
   ▼
Importers (SheetJS + Zod)
   ▼
SQLite on a Fly volume (Prisma 7)
   ▼
Next.js dashboards
```

- A weekly inventory snapshot (~10 MB) sets the baseline. Daily sales files apply deltas on top. Only sales after the snapshot's print date are valid, and the importer reads that date from the file header to enforce it.
- Inventory movements are append-only: errors are corrected with compensating movements, never edits. Every movement points to the import that created it, so a bad import can be audited or reverted as a unit.
- Imports are idempotent. Re-uploading the same snapshot produces zero changes, and sales imports have a duplicate-date guard.
- Products are keyed by the legacy's full description (`BRAND-MODEL-GENDER-MATERIAL-COLOR`) and parsed into structured fields. Sizes come as integers (`1750`) and get normalized (`"17.5"`).

## Design decisions

- **SQLite on a volume means exactly one machine.** Two machines would be two database files diverging silently, so the deploy forces a single machine. For an internal tool with a handful of users this keeps everything simple: no pooling, and backup is copying one file.
- **A single file decided the hosting.** The weekly export weighs ~10 MB. Vercel caps requests at 4.5 MB (not configurable) and the import takes ~40 seconds, so serverless was out. Fly.io gives a persistent Node process with a mounted disk.
- **Migrations run at startup, not in Fly's `release_command`.** The release command runs on an ephemeral machine that never mounts volumes: migrating there means migrating a database that gets destroyed seconds later, with the deploy still showing green. The container entrypoint runs `prisma migrate deploy` before `next start`, on the machine where the volume actually exists.
- **Nothing was ever deployed without the lock.** The importers write to the database, so every route sits behind Next 16 middleware (`proxy.ts`) with a hashed httpOnly cookie.

## Stack

Next.js 16 (App Router), TypeScript strict, Prisma 7 + SQLite (`@prisma/adapter-better-sqlite3`), Zod, SheetJS, Tailwind CSS 4, shadcn/ui. Docker on Fly.io.

## Status

Deployed and working. Next up: loading fresh production data through the importers, then restock forecasting, which is the feature the legacy system lacks entirely.

The UI theme ("Modo Centinela", a sci-fi HUD look) was a request from the owner, a lifelong comics fan.

<!-- TODO: screenshots after the production data load -->

## Run locally

```bash
pnpm install
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

`.env` needs:

```
DATABASE_URL="file:./prisma/dev.db"
SENTINEL_PASSWORD="whatever-you-want-locally"
```
