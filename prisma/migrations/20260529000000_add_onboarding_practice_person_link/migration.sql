-- Add onboarding recipient/practice linkage
ALTER TABLE "onboardings"
ADD COLUMN "practice_id" UUID,
ADD COLUMN "person_id" UUID;

CREATE INDEX "onboardings_practice_id_idx" ON "onboardings"("practice_id");
CREATE INDEX "onboardings_person_id_idx" ON "onboardings"("person_id");

ALTER TABLE "onboardings"
ADD CONSTRAINT "onboardings_practice_id_fkey"
FOREIGN KEY ("practice_id") REFERENCES "practices"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboardings"
ADD CONSTRAINT "onboardings_person_id_fkey"
FOREIGN KEY ("person_id") REFERENCES "contacts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
