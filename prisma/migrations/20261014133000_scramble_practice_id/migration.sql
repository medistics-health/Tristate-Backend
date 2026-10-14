-- Map the practice sequence onto a unique, non-sequential 5-digit id.

CREATE OR REPLACE FUNCTION practice_id_from_seq(n BIGINT) RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (((48271::BIGINT * n + 35791) % 90000) + 10000)::INTEGER;
$$;

CREATE OR REPLACE FUNCTION next_practice_id() RETURNS INTEGER
LANGUAGE sql
VOLATILE
AS $$
  SELECT practice_id_from_seq(nextval('practice_id_seq'));
$$;

ALTER TABLE "practices" DROP CONSTRAINT IF EXISTS "practices_practice_id_key";
ALTER TABLE "practices" DROP CONSTRAINT IF EXISTS "practices_practice_id_range_check";
ALTER TABLE "practices" ALTER COLUMN "practice_id" DROP DEFAULT;

ALTER SEQUENCE "practice_id_seq" MINVALUE 1;
ALTER SEQUENCE "practice_id_seq" MAXVALUE 90000;
ALTER SEQUENCE "practice_id_seq" RESTART WITH 1;

WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS n
  FROM "practices"
)
UPDATE "practices" AS p
SET "practice_id" = practice_id_from_seq(ordered.n)
FROM ordered
WHERE p."id" = ordered."id";

SELECT setval(
  'practice_id_seq',
  GREATEST((SELECT COUNT(*) FROM "practices"), 1),
  (SELECT COUNT(*) FROM "practices") > 0
);

ALTER TABLE "practices"
ALTER COLUMN "practice_id" SET DEFAULT next_practice_id();

ALTER TABLE "practices"
ADD CONSTRAINT "practices_practice_id_key" UNIQUE ("practice_id");

ALTER TABLE "practices"
ADD CONSTRAINT "practices_practice_id_range_check"
CHECK ("practice_id" BETWEEN 10000 AND 99999);
