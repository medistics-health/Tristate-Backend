import { InvoiceStatus } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { sendOutlookEmail } from "../utils/outlook";
import { getPrimaryPracticeEmail } from "../utils/practiceEmail";

const DEFAULT_INTERVAL_MINUTES = 60;

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

      // Gather recipient emails
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

      if (pInv.practice.persons) {
        for (const pp of pInv.practice.persons) {
          if (pp.person?.email && pp.person.email.includes("@")) {
            pEmails.push(pp.person.email.trim());
          }
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
            const body = `
              <div style="font-family: 'Google Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #fee2e2; border-radius: 12px;">
                <h2 style="color: #dc2626; margin-top: 0; font-family: 'Google Sans', sans-serif;">Prefunding Invoice Overdue Notice</h2>
                <p style="color: #334155; font-size: 14px; line-height: 1.5; font-family: 'Google Sans', sans-serif;">Dear <strong>${pInv.practice.name}</strong>,</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.5; font-family: 'Google Sans', sans-serif;">This is an urgent reminder that Prefunding Invoice <strong>#${invNum}</strong> (Cycle: ${pInv.cycle}) was due on <strong>${formatUTCDate(dueDate)}</strong> and is now overdue.</p>
                <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                  <span style="font-size: 11px; text-transform: uppercase; color: #991b1b; font-weight: 700; display: block; font-family: 'Google Sans', sans-serif;">Total Amount Due</span>
                  <span style="font-size: 20px; font-weight: 800; color: #dc2626; font-family: 'Google Sans', sans-serif;">$${Number(pInv.totalAmount).toFixed(2)}</span>
                </div>
                ${pInv.stripeHostedInvoiceUrl ? `<p style="margin: 20px 0;"><a href="${pInv.stripeHostedInvoiceUrl}" style="background-color: #dc2626; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 700; font-family: 'Google Sans', sans-serif;">Pay Overdue Invoice with Stripe &rarr;</a></p>` : ""}
                <p style="color: #64748b; font-size: 12px; margin-top: 24px; font-family: 'Google Sans', sans-serif;">Please settle the payment immediately. If you have questions, contact info@tristatemso.com.</p>
                <p style="color: #334155; font-size: 13px; font-weight: 600; font-family: 'Google Sans', sans-serif;">Best regards,<br/>The Tristate Prefunding Team</p>
              </div>
            `;

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
            const body = `
              <div style="font-family: 'Google Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #0f172a; margin-top: 0; font-family: 'Google Sans', sans-serif;">Prefunding Invoice Reminder</h2>
                <p style="color: #334155; font-size: 14px; line-height: 1.5; font-family: 'Google Sans', sans-serif;">Dear <strong>${pInv.practice.name}</strong>,</p>
                <p style="color: #475569; font-size: 14px; line-height: 1.5; font-family: 'Google Sans', sans-serif;">This is a friendly reminder that Prefunding Invoice <strong>#${invNum}</strong> (Cycle: ${pInv.cycle}) is due on <strong>${formatUTCDate(dueDate)}</strong>.</p>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 18px 0;">
                  <span style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; display: block; font-family: 'Google Sans', sans-serif;">Total Amount Due</span>
                  <span style="font-size: 20px; font-weight: 800; color: #4f63ea; font-family: 'Google Sans', sans-serif;">$${Number(pInv.totalAmount).toFixed(2)}</span>
                </div>
                ${pInv.stripeHostedInvoiceUrl ? `<p style="margin: 20px 0;"><a href="${pInv.stripeHostedInvoiceUrl}" style="background-color: #4f63ea; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 700; font-family: 'Google Sans', sans-serif;">Pay Prefunding Invoice with Stripe &rarr;</a></p>` : ""}
                <p style="color: #64748b; font-size: 12px; margin-top: 24px; font-family: 'Google Sans', sans-serif;">Thank you for partnering with Tristate MSO. If you have questions, contact info@tristatemso.com.</p>
                <p style="color: #334155; font-size: 13px; font-weight: 600; font-family: 'Google Sans', sans-serif;">Best regards,<br/>The Tristate Prefunding Team</p>
              </div>
            `;

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

export function startInvoiceReminderJob() {
  if (process.env.ENABLE_INVOICE_REMINDER_JOB === "false") {
    console.log("[invoice-reminder] Job disabled by environment.");
    return;
  }

  const configuredInterval = Number(
    process.env.INVOICE_REMINDER_CHECK_INTERVAL_MINUTES ||
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
      await processInvoiceReminders();
    } catch (error) {
      console.error("[invoice-reminder] Failed to process invoice reminders:", error);
    } finally {
      isRunning = false;
    }
  };

  // Run immediately on start
  void run();

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  timer.unref?.();

  console.log(
    `[invoice-reminder] Job started. Checking every ${intervalMinutes} minute(s).`,
  );
}
