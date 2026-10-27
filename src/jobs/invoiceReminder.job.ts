import cron from 'node-cron';
import { InvoiceStatus } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { sendOutlookEmail } from "../utils/outlook";
import { getPrimaryPracticeEmail } from "../utils/practiceEmail";
import { wrapPrefundingEmailLayout } from "../utils/prefundingEmailLayout";

const DEFAULT_INTERVAL_MINUTES = 10;

export async function processInvoiceReminders() {
  const formatUTCDate = (d: Date | string) => {
    const date = new Date(d);
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
  };

  const settings = await prisma.systemSettings.findFirst();
  const reminderDays = settings?.invoiceReminderDays ?? 5;

  const now = new Date();

  // Fetch all active, unpaid/partially paid/overdue invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      status: {
        notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
      },
      dueDate: {
        not: null,
      },
    },
    include: {
      practice: {
        include: {
          persons: {
            include: {
              person: true,
            },
          },
          company: {
            include: {
              persons: {
                include: {
                  person: true,
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(`[invoice-reminder] Processing ${invoices.length} unpaid invoice(s)...`);

  for (const invoice of invoices) {
    if (!invoice.dueDate) continue;

    const dueDate = new Date(invoice.dueDate);
    const msToDue = dueDate.getTime() - now.getTime();
    const daysToDue = msToDue / (24 * 60 * 60 * 1000);

    // Get all unique contact emails
    const emails: string[] = [];
    if (invoice.practice) {
      if (invoice.practice.persons) {
        for (const pp of invoice.practice.persons) {
          if (pp.person?.email && pp.person.email.includes("@")) {
            emails.push(pp.person.email.trim());
          }
        }
      }

      if (emails.length === 0) {
        const primaryEmail = await getPrimaryPracticeEmail(invoice.practice);
        if (primaryEmail) {
          emails.push(primaryEmail);
        }
      }
    }
    const uniqueEmails = [...new Set(emails)];
    const invoiceNum = invoice.invoiceNumber || invoice.id.slice(0, 8);

    // 1. Check for OVERDUE status and OVERDUE reminder email
    if (now >= dueDate) {
      // Mark as OVERDUE in the DB if not already done
      if (invoice.status !== InvoiceStatus.OVERDUE) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: InvoiceStatus.OVERDUE },
        });
        console.log(`[invoice-reminder] Marked Invoice #${invoiceNum} as OVERDUE.`);
      }

      // Send overdue email if not sent yet
      if (!invoice.dueReminderOverdueSent) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { dueReminderOverdueSent: true },
        });

        if (uniqueEmails.length > 0) {
          const emailSubject = `URGENT: Invoice #${invoiceNum} is OVERDUE`;
          const emailBody = `
            <p>Dear Partner,</p>
            <p>This is a notification that Invoice <strong>#${invoiceNum}</strong> is past its due date of ${formatUTCDate(dueDate)}.</p>
            <p><strong>Invoice Details:</strong></p>
            <ul>
              <li><strong>Invoice Number:</strong> #${invoiceNum}</li>
              <li><strong>Due Date:</strong> ${formatUTCDate(dueDate)} (OVERDUE)</li>
              <li><strong>Total Amount:</strong> $${Number(invoice.totalAmount).toFixed(2)}</li>
            </ul>
            ${invoice.stripeHostedInvoiceUrl ? `<p><a href="${invoice.stripeHostedInvoiceUrl}" style="background-color: #e53e3e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Pay Invoice Now</a></p>` : ""}
            <p>If you have already paid this invoice, please disregard this reminder.</p>
            <p>Best regards,<br/>The Tristate Team</p>
          `;

          for (const email of uniqueEmails) {
            try {
              await sendOutlookEmail(email, emailSubject, emailBody);
            } catch (err) {
              console.error(`[invoice-reminder] Failed to send overdue reminder to ${email}:`, err);
            }
          }
        }
        console.log(`[invoice-reminder] Overdue email reminder sent for Invoice #${invoiceNum}.`);
      }
    } 
    // 2. Check for upcoming reminder email (e.g. 5 days before due)
    else if (daysToDue <= reminderDays) {
      if (!invoice.dueReminder5DaysSent) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { dueReminder5DaysSent: true },
        });

        if (uniqueEmails.length > 0) {
          const emailSubject = `Reminder: Invoice #${invoiceNum} is due in ${reminderDays} days`;
          const emailBody = `
            <p>Dear Partner,</p>
            <p>This is a friendly reminder that Invoice <strong>#${invoiceNum}</strong> will be due in ${reminderDays} days on ${formatUTCDate(dueDate)}.</p>
            <p><strong>Invoice Details:</strong></p>
            <ul>
              <li><strong>Invoice Number:</strong> #${invoiceNum}</li>
              <li><strong>Due Date:</strong> ${formatUTCDate(dueDate)}</li>
              <li><strong>Total Amount:</strong> $${Number(invoice.totalAmount).toFixed(2)}</li>
            </ul>
            <p>Please make arrangements to pay this invoice by the due date.</p>
            ${invoice.stripeHostedInvoiceUrl ? `<p><a href="${invoice.stripeHostedInvoiceUrl}" style="background-color: #4f63ea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Pay Invoice</a></p>` : ""}
            <p>Thank you for your business!</p>
            <p>Best regards,<br/>The Tristate Team</p>
          `;

          for (const email of uniqueEmails) {
            try {
              await sendOutlookEmail(email, emailSubject, emailBody);
            } catch (err) {
              console.error(`[invoice-reminder] Failed to send pre-due reminder to ${email}:`, err);
            }
          }
        }
        console.log(`[invoice-reminder] Upcoming ${reminderDays}-day email reminder sent for Invoice #${invoiceNum}.`);
      }
    }
  }

  // 3. Process Prefunding Invoices Reminders (Section 17: Due Date & Reminder Calculation)
  try {
    const prefundingInvoices = await prisma.prefundingInvoice.findMany({
      where: {
        status: { in: ["Posted", "POSTED", "Sent", "SENT", "Overdue", "OVERDUE"] },
        dueDate: { not: undefined },
      },
      include: {
        practice: {
          include: {
            persons: {
              include: { person: true },
            },
          },
        },
      },
    });

    for (const pInv of prefundingInvoices) {
      if (!pInv.dueDate) continue;

      const dueDate = new Date(pInv.dueDate);
      const msToDue = dueDate.getTime() - now.getTime();
      const daysToDue = msToDue / (24 * 60 * 60 * 1000);

      // Section 17: Practice configuration prefundingReminderOn (days before Due Date)
      const practiceReminderDays = pInv.practice.prefundingReminderOn ?? 2;

      // Gather recipient emails - ONLY send invoice reminders to prefundingInvoiceRecipientId
      const pEmails: string[] = [];
      if (pInv.practice.prefundingInvoiceRecipientId) {
        const designated = await prisma.person.findUnique({
          where: { id: pInv.practice.prefundingInvoiceRecipientId },
          select: { email: true },
        });
        if (designated?.email && designated.email.includes("@")) {
          pEmails.push(designated.email.trim());
        }
      }

      if (pEmails.length === 0) {
        const primary = await getPrimaryPracticeEmail(pInv.practice);
        if (primary) pEmails.push(primary);
      }

      const uniquePEmails = [...new Set(pEmails)];
      const invNum = pInv.invoiceNumber || pInv.id.slice(0, 8);

      // Overdue check
      if (now >= dueDate) {
        if (pInv.status.toLowerCase() !== "overdue") {
          await prisma.prefundingInvoice.update({
            where: { id: pInv.id },
            data: { status: "Overdue" },
          });
        }

        if (!pInv.dueReminderOverdueSent) {
          await prisma.prefundingInvoice.update({
            where: { id: pInv.id },
            data: { dueReminderOverdueSent: true },
          });

          if (uniquePEmails.length > 0) {
            const subject = `URGENT: Prefunding Invoice #${invNum} is OVERDUE`;
            const contentHtml = `
              <p style="margin: 0 0 14px 0; font-size: 16px; line-height: 24px; color: #0f2d46; font-weight: 700;">
                Hello ${pInv.practice.name},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 22px; color: #475569;">
                This is an urgent reminder that Prefunding Invoice <strong>#${invNum}</strong> (Cycle: <strong>${pInv.cycle}</strong>) was due on <strong style="color: #dc2626;">${formatUTCDate(dueDate)}</strong> and is now overdue.
              </p>
              <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
                <span style="font-size: 11px; text-transform: uppercase; color: #991b1b; font-weight: 700; display: block; letter-spacing: 0.05em;">Total Overdue Amount</span>
                <span style="font-size: 24px; font-weight: 900; color: #dc2626; margin-top: 4px; display: block;">${Number(pInv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ${pInv.stripeHostedInvoiceUrl ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${pInv.stripeHostedInvoiceUrl}" target="_blank" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 36px; font-size: 14px; font-weight: 700; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.3);">
                  Pay Overdue Invoice with Stripe &rarr;
                </a>
              </div>` : ""}
              <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 20px; color: #64748b;">
                Please settle the payment immediately to avoid interruption in services. If you have any questions or have already initiated the payment via bank transfer, please disregard this notice or contact us at <a href="mailto:info@tristatemso.com" style="color: #0f4c81; font-weight: 600;">info@tristatemso.com</a>.
              </p>
            `;
            const body = wrapPrefundingEmailLayout({
              title: "Prefunding Invoice Overdue Notice",
              subtitle: "Urgent Payment Reminder",
              preheader: `Prefunding Invoice #${invNum} is overdue. Total amount ${Number(pInv.totalAmount).toFixed(2)}.`,
              contentHtml,
              invoiceNumber: invNum,
            });

            for (const email of uniquePEmails) {
              try {
                await sendOutlookEmail(email, subject, body);
              } catch (err) {
                console.error(`[invoice-reminder] Failed to send prefunding overdue email to ${email}:`, err);
              }
            }
          }
        }
      }
      // Reminder before due date
      else if (daysToDue <= practiceReminderDays) {
        if (!pInv.dueReminderDaysSent) {
          await prisma.prefundingInvoice.update({
            where: { id: pInv.id },
            data: { dueReminderDaysSent: true },
          });

          if (uniquePEmails.length > 0) {
            const subject = `Reminder: Prefunding Invoice #${invNum} is due in ${Math.ceil(daysToDue)} day(s)`;
            const contentHtml = `
              <p style="margin: 0 0 14px 0; font-size: 16px; line-height: 24px; color: #0f2d46; font-weight: 700;">
                Hello ${pInv.practice.name},
              </p>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 22px; color: #475569;">
                This is a friendly reminder that Prefunding Invoice <strong>#${invNum}</strong> (Cycle: <strong>${pInv.cycle}</strong>) is due on <strong>${formatUTCDate(dueDate)}</strong>.
              </p>
              <div style="background-color: #f8fbfe; border: 1px solid #dbe8f3; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
                <span style="font-size: 11px; text-transform: uppercase; color: #0f4c81; font-weight: 700; display: block; letter-spacing: 0.05em;">Total Amount Due</span>
                <span style="font-size: 24px; font-weight: 900; color: #0f4c81; margin-top: 4px; display: block;">${Number(pInv.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ${pInv.stripeHostedInvoiceUrl ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${pInv.stripeHostedInvoiceUrl}" target="_blank" style="display: inline-block; background-color: #0f4c81; color: #ffffff; text-decoration: none; padding: 14px 36px; font-size: 14px; font-weight: 700; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(15, 76, 129, 0.3);">
                  Pay Prefunding Invoice with Stripe &rarr;
                </a>
              </div>` : ""}
              <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 20px; color: #64748b;">
                Thank you for partnering with Tristate MSO. If you have any questions, please contact our team at <a href="mailto:info@tristatemso.com" style="color: #0f4c81; font-weight: 600;">info@tristatemso.com</a>.
              </p>
            `;
            const body = wrapPrefundingEmailLayout({
              title: "Prefunding Invoice Reminder",
              subtitle: `Due in ${Math.ceil(daysToDue)} day(s)`,
              preheader: `Prefunding Invoice #${invNum} is due on ${formatUTCDate(dueDate)}.`,
              contentHtml,
              invoiceNumber: invNum,
            });

            for (const email of uniquePEmails) {
              try {
                await sendOutlookEmail(email, subject, body);
              } catch (err) {
                console.error(`[invoice-reminder] Failed to send prefunding reminder email to ${email}:`, err);
              }
            }
          }
        }
      }
    }
  } catch (pErr) {
    console.error("[invoice-reminder] Error processing prefunding invoice reminders:", pErr);
  }
}


