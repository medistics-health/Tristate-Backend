-- CreateTable
CREATE TABLE "quickbooks_connections" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "realm_id" TEXT NOT NULL,
    "is_sandbox" BOOLEAN NOT NULL DEFAULT TRUE,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "connected_by_user_id" UUID,
    "default_income_item_id" TEXT,
    "default_expense_account_id" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quickbooks_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quickbooks_connections_company_id_key" ON "quickbooks_connections"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "quickbooks_connections_realm_id_key" ON "quickbooks_connections"("realm_id");

-- AddForeignKey
ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
