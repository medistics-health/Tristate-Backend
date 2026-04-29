# Billing Module Flow After Creating an Agreement for a Practice

This document describes the actual business flow in the current codebase after an `Agreement` is created for a `Practice`.

## What Happens Immediately After Agreement Creation

When an agreement is created:

1. the `Agreement` is stored and linked to the `Practice`
2. optional Docuseal submission metadata can also be created with it

This happens in:

- `src/controllers/agreement/agreement.ts`

Important point:

- creating an agreement alone does not create invoices
- creating an agreement alone does not start billing automatically

## Implemented Flow After Agreement Creation

The implemented downstream flow is:

1. create the `Agreement`
2. send or track signing through Docuseal if applicable
3. once signing is completed, move the agreement to `ACTIVE`
4. create an `AgreementVersion`
5. create `AgreementServiceTerm` records under that agreement or agreement version
6. create a `BillingRun` for a billing period
7. attach or capture `BillingInputSnapshot` records for that run
8. calculate the run
9. approve the run
10. post the run
11. generate `Invoice` and `InvoiceLineItem`
12. generate `VendorPayable` and `VendorPayableLineItem`
13. sync/send invoice through Stripe if needed
14. record payment and allocate it to invoice(s)

## Agreement Creation

The agreement is created from:

- `POST /api/v1/agreements`

Handled in:

- `src/controllers/agreement/agreement.ts`

The controller:

- validates `practiceId`, `type`, and `status`
- verifies the `Practice` exists
- optionally verifies the `Deal` belongs to that practice
- creates the `Agreement`
- optionally creates related Docuseal submission metadata

At this stage, the agreement exists, but billing still cannot happen unless pricing terms are defined.

## Agreement Signing and Activation

If Docuseal is used, the signing flow is handled through:

- `POST /api/v1/agreements/docuseal/submission`
- `POST /api/v1/agreements/docuseal/webhook`

Implemented in:

- `src/controllers/agreement/agreement.ts`

When the Docuseal webhook reports completion:

- the submission status is updated
- the signed document URL and audit log URL are stored
- the agreement can be updated to `ACTIVE`

This is the point where the agreement becomes commercially effective.

## Agreement Version

After the agreement exists, the next operational step is:

- create an `AgreementVersion`

Endpoint:

- `POST /api/v1/agreements/versions`

Handled in:

- `src/controllers/agreement/agreementVersion.ts`

Purpose:

- preserve contract history over time
- let billing resolve the correct version for a period
- avoid changing old billing results when terms change later

Implemented hardening:

- an initial `AgreementVersion` is now auto-created when the agreement is created
- the initial version is created as:
  - `versionNumber = 1`
  - `isCurrent = true`
  - `effectiveDate = agreement.effectiveDate` when available
- manual version creation now validates:
  - agreement exists
  - `versionNumber` is a positive integer
  - `versionNumber` is unique per agreement
  - `effectiveDate <= endDate`
- deleting an agreement version is blocked if service terms are still linked to it

## Agreement Service Terms

After the version exists, pricing must be defined through:

- `AgreementServiceTerm`

Endpoint:

- `POST /api/v1/agreements/service-terms`

Handled in:

- `src/controllers/agreement/agreementServiceTerm.ts`

This is the object that actually makes the agreement billable.

It defines:

- `serviceId`
- `vendorId`
- `pricingModel`
- `pricingConfig`
- `currency`
- `priority`
- `minimumFee`
- active date range

Without active service terms, the billing run has nothing to calculate.

Implemented hardening:

- `agreementVersionId` is now required when creating a service term
- service terms are now enforced to be version-bound
- service term creation now validates:
  - agreement exists
  - agreement version exists
  - agreement version belongs to the agreement
  - service exists
  - vendor exists when provided
  - `effectiveDate <= endDate`
  - service term dates do not conflict with the agreement version dates
- service term updates keep the version binding enforced

This closes the earlier gap where terms could exist without being pinned to a contract version.

## Billing Run Start

Billing starts only after:

