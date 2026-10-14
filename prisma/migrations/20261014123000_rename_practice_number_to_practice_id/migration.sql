-- Rename the auto-generated 5-digit practice number to practice_id.

ALTER TABLE "practices" RENAME COLUMN "practice_number" TO "practice_id";

ALTER SEQUENCE "practice_number_seq" RENAME TO "practice_id_seq";

ALTER TABLE "practices"
ALTER COLUMN "practice_id" SET DEFAULT nextval('practice_id_seq');

ALTER SEQUENCE "practice_id_seq" OWNED BY "practices"."practice_id";

ALTER TABLE "practices"
RENAME CONSTRAINT "practices_practice_number_key" TO "practices_practice_id_key";

ALTER TABLE "practices"
RENAME CONSTRAINT "practices_practice_number_range_check" TO "practices_practice_id_range_check";
