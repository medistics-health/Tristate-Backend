import { AgreementStatus } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

const DEFAULT_INTERVAL_MINUTES = 60;

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function expireOverdueAgreements() {
  const cutoffDate = getStartOfToday();

  const result = await prisma.agreement.updateMany({
    where: {
      status: {
        not: AgreementStatus.EXPIRED,
      },
      renewalDate: {
        not: null,
        lt: cutoffDate,
      },
    },
    data: {
      status: AgreementStatus.EXPIRED,
    },
  });

  if (result.count > 0) {
    console.log(
      `[agreement-expiry] Marked ${result.count} agreement(s) as EXPIRED before ${cutoffDate.toISOString()}.`,
    );
  }

  return result.count;
}

export function startAgreementExpiryJob() {
  if (process.env.ENABLE_AGREEMENT_EXPIRY_JOB === "false") {
    console.log("[agreement-expiry] Job disabled by environment.");
    return;
  }

  const configuredInterval = Number(
    process.env.AGREEMENT_EXPIRY_CHECK_INTERVAL_MINUTES ||
      DEFAULT_INTERVAL_MINUTES,
  );
  const intervalMinutes =
    Number.isFinite(configuredInterval) && configuredInterval > 0
      ? configuredInterval
      : DEFAULT_INTERVAL_MINUTES;
  const intervalMs = intervalMinutes * 60 * 1000;

  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      await expireOverdueAgreements();
    } catch (error) {
      console.error("[agreement-expiry] Failed to update agreements:", error);
    } finally {
      isRunning = false;
    }
  };

  void run();

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  timer.unref?.();

  console.log(
    `[agreement-expiry] Job started. Checking every ${intervalMinutes} minute(s).`,
  );
}
