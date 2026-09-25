ALTER TABLE "hub_document_public_links"
ADD COLUMN "revoked_by" UUID;

CREATE INDEX "hub_document_public_links_revoked_by_idx"
ON "hub_document_public_links"("revoked_by");

ALTER TABLE "hub_document_public_links"
ADD CONSTRAINT "hub_document_public_links_revoked_by_fkey"
FOREIGN KEY ("revoked_by") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