- agreement is active
- service terms exist
- a billing period is selected

Billing entry point:

- `POST /api/v1/billing/runs`

Handled in:

- `src/controllers/billing/billing.ts`
- `src/services/billing/billing.service.ts`

The implemented billing flow is:

1. create `BillingRun`
2. optionally create snapshots with the run
3. calculate the run
4. review results
5. approve the run
6. post the run

## Billing Input Snapshots

Snapshots are attached to a billing run, not created independently first.

Endpoint:

- `POST /api/v1/billing/runs/:id/snapshots`

Examples:

- provider count
- collections
- revenue
- encounters
- units

These snapshots are the frozen inputs used in billing calculation.

## Billing Calculation

Calculation is triggered by:

- `POST /api/v1/billing/runs/:id/calculate`

The billing service:

- loads active agreement service terms for the practice and period
- reads the snapshots
- applies `pricingModel` and `pricingConfig`
- creates `BillingRunItem`
- creates `BillingRunItemComponent`
- records exception flags where needed

Possible run statuses after calculation:

- `CALCULATED`
- `REVIEW_REQUIRED`

## Billing Approval

Approval is triggered by:

- `POST /api/v1/billing/runs/:id/approve`

This:

- marks the run as approved
- records approval metadata
- prepares the run for posting

Approval does not yet create the invoice.

## Billing Posting

Posting is triggered by:

- `POST /api/v1/billing/runs/:id/post`

This is the step that transforms billing results into financial records.

The posting flow:

1. create `Invoice`
2. create `InvoiceLineItem`
3. create `VendorPayable`
4. create `VendorPayableLineItem`
5. mark the billing run as `POSTED`

So the actual rule is:

- `APPROVED` means finance accepted the run
- `POSTED` means invoice and payable records were created

## Invoice Stage

After posting, invoices now exist and can be managed through:

- `src/controllers/invoice/invoice.ts`
- `src/controllers/invoice/invoiceLineItem.ts`

Optional Stripe actions already implemented:

- sync invoice to Stripe
- finalize Stripe invoice
- send Stripe invoice

Implemented in:

- `src/controllers/stripe/stripe.ts`

## Payment Stage

Payments happen after invoice generation.

Two paths exist:

1. Stripe webhook-based payment recording
2. manual payment recording through billing module

Manual payment endpoint:

- `POST /api/v1/billing/payments/record`

This creates:

- `Payment`
- `PaymentAllocation`

It also updates invoice payment status.

## Important Operational Rule

After creating an agreement for a practice, the next real steps should be:

1. create agreement
2. initial agreement version is auto-created
3. activate agreement through signing or manual status update
4. create agreement service terms against the correct agreement version
5. create billing run
6. add billing snapshots
7. calculate run
8. approve run
9. post run
10. sync/send invoice if needed
11. record payment

## What Does Not Happen Automatically

Creating an agreement does not automatically:

- create service terms
- create a billing run
- calculate charges
- generate invoice
- generate vendor payable
- sync to Stripe
- collect payment

Those happen only after the billing workflow is executed.

## Code References

Main files involved in this flow:

- `src/controllers/agreement/agreement.ts`
- `src/controllers/agreement/agreementVersion.ts`
- `src/controllers/agreement/agreementServiceTerm.ts`
- `src/controllers/billing/billing.ts`
- `src/services/billing/billing.service.ts`
- `src/controllers/invoice/invoice.ts`
- `src/controllers/invoice/invoiceLineItem.ts`
- `src/controllers/stripe/stripe.ts`

## Summary of the New Contract Readiness Rules

The agreement-to-billing handoff is now stricter than before.

New enforced rules:

1. Every agreement gets an initial version automatically.
2. Agreement versions must have valid dates and unique version numbers.
3. Service terms must be attached to an agreement version.
4. Service terms must belong to the same agreement as the version.
5. Service term dates must be logically consistent with the agreement version.
6. Billing readiness is checked before a billing run can be created.

This means the system now blocks more bad contract setups earlier, instead of waiting until billing run creation or calculation to discover them.
