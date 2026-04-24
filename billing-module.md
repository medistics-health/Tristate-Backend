# Billing Module Schema

This document describes the billing and accounting schema added on top of the existing CRM models in `prisma/schema.prisma`.

## Purpose

The billing module separates:

- commercial setup
- billing calculation
- client invoicing
- vendor payables
- approvals and exceptions
- external sync
- payments

The design keeps the existing `Practice`, `Agreement`, `Invoice`, `Vendor`, and `PurchaseOrder` models working while introducing a proper contract-driven billing structure.

## Existing Base Models

These models already existed and remain part of the billing flow:

- `Practice`
- `Agreement`
- `Service`
- `Invoice`
- `InvoiceLineItem`
- `Vendor`
- `PurchaseOrder`
- `TaxId`
- `User`

They now act as the base layer for the billing module.

## Updated Existing Models

### `Practice`

Represents the client/practice being billed.

Important fields:

- `taxIdId`: primary legal tax entity
- `billToTaxIdId`: optional billing entity
- `stripeCustomerId`
- `quickbooksCustomerId`
- `defaultCurrency`

New billing relations:

- `billingRuns`
- `billingInputSnapshots`
- `billingRunItems`
- `vendorPayables`
- `payments`

Meaning:

- one practice can have many billing runs
- one practice can have many calculated billing items
- one practice can have many vendor payables
- one practice can have many payments

### `Agreement`

Represents the parent commercial agreement with a practice.

New additions:

- `externalReference`
- `versions`
- `serviceTerms`

Meaning:

- one agreement can have multiple versions
- one agreement can have multiple service terms

### `Service`

`Service` is now treated as a service catalog record, not a pricing table.

Fields:

- `name`
- `code`
- `category`
- `isActive`

Relations:

- `agreementTerms`
- `billingInputSnapshots`
- `billingRunItems`
- `lineItems`
- `vendorPayableLineItems`

Important note:

- `clientRate`, `vendorRate`, and `margin` were removed from the schema
- pricing now belongs in `AgreementServiceTerm`

### `Invoice`

Represents the client receivable header.

New additions:

- `invoiceNumber`
- `currency`
- `billingPeriodStart`
- `billingPeriodEnd`
- `subtotalAmount`
- `taxAmount`
- `discountAmount`
- `stripeInvoiceId`
- `stripeHostedInvoiceUrl`
- `stripeInvoicePdfUrl`
- `quickbooksInvoiceId`

New relations:

- `paymentAllocations`
- `vendorPayables`

Meaning:

- one invoice can have many line items
- one invoice can have many payment allocations
- one invoice can be linked to many vendor payables

### `InvoiceLineItem`

Represents invoice detail rows.

New additions:

- `description`
- `billingRunItemId`
- `billingRunItemComponentId`
- `agreementServiceTermId`
- `billingPeriodStart`
- `billingPeriodEnd`

Meaning:

- invoice lines can still point to `Service`
- invoice lines can now also trace back to calculated billing data

### `Vendor`

Represents the vendor being paid.

New additions:

- `quickbooksVendorId`
- `remitEmail`
- `paymentTerms`

New relations:

- `agreementTerms`
- `billingRunItems`
- `vendorPayables`

### `PurchaseOrder`

Still supported for compatibility.

New addition:

- `vendorPayableId`

Meaning:

- purchase orders can optionally point to a `VendorPayable`
- `VendorPayable` is now the preferred operational payable object

## New Billing Models

### `AgreementVersion`

Purpose:

- tracks versions of an agreement over time

Important fields:

- `agreementId`
- `versionNumber`
- `isCurrent`
- `effectiveDate`
- `endDate`

Relations:

- belongs to one `Agreement`
- has many `AgreementServiceTerm`

Use case:

- preserve history when agreement terms change

### `AgreementServiceTerm`

Purpose:

- stores the service-level pricing and fulfillment terms for an agreement

Important fields:

- `agreementId`
- `agreementVersionId`
- `serviceId`
- `vendorId`
- `pricingModel`
- `pricingConfig`
- `currency`
- `priority`
- `minimumFee`
- `effectiveDate`
- `endDate`
- `isActive`

Relations:

- belongs to one `Agreement`
- optionally belongs to one `AgreementVersion`
- belongs to one `Service`
- optionally belongs to one `Vendor`
- has many `BillingRunItem`
- has many `InvoiceLineItem`

