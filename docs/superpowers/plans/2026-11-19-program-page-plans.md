# Program page plans and earnings calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A founder lists their real prices on a program. The public program page then shows earnings from those prices, with a slider calculator for sales and revenue, instead of a fixed $100 example.

**Architecture:** A new `page_plans` jsonb column on `program` holds up to 4 plans `{ id, label, amount, interval }`. A pure module `lib/plan-earnings.ts` turns a program and a plan into per-customer revenue and commission. The public page passes those numbers to a small client component with one slider per plan. With no plans saved, the page renders exactly as before.

**Tech Stack:** Next.js 16, React 19, drizzle-orm 0.45 with drizzle-kit migrations, zod 4, vitest, biome.

## Global Constraints

- Copy follows `docs/CONTENT-GUIDELINES.md`: no em dashes, sentences of 25 words or fewer, no "X, not Y", American English.
- Amounts are minor units in the program currency, entered before tax (commission is worked out before tax).
- At most 4 plans per program. Intervals: `once`, `month`, `year`.
- Programs with no plans keep the current $100 example and the 1/10/50 table.

## Review Focus

1. A fixed-amount program (`commissionType = "fixed"`): earnings are the fixed amount per customer, whatever the plan price.
2. `commissionDuration = "once"` with a monthly plan: one payment only.
3. `commissionDuration = "lifetime"`: the calculator shows the first 12 months and says so.
4. A yearly plan with `commissionMonths = 12`: one payment; with 24 months, two.
5. Zero-decimal currencies (JPY): money formatting stays right in the calculator.

---

### Task 1: Earnings math

**Files:** Create `apps/app/src/lib/plan-earnings.ts`, `apps/app/tests/plan-earnings.test.ts`

**Interfaces:**
- Produces: `type PagePlan = { id: string; label: string; amount: number; interval: "once" | "month" | "year" }` (exported from `@openpromoter/db` schema), `paymentsInTerm(p, interval): number`, `perCustomer(p, plan): { revenue: number; earned: number; payments: number }`, `termLabel` text via `calcSpan(p): string`.

- [ ] Tests: percent 30% on $29.99 once gives earned 900, revenue 2999, payments 1. Monthly $4.99 over 12 months gives payments 12, earned 1800 (150 x 12), revenue 5988. Fixed 2500 gives earned 2500. `once` duration with a monthly plan gives 1 payment. Lifetime with monthly gives 12. Yearly with 24 months gives 2.
- [ ] Implement, tests pass.

### Task 2: Column and migration

**Files:** Modify `packages/db/src/schema.ts`; generate `packages/db/drizzle/0028_page_plans.sql`.

- [ ] Add `pagePlans: jsonb("page_plans").$type<PagePlan[]>().notNull().default([])`.
- [ ] `pnpm --filter @openpromoter/db exec drizzle-kit generate --name page_plans`; the SQL is one `ALTER TABLE ... ADD COLUMN`.

### Task 3: Settings card

**Files:** Modify `settings-actions.ts` (`savePagePlanAction`, `deletePagePlanAction`), `settings/program-form.tsx` (`PagePlansCard`), `settings/page.tsx`.

- [ ] Same shape as `ProductRatesCard`: rows of Name, Price, Billing, Save and Delete. Validation: label 1 to 40 chars, price like `29.99`, interval enum, max 4. Audited as `program.page_plan_save` and `program.page_plan_delete`.

### Task 4: Public page

**Files:** Modify `app/p/[slug]/offer.tsx`, `app/p/[slug]/page.tsx`; create `app/p/[slug]/calculator.tsx`.

- [ ] Statement example lists each plan: "A $29.99 Lifetime sale pays you $9.00".
- [ ] "Follow one sale" uses the first plan.
- [ ] "What it adds up to" becomes the calculator when plans exist: one range slider per plan (0 to 250 customers), totals for what customers pay and what you earn.
- [ ] Tab title drops the product suffix (`title.absolute`).

### Task 5: Verify and ship

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm --filter @openpromoter/app test`, `pnpm --filter @openpromoter/app build`.
- [ ] Look at the page locally with plans set (screenshot, mobile and desktop).
- [ ] Commit, ask about the OpenQodex review, push `main` (Railway deploys and migrates on start).
- [ ] Set Love Wrapped's plans: Lifetime $29.99 once, Monthly $4.99 month.
