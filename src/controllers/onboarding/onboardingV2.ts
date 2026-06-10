import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  deleteBlobFromAzureByUrl,
  uploadBufferToAzureBlob,
} from "../../utils/azureBlob";
import { generateOnboardingPdfBuffer } from "../../utils/onboardingPdf";
import {
  AgreementStatus,
  CompanyStatus,
  DocumentStatus,
  DocumentTypes,
  OnboardingStatus,
} from "../../../generated/prisma/client";

type OnboardingContactBody = {
  id?: string;
  fullName?: string;
  jobTitle?: string;
  contactRole?: string;
  email?: string;
  phone?: string;
  extension?: string;
  preferredContactMethod?: string;
  bestTimeToReach?: string;
  isPrimaryDecisionMaker?: boolean;
  canSignAgreements?: boolean;
  additionalResponsibilities?: string[];
};

type OnboardingLocationBody = {
  id?: string;
  locationName?: string;
  isPrimaryLocation?: boolean;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  mainPhoneNumber?: string;
  mainFaxNumber?: string;
  officeEmail?: string;
  hoursOfOperation?: string;
  officeManagerName?: string;
  patientOutreachManaged?: string;
  billingManaged?: string;
  notes?: string;
};

type OnboardingProviderBody = {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  dateOfBirth?: Date;
  gender?: string;
  credentials?: string;
  providerType?: string;
  specialty?: string;
  cliaNumber?: string;
  npi?: string;
  caqhId?: string;
  ssnFullDigits?: string;
  licenseNumber?: string;
  licenseExpiryDate?: Date;
  stateOfLicense?: string;
  licenseType?: string;
  taxonomy?: string;
  primarySpecialty?: string;
  secondarySpecialty?: string;
  boardCertifications?: string;
  caqhUsername?: string;
  caqhPassword?: string;
  caqhLastAttestationDate?: Date;
  languagesSpoken?: string;
  telehealthAvailable?: boolean;
  malpracticeCarrier?: string;
  malpracticePolicyNumber?: string;
  malpracticeEffectiveDate?: Date;
  malpracticeExpiryDate?: Date;
  hospitalAffiliations?: string;
  personalCellNumber?: string;
  personalEmail?: string;
  practiceEmail?: string;
  medicarePtanIndividual?: string;
  medicaidIdIndividual?: string;
  ipaAffiliationsProviderLevel?: string;
  nppesUsername?: string;
  nppesPassword?: string;
  railroadMedicareIndividual?: string;
  copyOfBoardCertification?: string;
  copyOfProfessionalLiabilityInsurance?: string;
  copyOfBachelorsDegree?: string;
  copyOfMastersDegree?: string;
  copyOfSocialSecurityCard?: string;
  copyOfDriversLicense?: string;
  passportSizedPhoto?: string;
  resume?: string;
  providerEffectiveDateWithGroup?: Date;
  countryOfBirth?: string;
  statePlaceOfBirth?: string;
  homeAddress?: string;
  stateLicenseNumber?: string;
  deaNumber?: string;
  boardCertified?: boolean;
  employmentStatus?: string;
  participatingLocations?: string[];
  credentialingNeeded?: string;
  recredentialingNeeded?: string;
  notes?: string;
};

type OnboardingPracticeBody = {
  id?: string;
  practiceName?: string;
  practiceDbaName?: string;
  isPartOfParentCompany?: boolean;
  practiceType?: string;
  additionalSpecialtyAreas?: string[];
  groupNpi?: string;
  taxIdEin?: string;
  medicaidIdNumber?: string;
  groupMedicaidNpi?: string;
  groupMedicarePtan?: string;
  groupTaxonomy?: string;
  ipaAffiliations?: string;
  practiceManagerName?: string;
  practiceManagerEmail?: string;
  practiceManagerPhone?: string;
  billingAddress?: string;
  mailingAddress?: string;
  practiceWorkStartDate?: Date;
  railroadMedicareGroup?: string;
  approximateNumberOfProviders?: number;
  approximateNumberOfLocations?: number;
  approximateMonthlyPatientVolume?: number;
  approximateMedicarePatientVolume?: number;
  approximateMedicaidPatientVolume?: number;
  approximateCommercialPatientVolume?: number;
  offersCareManagementServices?: boolean;
  currentServicesOffered?: string[];
  operationalPainPoints?: string[];
  additionalNotes?: string;
  locations?: OnboardingLocationBody[];
  providers?: OnboardingProviderBody[];
};

type OnboardingDocumentBody = {
  id?: string;
  documentType?: string[];
  fileName?: string;
  fileUrl?: string;
  required?: boolean;
  status?: string;
  dateRequested?: Date;
  dateReceived?: Date;
  notes?: string;
};

type OnboardingBillingBody = {
  currentBillingModel?: string;
  billingCompanyName?: string;
  mainBillingContactName?: string;
  mainBillingContactEmail?: string;
  mainBillingContactPhone?: string;
  recentW9Form?: string;
  voidCheck?: string;
  formalLetterFromBank?: string;
  currentlyBilledServices?: string[];
  activePayers?: string;
  eftEraSetup?: string;
  invoiceRecipient?: string;
  invoiceEmail?: string;
  preferredReportingCadence?: string;
  billingPainPoints?: string[];
  additionalNotes?: string;
};

type OnboardingCredentialingBody = {
  credentialingNeeded?: boolean;
  credentialingFor?: string[];
  payersToEnroll?: string;
  approvedInsurancesTracker?: string;
  designatedPortalContactName?: string;
  designatedPortalContactEmail?: string;
  designatedPortalContactPhone?: string;
  irsDocument147c?: string;
  desiredInsurancePlans?: string;
  caqhMaintained?: boolean;
  currentCredentialingIssues?: string[];
  medicarePtanAvailable?: string;
  medicaidEnrollmentActive?: string;
  additionalNotes?: string;
};

type OnboardingTechnologyBody = {
  ehrSystem?: string;
  practiceManagementSystem?: string;
  patientPortalAvailable?: boolean;
  patientListExportable?: boolean;
  appointmentListExportable?: boolean;
  apiAccessAvailable?: boolean;
  clearinghouse?: string;
  faxPlatform?: string;
  phonePlatform?: string;
  currentCareManagementPlatform?: string;
  itContactName?: string;
  itContactEmail?: string;
  additionalTechnicalNotes?: string;
};

type OnboardingOutreachBody = {
  preferredChannels?: string[];
  patientTextConsent?: boolean;
  preferredLanguages?: string[];
  interpreterServices?: boolean;
  outreachFromPractice?: boolean;
  approvedOutreachHours?: string;
  messagingRequirements?: string;
};

type OnboardingLabPharmacyBody = {
  preferredLab?: string;
  existingLabRelationship?: boolean;
  labInterfaceStatus?: string;
  labContactName?: string;
  labContactEmail?: string;
  pharmacyPartnerName?: string;
  pharmacyPartnerInvolved?: boolean;
  additionalNotes?: string;
};

type OnboardingComplianceBody = {
  hipaaContactName?: string;
  hipaaContactEmail?: string;
  baaRequired?: boolean;
  securityQuestionnaire?: boolean;
  currentConcerns?: string[];
  additionalNotes?: string;
};

type OnboardingMarketingBody = {
  websiteUrl?: string;
  socialMediaChannels?: string[];
  currentMarketingChannels?: string[];
  targetPatientDemographics?: string;
  monthlyMarketingBudget?: string;
  existingBrandAssets?: string;
  googleBusinessProfileClaimed?: boolean;
  patientAcquisitionGoals?: string;
  aiToolsUsed?: string;
  additionalMarketingNotes?: string;
};

