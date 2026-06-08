import cron from "node-cron";
import { prisma } from "../lib/prisma";

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
  // Optional: Run once on startup
  void deactivateExpiredPricingTerms().catch((error) => {
    console.error("Pricing term expiry job failed:", error);
  });

  // Run every day at 12:00 AM Eastern Time
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await deactivateExpiredPricingTerms();
      } catch (error) {
        console.error("Pricing term expiry job failed:", error);
      }
    },
    {
      timezone: "America/New_York",
    }
  );

  console.log("Pricing term expiry job scheduled for 12:00 AM ET daily.");
}