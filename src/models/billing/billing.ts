export type BillingSnapshotInput = {
  serviceId?: string | null;
  metricKey: string;
  metricValue?: number | string | null;
  metricTextValue?: string | null;
  metricJsonValue?: unknown;
  sourceType?: string | null;
  sourceReference?: string | null;
};

export type CreateBillingRunBody = {
  practiceId?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  autoCalculate?: boolean;
  snapshots?: BillingSnapshotInput[];
};

export type UpsertBillingSnapshotsBody = {
  replaceExisting?: boolean;
  snapshots?: BillingSnapshotInput[];
};

export type RecordPaymentAllocationInput = {
  invoiceId: string;
  allocatedAmount: number | string;
};

export type RecordPaymentBody = {
  practiceId?: string;
  amount?: number | string;
  currency?: string | null;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  externalReference?: string | null;
  allocations?: RecordPaymentAllocationInput[];
};

export type BillingReadinessIssue = {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
  agreementId?: string;
  agreementVersionId?: string;
  agreementServiceTermId?: string;
};

export type BillingReadinessSummary = {
  activeAgreementCount: number;
  currentVersionCount: number;
  activeServiceTermCount: number;
  billableServiceTermCount: number;
};

export type BillingReadinessResponse = {
  practiceId: string;
  periodStart: string;
  periodEnd: string;
  isReady: boolean;
  summary: BillingReadinessSummary;
  issues: BillingReadinessIssue[];
};