This is the main commercial pricing object.

### `BillingRun`

Purpose:

- represents a billing cycle for a practice and period

Important fields:

- `practiceId`
- `periodStart`
- `periodEnd`
- `status`
- `approvedByUserId`
- `approvedAt`
- `notes`

Relations:

- belongs to one `Practice`
- optionally belongs to one approving `User`
- has many `BillingInputSnapshot`
- has many `BillingRunItem`
- has many `VendorPayable`

### `BillingInputSnapshot`

Purpose:

- stores frozen input values used during billing calculations

Important fields:

- `billingRunId`
- `practiceId`
- `serviceId`
- `metricKey`
- `metricValue`
- `metricTextValue`
- `metricJsonValue`
- `sourceType`
- `sourceReference`

Relations:

- belongs to one `BillingRun`
- belongs to one `Practice`
- optionally belongs to one `Service`

Examples:

- collections
- encounters
- CPT counts
- users
- sites
- hours

### `BillingRunItem`

Purpose:

- stores the calculated result for one service within a billing run

Important fields:

- `billingRunId`
- `practiceId`
- `serviceId`
- `vendorId`
- `agreementServiceTermId`
- `clientAmount`
- `vendorAmount`
- `marginAmount`
- `currency`
- `formulaSnapshot`
- `sourceSnapshot`
- `exceptionFlags`

Relations:

- belongs to one `BillingRun`
- belongs to one `Practice`
- belongs to one `Service`
- optionally belongs to one `Vendor`
- optionally belongs to one `AgreementServiceTerm`
- has many `BillingRunItemComponent`
- has many `InvoiceLineItem`
- has many `VendorPayableLineItem`

This is the core auditable billing result.

### `BillingRunItemComponent`

Purpose:

- breaks a billing item into detailed components

Important fields:

- `billingRunItemId`
- `componentType`
- `description`
- `quantity`
- `rate`
- `amount`
- `metadata`

Relations:

- belongs to one `BillingRunItem`
- has many `InvoiceLineItem`
- has many `VendorPayableLineItem`

Examples:

- fixed monthly fee
- minimum uplift
- CPT charge
- implementation fee
- per-user charge

### `VendorPayable`

Purpose:

- operational payable header for vendor obligations

Important fields:

- `practiceId`
- `vendorId`
- `invoiceId`
- `billingRunId`
- `payableNumber`
- `totalAmount`
- `currency`
- `status`
- `releasePolicy`
- `releasedAt`
- `paidAt`
- `quickbooksBillId`
- `quickbooksBillPaymentId`

Relations:

- belongs to one `Practice`
- belongs to one `Vendor`
- optionally belongs to one `Invoice`
- optionally belongs to one `BillingRun`
- has many `VendorPayableLineItem`
- has many `PurchaseOrder`

This is the preferred payable object instead of using `PurchaseOrder` as the core payable record.

### `VendorPayableLineItem`

Purpose:

- detailed vendor payable rows

Important fields:

- `vendorPayableId`
- `serviceId`
- `description`
- `quantity`
- `unitCost`
- `totalCost`
- `billingRunItemId`
- `billingRunItemComponentId`

Relations:

- belongs to one `VendorPayable`
- optionally belongs to one `Service`
- optionally belongs to one `BillingRunItem`
- optionally belongs to one `BillingRunItemComponent`

### `ApprovalDecision`

Purpose:

- stores review and approval decisions for billing entities

Important fields:

- `entityType`
- `entityId`
- `decision`
- `decidedByUserId`
- `reason`
- `note`
- `decidedAt`

Relations:

- optionally belongs to one `User`

Supported entity categories:

- billing run
- billing run item
- client invoice
- vendor payable
- agreement term

### `ExceptionEvent`

Purpose:

- stores calculation or workflow exceptions

Important fields:

- `entityType`
- `entityId`
- `code`
- `message`
- `severity`
- `status`
- `resolvedByUserId`
- `resolvedAt`
- `metadata`

Relations:

- optionally belongs to one `User`

### `ExternalSyncJob`

Purpose:

- stores sync work for Stripe and QuickBooks

Important fields:

- `system`
- `entityType`
- `entityId`
- `externalId`
- `status`
- `direction`
- `payload`
- `lastError`
- `lastSyncedAt`

Relations:

- has many `ExternalSyncAttempt`

### `ExternalSyncAttempt`

Purpose:

- stores each sync attempt for a job

