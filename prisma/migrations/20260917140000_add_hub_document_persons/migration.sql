-- CreateTable
CREATE TABLE "hub_document_persons" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "hub_document_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hub_document_persons_document_id_person_id_key" ON "hub_document_persons"("document_id", "person_id");
CREATE INDEX "hub_document_persons_document_id_idx" ON "hub_document_persons"("document_id");
CREATE INDEX "hub_document_persons_person_id_idx" ON "hub_document_persons"("person_id");

-- AddForeignKey
ALTER TABLE "hub_document_persons" ADD CONSTRAINT "hub_document_persons_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "hub_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hub_document_persons" ADD CONSTRAINT "hub_document_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