type OnboardingBody = {
  practiceId?: string;
  personId?: string;
  onboardingType?: string;
  isAuthorizedPerson?: boolean;
  nonAuthorizedRole?: string;
  numberOfPractices?: number;
  numberOfLocations?: number;
  billingManagedCentrally?: string;
  credentialingManagedCentrally?: string;
  contractingManagedCentrally?: string;
  oneMainContact?: boolean;
  legalCompanyName?: string;
  dbaName?: string;
  organizationType?: string;
  taxIdEin?: string;
  mainCompanyPhone?: string;
  mainCompanyFax?: string;
  mainCompanyEmail?: string;
  companyWebsite?: string;
  companyAddressLine1?: string;
  companyAddressLine2?: string;
  companyCity?: string;
  companyState?: string;
  companyZip?: string;
  ownershipType?: string;
  statesOfOperation?: string[];
  isLegalContractingEntity?: boolean;
  isBillingEntity?: boolean;
  isCredentialingEntity?: boolean;
  primarySpecialty?: string;
  additionalSpecialties?: string[];
  requestedServices?: string[];
  primaryServiceToLaunch?: string;
  requestedGoLiveDate?: Date;
  priorityLevel?: string;
  servicesForAllPractices?: string;
  selectedPractices?: string[];
  replacingExistingVendor?: boolean;
  currentVendorName?: string;
  currentVendorEndDate?: Date;
  engagementGoals?: string;
  informationAccurate?: boolean;
  authorizeUse?: boolean;
  submittedByName?: string;
  submittedByTitle?: string;
  status?: string;
  contacts?: OnboardingContactBody[];
  practices?: OnboardingPracticeBody[];
  documents?: OnboardingDocumentBody[];
  billing?: OnboardingBillingBody;
  credentialing?: OnboardingCredentialingBody;
  technology?: OnboardingTechnologyBody;
  outreach?: OnboardingOutreachBody;
  labPharmacy?: OnboardingLabPharmacyBody;
  compliance?: OnboardingComplianceBody;
  careProgram?: {
    programsPlanned?: string[];
    estimatedEligiblePatients?: number;
    currentEnrolledPatients?: number;
    patientEnrollmentHandler?: string;
    monthlyFollowUpHandler?: string;
    consentFormsInPlace?: boolean;
    existingCarePlanWorkflow?: boolean;
    patientMinutesTracker?: string;
    complianceConcerns?: string;
  };
  marketing?: OnboardingMarketingBody;
};

const onboardingInclude = {
  contacts: true,
  practices: {
    include: {
      locations: true,
      providers: true,
    },
  },
  documents: true,
  billing: true,
  credentialing: true,
  technology: true,
  outreach: true,
  labPharmacy: true,
  compliance: true,
  careProgram: true,
  OnboardingMarketing: true,
  practice: true,
  person: true,
} as const;

class PracticeOnboardingConflictError extends Error {
  constructor(practiceId: string) {
    super(`Onboarding already exists for practice ${practiceId}.`);
    this.name = "PracticeOnboardingConflictError";
  }
}

function getCreateConflictMessage(practiceId: string) {
  return `Onboarding already exists for practice ${practiceId}.`;
}

function getOnboardingPracticeFolderName(onboarding: any) {
  return (
    onboarding.practices?.[0]?.practiceName ||
    onboarding.legalCompanyName ||
    onboarding.dbaName ||
    onboarding.practiceId ||
    "onboarding"
  );
}

async function attachSubmissionPdfToOnboarding(onboarding: any) {
  const practiceFolderName = getOnboardingPracticeFolderName(onboarding);
  const generatedAt = new Date();
  const fileName = `onboarding-submission-${generatedAt
    .toISOString()
    .replace(/[:.]/g, "-")}.pdf`;
  const pdfBuffer = generateOnboardingPdfBuffer(onboarding);
  const upload = await uploadBufferToAzureBlob({
    folder: `${practiceFolderName}/onboarding-submission`,
    fileName,
    buffer: pdfBuffer,
    contentType: "application/pdf",
  });

  await prisma.onboardingDocument.create({
    data: {
      onboardingId: onboarding.id,
      documentType: [DocumentTypes.OTHER],
      fileName,
      fileUrl: upload.sasUrl,
      required: false,
      status: DocumentStatus.RECEIVED,
      dateReceived: generatedAt,
      notes: "Auto-generated onboarding submission PDF.",
    },
  });

  return prisma.onboarding.findUnique({
    where: { id: onboarding.id },
    include: onboardingInclude,
  } as any);
}

