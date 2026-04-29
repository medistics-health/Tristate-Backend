import { Router } from "express";
import { verifyAuthToken } from "../middleware/auth.middleware";
import {
  addBillingRunSnapshotsHandler,
  approveBillingRunHandler,
  calculateBillingRunHandler,
  createBillingRunHandler,
  getBillingReadinessHandler,
  getBillingRunHandler,
  listBillingRunsHandler,
  postBillingRunHandler,
  recordManualPaymentHandler,
} from "../controllers/billing/billing";

const billingRouter = Router();

billingRouter.use(verifyAuthToken);

billingRouter.get("/practices/:practiceId/readiness", getBillingReadinessHandler);
billingRouter.get("/runs", listBillingRunsHandler);
billingRouter.post("/runs", createBillingRunHandler);
billingRouter.get("/runs/:id", getBillingRunHandler);
billingRouter.post("/runs/:id/snapshots", addBillingRunSnapshotsHandler);
billingRouter.post("/runs/:id/calculate", calculateBillingRunHandler);
billingRouter.post("/runs/:id/approve", approveBillingRunHandler);
billingRouter.post("/runs/:id/post", postBillingRunHandler);
billingRouter.post("/payments/record", recordManualPaymentHandler);

export default billingRouter;

// Create Run

//   POST /api/v1/billing/runs

//   {
//     "practiceId": "8d4c8d6e-5b4f-4e8b-8c61-2f3c5d7a9b10",
//     "periodStart": "2026-04-01",
//     "periodEnd": "2026-04-30",
//     "notes": "April billing cycle",
//     "autoCalculate": false,
//     "snapshots": [
//       {
//         "serviceId": "11111111-1111-1111-1111-111111111111",
//         "metricKey": "providers",
//         "metricValue": 12,
//         "sourceType": "manual",
//         "sourceReference": "provider roster"
//       },
//       {
//         "serviceId": "22222222-2222-2222-2222-222222222222",
//         "metricKey": "collections",
//         "metricValue": 185000.75,
//         "sourceType": "rcm_report",
//         "sourceReference": "collections-apr-2026"
//       }
//     ]
//   }

//   Add Or Replace Snapshots

//   POST /api/v1/billing/runs/:id/snapshots

//   {
//     "replaceExisting": false,
//     "snapshots": [
//       {
//         "serviceId": "11111111-1111-1111-1111-111111111111",
//         "metricKey": "units",
//         "metricValue": 45,
//         "sourceType": "manual"
//       },
//       {
//         "serviceId": "22222222-2222-2222-2222-222222222222",
//         "metricKey": "revenue",
//         "metricValue": 225000,
//         "sourceType": "finance_report"
//       }
//     ]
//   }

//   If you want to overwrite all snapshots for the run:

//   {
//     "replaceExisting": true,
//     "snapshots": [
//       {
//         "metricKey": "providers",
//         "metricValue": 10
//       }
//     ]
//   }

//   Calculate Run

//   POST /api/v1/billing/runs/:id/calculate

//   No body required.

//   Approve Run

//   POST /api/v1/billing/runs/:id/approve

//   No body required.

//   Post Run

//   POST /api/v1/billing/runs/:id/post

//   No body required.

//   Record Manual Payment

//   POST /api/v1/billing/payments/record

//   {
//     "practiceId": "8d4c8d6e-5b4f-4e8b-8c61-2f3c5d7a9b10",
//     "amount": 12000,
//     "currency": "USD",
//     "paymentDate": "2026-04-29",
//     "paymentMethod": "check",
//     "externalReference": "CHK-10492",
//     "allocations": [
//       {
//         "invoiceId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
//         "allocatedAmount": 7000
//       },
//       {
//         "invoiceId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
//         "allocatedAmount": 5000
//       }
//     ]
//   }

//   Unallocated payment example:

//   {
//     "practiceId": "8d4c8d6e-5b4f-4e8b-8c61-2f3c5d7a9b10",
//     "amount": 3000,
//     "currency": "USD",
//     "paymentMethod": "wire",
//     "externalReference": "WIRE-APR-29"
//   }

//   Supported pricingConfig Shapes

//   Fixed monthly:

//   {
//     "amount": 5000
//   }

//   Per provider:

//   {
//     "rate": 50,
//     "metricKey": "providers"
//   }

//   Percent collections:

//   {
//     "ratePercent": 6,
//     "metricKey": "collections"
//   }

//   Tiered volume:

//   {
//     "metricKey": "units",
//     "tiers": [
//       { "from": 0, "to": 100, "rate": 10 },
//       { "from": 100, "to": 250, "rate": 8 }
//     ]
//   }

//   Hybrid / multi-component:

//   {
//     "components": [
//       {
//         "pricingModel": "FIXED_MONTHLY",
//         "label": "Base Fee",
//         "amount": 3000
//       },
//       {
//         "pricingModel": "PERCENT_COLLECTIONS",
//         "label": "Performance Fee",
//         "ratePercent": 4,
//         "metricKey": "collections"
//       }
//     ],
//     "vendorPercentOfClient": 35,
//     "releasePolicy": "ON_CLIENT_PAYMENT"
//   }