Important fields:

- `externalSyncJobId`
- `status`
- `requestPayload`
- `responsePayload`
- `errorMessage`
- `attemptedAt`

Relations:

- belongs to one `ExternalSyncJob`

### `Payment`

Purpose:

- internal record of client payment receipt

Important fields:

- `practiceId`
- `amount`
- `currency`
- `status`
- `paymentDate`
- `paymentMethod`
- `stripePaymentIntentId`
- `stripeChargeId`
- `quickbooksPaymentId`
- `externalReference`

Relations:

- belongs to one `Practice`
- has many `PaymentAllocation`

### `PaymentAllocation`

Purpose:

- applies a payment to an invoice

Important fields:

- `paymentId`
- `invoiceId`
- `allocatedAmount`

Relations:

- belongs to one `Payment`
- belongs to one `Invoice`

## Main Relationship Flow

The main commercial and billing flow is:

1. `Practice`
2. `Agreement`
3. `AgreementVersion`
4. `AgreementServiceTerm`
5. `BillingRun`
6. `BillingInputSnapshot`
7. `BillingRunItem`
8. `BillingRunItemComponent`
9. `Invoice` and `InvoiceLineItem`
10. `VendorPayable` and `VendorPayableLineItem`
11. `Payment` and `PaymentAllocation`
12. `ExternalSyncJob` and `ExternalSyncAttempt`

## Relationship Summary

### Commercial setup

- one `Practice` has many `Agreement`
- one `Agreement` has many `AgreementVersion`
- one `Agreement` has many `AgreementServiceTerm`
- one `AgreementServiceTerm` belongs to one `Service`
- one `AgreementServiceTerm` can optionally belong to one `Vendor`

### Billing execution

- one `Practice` has many `BillingRun`
- one `BillingRun` has many `BillingInputSnapshot`
- one `BillingRun` has many `BillingRunItem`
- one `BillingRunItem` can reference one `AgreementServiceTerm`
- one `BillingRunItem` has many `BillingRunItemComponent`

### Client invoicing

- one `Invoice` belongs to one `Practice`
- one `Invoice` can belong to one `Agreement`
- one `Invoice` has many `InvoiceLineItem`
- one `InvoiceLineItem` belongs to one `Service`
- one `InvoiceLineItem` can reference one `BillingRunItem`
- one `InvoiceLineItem` can reference one `BillingRunItemComponent`
- one `InvoiceLineItem` can reference one `AgreementServiceTerm`

### Vendor payable flow

- one `VendorPayable` belongs to one `Practice`
- one `VendorPayable` belongs to one `Vendor`
- one `VendorPayable` can reference one `Invoice`
- one `VendorPayable` can reference one `BillingRun`
- one `VendorPayable` has many `VendorPayableLineItem`
- one `VendorPayableLineItem` can reference one `BillingRunItem`
- one `VendorPayableLineItem` can reference one `BillingRunItemComponent`

### Payment flow

- one `Payment` belongs to one `Practice`
- one `Payment` has many `PaymentAllocation`
- one `PaymentAllocation` belongs to one `Invoice`

### Review and sync

- `ApprovalDecision` points to business entities by `entityType` and `entityId`
- `ExceptionEvent` points to business entities by `entityType` and `entityId`
- `ExternalSyncJob` points to business entities by `entityType` and `entityId`
- one `ExternalSyncJob` has many `ExternalSyncAttempt`

## Why This Structure Works

This schema solves the original gaps:

- pricing is no longer stored globally on `Service`
- pricing is contract-driven through `AgreementServiceTerm`
- billing calculations are frozen in `BillingRun`, `BillingInputSnapshot`, and `BillingRunItem`
- invoice lines can trace back to calculated billing records
- vendor obligations are modeled separately through `VendorPayable`
- approvals, exceptions, payments, and sync state are first-class entities

## Current Compatibility Notes

- legacy invoice, vendor, and practice flows still work
- `PurchaseOrder` still exists for compatibility
- `Service` responses may still expose deprecated pricing keys in controller output for older clients, but the schema no longer stores them

## Recommended Operational Rule

Use these models as the system of record:

- `AgreementServiceTerm` for pricing rules
- `BillingRun` and `BillingRunItem` for billing calculations
- `Invoice` for client receivables
- `VendorPayable` for vendor obligations
- `Payment` for money received
- `ExternalSyncJob` for Stripe and QuickBooks integration state
