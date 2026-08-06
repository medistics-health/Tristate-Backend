import { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  sendOutlookEmail,
  listOutlookEmails,
  listOutlookSentEmails,
} from "../../utils/outlook";
import { prisma } from "../../lib/prisma";

type SendEmailBody = {
  personId: string;
  subject: string;
  body: string;
};

type SentEmailQuery = {
  sender?: string;
  toEmail?: string;
  sentFrom?: string;
  sentTo?: string;
};

function parseDateQueryValue(rawValue: string, boundary: "start" | "end"): Date | null {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue) return null;

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  const normalizedValue = dateOnlyPattern.test(trimmedValue)
    ? `${trimmedValue}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : trimmedValue;

  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return parsedDate;
}

export async function sendEmail(req: AuthenticatedRequest, res: Response) {
  try {
    const { personId, subject, body } = req.body as SendEmailBody;

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!personId || !subject || !body) {
      return res.status(400).json({
        message: "personId, subject, and body are required.",
      });
    }

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
      },
      select: { email: true },
    });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found." });
    }

    if (!person.email) {
      return res
        .status(400)
        .json({ message: "Person does not have an email address." });
    }

    await sendOutlookEmail(person.email, subject, body);

    return res.status(200).json({
      message: "Email sent successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to send email.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getEmailHistory(
  req: AuthenticatedRequest,
  res: Response,
) {
  try {
    const { personId } = req.params as { personId: string };

    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    if (!personId) {
      return res.status(400).json({ message: "personId is required." });
    }

    const person = await prisma.person.findFirst({
      where: {
        id: personId,
      },
      select: { email: true },
    });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found." });
    }

    if (!person.email) {
      return res
        .status(400)
        .json({ message: "Person does not have an email address." });
    }

    const emails = await listOutlookEmails(person.email);

    return res.status(200).json({
      message: "Email history fetched successfully.",
      emails,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch email history.",
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getSentEmails(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ message: "Unauthorized." });
    }

    const query = req.query as SentEmailQuery;
    const sender =
      typeof query.sender === "string" && query.sender.trim()
        ? query.sender.trim()
        : undefined;
    const toEmail =
      typeof query.toEmail === "string" && query.toEmail.trim()
        ? query.toEmail.trim()
        : undefined;

    let sentFromIso: string | undefined;
    if (typeof query.sentFrom === "string" && query.sentFrom.trim()) {
      const sentFromDate = parseDateQueryValue(query.sentFrom, "start");
      if (!sentFromDate) {
        return res.status(400).json({
          message: "Invalid sentFrom date format. Use ISO date/time or YYYY-MM-DD.",
        });
      }
      sentFromIso = sentFromDate.toISOString();
    }

    let sentToIso: string | undefined;
    if (typeof query.sentTo === "string" && query.sentTo.trim()) {
      const sentToDate = parseDateQueryValue(query.sentTo, "end");
      if (!sentToDate) {
        return res.status(400).json({
          message: "Invalid sentTo date format. Use ISO date/time or YYYY-MM-DD.",
        });
      }
      sentToIso = sentToDate.toISOString();
    }

    if (sentFromIso && sentToIso && sentFromIso > sentToIso) {
      return res.status(400).json({
        message: "sentFrom must be earlier than or equal to sentTo.",
      });
    }

    const emails = await listOutlookSentEmails({
      senderOverride: sender,
      recipientEmail: toEmail,
      sentFrom: sentFromIso,
      sentTo: sentToIso,
    });

    return res.status(200).json({
      message: "Sent emails fetched successfully.",
      emails,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to fetch sent emails.",
      error: error instanceof Error ? error.message : error,
    });
  }
}
