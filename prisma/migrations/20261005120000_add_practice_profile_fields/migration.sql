-- Practice profile: address, payer IDs, contacts, and locations.

ALTER TABLE "practices"
ADD COLUMN IF NOT EXISTS "referred_by" TEXT,
ADD COLUMN IF NOT EXISTS "address_line_1" TEXT,
ADD COLUMN IF NOT EXISTS "address_line_2" TEXT,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "state" TEXT,
ADD COLUMN IF NOT EXISTS "zip_code" TEXT,
ADD COLUMN IF NOT EXISTS "country" TEXT,
ADD COLUMN IF NOT EXISTS "faxes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "group_tax_id" TEXT,
ADD COLUMN IF NOT EXISTS "group_medicare_ptan" TEXT,
ADD COLUMN IF NOT EXISTS "railroad_medicare_ptan" TEXT,
ADD COLUMN IF NOT EXISTS "dme_ptan" TEXT,
ADD COLUMN IF NOT EXISTS "group_medicaid_ptan" TEXT,
ADD COLUMN IF NOT EXISTS "spark_group" TEXT;

CREATE TABLE IF NOT EXISTS "practice_locations" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "location_name" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip_code" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "practice_contact_persons" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_contact_persons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "practice_contact_numbers" (
    "id" UUID NOT NULL,
    "practice_id" UUID NOT NULL,
    "person_id" UUID,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_contact_numbers_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "practice_locations"
    ADD CONSTRAINT "practice_locations_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "practice_contact_persons"
    ADD CONSTRAINT "practice_contact_persons_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "practice_contact_persons"
    ADD CONSTRAINT "practice_contact_persons_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "practice_contact_numbers"
    ADD CONSTRAINT "practice_contact_numbers_practice_id_fkey"
    FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "practice_contact_numbers"
    ADD CONSTRAINT "practice_contact_numbers_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "practice_contact_persons_practice_id_person_id_key"
ON "practice_contact_persons"("practice_id", "person_id");

CREATE INDEX IF NOT EXISTS "practice_locations_practice_id_idx" ON "practice_locations"("practice_id");
CREATE INDEX IF NOT EXISTS "practice_contact_persons_practice_id_idx" ON "practice_contact_persons"("practice_id");
CREATE INDEX IF NOT EXISTS "practice_contact_persons_person_id_idx" ON "practice_contact_persons"("person_id");
CREATE INDEX IF NOT EXISTS "practice_contact_numbers_practice_id_idx" ON "practice_contact_numbers"("practice_id");
CREATE INDEX IF NOT EXISTS "practice_contact_numbers_person_id_idx" ON "practice_contact_numbers"("person_id");
