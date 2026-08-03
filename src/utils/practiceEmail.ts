import { prisma } from "../lib/prisma";

type PracticePersonEmailLike = {
  email?: string | null;
  person?: {
    email?: string | null;
  } | null;
};

type PracticeEmailLike = {
  id?: string;
  persons?: PracticePersonEmailLike[] | null;
};

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim();
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

async function getPrimaryPracticeEmailFromPracticeId(practiceId: string) {
  const practicePersons = await prisma.practicePerson.findMany({
    where: { practiceId },
    select: {
      person: {
        select: {
          email: true,
        },
      },
    },
  });

  return practicePersons
    .map((entry) => normalizeEmail(entry.person?.email))
    .find((email): email is string => !!email);
}

export async function getPrimaryPracticeEmail(
  practice?: PracticeEmailLike | string | null,
) {
  if (!practice) {
    return null;
  }

  if (typeof practice === "string") {
    return getPrimaryPracticeEmailFromPracticeId(practice);
  }

  const personEmail = practice.persons
    ?.map((entry) => normalizeEmail(entry.person?.email ?? entry.email))
    .find((email): email is string => !!email);

  if (personEmail) {
    return personEmail;
  }

  if (practice.id) {
    return getPrimaryPracticeEmailFromPracticeId(practice.id);
  }

  return null;
}
