import cron from "node-cron";
import {
  CredentialingActivityType,
  CredentialingRequestStatus,
} from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { sendOutlookEmail } from "../utils/outlook";

// Track sent email keys per day to prevent duplicate emails during the same day: `${requestId}:${dateType}:${dateString}:${subType}`
const sentRemindersToday = new Set<string>();
let lastSentResetDay = new Date().getUTCDate();

function resetSentTrackerIfNewDay() {
  const currentDay = new Date().getUTCDate();
  if (currentDay !== lastSentResetDay) {
    sentRemindersToday.clear();
    lastSentResetDay = currentDay;
  }
}

function formatDate(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${date.getUTCFullYear()}`;
}

export async function processCredentialingTriggers() {
  resetSentTrackerIfNewDay();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // -------------------------------------------------------------
  // 1. AUTO STATUS TRIGGER: Change status to RE_CREDENTIALING_DUE
  // -------------------------------------------------------------
  try {
    const dueForReCred = await prisma.credentialingRequest.findMany({
      where: {
        reCredentialingDueDate: {
          lte: now,
          not: null,
        },
        status: {
          notIn: [
            CredentialingRequestStatus.RE_CREDENTIALING_DUE,
            CredentialingRequestStatus.TERMINATED,
          ],
        },
      },
      select: {
        id: true,
        credentialingId: true,
        reCredentialingDueDate: true,
        status: true,
      },
    });

    if (dueForReCred.length > 0) {
      console.log(
        `[credentialing-trigger] Found ${dueForReCred.length} record(s) reaching Re-credentialing Due Date. Updating status...`,
      );

      for (const reqRecord of dueForReCred) {
        await prisma.$transaction(async (tx) => {
          await tx.credentialingRequest.update({
            where: { id: reqRecord.id },
            data: {
              status: CredentialingRequestStatus.RE_CREDENTIALING_DUE,
              lastActivityDate: now,
            },
          });

          await tx.credentialingActivityLog.create({
            data: {
              credentialingRequestId: reqRecord.id,
              activityType: CredentialingActivityType.STATUS_CHANGED,
              action: "Status Auto-Updated",
              details: `Status automatically updated to Re-credentialing Due upon reaching Re-credentialing Due Date (${formatDate(reqRecord.reCredentialingDueDate)}).`,
              actorName: "System",
            },
          });
        });

        console.log(
          `[credentialing-trigger] Updated record ${reqRecord.credentialingId} to RE_CREDENTIALING_DUE.`,
        );
      }
    }
  } catch (err) {
    console.error(
      "[credentialing-trigger] Error processing auto status trigger:",
      err,
    );
  }

  // -------------------------------------------------------------
  // 2. EMAIL REMINDER TRIGGER: Notify Assigned Specialist
  // -------------------------------------------------------------
  try {
    const settings = await prisma.systemSettings.findFirst();
    const reminderDays = settings?.credentialingReminderDays ?? 5;

    // Threshold end date (today + reminderDays)
    const thresholdEnd = new Date(todayStart.getTime() + (reminderDays + 1) * 24 * 60 * 60 * 1000);

    const activeRequests = await prisma.credentialingRequest.findMany({
      where: {
        assignedToUserId: { not: null },
        status: { not: CredentialingRequestStatus.TERMINATED },
        OR: [
          {
            reCredentialingDueDate: {
              gte: todayStart,
              lte: thresholdEnd,
            },
          },
          {
            expirationDate: {
              gte: todayStart,
              lte: thresholdEnd,
            },
          },
          {
            nextFollowUpDate: {
              gte: todayStart,
              lte: thresholdEnd,
            },
          },
        ],
      },
      include: {
        practice: true,
        assignedToUser: true,
      },
    });

    for (const record of activeRequests) {
      const specialistEmail = record.assignedToUser?.email?.trim();
      if (!specialistEmail || !specialistEmail.includes("@")) continue;

      const specialistName =
        [record.assignedToUser?.firstName, record.assignedToUser?.lastName]
          .filter(Boolean)
          .join(" ") ||
        record.assignedToUser?.userName ||
        "Specialist";

      const practiceName = record.practice?.name || "Practice";
      const providerName = record.providerName || "Provider";

      const checkAndSendReminder = async (
        dateVal: Date | null,
        dateLabel: string,
        reminderKeyType: string,
      ) => {
        if (!dateVal) return;

        const dateObj = new Date(dateVal);
        const targetStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        const msDiff = targetStart.getTime() - todayStart.getTime();
        const daysDiff = Math.round(msDiff / (24 * 60 * 60 * 1000));

        // Skip if past date or further away than setting reminder days
        if (daysDiff < 0 || daysDiff > reminderDays) {
          return;
        }

        const dateStr = formatDate(dateObj);
        const isSameDay = daysDiff === 0;
        const subType = isSameDay ? "SAMEDAY" : "ADVANCE";
        const reminderKey = `${record.id}:${reminderKeyType}:${dateStr}:${subType}`;

        if (sentRemindersToday.has(reminderKey)) {
          return;
        }

        // Check DB to prevent duplicate reminder emails on server restart or reload
        const alreadyLoggedToday = await prisma.credentialingActivityLog.findFirst({
          where: {
            credentialingRequestId: record.id,
            activityType: CredentialingActivityType.FOLLOW_UP_LOGGED,
            details: { contains: reminderKey },
          },
        });

        if (alreadyLoggedToday) {
          sentRemindersToday.add(reminderKey);
          return;
        }

        const subject = isSameDay
          ? `URGENT: Credentialing Deadline Alert: ${dateLabel} is TODAY (${record.credentialingId})`
          : `Credentialing Deadline Alert: ${dateLabel} in ${daysDiff} day(s) (${record.credentialingId})`;

        const body = `
          <p>Dear ${specialistName},</p>
          <p>This is an automated reminder regarding an upcoming credentialing deadline for a record assigned to you.</p>
          <p><strong>Credentialing Details:</strong></p>
          <ul>
            <li><strong>Credentialing ID:</strong> ${record.credentialingId}</li>
            <li><strong>Practice:</strong> ${practiceName}</li>
            <li><strong>Provider:</strong> ${providerName}</li>
            <li><strong>Insurance Payer:</strong> ${record.insurancePayerName}</li>
            <li><strong>Deadline Type:</strong> ${dateLabel}</li>
            <li><strong>Target Date:</strong> ${dateStr} (${isSameDay ? "TODAY" : `due in ${daysDiff} day(s)`})</li>
          </ul>
          <p>Please review and take appropriate action on this credentialing record.</p>
          <p>Best regards,<br/>Tristate MSO System</p>
        `;

        try {
          await sendOutlookEmail(specialistEmail, subject, body);
          sentRemindersToday.add(reminderKey);

          await prisma.credentialingActivityLog.create({
            data: {
              credentialingRequestId: record.id,
              activityType: CredentialingActivityType.FOLLOW_UP_LOGGED,
              action: "Automated Reminder Sent",
              details: `[reminderKey:${reminderKey}] Sent ${dateLabel} ${isSameDay ? "same-day" : `${daysDiff}-day advance`} email reminder for record ${record.credentialingId} to ${specialistEmail}.`,
              actorName: "System",
            },
          });

          console.log(
            `[credentialing-trigger] Sent ${dateLabel} ${isSameDay ? "same-day" : `${daysDiff}-day advance`} email reminder for record ${record.credentialingId} to ${specialistEmail}.`,
          );
        } catch (mailErr) {
          console.error(
            `[credentialing-trigger] Failed to send reminder email to ${specialistEmail}:`,
            mailErr,
          );
        }
      };

      await checkAndSendReminder(
        record.reCredentialingDueDate,
        "Re-credentialing Due Date",
        "RE_CRED_DUE",
      );
      await checkAndSendReminder(
        record.expirationDate,
        "Expiration Date",
        "EXPIRATION",
      );
      await checkAndSendReminder(
        record.nextFollowUpDate,
        "Next Follow-up Date",
        "FOLLOW_UP",
      );
    }
  } catch (err) {
    console.error(
      "[credentialing-trigger] Error processing specialist email reminders:",
      err,
    );
  }
}

export function startCredentialingTriggerJob() {
  if (process.env.ENABLE_CREDENTIALING_TRIGGER_JOB === "false") {
    console.log("[credentialing-trigger] Job disabled by environment.");
    return;
  }

  let isRunning = false;

  const run = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await processCredentialingTriggers();
    } catch (error) {
      console.error(
        "[credentialing-trigger] Failed to run credentialing triggers:",
        error,
      );
    } finally {
      isRunning = false;
    }
  };

  // Run immediately on server start
  void run();

  // Run every day at 8:00 AM UTC
  const cronSchedule = process.env.CREDENTIALING_TRIGGER_CRON || "0 8 * * *";
  cron.schedule(
    cronSchedule,
    () => {
      void run();
    },
    { timezone: "UTC" }
  );

  console.log(
    `[credentialing-trigger] Job scheduled daily at 8:00 AM UTC (${cronSchedule}).`,
  );
}
