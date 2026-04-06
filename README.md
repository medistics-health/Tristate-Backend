# Tristate Backend

This project now includes Prisma ORM configured for PostgreSQL with the requested business schema and relationships.

## What Was Added

- Prisma ORM and Prisma Client
- PostgreSQL datasource configuration for Prisma 7
- A reusable Prisma client bootstrap for the app
- A full relational schema for:
  - Practice
  - Contact
  - Deal
  - Agreement
  - Service
  - Invoice
  - Invoice Line Item
  - Purchase Order
  - Vendor
  - Audit
  - Assessment
  - Channel Partner

## Files Added or Updated

- `prisma/schema.prisma`
- `prisma.config.ts`
- `src/lib/prisma.ts`
- `.env.example`
- `.gitignore`
- `package.json`
- `tsconfig.json`

## Prisma Setup Process

### 1. Install Prisma and PostgreSQL adapter dependencies

Commands used:

```powershell
npm.cmd install @prisma/client prisma
npm.cmd install @prisma/adapter-pg pg
```

### 2. Add Prisma environment configuration

Created `.env.example` with:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tristate_backend?schema=public"
```

Created local `.env` for development with the same placeholder connection string.

### 3. Configure Prisma 7

Prisma 7 no longer keeps the datasource URL directly inside `schema.prisma`, so the project uses `prisma.config.ts`.

Configuration added:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

### 4. Create the database schema

The Prisma schema was added in `prisma/schema.prisma` with:

- UUID primary keys
- PostgreSQL enums
- JSON fields for audit findings, recommendations, and assessment responses
- Array field for `Practice.bucket`
- Foreign keys for the requested entity relationships

### 5. Create a shared Prisma client

Added `src/lib/prisma.ts` so the app can import Prisma from one place:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = global.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
```

### 6. Add Prisma scripts to `package.json`

Scripts added:

```json
{
  "prisma:generate": "prisma generate",
  "prisma:push": "prisma db push",
  "prisma:migrate": "prisma migrate dev",
  "prisma:studio": "prisma studio"
}
```

### 7. Adjust TypeScript config

The build initially failed because `prisma.config.ts` is outside `src/`, while `rootDir` is `src`.

To fix that, `tsconfig.json` was updated to compile only app source files:

```json
{
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

## Commands Run During Setup

These are the commands that were used and verified during the setup:

```powershell
npm.cmd install @prisma/client prisma
npm.cmd install @prisma/adapter-pg pg
npx.cmd prisma validate
npm.cmd run prisma:generate
npm.cmd run build
```

## Relationships Implemented

- `Practice -> Contacts`
- `Practice -> Deals`
- `Practice -> Agreements`
- `Practice -> Invoices`
- `Practice -> Audits`
- `Practice -> Assessments`
- `Deal -> Agreement`
- `Agreement -> Invoice`
- `Invoice -> InvoiceLineItem`
- `InvoiceLineItem -> Service`
- `Invoice -> PurchaseOrder`
- `PurchaseOrder -> Vendor`
- `Audit -> Deal` as an optional FK for upsell generation
- `ChannelPartner -> Agreement`

## How To Use Next

### 1. Set the real PostgreSQL connection string

Update `.env`:

```env
DATABASE_URL="postgresql://username:password@host:5432/database_name?schema=public"
```

### 2. Push the schema to the database

For direct sync without a migration history:

```powershell
npm.cmd run prisma:push
```

### 3. Or create a migration

For tracked schema migrations:

```powershell
npm.cmd run prisma:migrate -- --name init
```

### 4. Regenerate Prisma client after schema changes

```powershell
npm.cmd run prisma:generate
```

### 5. Open Prisma Studio

```powershell
npm.cmd run prisma:studio
```

## Notes

- `.env` is ignored by Git.
- `prisma.config.js` was excluded from Git to avoid checking in a generated artifact.
- The current schema uses practical enum values where exact domain values were not specified.
