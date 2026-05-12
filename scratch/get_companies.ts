import { PrismaClient } from "../generated/prisma";
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ take: 5 });
  console.log(JSON.stringify(companies, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
