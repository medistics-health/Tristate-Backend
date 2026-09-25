ALTER TABLE "hub_document_categories"
ADD COLUMN "created_by" UUID;

CREATE INDEX "hub_document_categories_created_by_idx"
ON "hub_document_categories"("created_by");

ALTER TABLE "hub_document_categories"
ADD CONSTRAINT "hub_document_categories_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
