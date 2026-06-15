import { InvoiceStatus } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { sendOutlookEmail } from "../utils/outlook";

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
      if (invoice.practice.company?.persons) {
        for (const cp of invoice.practice.company.persons) {
          if (cp.person?.email && cp.person.email.includes("@")) {
            emails.push(cp.person.email.trim());
          }
        }
      }
      if (invoice.practice.company?.email && invoice.practice.company.email.includes("@")) {
        emails.push(invoice.practice.company.email.trim());
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
            <p>Please log in to your portal or click the link below to settle the outstanding balance as soon as possible.</p>
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
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { dueReminderOverdueSent: true },
        });
        console.log(`[invoice-reminder] Overdue email reminder sent for Invoice #${invoiceNum}.`);
      }
    } 
    // 2. Check for upcoming reminder email (e.g. 5 days before due)
    else if (daysToDue <= reminderDays) {
      if (!invoice.dueReminder5DaysSent) {
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
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { dueReminder5DaysSent: true },
        });
        console.log(`[invoice-reminder] Upcoming ${reminderDays}-day email reminder sent for Invoice #${invoiceNum}.`);
      }
    }
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
