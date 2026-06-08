import { prisma } from "../lib/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function deactivateExpiredPricingTerms() {
  const now = new Date();
  const result = await prisma.agreementServiceTerm.updateMany({
    where: {
      isActive: true,
      endDate: {
        lt: now,
      },
    },
    data: {
      isActive: false,
    },
  });

  if (result.count > 0) {
    console.log(
      `Pricing term expiry job deactivated ${result.count} expired pricing term(s).`,
    );
  }
}

export function startPricingTermExpiryJob() {
  void deactivateExpiredPricingTerms().catch((error) => {
    console.error("Pricing term expiry job failed:", error);
  });

  setInterval(() => {
    void deactivateExpiredPricingTerms().catch((error) => {
      console.error("Pricing term expiry job failed:", error);
    });
  }, ONE_DAY_MS);
}
