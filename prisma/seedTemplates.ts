import { PrismaClient, OnboardingServiceLine, OnboardingTaskPhase } from "../generated/prisma/client";

const prisma = new PrismaClient();

async function seedTaskTemplates() {
  console.log("Starting Task Templates seeding...");

  const templateBlueprints = [
    {
      serviceLine: OnboardingServiceLine.RCM,
      name: "Standard RCM & Revenue Cycle Blueprint",
      description: "Canonical 5-phase revenue cycle onboarding sequence for medical practices.",
      tasks: [
        {
          taskNumber: 1,
          taskName: "Initial Intake & Portal Access Setup",
          phase: OnboardingTaskPhase.ONBOARDING_ACCESS,
          startOffsetDays: 0,
          dueOffsetDays: 3,
          deliverable: "Access Credentials Granted",
          notes: "Collect EMR & Billing logins.",
        },
        {
          taskNumber: 2,
          taskName: "Clearinghouse Enrollment & Payer Linking",
          phase: OnboardingTaskPhase.ASSESSMENT_DISCOVERY,
          startOffsetDays: 3,
          dueOffsetDays: 10,
          deliverable: "EDI 835/837 Enrollment Forms",
          notes: "Medicare and commercial clearinghouse setup.",
        },
        {
          taskNumber: 3,
          taskName: "Fee Schedule Audit & ERA Configuration",
          phase: OnboardingTaskPhase.PLANNING_CONFIGURATION,
          startOffsetDays: 10,
          dueOffsetDays: 18,
          deliverable: "Configured Fee Matrix",
          notes: "Audit current reimbursement rates.",
        },
        {
          taskNumber: 4,
          taskName: "Claim Submission Testing & Rejection Verification",
          phase: OnboardingTaskPhase.TESTING_VALIDATION,
          startOffsetDays: 18,
          dueOffsetDays: 25,
          deliverable: "Test Batch 837 Approval",
          notes: "Run 50 test claims through scrubber.",
        },
        {
          taskNumber: 5,
          taskName: "Go-Live Claim Batching & Daily Billing Kickoff",
          phase: OnboardingTaskPhase.GO_LIVE_STABILIZATION,
          startOffsetDays: 25,
          dueOffsetDays: 30,
          deliverable: "First Live Claim Batch Submitted",
          notes: "Daily billing production operational.",
        },
      ],
    },
    {
      serviceLine: OnboardingServiceLine.CREDENTIALING,
      name: "Provider Credentialing & Payer Roster Blueprint",
      description: "Primary source verification, CAQH updates, and commercial payer roster submissions.",
      tasks: [
        {
          taskNumber: 1,
          taskName: "Provider Malpractice & State License Verification",
          phase: OnboardingTaskPhase.ONBOARDING_ACCESS,
          startOffsetDays: 0,
          dueOffsetDays: 5,
          deliverable: "Primary Source Verification Pack",
          notes: "Verify state board licenses and DEA.",
        },
        {
          taskNumber: 2,
          taskName: "CAQH Profile Re-attestation & Document Upload",
          phase: OnboardingTaskPhase.ASSESSMENT_DISCOVERY,
          startOffsetDays: 5,
          dueOffsetDays: 12,
          deliverable: "CAQH Attestation Confirmation",
          notes: "Upload current W9 and malpractice COI.",
        },
        {
          taskNumber: 3,
          taskName: "Commercial Payer Contract Roster Submissions",
          phase: OnboardingTaskPhase.PLANNING_CONFIGURATION,
          startOffsetDays: 12,
          dueOffsetDays: 25,
          deliverable: "Roster Submission Confirmation",
          notes: "Submit to BCBS, Aetna, Cigna, Horizon.",
        },
        {
          taskNumber: 4,
          taskName: "Payer Effective Date & Participation Letter Audit",
          phase: OnboardingTaskPhase.GO_LIVE_STABILIZATION,
          startOffsetDays: 25,
          dueOffsetDays: 45,
          deliverable: "Payer Approval Matrix",
          notes: "Log in-network effective dates.",
        },
      ],
    },
    {
      serviceLine: OnboardingServiceLine.CCM,
      name: "Chronic Care Management (CCM) Blueprint",
      description: "Clinical patient screening, EMR roster import, and care plan setup.",
      tasks: [
        {
          taskNumber: 1,
          taskName: "Patient Eligibility Screening & Chronic Roster Import",
          phase: OnboardingTaskPhase.ASSESSMENT_DISCOVERY,
          startOffsetDays: 0,
          dueOffsetDays: 7,
          deliverable: "Eligible CCM Patient List",
          notes: "Identify Medicare 2+ chronic condition patients.",
        },
        {
          taskNumber: 2,
          taskName: "Care Management Software Setup & Provider Training",
          phase: OnboardingTaskPhase.PLANNING_CONFIGURATION,
          startOffsetDays: 7,
          dueOffsetDays: 14,
          deliverable: "Care Manager Credentials Active",
          notes: "Train clinical staff on 20-min monthly log.",
        },
        {
          taskNumber: 3,
          taskName: "First Patient Outreach & Initial Care Plan Consent",
          phase: OnboardingTaskPhase.GO_LIVE_STABILIZATION,
          startOffsetDays: 14,
          dueOffsetDays: 30,
          deliverable: "Signed Care Plan Consents",
          notes: "Begin monthly patient care calls.",
        },
      ],
    },
    {
      serviceLine: OnboardingServiceLine.HR,
      name: "HR, Benefits & Payroll Integration Blueprint",
      description: "Employee handbook distribution, payroll sync, and benefits enrollment.",
      tasks: [
        {
          taskNumber: 1,
          taskName: "Practice Employee Audit & Payroll Roster Sync",
          phase: OnboardingTaskPhase.ONBOARDING_ACCESS,
          startOffsetDays: 0,
          dueOffsetDays: 5,
          deliverable: "Verified Payroll Census",
          notes: "Import employee records into HR portal.",
        },
        {
          taskNumber: 2,
          taskName: "Employee Handbook & Compliance Binder Distribution",
          phase: OnboardingTaskPhase.PLANNING_CONFIGURATION,
          startOffsetDays: 5,
          dueOffsetDays: 15,
          deliverable: "Signed Employee Acknowledgments",
          notes: "Distribute OSHA and HIPAA policies.",
        },
        {
          taskNumber: 3,
          taskName: "Benefits Open Enrollment & Carrier Sync",
          phase: OnboardingTaskPhase.GO_LIVE_STABILIZATION,
          startOffsetDays: 15,
          dueOffsetDays: 30,
          deliverable: "Active Benefits Enrollment Roster",
          notes: "Sync health insurance deductions.",
        },
      ],
    },
    {
      serviceLine: OnboardingServiceLine.MSP_IT,
      name: "MSP / IT & Infrastructure Blueprint",
      description: "Workstation setup, firewall deployment, EMR integration, and IT security audit.",
      tasks: [
        {
          taskNumber: 1,
          taskName: "Workstation Hardware Audit & Network Security Scan",
          phase: OnboardingTaskPhase.ASSESSMENT_DISCOVERY,
          startOffsetDays: 0,
          dueOffsetDays: 5,
          deliverable: "IT Security Vulnerability Report",
          notes: "Audit routers, firewalls, and PCs.",
        },
        {
          taskNumber: 2,
          taskName: "HIPAA Compliant Firewall & Antivirus Deployment",
          phase: OnboardingTaskPhase.PLANNING_CONFIGURATION,
          startOffsetDays: 5,
          dueOffsetDays: 14,
          deliverable: "Secured Network Infrastructure",
          notes: "Deploy encrypted VPN and endpoint security.",
        },
        {
          taskNumber: 3,
          taskName: "EMR Interface Link & Backup Verification",
          phase: OnboardingTaskPhase.TESTING_VALIDATION,
          startOffsetDays: 14,
          dueOffsetDays: 21,
          deliverable: "Verified Cloud Backup Certificate",
          notes: "Test daily offsite database backups.",
        },
      ],
    },
  ];

  for (const blueprint of templateBlueprints) {
    const existing = await prisma.onboardingTaskTemplate.findFirst({
      where: { serviceLine: blueprint.serviceLine },
    });

    if (!existing) {
      await prisma.onboardingTaskTemplate.create({
        data: {
          serviceLine: blueprint.serviceLine,
          name: blueprint.name,
          description: blueprint.description,
          isActive: true,
          tasks: {
            create: blueprint.tasks,
          },
        },
      });
      console.log(`Created Task Template for ${blueprint.serviceLine}`);
    } else {
      console.log(`Template for ${blueprint.serviceLine} already exists.`);
    }
  }

  console.log("Seeding Task Templates complete!");
}

seedTaskTemplates()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