async function ensureUniquePracticeOnboarding(
  practiceId: string | undefined,
  excludeId?: string,
) {
  if (!practiceId) return;

  const existing = await prisma.onboarding.findFirst({
    where: {
      practiceId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new PracticeOnboardingConflictError(practiceId);
  }
}

function isPracticeOnboardingConflictError(
  error: unknown,
): error is PracticeOnboardingConflictError {
  return error instanceof PracticeOnboardingConflictError;
}

async function createOnboardingRecord(body: OnboardingBody) {
  const toEnum = (v: string) => (v === "" ? undefined : v);
  const toDate = (v: string | Date | undefined) =>
    !v || v === "" ? undefined : v instanceof Date ? v : new Date(v);
  const toDateValue = (v: string | Date | undefined) =>
    !v || v === "" ? undefined : v instanceof Date ? v : new Date(v);

  await ensureUniquePracticeOnboarding(body.practiceId);

  const onboarding = (await prisma.onboarding.create({
    data: {
      practiceId: body.practiceId,
      personId: body.personId,
      onboardingType: toEnum(body.onboardingType || "") as any,
      isAuthorizedPerson: body.isAuthorizedPerson,
      nonAuthorizedRole: body.nonAuthorizedRole,
      numberOfPractices: body.numberOfPractices,
      numberOfLocations: body.numberOfLocations,
      billingManagedCentrally: body.billingManagedCentrally,
      credentialingManagedCentrally: body.credentialingManagedCentrally,
      contractingManagedCentrally: body.contractingManagedCentrally,
      oneMainContact: body.oneMainContact,
      legalCompanyName: body.legalCompanyName,
      dbaName: body.dbaName,
      organizationType: toEnum(body.organizationType || "") as any,
      taxIdEin: body.taxIdEin,
      mainCompanyPhone: body.mainCompanyPhone,
      mainCompanyFax: body.mainCompanyFax,
      mainCompanyEmail: body.mainCompanyEmail,
      companyWebsite: body.companyWebsite,
      companyAddressLine1: body.companyAddressLine1,
      companyAddressLine2: body.companyAddressLine2,
      companyCity: body.companyCity,
      companyState: body.companyState,
      companyZip: body.companyZip,
      ownershipType: toEnum(body.ownershipType || "") as any,
      statesOfOperation: body.statesOfOperation,
      isLegalContractingEntity: body.isLegalContractingEntity,
      isBillingEntity: body.isBillingEntity,
      isCredentialingEntity: body.isCredentialingEntity,
      primarySpecialty: body.primarySpecialty,
      additionalSpecialties: body.additionalSpecialties,
      requestedServices: body.requestedServices as any,
      primaryServiceToLaunch: body.primaryServiceToLaunch,
      requestedGoLiveDate: toDate(body.requestedGoLiveDate),
      priorityLevel: body.priorityLevel,
      servicesForAllPractices: body.servicesForAllPractices,
      selectedPractices: body.selectedPractices,
      replacingExistingVendor: body.replacingExistingVendor,
      currentVendorName: body.currentVendorName,
      currentVendorEndDate: toDate(body.currentVendorEndDate),
      engagementGoals: body.engagementGoals,
      informationAccurate: body.informationAccurate,
      authorizeUse: body.authorizeUse,
      submittedByName: body.submittedByName,
      submittedByTitle: body.submittedByTitle,
      submissionDate: body.informationAccurate ? new Date() : undefined,
      contacts: body.contacts
        ? {
            create: body.contacts.map((c) => ({
              fullName: c.fullName,
              jobTitle: c.jobTitle,
              contactRole: c.contactRole,
              email: c.email,
              phone: c.phone,
              extension: c.extension,
              preferredContactMethod: c.preferredContactMethod,
              bestTimeToReach: c.bestTimeToReach,
              isPrimaryDecisionMaker: c.isPrimaryDecisionMaker,
              canSignAgreements: c.canSignAgreements,
              additionalResponsibilities: c.additionalResponsibilities,
            })),
          }
        : undefined,
      practices: body.practices
        ? {
            create: body.practices.map((p) => ({
              practiceName: p.practiceName,
              practiceDbaName: p.practiceDbaName,
              isPartOfParentCompany: p.isPartOfParentCompany,
              practiceType: p.practiceType,
              additionalSpecialtyAreas: p.additionalSpecialtyAreas,
              groupNpi: p.groupNpi,
              taxIdEin: p.taxIdEin,
              medicaidIdNumber: p.medicaidIdNumber,
              groupMedicaidNpi: p.groupMedicaidNpi,
              groupMedicarePtan: p.groupMedicarePtan,
              groupTaxonomy: p.groupTaxonomy,
              ipaAffiliations: p.ipaAffiliations,
              practiceManagerName: p.practiceManagerName,
              practiceManagerEmail: p.practiceManagerEmail,
              practiceManagerPhone: p.practiceManagerPhone,
              billingAddress: p.billingAddress,
              mailingAddress: p.mailingAddress,
              practiceWorkStartDate: toDateValue(p.practiceWorkStartDate),
              railroadMedicareGroup: p.railroadMedicareGroup,
              approximateNumberOfProviders: p.approximateNumberOfProviders,
              approximateNumberOfLocations: p.approximateNumberOfLocations,
              approximateMonthlyPatientVolume:
                p.approximateMonthlyPatientVolume,
              approximateMedicarePatientVolume:
                p.approximateMedicarePatientVolume,
              approximateMedicaidPatientVolume:
                p.approximateMedicaidPatientVolume,
              approximateCommercialPatientVolume:
                p.approximateCommercialPatientVolume,
              offersCareManagementServices: p.offersCareManagementServices,
              currentServicesOffered: p.currentServicesOffered,
              operationalPainPoints: p.operationalPainPoints,
              additionalNotes: p.additionalNotes,
              locations: p.locations
                ? {
                    create: p.locations.map((l) => ({
                      locationName: l.locationName,
                      isPrimaryLocation: l.isPrimaryLocation,
                      addressLine1: l.addressLine1,
                      addressLine2: l.addressLine2,
                      city: l.city,
                      state: l.state,
                      zipCode: l.zipCode,
                      mainPhoneNumber: l.mainPhoneNumber,
                      mainFaxNumber: l.mainFaxNumber,
                      officeEmail: l.officeEmail,
                      hoursOfOperation: l.hoursOfOperation,
                      officeManagerName: l.officeManagerName,
                      patientOutreachManaged: l.patientOutreachManaged,
                      billingManaged: l.billingManaged,
                      notes: l.notes,
                    })),
                  }
                : undefined,
              providers: p.providers
                ? {
                    create: p.providers.map((pr) => ({
                      firstName: pr.firstName,
                      lastName: pr.lastName,
                      fullName: pr.fullName,
                      dateOfBirth: toDateValue(pr.dateOfBirth),
                      gender: pr.gender,
                      credentials: pr.credentials,
                      providerType: pr.providerType,
                      specialty: pr.specialty,
                      cliaNumber: pr.cliaNumber,
                      npi: pr.npi,
                      caqhId: pr.caqhId,
                      ssnFullDigits: pr.ssnFullDigits,
                      licenseNumber: pr.licenseNumber,
                      licenseExpiryDate: toDateValue(pr.licenseExpiryDate),
                      stateOfLicense: pr.stateOfLicense,
                      licenseType: pr.licenseType,
                      taxonomy: pr.taxonomy,
                      primarySpecialty: pr.primarySpecialty,
                      secondarySpecialty: pr.secondarySpecialty,
                      boardCertifications: pr.boardCertifications,
                      caqhUsername: pr.caqhUsername,
                      caqhPassword: pr.caqhPassword,
                      caqhLastAttestationDate: toDateValue(
                        pr.caqhLastAttestationDate,
                      ),
                      languagesSpoken: pr.languagesSpoken,
                      telehealthAvailable: pr.telehealthAvailable,
                      malpracticeCarrier: pr.malpracticeCarrier,
                      malpracticePolicyNumber: pr.malpracticePolicyNumber,
                      malpracticeEffectiveDate: toDateValue(
                        pr.malpracticeEffectiveDate,
                      ),
                      malpracticeExpiryDate: toDateValue(
                        pr.malpracticeExpiryDate,
                      ),
                      hospitalAffiliations: pr.hospitalAffiliations,
                      personalCellNumber: pr.personalCellNumber,
                      personalEmail: pr.personalEmail,
                      practiceEmail: pr.practiceEmail,
                      medicarePtanIndividual: pr.medicarePtanIndividual,
                      medicaidIdIndividual: pr.medicaidIdIndividual,
                      ipaAffiliationsProviderLevel:
                        pr.ipaAffiliationsProviderLevel,
                      nppesUsername: pr.nppesUsername,
                      nppesPassword: pr.nppesPassword,
                      railroadMedicareIndividual:
                        pr.railroadMedicareIndividual,
                      copyOfBoardCertification: pr.copyOfBoardCertification,
                      copyOfProfessionalLiabilityInsurance:
                        pr.copyOfProfessionalLiabilityInsurance,
                      copyOfBachelorsDegree: pr.copyOfBachelorsDegree,
                      copyOfMastersDegree: pr.copyOfMastersDegree,
                      copyOfSocialSecurityCard: pr.copyOfSocialSecurityCard,
                      copyOfDriversLicense: pr.copyOfDriversLicense,
                      passportSizedPhoto: pr.passportSizedPhoto,
                      resume: pr.resume,
                      providerEffectiveDateWithGroup: toDateValue(
                        pr.providerEffectiveDateWithGroup,
                      ),
                      countryOfBirth: pr.countryOfBirth,
                      statePlaceOfBirth: pr.statePlaceOfBirth,
                      homeAddress: pr.homeAddress,
                      stateLicenseNumber: pr.stateLicenseNumber,
                      deaNumber: pr.deaNumber,
                      boardCertified: pr.boardCertified,
                      employmentStatus: pr.employmentStatus,
                      participatingLocations: pr.participatingLocations,
                      credentialingNeeded: pr.credentialingNeeded,
                      recredentialingNeeded: pr.recredentialingNeeded,
                      notes: pr.notes,
                    })),
                  }
                : undefined,
            })),
          }
        : undefined,
      documents: body.documents
        ? {
            create: body.documents.map((d) => ({
              documentType: d.documentType || [],
              fileName: d.fileName,
              fileUrl: d.fileUrl,
              required: d.required,
              status: d.status,
              dateRequested: toDateValue(d.dateRequested),
              dateReceived: toDateValue(d.dateReceived),
              notes: d.notes,
            })),
          }
        : undefined,
      billing: body.billing
        ? {
            create: {
              currentBillingModel: body.billing.currentBillingModel,
              billingCompanyName: body.billing.billingCompanyName,
              mainBillingContactName: body.billing.mainBillingContactName,
              mainBillingContactEmail: body.billing.mainBillingContactEmail,
              mainBillingContactPhone: body.billing.mainBillingContactPhone,
              recentW9Form: body.billing.recentW9Form,
              voidCheck: body.billing.voidCheck,
              formalLetterFromBank: body.billing.formalLetterFromBank,
              currentlyBilledServices: body.billing.currentlyBilledServices,
              activePayers: body.billing.activePayers,
              eftEraSetup: body.billing.eftEraSetup,
              invoiceRecipient: body.billing.invoiceRecipient,
              invoiceEmail: body.billing.invoiceEmail,
              preferredReportingCadence:
                body.billing.preferredReportingCadence,
              billingPainPoints: body.billing.billingPainPoints,
              additionalNotes: body.billing.additionalNotes,
            },
          }
        : undefined,
      credentialing: body.credentialing
        ? {
            create: {
              credentialingNeeded: body.credentialing.credentialingNeeded,
              credentialingFor: body.credentialing.credentialingFor,
              payersToEnroll: body.credentialing.payersToEnroll,
              approvedInsurancesTracker:
                body.credentialing.approvedInsurancesTracker,
              designatedPortalContactName:
                body.credentialing.designatedPortalContactName,
              designatedPortalContactEmail:
                body.credentialing.designatedPortalContactEmail,
              designatedPortalContactPhone:
                body.credentialing.designatedPortalContactPhone,
              irsDocument147c: body.credentialing.irsDocument147c,
              desiredInsurancePlans:
                body.credentialing.desiredInsurancePlans,
              caqhMaintained: body.credentialing.caqhMaintained,
              currentCredentialingIssues: body.credentialing
                .currentCredentialingIssues as any,
              medicarePtanAvailable: body.credentialing.medicarePtanAvailable,
              medicaidEnrollmentActive:
                body.credentialing.medicaidEnrollmentActive,
              additionalNotes: body.credentialing.additionalNotes,
            },
          }
        : undefined,
      technology: body.technology
        ? {
            create: {
              ehrSystem: body.technology.ehrSystem,
              practiceManagementSystem:
                body.technology.practiceManagementSystem,
              patientPortalAvailable: body.technology.patientPortalAvailable,
              patientListExportable: body.technology.patientListExportable,
              appointmentListExportable:
                body.technology.appointmentListExportable,
              apiAccessAvailable: body.technology.apiAccessAvailable,
              clearinghouse: body.technology.clearinghouse,
              faxPlatform: body.technology.faxPlatform,
              phonePlatform: body.technology.phonePlatform,
              currentCareManagementPlatform:
                body.technology.currentCareManagementPlatform,
              itContactName: body.technology.itContactName,
              itContactEmail: body.technology.itContactEmail,
              additionalTechnicalNotes:
                body.technology.additionalTechnicalNotes,
            },
          }
        : undefined,
      outreach: body.outreach
        ? {
            create: {
              preferredChannels: body.outreach.preferredChannels,
              patientTextConsent: body.outreach.patientTextConsent,
              preferredLanguages: body.outreach.preferredLanguages,
              interpreterServices: body.outreach.interpreterServices,
              outreachFromPractice: body.outreach.outreachFromPractice,
              approvedOutreachHours: body.outreach.approvedOutreachHours,
              messagingRequirements: body.outreach.messagingRequirements,
            },
          }
        : undefined,
      labPharmacy: body.labPharmacy
        ? {
            create: {
              preferredLab: body.labPharmacy.preferredLab,
              existingLabRelationship:
                body.labPharmacy.existingLabRelationship,
              labInterfaceStatus: body.labPharmacy.labInterfaceStatus,
              labContactName: body.labPharmacy.labContactName,
              labContactEmail: body.labPharmacy.labContactEmail,
              pharmacyPartnerName: body.labPharmacy.pharmacyPartnerName,
              pharmacyPartnerInvolved:
                body.labPharmacy.pharmacyPartnerInvolved,
              additionalNotes: body.labPharmacy.additionalNotes,
            },
          }
        : undefined,
      compliance: body.compliance
        ? {
            create: {
              hipaaContactName: body.compliance.hipaaContactName,
              hipaaContactEmail: body.compliance.hipaaContactEmail,
              baaRequired: body.compliance.baaRequired,
              securityQuestionnaire: body.compliance.securityQuestionnaire,
              currentConcerns: body.compliance.currentConcerns,
              additionalNotes: body.compliance.additionalNotes,
            },
          }
        : undefined,
      careProgram: body.careProgram
        ? {
            create: {
              programsPlanned: body.careProgram.programsPlanned || [],
              estimatedEligiblePatients:
                body.careProgram.estimatedEligiblePatients,
              currentEnrolledPatients:
                body.careProgram.currentEnrolledPatients,
              patientEnrollmentHandler:
                body.careProgram.patientEnrollmentHandler,
              monthlyFollowUpHandler: body.careProgram.monthlyFollowUpHandler,
              consentFormsInPlace: body.careProgram.consentFormsInPlace,
              existingCarePlanWorkflow:
                body.careProgram.existingCarePlanWorkflow,
              patientMinutesTracker: body.careProgram.patientMinutesTracker,
              complianceConcerns: body.careProgram.complianceConcerns,
            },
          }
        : undefined,
      OnboardingMarketing: body.marketing
        ? {
            create: {
              websiteUrl: body.marketing.websiteUrl,
              socialMediaChannels: body.marketing.socialMediaChannels || [],
              currentMarketingChannels:
                body.marketing.currentMarketingChannels || [],
              targetPatientDemographics:
                body.marketing.targetPatientDemographics,
              monthlyMarketingBudget: body.marketing.monthlyMarketingBudget,
              existingBrandAssets: body.marketing.existingBrandAssets,
              googleBusinessProfileClaimed:
                body.marketing.googleBusinessProfileClaimed,
              patientAcquisitionGoals:
                body.marketing.patientAcquisitionGoals,
              aiToolsUsed: body.marketing.aiToolsUsed,
              additionalMarketingNotes:
                body.marketing.additionalMarketingNotes,
            },
          }
        : undefined,
      status:
        (body.status as OnboardingStatus | undefined) ??
        OnboardingStatus.DRAFT,
    },
    include: onboardingInclude as any,
  } as any)) as any;

  if (body.status === OnboardingStatus.COMPLETED) {
    await handleCompletedOnboarding(onboarding.id);
  }

  return onboarding;
}

async function findExistingExternalOnboarding(practiceId: string) {
  const onboarding = (await prisma.onboarding.findFirst({
    where: { practiceId },
    include: onboardingInclude,
  } as any)) as any;

  return onboarding;
}

async function handleCompletedOnboarding(
  onboardingId: string,
): Promise<void> {
  const onboarding = (await prisma.onboarding.findUnique({
    where: { id: onboardingId },
    include: {
      practice: true,
    },
  } as any)) as any;

  if (!onboarding?.practiceId) {
    return;
  }

  const agreement = await prisma.agreement.findFirst({
    where: {
      practiceId: onboarding.practiceId,
      status: {
        in: [AgreementStatus.DRAFT, AgreementStatus.SIGNED],
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });

  if (agreement && agreement.status !== AgreementStatus.ACTIVE) {
    await prisma.agreement.update({
      where: { id: agreement.id },
      data: { status: AgreementStatus.ACTIVE },
    });
  }

  const companyId = onboarding.practice?.companyId;
  if (companyId) {
    await prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.CUSTOMER },
    });
  }
}

export async function createOnboarding(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const body = req.body as OnboardingBody;
    const onboarding = await createOnboardingRecord(body);

    if (body.status === OnboardingStatus.COMPLETED) {
      await handleCompletedOnboarding(onboarding.id);
    }

    return res.status(201).json({
      message: "Onboarding created successfully.",
      onboarding,
    });
  } catch (error) {
    if (isPracticeOnboardingConflictError(error)) {
      return res.status(409).json({
        message: error.message,
      });
    }

    console.log(error);
    return res.status(500).json({
      message: "Unable to create onboarding.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getExternalOnboardingByPractice(
  req: Request,
  res: Response,
) {
  try {
    const practiceId = Array.isArray(req.params.practiceId)
      ? req.params.practiceId[0]
      : req.params.practiceId;

    if (!practiceId) {
      return res.status(400).json({ message: "Practice id is required." });
    }

    const onboarding = await findExistingExternalOnboarding(practiceId);

    return res.status(200).json({
      message: "External onboarding lookup completed successfully.",
      onboarding,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch onboarding.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function createExternalOnboarding(req: Request, res: Response) {
  try {
    const body = req.body as OnboardingBody;
    const practiceId = body.practiceId;

    if (!practiceId) {
      return res.status(400).json({ message: "Practice id is required." });
    }

    const existingOnboarding = await findExistingExternalOnboarding(practiceId);

    if (existingOnboarding) {
      if (existingOnboarding.status !== OnboardingStatus.DRAFT) {
        return res.status(409).json({
          message:
            existingOnboarding.practiceId != null
              ? getCreateConflictMessage(existingOnboarding.practiceId)
              : "Onboarding already submitted for this practice.",
        });
      }

      const updateReq = {
        ...req,
        params: { ...req.params, id: existingOnboarding.id },
        body: {
          ...body,
          practiceId,
        },
      } as unknown as AuthenticatedRequest;

      return updateOnboarding(updateReq, res);
    }

    let onboarding = await createOnboardingRecord({
      ...body,
      practiceId,
    });

    if (body.status === OnboardingStatus.IN_PROGRESS) {
      onboarding = await attachSubmissionPdfToOnboarding(onboarding);
    }

    if (body.status === OnboardingStatus.COMPLETED) {
      await handleCompletedOnboarding(onboarding.id);
    }

    return res.status(201).json({
      message: "Onboarding submitted successfully.",
      onboarding,
    });
  } catch (error) {
    if (isPracticeOnboardingConflictError(error)) {
      return res.status(409).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Unable to submit onboarding.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function uploadExternalOnboardingDocument(
  req: Request,
  res: Response,
) {
  try {
    const decodeHeader = (value: string | string[] | undefined) => {
      const rawValue = Array.isArray(value) ? value[0] : value;
      if (!rawValue) return "";

      try {
        return decodeURIComponent(rawValue).trim();
      } catch {
        return rawValue.trim();
      }
    };

    const practiceId = decodeHeader(req.header("x-practice-id"));
    const practiceName = decodeHeader(req.header("x-practice-name"));
    const fileName = decodeHeader(req.header("x-file-name"));
    const field = decodeHeader(req.header("x-upload-field"));
    const contentType =
      decodeHeader(req.header("x-file-content-type")) ||
      req.header("content-type") ||
      "application/octet-stream";
    const fileBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from([]);

    if (!practiceId) {
      return res.status(400).json({ message: "Practice id is required." });
    }

    if (!practiceName) {
      return res.status(400).json({ message: "Practice name is required." });
    }

    if (!fileName || !field || fileBuffer.length === 0) {
      return res.status(400).json({
        message:
          "practiceId, practiceName, field, fileName, and file content are required.",
      });
    }

    const upload = await uploadBufferToAzureBlob({
      folder: `${practiceName}/providers/${field}`,
      fileName,
      buffer: fileBuffer,
      contentType,
    });

    return res.status(201).json({
      message: "Document uploaded successfully.",
      fileName,
      fileUrl: upload.sasUrl,
      blobUrl: upload.url,
      blobName: upload.blobName,
      field,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to upload onboarding document.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteExternalOnboardingDocument(
  req: Request,
  res: Response,
) {
  try {
    const fileUrl =
      typeof req.body?.fileUrl === "string" ? req.body.fileUrl.trim() : "";

    if (!fileUrl) {
      return res.status(400).json({ message: "File URL is required." });
    }

    const deletion = await deleteBlobFromAzureByUrl(fileUrl);

    return res.status(200).json({
      message: "Document deleted successfully.",
      blobName: deletion.blobName,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete onboarding document.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getOnboardings(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const { search, status } = req.query;

    const where: any = {};

    if (search) {
      where.OR = [
        {
          legalCompanyName: { contains: search as string, mode: "insensitive" },
        },
        { dbaName: { contains: search as string, mode: "insensitive" } },
        {
          submittedByName: { contains: search as string, mode: "insensitive" },
        },
      ];
    }

    if (status && (status as string) in OnboardingStatus) {
      where.status = status as OnboardingStatus;
    }

    const [onboardings, totalRecords] = await Promise.all([
      prisma.onboarding.findMany({
        where,
        include: {
          contacts: true,
          practices: {
            include: {
              locations: true,
              providers: true,
            },
          },
          billing: true,
          careProgram: true,
          compliance: true,
          credentialing: true,
          documents: true,
          labPharmacy: true,
          OnboardingMarketing: true,
          outreach: true,
          technology: true,
          _count: {
            select: {
              practices: true,
              contacts: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.onboarding.count({ where }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return res.status(200).json({
      message: "Onboardings fetched successfully.",
      onboardings,
      pagination: {
        totalRecords,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Unable to fetch onboardings.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getOnboarding(req: AuthenticatedRequest, res: Response) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Onboarding id is required." });
    }

    const onboarding = (await prisma.onboarding.findFirst({
      where: { id },
      include: {
        contacts: true,
        practices: {
          include: {
            locations: true,
            providers: true,
          },
        },
        documents: true,
        billing: true,
        credentialing: true,
        technology: true,
        outreach: true,
        labPharmacy: true,
        compliance: true,
        careProgram: true,
        OnboardingMarketing: true,
      },
    } as any)) as any;

    if (!onboarding) {
      return res.status(404).json({ message: "Onboarding not found." });
    }

    return res.status(200).json({
      message: "Onboarding fetched successfully.",
      onboarding,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch onboarding.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function updateOnboarding(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Onboarding id is required." });
    }

    const body = req.body as OnboardingBody;

    const toEnum = (v: string) => (v === "" ? undefined : v);
    const toDate = (v: string | Date | undefined) =>
      !v || v === "" ? undefined : v instanceof Date ? v : new Date(v);
    const toDateValue = (v: string | Date | undefined) =>
      !v || v === "" ? undefined : v instanceof Date ? v : new Date(v);

    const existing = (await prisma.onboarding.findFirst({
      where: { id },
      include: {
        contacts: true,
        practices: {
          include: {
            locations: true,
            providers: true,
          },
        },
        documents: true,
        billing: true,
        credentialing: true,
        technology: true,
        outreach: true,
        labPharmacy: true,
        compliance: true,
        careProgram: true,
        OnboardingMarketing: true,
      },
    } as any)) as any;

    if (!existing) {
      return res.status(404).json({ message: "Onboarding not found." });
    }

    await ensureUniquePracticeOnboarding(body.practiceId ?? existing.practiceId, id);

    let onboarding = (await prisma.onboarding.update({
      where: { id },
      data: {
        practiceId: body.practiceId,
        personId: body.personId,
        onboardingType: toEnum(body.onboardingType || "") as any,
        isAuthorizedPerson: body.isAuthorizedPerson,
        nonAuthorizedRole: body.nonAuthorizedRole,
        numberOfPractices: body.numberOfPractices,
        numberOfLocations: body.numberOfLocations,
        billingManagedCentrally: body.billingManagedCentrally,
        credentialingManagedCentrally: body.credentialingManagedCentrally,
        contractingManagedCentrally: body.contractingManagedCentrally,
        oneMainContact: body.oneMainContact,
        legalCompanyName: body.legalCompanyName,
        dbaName: body.dbaName,
        organizationType: toEnum(body.organizationType || "") as any,
        taxIdEin: body.taxIdEin,
        mainCompanyPhone: body.mainCompanyPhone,
        mainCompanyFax: body.mainCompanyFax,
        mainCompanyEmail: body.mainCompanyEmail,
        companyWebsite: body.companyWebsite,
        companyAddressLine1: body.companyAddressLine1,
        companyAddressLine2: body.companyAddressLine2,
        companyCity: body.companyCity,
        companyState: body.companyState,
        companyZip: body.companyZip,
        ownershipType: toEnum(body.ownershipType || "") as any,
        statesOfOperation: body.statesOfOperation,
        isLegalContractingEntity: body.isLegalContractingEntity,
        isBillingEntity: body.isBillingEntity,
        isCredentialingEntity: body.isCredentialingEntity,
        primarySpecialty: body.primarySpecialty,
        additionalSpecialties: body.additionalSpecialties,
        requestedServices: body.requestedServices as any,
        primaryServiceToLaunch: body.primaryServiceToLaunch,
        requestedGoLiveDate: toDate(body.requestedGoLiveDate),
        priorityLevel: body.priorityLevel,
        servicesForAllPractices: body.servicesForAllPractices,
        selectedPractices: body.selectedPractices,
        replacingExistingVendor: body.replacingExistingVendor,
        currentVendorName: body.currentVendorName,
        currentVendorEndDate: toDate(body.currentVendorEndDate),
        engagementGoals: body.engagementGoals,
        informationAccurate: body.informationAccurate,
        authorizeUse: body.authorizeUse,
        submittedByName: body.submittedByName,
        submittedByTitle: body.submittedByTitle,
        submissionDate:
          body.informationAccurate && !existing.submissionDate
            ? new Date()
            : existing.submissionDate,
        status: body.status as OnboardingStatus,
        contacts: body.contacts
          ? {
              deleteMany: {},
              create: body.contacts.map((c) => ({
                fullName: c.fullName,
                jobTitle: c.jobTitle,
                contactRole: c.contactRole as any,
                email: c.email,
                phone: c.phone,
                extension: c.extension,
                preferredContactMethod: c.preferredContactMethod,
                bestTimeToReach: c.bestTimeToReach,
                isPrimaryDecisionMaker: c.isPrimaryDecisionMaker,
                canSignAgreements: c.canSignAgreements,
                additionalResponsibilities: c.additionalResponsibilities,
              })),
            }
          : undefined,
        practices: body.practices
          ? {
              deleteMany: {},
              create: body.practices.map((p) => ({
                practiceName: p.practiceName,
                practiceDbaName: p.practiceDbaName,
                isPartOfParentCompany: p.isPartOfParentCompany,
                practiceType: p.practiceType as any,
                additionalSpecialtyAreas: p.additionalSpecialtyAreas,
                groupNpi: p.groupNpi,
                taxIdEin: p.taxIdEin,
                medicaidIdNumber: p.medicaidIdNumber,
                groupMedicaidNpi: p.groupMedicaidNpi,
                groupMedicarePtan: p.groupMedicarePtan,
                groupTaxonomy: p.groupTaxonomy,
                ipaAffiliations: p.ipaAffiliations,
                practiceManagerName: p.practiceManagerName,
                practiceManagerEmail: p.practiceManagerEmail,
                practiceManagerPhone: p.practiceManagerPhone,
                billingAddress: p.billingAddress,
                mailingAddress: p.mailingAddress,
                practiceWorkStartDate: toDateValue(p.practiceWorkStartDate),
                railroadMedicareGroup: p.railroadMedicareGroup,
                approximateNumberOfProviders: p.approximateNumberOfProviders,
                approximateNumberOfLocations: p.approximateNumberOfLocations,
                approximateMonthlyPatientVolume:
                  p.approximateMonthlyPatientVolume,
                approximateMedicarePatientVolume:
                  p.approximateMedicarePatientVolume,
                approximateMedicaidPatientVolume:
                  p.approximateMedicaidPatientVolume,
                approximateCommercialPatientVolume:
                  p.approximateCommercialPatientVolume,
                offersCareManagementServices: p.offersCareManagementServices,
                currentServicesOffered: p.currentServicesOffered,
                operationalPainPoints: p.operationalPainPoints,
                additionalNotes: p.additionalNotes,
                locations: p.locations
                  ? {
                      create: p.locations.map((l) => ({
                        locationName: l.locationName,
                        isPrimaryLocation: l.isPrimaryLocation,
                        addressLine1: l.addressLine1,
                        addressLine2: l.addressLine2,
                        city: l.city,
                        state: l.state,
                        zipCode: l.zipCode,
                        mainPhoneNumber: l.mainPhoneNumber,
                        mainFaxNumber: l.mainFaxNumber,
                        officeEmail: l.officeEmail,
                        hoursOfOperation: l.hoursOfOperation,
                        officeManagerName: l.officeManagerName,
                        patientOutreachManaged: l.patientOutreachManaged,
                        billingManaged: l.billingManaged,
                        notes: l.notes,
                      })),
                    }
                  : undefined,
                providers: p.providers
                  ? {
                      create: p.providers.map((pr) => ({
                        firstName: pr.firstName,
                        lastName: pr.lastName,
                        fullName: pr.fullName,
                        dateOfBirth: toDateValue(pr.dateOfBirth),
                        gender: pr.gender,
                        credentials: pr.credentials,
                        providerType: pr.providerType,
                        specialty: pr.specialty,
                        cliaNumber: pr.cliaNumber,
                        npi: pr.npi,
                        caqhId: pr.caqhId,
                        ssnFullDigits: pr.ssnFullDigits,
                        licenseNumber: pr.licenseNumber,
                        licenseExpiryDate: toDateValue(pr.licenseExpiryDate),
                        stateOfLicense: pr.stateOfLicense,
                        licenseType: pr.licenseType,
                        taxonomy: pr.taxonomy,
                        primarySpecialty: pr.primarySpecialty,
                        secondarySpecialty: pr.secondarySpecialty,
                        boardCertifications: pr.boardCertifications,
                        caqhUsername: pr.caqhUsername,
                        caqhPassword: pr.caqhPassword,
                        caqhLastAttestationDate: toDateValue(
                          pr.caqhLastAttestationDate,
                        ),
                        languagesSpoken: pr.languagesSpoken,
                        telehealthAvailable: pr.telehealthAvailable,
                        malpracticeCarrier: pr.malpracticeCarrier,
                        malpracticePolicyNumber: pr.malpracticePolicyNumber,
                        malpracticeEffectiveDate: toDateValue(
                          pr.malpracticeEffectiveDate,
                        ),
                        malpracticeExpiryDate: toDateValue(
                          pr.malpracticeExpiryDate,
                        ),
                        hospitalAffiliations: pr.hospitalAffiliations,
                        personalCellNumber: pr.personalCellNumber,
                        personalEmail: pr.personalEmail,
                        practiceEmail: pr.practiceEmail,
                        medicarePtanIndividual: pr.medicarePtanIndividual,
                        medicaidIdIndividual: pr.medicaidIdIndividual,
                        ipaAffiliationsProviderLevel:
                          pr.ipaAffiliationsProviderLevel,
                        nppesUsername: pr.nppesUsername,
                        nppesPassword: pr.nppesPassword,
                        railroadMedicareIndividual:
                          pr.railroadMedicareIndividual,
                        copyOfBoardCertification: pr.copyOfBoardCertification,
                        copyOfProfessionalLiabilityInsurance:
                          pr.copyOfProfessionalLiabilityInsurance,
                        copyOfBachelorsDegree: pr.copyOfBachelorsDegree,
                        copyOfMastersDegree: pr.copyOfMastersDegree,
                        copyOfSocialSecurityCard: pr.copyOfSocialSecurityCard,
                        copyOfDriversLicense: pr.copyOfDriversLicense,
                        passportSizedPhoto: pr.passportSizedPhoto,
                        resume: pr.resume,
                        providerEffectiveDateWithGroup: toDateValue(
                          pr.providerEffectiveDateWithGroup,
                        ),
                        countryOfBirth: pr.countryOfBirth,
                        statePlaceOfBirth: pr.statePlaceOfBirth,
                        homeAddress: pr.homeAddress,
                        stateLicenseNumber: pr.stateLicenseNumber,
                        deaNumber: pr.deaNumber,
                        boardCertified: pr.boardCertified,
                        employmentStatus: pr.employmentStatus,
                        participatingLocations: pr.participatingLocations,
                        credentialingNeeded: pr.credentialingNeeded,
                        recredentialingNeeded: pr.recredentialingNeeded,
                        notes: pr.notes,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
        documents: body.documents
          ? {
              deleteMany: {},
              create: body.documents.map((d) => ({
                documentType: (d.documentType || []) as any,
                fileName: d.fileName,
                fileUrl: d.fileUrl,
                required: d.required,
                status: d.status as any,
                dateRequested: toDateValue(d.dateRequested),
                dateReceived: toDateValue(d.dateReceived),
                notes: d.notes,
              })),
            }
          : undefined,
        billing: body.billing
          ? existing.billing
            ? {
                update: {
                  currentBillingModel: body.billing.currentBillingModel,
                  billingCompanyName: body.billing.billingCompanyName,
                  mainBillingContactName: body.billing.mainBillingContactName,
                  mainBillingContactEmail: body.billing.mainBillingContactEmail,
                  mainBillingContactPhone: body.billing.mainBillingContactPhone,
                  recentW9Form: body.billing.recentW9Form,
                  voidCheck: body.billing.voidCheck,
                  formalLetterFromBank: body.billing.formalLetterFromBank,
                  currentlyBilledServices: body.billing.currentlyBilledServices,
                  activePayers: body.billing.activePayers,
                  eftEraSetup: body.billing.eftEraSetup,
                  invoiceRecipient: body.billing.invoiceRecipient,
                  invoiceEmail: body.billing.invoiceEmail,
                  preferredReportingCadence:
                    body.billing.preferredReportingCadence,
                  billingPainPoints: body.billing.billingPainPoints,
                  additionalNotes: body.billing.additionalNotes,
                },
              }
            : {
                create: {
                  currentBillingModel: body.billing.currentBillingModel,
                  billingCompanyName: body.billing.billingCompanyName,
                  mainBillingContactName: body.billing.mainBillingContactName,
                  mainBillingContactEmail: body.billing.mainBillingContactEmail,
                  mainBillingContactPhone: body.billing.mainBillingContactPhone,
                  recentW9Form: body.billing.recentW9Form,
                  voidCheck: body.billing.voidCheck,
                  formalLetterFromBank: body.billing.formalLetterFromBank,
                  currentlyBilledServices: body.billing.currentlyBilledServices,
                  activePayers: body.billing.activePayers,
                  eftEraSetup: body.billing.eftEraSetup,
                  invoiceRecipient: body.billing.invoiceRecipient,
                  invoiceEmail: body.billing.invoiceEmail,
                  preferredReportingCadence:
                    body.billing.preferredReportingCadence,
                  billingPainPoints: body.billing.billingPainPoints,
                  additionalNotes: body.billing.additionalNotes,
                },
              }
          : undefined,
        credentialing: body.credentialing
          ? existing.credentialing
            ? {
                update: {
                  credentialingNeeded: body.credentialing.credentialingNeeded,
                  credentialingFor: body.credentialing.credentialingFor,
                  payersToEnroll: body.credentialing.payersToEnroll,
                  approvedInsurancesTracker:
                    body.credentialing.approvedInsurancesTracker,
                  designatedPortalContactName:
                    body.credentialing.designatedPortalContactName,
                  designatedPortalContactEmail:
                    body.credentialing.designatedPortalContactEmail,
                  designatedPortalContactPhone:
                    body.credentialing.designatedPortalContactPhone,
                  irsDocument147c: body.credentialing.irsDocument147c,
                  desiredInsurancePlans:
                    body.credentialing.desiredInsurancePlans,
                  caqhMaintained: body.credentialing.caqhMaintained,
                  currentCredentialingIssues: body.credentialing
                    .currentCredentialingIssues as any,
                  medicarePtanAvailable:
                    body.credentialing.medicarePtanAvailable,
                  medicaidEnrollmentActive:
                    body.credentialing.medicaidEnrollmentActive,
                  additionalNotes: body.credentialing.additionalNotes,
                },
              }
            : {
                create: {
                  credentialingNeeded: body.credentialing.credentialingNeeded,
                  credentialingFor: body.credentialing.credentialingFor,
                  payersToEnroll: body.credentialing.payersToEnroll,
                  approvedInsurancesTracker:
                    body.credentialing.approvedInsurancesTracker,
                  designatedPortalContactName:
                    body.credentialing.designatedPortalContactName,
                  designatedPortalContactEmail:
                    body.credentialing.designatedPortalContactEmail,
                  designatedPortalContactPhone:
                    body.credentialing.designatedPortalContactPhone,
                  irsDocument147c: body.credentialing.irsDocument147c,
                  desiredInsurancePlans:
                    body.credentialing.desiredInsurancePlans,
                  caqhMaintained: body.credentialing.caqhMaintained,
                  currentCredentialingIssues: body.credentialing
                    .currentCredentialingIssues as any,
                  medicarePtanAvailable:
                    body.credentialing.medicarePtanAvailable,
                  medicaidEnrollmentActive:
                    body.credentialing.medicaidEnrollmentActive,
                  additionalNotes: body.credentialing.additionalNotes,
                },
              }
          : undefined,
        technology: body.technology
          ? existing.technology
            ? {
                update: {
                  ehrSystem: body.technology.ehrSystem,
                  practiceManagementSystem:
                    body.technology.practiceManagementSystem,
                  patientPortalAvailable: body.technology.patientPortalAvailable,
                  patientListExportable: body.technology.patientListExportable,
                  appointmentListExportable:
                    body.technology.appointmentListExportable,
                  apiAccessAvailable: body.technology.apiAccessAvailable,
                  clearinghouse: body.technology.clearinghouse,
                  faxPlatform: body.technology.faxPlatform,
                  phonePlatform: body.technology.phonePlatform,
                  currentCareManagementPlatform:
                    body.technology.currentCareManagementPlatform,
                  itContactName: body.technology.itContactName,
                  itContactEmail: body.technology.itContactEmail,
                  additionalTechnicalNotes:
                    body.technology.additionalTechnicalNotes,
                },
              }
            : {
                create: {
                  ehrSystem: body.technology.ehrSystem,
                  practiceManagementSystem:
                    body.technology.practiceManagementSystem,
                  patientPortalAvailable: body.technology.patientPortalAvailable,
                  patientListExportable: body.technology.patientListExportable,
                  appointmentListExportable:
                    body.technology.appointmentListExportable,
                  apiAccessAvailable: body.technology.apiAccessAvailable,
                  clearinghouse: body.technology.clearinghouse,
                  faxPlatform: body.technology.faxPlatform,
                  phonePlatform: body.technology.phonePlatform,
                  currentCareManagementPlatform:
                    body.technology.currentCareManagementPlatform,
                  itContactName: body.technology.itContactName,
                  itContactEmail: body.technology.itContactEmail,
                  additionalTechnicalNotes:
                    body.technology.additionalTechnicalNotes,
                },
              }
          : undefined,
        outreach: body.outreach
          ? existing.outreach
            ? {
                update: {
                  preferredChannels: body.outreach.preferredChannels,
                  patientTextConsent: body.outreach.patientTextConsent,
                  preferredLanguages: body.outreach.preferredLanguages,
                  interpreterServices: body.outreach.interpreterServices,
                  outreachFromPractice: body.outreach.outreachFromPractice,
                  approvedOutreachHours: body.outreach.approvedOutreachHours,
                  messagingRequirements: body.outreach.messagingRequirements,
                },
              }
            : {
                create: {
                  preferredChannels: body.outreach.preferredChannels,
                  patientTextConsent: body.outreach.patientTextConsent,
                  preferredLanguages: body.outreach.preferredLanguages,
                  interpreterServices: body.outreach.interpreterServices,
                  outreachFromPractice: body.outreach.outreachFromPractice,
                  approvedOutreachHours: body.outreach.approvedOutreachHours,
                  messagingRequirements: body.outreach.messagingRequirements,
                },
              }
          : undefined,
        labPharmacy: body.labPharmacy
          ? existing.labPharmacy
            ? {
                update: {
                  preferredLab: body.labPharmacy.preferredLab,
                  existingLabRelationship:
                    body.labPharmacy.existingLabRelationship,
                  labInterfaceStatus: body.labPharmacy.labInterfaceStatus,
                  labContactName: body.labPharmacy.labContactName,
                  labContactEmail: body.labPharmacy.labContactEmail,
                  pharmacyPartnerName: body.labPharmacy.pharmacyPartnerName,
                  pharmacyPartnerInvolved:
                    body.labPharmacy.pharmacyPartnerInvolved,
                  additionalNotes: body.labPharmacy.additionalNotes,
                },
              }
            : {
                create: {
                  preferredLab: body.labPharmacy.preferredLab,
                  existingLabRelationship:
                    body.labPharmacy.existingLabRelationship,
                  labInterfaceStatus: body.labPharmacy.labInterfaceStatus,
                  labContactName: body.labPharmacy.labContactName,
                  labContactEmail: body.labPharmacy.labContactEmail,
                  pharmacyPartnerName: body.labPharmacy.pharmacyPartnerName,
                  pharmacyPartnerInvolved:
                    body.labPharmacy.pharmacyPartnerInvolved,
                  additionalNotes: body.labPharmacy.additionalNotes,
                },
              }
          : undefined,
        compliance: body.compliance
          ? existing.compliance
            ? {
                update: {
                  hipaaContactName: body.compliance.hipaaContactName,
                  hipaaContactEmail: body.compliance.hipaaContactEmail,
                  baaRequired: body.compliance.baaRequired,
                  securityQuestionnaire: body.compliance.securityQuestionnaire,
                  currentConcerns: body.compliance.currentConcerns,
                  additionalNotes: body.compliance.additionalNotes,
                },
              }
            : {
                create: {
                  hipaaContactName: body.compliance.hipaaContactName,
                  hipaaContactEmail: body.compliance.hipaaContactEmail,
                  baaRequired: body.compliance.baaRequired,
                  securityQuestionnaire: body.compliance.securityQuestionnaire,
                  currentConcerns: body.compliance.currentConcerns,
                  additionalNotes: body.compliance.additionalNotes,
                },
              }
          : undefined,
        careProgram: body.careProgram
          ? existing.careProgram
            ? {
                update: {
                  programsPlanned: body.careProgram.programsPlanned || [],
                  estimatedEligiblePatients:
                    body.careProgram.estimatedEligiblePatients,
                  currentEnrolledPatients:
                    body.careProgram.currentEnrolledPatients,
                  patientEnrollmentHandler:
                    body.careProgram.patientEnrollmentHandler,
                  monthlyFollowUpHandler:
                    body.careProgram.monthlyFollowUpHandler,
                  consentFormsInPlace: body.careProgram.consentFormsInPlace,
                  existingCarePlanWorkflow:
                    body.careProgram.existingCarePlanWorkflow,
                  patientMinutesTracker: body.careProgram.patientMinutesTracker,
                  complianceConcerns: body.careProgram.complianceConcerns,
                },
              }
            : {
                create: {
                  programsPlanned: body.careProgram.programsPlanned || [],
                  estimatedEligiblePatients:
                    body.careProgram.estimatedEligiblePatients,
                  currentEnrolledPatients:
                    body.careProgram.currentEnrolledPatients,
                  patientEnrollmentHandler:
                    body.careProgram.patientEnrollmentHandler,
                  monthlyFollowUpHandler:
                    body.careProgram.monthlyFollowUpHandler,
                  consentFormsInPlace: body.careProgram.consentFormsInPlace,
                  existingCarePlanWorkflow:
                    body.careProgram.existingCarePlanWorkflow,
                  patientMinutesTracker: body.careProgram.patientMinutesTracker,
                  complianceConcerns: body.careProgram.complianceConcerns,
                },
              }
          : undefined,
        OnboardingMarketing: body.marketing
          ? existing.OnboardingMarketing
            ? {
                update: {
                  websiteUrl: body.marketing.websiteUrl,
                  socialMediaChannels: body.marketing.socialMediaChannels || [],
                  currentMarketingChannels:
                    body.marketing.currentMarketingChannels || [],
                  targetPatientDemographics:
                    body.marketing.targetPatientDemographics,
                  monthlyMarketingBudget: body.marketing.monthlyMarketingBudget,
                  existingBrandAssets: body.marketing.existingBrandAssets,
                  googleBusinessProfileClaimed:
                    body.marketing.googleBusinessProfileClaimed,
                  patientAcquisitionGoals:
                    body.marketing.patientAcquisitionGoals,
                  aiToolsUsed: body.marketing.aiToolsUsed,
                  additionalMarketingNotes:
                    body.marketing.additionalMarketingNotes,
                },
              }
            : {
                create: {
                  websiteUrl: body.marketing.websiteUrl,
                  socialMediaChannels: body.marketing.socialMediaChannels || [],
                  currentMarketingChannels:
                    body.marketing.currentMarketingChannels || [],
                  targetPatientDemographics:
                    body.marketing.targetPatientDemographics,
                  monthlyMarketingBudget: body.marketing.monthlyMarketingBudget,
                  existingBrandAssets: body.marketing.existingBrandAssets,
                  googleBusinessProfileClaimed:
                    body.marketing.googleBusinessProfileClaimed,
                  patientAcquisitionGoals:
                    body.marketing.patientAcquisitionGoals,
                  aiToolsUsed: body.marketing.aiToolsUsed,
                  additionalMarketingNotes:
                    body.marketing.additionalMarketingNotes,
                },
              }
          : undefined,
      },
      include: {
        contacts: true,
        practices: {
          include: {
            locations: true,
            providers: true,
          },
        },
        documents: true,
        billing: true,
        credentialing: true,
        technology: true,
        outreach: true,
        labPharmacy: true,
        compliance: true,
        careProgram: true,
        OnboardingMarketing: true,
        practice: true,
        person: true,
      },
    } as any)) as any;

    if (
      body.status === OnboardingStatus.COMPLETED &&
      existing.status !== OnboardingStatus.COMPLETED
    ) {
      await handleCompletedOnboarding(onboarding.id);
    }

    if (
      body.status === OnboardingStatus.IN_PROGRESS &&
      existing.status !== OnboardingStatus.IN_PROGRESS
    ) {
      onboarding = await attachSubmissionPdfToOnboarding(onboarding);
    }

    return res.status(200).json({
      message: "Onboarding updated successfully.",
      onboarding,
    });
  } catch (error) {
    if (isPracticeOnboardingConflictError(error)) {
      return res.status(409).json({
        message: error.message,
      });
    }

    console.log(error);
    return res.status(500).json({
      message: "Unable to update onboarding.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function deleteOnboarding(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!id) {
      return res.status(400).json({ message: "Onboarding id is required." });
    }

    const existing = await prisma.onboarding.findFirst({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Onboarding not found." });
    }

    await prisma.onboarding.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Onboarding deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to delete onboarding.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