// Prefunding Cycle Schedule Reminders (Due On / Reminder On) sent to prefundingReminderRecipientId
export async function processPrefundingCycleReminders() {
  try {
    const formatUTCDate = (d: Date | string) => {
      const date = new Date(d);
      return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
    };

    const practices = await prisma.practice.findMany({
      where: {
        isPrefundingEnabled: true,
        prefundingReminderRecipientId: { not: null },
      },
      include: {
        prefundingRates: {
          include: { prefundingRate: true },
        },
      },
    });

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    for (const practice of practices) {
      if (!practice.prefundingStartDate || !practice.prefundingCycle || !practice.prefundingReminderRecipientId) {
        continue;
      }

      const reminderPerson = await prisma.person.findUnique({
        where: { id: practice.prefundingReminderRecipientId },
        select: { email: true, firstName: true, lastName: true },
      });

      if (!reminderPerson?.email || !reminderPerson.email.includes('@')) {
        continue;
      }

      const dueOnDays = practice.prefundingDueOn ?? 5;
      const reminderOnDays = practice.prefundingReminderOn ?? 6;

      // Calculate next upcoming cycle start based on prefundingStartDate and prefundingCycle
      const startDate = new Date(practice.prefundingStartDate);
      let cycleStart = new Date(startDate);

      const addCycle = (date: Date, cycle: string) => {
        const next = new Date(date);
        switch (cycle.toUpperCase()) {
          case 'WEEKLY':
            next.setUTCDate(next.getUTCDate() + 7);
            break;
          case 'BI-WEEKLY':
          case 'BIWEEKLY':
            next.setUTCDate(next.getUTCDate() + 14);
            break;
          case 'MONTHLY':
            next.setUTCMonth(next.getUTCMonth() + 1);
            break;
          case 'QUARTERLY':
            next.setUTCMonth(next.getUTCMonth() + 3);
            break;
          case 'SEMI-ANNUALLY':
          case 'SEMIANNUALLY':
            next.setUTCMonth(next.getUTCMonth() + 6);
            break;
          case 'YEARLY':
          case 'ANNUALLY':
            next.setUTCFullYear(next.getUTCFullYear() + 1);
            break;
          default:
            next.setUTCMonth(next.getUTCMonth() + 1);
        }
        return next;
      };

      while (cycleStart < now) {
        cycleStart = addCycle(cycleStart, practice.prefundingCycle);
      }

      // Cycle Due Date = cycleStart minus dueOnDays
      const cycleDueDate = new Date(cycleStart);
      cycleDueDate.setUTCDate(cycleDueDate.getUTCDate() - dueOnDays);

      // Cycle Reminder Date = cycleDueDate minus reminderOnDays
      const cycleReminderDate = new Date(cycleDueDate);
      cycleReminderDate.setUTCDate(cycleReminderDate.getUTCDate() - reminderOnDays);

      const reminderDateStr = cycleReminderDate.toISOString().slice(0, 10);
      const dueDateStr = cycleDueDate.toISOString().slice(0, 10);

      const cycleKey = `${practice.prefundingCycle}_${dueDateStr}`;
      const shouldSendDue = todayStr === dueDateStr && practice.lastPrefundingDueSentCycleKey !== cycleKey;
      const shouldSendReminder = !shouldSendDue && todayStr === reminderDateStr && practice.lastPrefundingReminderSentCycleKey !== cycleKey;

      if (shouldSendDue || shouldSendReminder) {
        const isDueDay = shouldSendDue;
        const subject = isDueDay
          ? `Prefunding Cycle Payment Due Today: ${practice.name} (${practice.prefundingCycle})`
          : `Prefunding Upcoming Cycle Reminder: ${practice.name} (${practice.prefundingCycle})`;

        const recipientName = `${reminderPerson.firstName || ''} ${reminderPerson.lastName || ''}`.trim() || 'Valued Partner';

        const contentHtml = `
          <p style="margin: 0 0 14px 0; font-size: 16px; line-height: 24px; color: #0f2d46; font-weight: 700;">
            Hello ${recipientName},
          </p>
          <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 22px; color: #475569;">
            This is a prefunding cycle notification for <strong>${practice.name}</strong>.
          </p>
          <div style="background-color: #f8fbfe; border: 1px solid #dbe8f3; border-radius: 12px; padding: 18px 22px; margin: 20px 0;">
            <h4 style="margin: 0 0 12px 0; color: #0f4c81; font-size: 15px;">Cycle Details</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; color: #334155;">
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Cycle Frequency:</td>
                <td style="padding: 6px 0; text-align: right;">${practice.prefundingCycle}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Next Cycle Period Starts:</td>
                <td style="padding: 6px 0; text-align: right; color: #0f4c81; font-weight: 700;">${formatUTCDate(cycleStart)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Prefunding Due Date:</td>
                <td style="padding: 6px 0; text-align: right; color: #dc2626; font-weight: 700;">${formatUTCDate(cycleDueDate)} (${dueOnDays} days before start)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Reminder Window:</td>
                <td style="padding: 6px 0; text-align: right;">${reminderOnDays} days before due</td>
              </tr>
            </table>
          </div>
          <p style="margin: 20px 0 0 0; font-size: 13px; line-height: 20px; color: #64748b;">
            Please make sure prefunding allocations are calculated and confirmed prior to the cycle start date. If you have questions, contact us at <a href="mailto:info@tristatemso.com" style="color: #0f4c81; font-weight: 600;">info@tristatemso.com</a>.
          </p>
        `;

        const body = wrapPrefundingEmailLayout({
          title: isDueDay ? 'Prefunding Cycle Due Today' : 'Upcoming Prefunding Cycle Reminder',
          subtitle: `Cycle: ${practice.prefundingCycle}`,
          preheader: `Upcoming prefunding cycle schedule for ${practice.name}.`,
          contentHtml,
        });

        try {
          await sendOutlookEmail(reminderPerson.email.trim(), subject, body);
          console.log(`[invoice-reminder] Sent prefunding cycle reminder to ${reminderPerson.email.trim()} for practice ${practice.name}`);

          // Mark as sent in DB immediately so it is sent ONLY ONCE and never repeated
          if (isDueDay) {
            await prisma.practice.update({
              where: { id: practice.id },
              data: { lastPrefundingDueSentCycleKey: cycleKey },
            });
          } else {
            await prisma.practice.update({
              where: { id: practice.id },
              data: { lastPrefundingReminderSentCycleKey: cycleKey },
            });
          }
        } catch (mailErr) {
          console.error(`[invoice-reminder] Failed to send cycle reminder email to ${reminderPerson.email}:`, mailErr);
        }
      }
    }
  } catch (err) {
    console.error('[invoice-reminder] Error in processPrefundingCycleReminders:', err);
  }
}

export function startInvoiceReminderJob(
  cronExpression: string = "*/10 * * * *", // Runs every 10 minutes (cron)
) {
  if (process.env.ENABLE_INVOICE_REMINDER_JOB === "false") {
    console.log("[invoice-reminder] Job disabled by environment.");
    return;
  }

  let isRunning = false;

  const run = async () => {
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      await processInvoiceReminders();
      await processPrefundingCycleReminders();
    } catch (error) {
      console.error("[invoice-reminder] Failed to process invoice reminders:", error);
    } finally {
      isRunning = false;
    }
  };

  // Run once immediately on server start
  void run();

  // Schedule every 10 minutes using standard cron expression: */10 * * * *
  cron.schedule(cronExpression, async () => {
    void run();
  });

  console.log(
    `[invoice-reminder] Job scheduled with cron expression: "${cronExpression}"`
  );
}
