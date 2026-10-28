import { FormRecipientSource, PersonStatus, PracticeStatus } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { isEmail, normalizeEmail } from "./sanitize";

export type ResolvedRecipient = {
  sourceType: FormRecipientSource;
  practiceId: string | null;
  personId: string | null;
  email: string;
  emailNormalized: string;
  displayName: string | null;
  practiceName: string | null;
};

export type ResolveInput = {
  practiceIds?: string[];
  includePracticePersons?: boolean;
  personIds?: string[];
  practiceEmails?: Array<{ practiceId: string; email: string }>;
  emails?: string[];
};

export async function resolveRecipients(input: ResolveInput) {
  const rows: ResolvedRecipient[] = [];
  const excluded: Array<{ email?: string; name?: string; reason: string }> = [];

  const practiceIds = [...new Set(input.practiceIds || [])];
  if (practiceIds.length) {
    const practices = await prisma.practice.findMany({
      where: { id: { in: practiceIds } },
      include: {
        persons: { include: { person: true } },
        company: true,
      },
    });
    for (const practice of practices) {
      if (practice.status === PracticeStatus.CLOSED) {
        excluded.push({ name: practice.name, reason: "Practice is closed." });
        continue;
      }
      const addresses = [...new Set(
        [...(practice.emails || []), practice.company?.email || ""]
          .map((email) => email.trim())
          .filter((email) => isEmail(email))
          .map((email) => email.toLowerCase()),
      )];
      if (!addresses.length) {
        excluded.push({ name: practice.name, reason: "Practice has no email." });
      } else {
        for (const email of addresses) {
          rows.push({
            sourceType: FormRecipientSource.PRACTICE,
            practiceId: practice.id,
            personId: null,
            email,
            emailNormalized: normalizeEmail(email),
            displayName: practice.name,
            practiceName: practice.name,
          });
        }
      }
      if (input.includePracticePersons) {
        for (const link of practice.persons) {
          const person = link.person;
          if (!person?.email || !isEmail(person.email)) {
            excluded.push({
              name: `${person?.firstName || ""} ${person?.lastName || ""}`.trim(),
              reason: "Person has no email.",
            });
            continue;
          }
          if (person.status === PersonStatus.INACTIVE) {
            excluded.push({
              email: person.email,
              name: `${person.firstName} ${person.lastName}`,
              reason: "Do-not-contact (inactive person).",
            });
            continue;
          }
          rows.push({
            sourceType: FormRecipientSource.PERSON,
            practiceId: practice.id,
            personId: person.id,
            email: person.email.trim(),
            emailNormalized: normalizeEmail(person.email),
            displayName: `${person.firstName} ${person.lastName}`.trim(),
            practiceName: practice.name,
          });
        }
      }
    }
  }

  const personIds = [...new Set(input.personIds || [])];
  if (personIds.length) {
    const people = await prisma.person.findMany({
      where: { id: { in: personIds } },
      include: { practices: { include: { practice: true } } },
    });
    for (const person of people) {
      const name = `${person.firstName} ${person.lastName}`.trim();
      if (!person.email || !isEmail(person.email)) {
        excluded.push({ name, reason: "Person has no email." });
        continue;
      }
      if (person.status === PersonStatus.INACTIVE) {
        excluded.push({ email: person.email, name, reason: "Do-not-contact (inactive person)." });
        continue;
      }
      const practice = person.practices[0]?.practice;
      rows.push({
        sourceType: FormRecipientSource.PERSON,
        practiceId: practice?.id || null,
        personId: person.id,
        email: person.email.trim(),
        emailNormalized: normalizeEmail(person.email),
        displayName: name,
        practiceName: practice?.name || null,
      });
    }
  }

  for (const entry of input.practiceEmails || []) {
    if (!isEmail(entry.email)) {
      excluded.push({ email: entry.email, reason: "Invalid email." });
      continue;
    }
    const practice = await prisma.practice.findUnique({ where: { id: entry.practiceId } });
    rows.push({
      sourceType: FormRecipientSource.PRACTICE_EMAIL,
      practiceId: practice?.id || null,
      personId: null,
      email: entry.email.trim(),
      emailNormalized: normalizeEmail(entry.email),
      displayName: practice?.name || entry.email.trim(),
      practiceName: practice?.name || null,
    });
  }

  for (const email of input.emails || []) {
    const trimmed = email.trim();
    if (!trimmed) continue;
    if (!isEmail(trimmed)) {
      excluded.push({ email: trimmed, reason: "Invalid email." });
      continue;
    }
    rows.push({
      sourceType: FormRecipientSource.NEW_EMAIL,
      practiceId: null,
      personId: null,
      email: trimmed,
      emailNormalized: normalizeEmail(trimmed),
      displayName: trimmed,
      practiceName: null,
    });
  }

  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  const recipients: ResolvedRecipient[] = [];
  for (const row of rows) {
    if (seen.has(row.emailNormalized)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(row.emailNormalized);
    recipients.push(row);
  }

  return { recipients, excluded, duplicatesRemoved };
}

export function parseEmailList(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);
}
