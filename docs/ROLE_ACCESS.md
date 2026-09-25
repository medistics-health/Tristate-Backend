# Role Access Matrix

This document is the RBAC reference for backend access.

Source of truth in code:
- `src/middleware/auth.middleware.ts` (`ROLE_GROUPS`, `requireRoles`)
- `src/routes/*.routes.ts` (where `requireRoles(ROLE_GROUPS.X)` is applied)

## Current roles

- `ADMIN`
- `SALES`
- `ACCOUNTMANAGER`
- `OPERATIONS`
- `FINANCE`
- `VIEWER`

## How access works

- All protected routes require authentication via `verifyAuthToken`.
- Endpoints with no `requireRoles(...)` after auth are available to all authenticated roles.
- Endpoints with `requireRoles(...)` are restricted by the role group used on that route.
- Special rule: `VIEWER` is globally read-only across protected routes (`GET` only). For `POST`, `PUT`, `PATCH`, `DELETE`, `VIEWER` is always denied.

## Role groups in use

### `USER_ADMIN` -> `ADMIN`
- Applied to `api/v1/users/*`

### `SETTINGS` -> `ADMIN`
- Applied to `api/v1/settings/*`

### `INTEGRATIONS` -> `ADMIN`, `FINANCE`
- Applied to:
  - `api/v1/quickbooks/*` (except callback route)
  - `api/v1/stripe/*` (except webhook route)
  - `api/v1/mercury/*`

### `BUSINESS_WRITE` -> `ADMIN`, `SALES`, `ACCOUNTMANAGER`, `OPERATIONS`
- Applied to write endpoints in:
  - `api/v1/companies`
  - `api/v1/persons`
  - `api/v1/practices`
  - `api/v1/deals`
  - `api/v1/services`
  - `api/v1/practice-groups`
  - `api/v1/group-npis`
  - `api/v1/tax-ids`
  - `api/v1/agreements` (create/update/delete + versions + service terms + docuseal submission actions)
  - `api/v1/onboardings` (authenticated internal CRUD routes)
  - `api/v1/audits`
  - `api/v1/assessments`
  - `api/v1/monthly-reports`
  - `api/v1/emails/send`

### `OPERATIONS_AND_FINANCE_WRITE` -> `ADMIN`, `OPERATIONS`, `FINANCE`
- Applied to write endpoints in:
  - `api/v1/vendors`
  - `api/v1/purchase-orders`
  - `api/v1/invoices` write flows
  - `api/v1/vendor-payables` create + statement
  - `api/v1/billing` create/snapshot/calculate flows

### `FINANCE_WRITE` -> `ADMIN`, `FINANCE`
- Applied to finance-sensitive actions:
  - `api/v1/billing` approve/post/delete/payment record
  - `api/v1/invoices/:id/resend`
  - `api/v1/vendor-payables` release/sync/pay/delete

### `DOCUMENT_HUB_CONTENT` -> `ADMIN`
- Applied to Document Hub write endpoints:
  - `POST/PATCH/DELETE /api/v1/documents*` (upload, metadata, versions, archive)
  - Category create/update/delete/merge
  - Public link revoke (`DELETE /api/v1/public-links/:id`)

### `DOCUMENT_HUB_SHARE` -> `ADMIN`, `SALES`
- Applied to `POST /api/v1/documents/:id/public-links`
- Controller check: the document must already have `isPublicShareable = true` (only admins can set that flag)

### `DOCUMENT_HUB_HARD_DELETE` -> `ADMIN`
- Applied to `DELETE /api/v1/documents/:id/hard`

## Effective access by role

### `ADMIN`
- Full access to all authenticated endpoints and all restricted actions.

### `FINANCE`
- All authenticated read endpoints.
- Finance and integrations write access (`FINANCE_WRITE`, `INTEGRATIONS`, `OPERATIONS_AND_FINANCE_WRITE`).
- No `BUSINESS_WRITE` and no `USER_ADMIN`/`SETTINGS`.

### `OPERATIONS`
- All authenticated read endpoints.
- `BUSINESS_WRITE` and `OPERATIONS_AND_FINANCE_WRITE`.
- No `FINANCE_WRITE`, no `INTEGRATIONS`, no `USER_ADMIN`/`SETTINGS`.

### `SALES`
- All authenticated read endpoints.
- `BUSINESS_WRITE`.
- Document Hub public link create (`DOCUMENT_HUB_SHARE`) only when the document is already public-shareable.
- No finance/integration/admin/settings restricted actions.

### `ACCOUNTMANAGER`
- All authenticated read endpoints.
- `BUSINESS_WRITE`.
- No Document Hub public link create.
- No finance/integration/admin/settings restricted actions.

### `VIEWER`
- Read-only access to all authenticated resources via `GET` endpoints, including routes that otherwise use restricted role groups.
- No access to non-`GET` methods (`POST`, `PUT`, `PATCH`, `DELETE`) on any protected route.

## Public routes (no auth required)

Examples of public routes:
- `GET /health`
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/stripe/webhook`
- `GET /api/v1/quickbooks/callback`
- Agreement public endpoints under:
  - `/api/v1/agreements/docuseal/*`
  - `/api/v1/agreements/service-terms/:id/approval`
  - `/api/v1/agreements/service-terms/:id/client-approval`
- Onboarding external endpoints under:
  - `/api/v1/onboardings/external/*`
- Document Hub public share (rate-limited):
  - `GET /api/v1/public/share/:token`
  - `GET /api/v1/public/share/:token/download`

## Maintenance rule (must follow)

Whenever RBAC changes are made:

1. Update `ROLE_GROUPS` in `src/middleware/auth.middleware.ts`.
2. Update route-level guards in `src/routes/*.routes.ts`.
3. Update this file `docs/ROLE_ACCESS.md` in the same change.
4. Run `npm run build` and verify no auth regressions.

