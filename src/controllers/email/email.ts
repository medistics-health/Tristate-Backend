import { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sendOutlookEmail, listOutlookEmails } from "../../utils/outlook";
import { prisma } from "../../lib/prisma";

type SendEmailBody = {
  personId: string;
  subject: string;
  body: string;
};

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
        practice: { ownerId: req.user.sub },
      },
      select: { email: true },
    });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or access denied." });
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
        practice: { ownerId: req.user.sub },
      },
      select: { email: true },
    });

    if (!person) {
      return res
        .status(404)
        .json({ message: "Person not found or access denied." });
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
