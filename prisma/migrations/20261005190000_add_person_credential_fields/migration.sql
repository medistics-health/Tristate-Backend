-- Individual credential fields on contacts (people).

ALTER TABLE "contacts"
ADD COLUMN IF NOT EXISTS "individual_npi" TEXT,
ADD COLUMN IF NOT EXISTS "individual_ptan" TEXT,
ADD COLUMN IF NOT EXISTS "individual_railroad_medicare_ptan" TEXT,
ADD COLUMN IF NOT EXISTS "caqh_id" TEXT,
ADD COLUMN IF NOT EXISTS "caqh_login_id" TEXT,
ADD COLUMN IF NOT EXISTS "caqh_password" TEXT,
ADD COLUMN IF NOT EXISTS "group_pecos_access" TEXT,
ADD COLUMN IF NOT EXISTS "individual_medicaid_number" TEXT,
ADD COLUMN IF NOT EXISTS "state_license" TEXT,
ADD COLUMN IF NOT EXISTS "dea" TEXT,
ADD COLUMN IF NOT EXISTS "ein" TEXT,
ADD COLUMN IF NOT EXISTS "specialty" TEXT,
ADD COLUMN IF NOT EXISTS "secondary_specialty" TEXT;
