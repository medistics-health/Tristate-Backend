/*
  Warnings:

  - Changed the type of `role` on the `contacts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('OWNER', 'ADMIN', 'FINANCE', 'OPERATIONS', 'CLINICAL', 'PROCUREMENT', 'OTHER');

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "role",
ADD COLUMN     "role" "PersonRole" NOT NULL;

-- DropEnum
DROP TYPE "ContactRole";
