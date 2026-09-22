-- Reassign any MARKETING users to ADMIN, then drop the enum value.
UPDATE "User" SET role = 'ADMIN' WHERE role = 'MARKETING';

ALTER TYPE "UserRoles" RENAME TO "UserRoles_old";

CREATE TYPE "UserRoles" AS ENUM ('ADMIN', 'SALES', 'ACCOUNTMANAGER', 'OPERATIONS', 'FINANCE', 'VIEWER');

ALTER TABLE "User" ALTER COLUMN role TYPE "UserRoles" USING role::text::"UserRoles";

DROP TYPE "UserRoles_old";
