import { Response } from "express";
import { prisma } from "../../lib/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { OnboardingStatus } from "../../../generated/prisma/client";

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
  credentials?: string;
  providerType?: string;
  specialty?: string;
  npi?: string;
  caqhId?: string;
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
  documentType?: string;
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

type OnboardingBody = {
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
};

export async function createOnboarding(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const body = req.body as OnboardingBody;

    const toEnum = (v: string) => (v === "" ? undefined : v);
    const toDate = (v: string | Date | undefined) =>
      !v || v === "" ? undefined : v instanceof Date ? v : new Date(v);

    const onboarding = await prisma.onboarding.create({
      data: {
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
                        credentials: pr.credentials,
                        providerType: pr.providerType,
                        specialty: pr.specialty,
                        npi: pr.npi,
                        caqhId: pr.caqhId,
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
                documentType: d.documentType || "",
                fileName: d.fileName,
                fileUrl: d.fileUrl,
                required: d.required,
                status: d.status,
                dateRequested: d.dateRequested,
                dateReceived: d.dateReceived,
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
                caqhMaintained: body.credentialing.caqhMaintained,
                currentCredentialingIssues:
                  body.credentialing.currentCredentialingIssues,
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
      },
    });

    return res.status(201).json({
      message: "Onboarding created successfully.",
      onboarding,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Unable to create onboarding.",
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

    const onboarding = await prisma.onboarding.findFirst({
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
      },
    });

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

    const existing = await prisma.onboarding.findFirst({
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
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Onboarding not found." });
    }

    const onboarding = await prisma.onboarding.update({
      where: { id },
      data: {
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
        requestedGoLiveDate: body.requestedGoLiveDate,
        priorityLevel: body.priorityLevel,
        servicesForAllPractices: body.servicesForAllPractices,
        replacingExistingVendor: body.replacingExistingVendor,
        currentVendorName: body.currentVendorName,
        currentVendorEndDate: body.currentVendorEndDate,
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
      },
    });

    return res.status(200).json({
      message: "Onboarding updated successfully.",
      onboarding,
    });
  } catch (error) {
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
