-- Auto-generated 5-digit practice number (10000–99999) for every practice.

CREATE SEQUENCE IF NOT EXISTS "practice_number_seq"
  AS INTEGER
  INCREMENT BY 1
  MINVALUE 10000
  MAXVALUE 99999
  START WITH 10000
  NO CYCLE;

ALTER TABLE "practices"
ADD COLUMN IF NOT EXISTS "practice_number" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    (9999 + ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC))::INTEGER AS "num"
  FROM "practices"
  WHERE "practice_number" IS NULL
)
UPDATE "practices" AS p
SET "practice_number" = numbered."num"
FROM numbered
WHERE p."id" = numbered."id";

SELECT setval(
  'practice_number_seq',
  GREATEST(
    COALESCE((SELECT MAX("practice_number") FROM "practices"), 9999),
    9999
  )
);

ALTER TABLE "practices"
ALTER COLUMN "practice_number" SET DEFAULT nextval('practice_number_seq');

ALTER TABLE "practices"
ALTER COLUMN "practice_number" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practices_practice_number_key'
  ) THEN
    ALTER TABLE "practices"
    ADD CONSTRAINT "practices_practice_number_key" UNIQUE ("practice_number");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'practices_practice_number_range_check'
  ) THEN
    ALTER TABLE "practices"
    ADD CONSTRAINT "practices_practice_number_range_check"
    CHECK ("practice_number" BETWEEN 10000 AND 99999);
  END IF;
END $$;

ALTER SEQUENCE "practice_number_seq" OWNED BY "practices"."practice_number";
