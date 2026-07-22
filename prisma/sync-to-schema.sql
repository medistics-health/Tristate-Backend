-- CreateIndex
CREATE INDEX "credentialing_follow_up_logs_logged_by_user_id_idx" ON "credentialing_follow_up_logs"("logged_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentialing_requests_credentialing_id_key" ON "credentialing_requests"("credentialing_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_practice_id_idx" ON "credentialing_requests"("practice_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_provider_id_idx" ON "credentialing_requests"("provider_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_assigned_to_user_id_idx" ON "credentialing_requests"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "credentialing_requests_status_idx" ON "credentialing_requests"("status");

-- CreateIndex
CREATE INDEX "credentialing_requests_insurance_payer_name_idx" ON "credentialing_requests"("insurance_payer_name");

-- CreateIndex
CREATE INDEX "credentialing_requests_next_follow_up_date_idx" ON "credentialing_requests"("next_follow_up_date");

-- CreateIndex
CREATE INDEX "credentialing_requests_re_credentialing_due_date_idx" ON "credentialing_requests"("re_credentialing_due_date");

-- CreateIndex
CREATE INDEX "credentialing_requests_updated_at_idx" ON "credentialing_requests"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "credentialing_requests_practice_id_provider_id_insurance_pa_key" ON "credentialing_requests"("practice_id", "provider_id", "insurance_payer_name", "request_type");

-- CreateIndex
CREATE INDEX "deal_selected_services_deal_id_idx" ON "deal_selected_services"("deal_id");

-- CreateIndex
CREATE INDEX "deal_selected_services_service_id_idx" ON "deal_selected_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_selected_services_deal_id_service_id_key" ON "deal_selected_services"("deal_id", "service_id");

-- CreateIndex
CREATE INDEX "exception_events_entity_type_entity_id_idx" ON "exception_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "exception_events_resolved_by_user_id_idx" ON "exception_events"("resolved_by_user_id");

-- CreateIndex
CREATE INDEX "exception_events_status_idx" ON "exception_events"("status");

-- CreateIndex
CREATE INDEX "external_sync_attempts_external_sync_job_id_idx" ON "external_sync_attempts"("external_sync_job_id");

-- CreateIndex
CREATE INDEX "external_sync_attempts_status_idx" ON "external_sync_attempts"("status");

-- CreateIndex
CREATE INDEX "external_sync_jobs_system_entity_type_entity_id_idx" ON "external_sync_jobs"("system", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "external_sync_jobs_status_idx" ON "external_sync_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_carriers_carrier_code_key" ON "insurance_carriers"("carrier_code");

-- CreateIndex
CREATE INDEX "insurance_carriers_carrier_name_idx" ON "insurance_carriers"("carrier_name");

-- CreateIndex
CREATE INDEX "insurance_carriers_carrier_type_idx" ON "insurance_carriers"("carrier_type");

-- CreateIndex
CREATE INDEX "insurance_carriers_status_idx" ON "insurance_carriers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_plans_plan_code_key" ON "insurance_plans"("plan_code");

-- CreateIndex
CREATE INDEX "insurance_plans_carrier_id_idx" ON "insurance_plans"("carrier_id");

-- CreateIndex
CREATE INDEX "insurance_plans_plan_name_idx" ON "insurance_plans"("plan_name");

-- CreateIndex
CREATE INDEX "insurance_plans_status_idx" ON "insurance_plans"("status");

-- CreateIndex
CREATE INDEX "journal_entry_links_source_entity_type_source_entity_id_idx" ON "journal_entry_links"("source_entity_type", "source_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "mercury_transactions_mercury_transaction_id_key" ON "mercury_transactions"("mercury_transaction_id");

-- CreateIndex
CREATE INDEX "mercury_transactions_account_id_idx" ON "mercury_transactions"("account_id");

-- CreateIndex
CREATE INDEX "mercury_transactions_status_idx" ON "mercury_transactions"("status");

-- CreateIndex
CREATE INDEX "mercury_transactions_reconciliation_status_idx" ON "mercury_transactions"("reconciliation_status");

-- CreateIndex
CREATE INDEX "mercury_transactions_posted_at_idx" ON "mercury_transactions"("posted_at");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_service_id_key" ON "monthly_reports"("service_id");

-- CreateIndex
CREATE INDEX "monthly_reports_practice_id_idx" ON "monthly_reports"("practice_id");

-- CreateIndex
CREATE INDEX "monthly_reports_service_id_idx" ON "monthly_reports"("service_id");

-- CreateIndex
CREATE INDEX "monthly_reports_status_idx" ON "monthly_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_billing_onboarding_id_key" ON "onboarding_billing"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_billing_onboarding_id_idx" ON "onboarding_billing"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_care_program_onboarding_id_key" ON "onboarding_care_program"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_care_program_onboarding_id_idx" ON "onboarding_care_program"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_compliance_onboarding_id_key" ON "onboarding_compliance"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_compliance_onboarding_id_idx" ON "onboarding_compliance"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_contacts_onboarding_id_idx" ON "onboarding_contacts"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_credentialing_onboarding_id_key" ON "onboarding_credentialing"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_credentialing_onboarding_id_idx" ON "onboarding_credentialing"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_documents_onboarding_id_idx" ON "onboarding_documents"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_lab_pharmacy_onboarding_id_key" ON "onboarding_lab_pharmacy"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_lab_pharmacy_onboarding_id_idx" ON "onboarding_lab_pharmacy"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_locations_onboarding_practice_id_idx" ON "onboarding_locations"("onboarding_practice_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_outreach_onboarding_id_key" ON "onboarding_outreach"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_outreach_onboarding_id_idx" ON "onboarding_outreach"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_practices_onboarding_id_idx" ON "onboarding_practices"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_providers_onboarding_practice_id_idx" ON "onboarding_providers"("onboarding_practice_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_technology_onboarding_id_key" ON "onboarding_technology"("onboarding_id");

-- CreateIndex
CREATE INDEX "onboarding_technology_onboarding_id_idx" ON "onboarding_technology"("onboarding_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboardings_practice_id_key" ON "onboardings"("practice_id");

-- CreateIndex
CREATE INDEX "onboardings_person_id_idx" ON "onboardings"("person_id");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_practice_id_idx" ON "payments"("practice_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "stripe_event_logs_stripe_event_id_idx" ON "stripe_event_logs"("stripe_event_id");

-- CreateIndex
CREATE INDEX "stripe_event_logs_invoice_id_idx" ON "stripe_event_logs"("invoice_id");

-- CreateIndex
CREATE INDEX "stripe_event_logs_event_type_idx" ON "stripe_event_logs"("event_type");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_vendor_payable_id_idx" ON "vendor_payable_line_items"("vendor_payable_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_service_id_idx" ON "vendor_payable_line_items"("service_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_billing_run_item_id_idx" ON "vendor_payable_line_items"("billing_run_item_id");

-- CreateIndex
CREATE INDEX "vendor_payable_line_items_billing_run_item_component_id_idx" ON "vendor_payable_line_items"("billing_run_item_component_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payables_payable_number_key" ON "vendor_payables"("payable_number");

-- CreateIndex
CREATE INDEX "vendor_payables_practice_id_idx" ON "vendor_payables"("practice_id");

-- CreateIndex
CREATE INDEX "vendor_payables_vendor_id_idx" ON "vendor_payables"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_payables_invoice_id_idx" ON "vendor_payables"("invoice_id");

-- CreateIndex
CREATE INDEX "vendor_payables_billing_run_id_idx" ON "vendor_payables"("billing_run_id");

-- AddForeignKey
ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quickbooks_connections" ADD CONSTRAINT "quickbooks_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_groups" ADD CONSTRAINT "practice_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_groups" ADD CONSTRAINT "practice_groups_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_bill_to_tax_id_id_fkey" FOREIGN KEY ("bill_to_tax_id_id") REFERENCES "tax_ids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_practice_group_id_fkey" FOREIGN KEY ("practice_group_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practices" ADD CONSTRAINT "practices_tax_id_id_fkey" FOREIGN KEY ("tax_id_id") REFERENCES "tax_ids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_ids" ADD CONSTRAINT "tax_ids_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_persons" ADD CONSTRAINT "practice_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_persons" ADD CONSTRAINT "practice_persons_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_persons" ADD CONSTRAINT "company_persons_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_persons" ADD CONSTRAINT "company_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_practice_group_id_fkey" FOREIGN KEY ("practice_group_id") REFERENCES "practice_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_npis" ADD CONSTRAINT "group_npis_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "tax_ids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docuseal_submissions" ADD CONSTRAINT "docuseal_submissions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docuseal_submissions" ADD CONSTRAINT "docuseal_submissions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docu_signers" ADD CONSTRAINT "docu_signers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "docuseal_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_agreement_service_term_id_fkey" FOREIGN KEY ("agreement_service_term_id") REFERENCES "agreement_service_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_billing_run_item_component_id_fkey" FOREIGN KEY ("billing_run_item_component_id") REFERENCES "billing_run_item_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_billing_run_item_id_fkey" FOREIGN KEY ("billing_run_item_id") REFERENCES "billing_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_connected_account_transfers" ADD CONSTRAINT "invoice_connected_account_transfers_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_payable_id_fkey" FOREIGN KEY ("vendor_payable_id") REFERENCES "vendor_payables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_versions" ADD CONSTRAINT "agreement_versions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_agreement_version_id_fkey" FOREIGN KEY ("agreement_version_id") REFERENCES "agreement_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement_service_terms" ADD CONSTRAINT "agreement_service_terms_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_input_snapshots" ADD CONSTRAINT "billing_input_snapshots_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_input_snapshots" ADD CONSTRAINT "billing_input_snapshots_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_input_snapshots" ADD CONSTRAINT "billing_input_snapshots_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_agreement_service_term_id_fkey" FOREIGN KEY ("agreement_service_term_id") REFERENCES "agreement_service_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_items" ADD CONSTRAINT "billing_run_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_item_components" ADD CONSTRAINT "billing_run_item_components_billing_run_item_id_fkey" FOREIGN KEY ("billing_run_item_id") REFERENCES "billing_run_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "billing_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payables" ADD CONSTRAINT "vendor_payables_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_billing_run_item_component_id_fkey" FOREIGN KEY ("billing_run_item_component_id") REFERENCES "billing_run_item_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_billing_run_item_id_fkey" FOREIGN KEY ("billing_run_item_id") REFERENCES "billing_run_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payable_line_items" ADD CONSTRAINT "vendor_payable_line_items_vendor_payable_id_fkey" FOREIGN KEY ("vendor_payable_id") REFERENCES "vendor_payables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exception_events" ADD CONSTRAINT "exception_events_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sync_attempts" ADD CONSTRAINT "external_sync_attempts_external_sync_job_id_fkey" FOREIGN KEY ("external_sync_job_id") REFERENCES "external_sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboardings" ADD CONSTRAINT "onboardings_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_contacts" ADD CONSTRAINT "onboarding_contacts_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_practices" ADD CONSTRAINT "onboarding_practices_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_locations" ADD CONSTRAINT "onboarding_locations_onboarding_practice_id_fkey" FOREIGN KEY ("onboarding_practice_id") REFERENCES "onboarding_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_providers" ADD CONSTRAINT "onboarding_providers_onboarding_practice_id_fkey" FOREIGN KEY ("onboarding_practice_id") REFERENCES "onboarding_practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_documents" ADD CONSTRAINT "onboarding_documents_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_billing" ADD CONSTRAINT "onboarding_billing_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_credentialing" ADD CONSTRAINT "onboarding_credentialing_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_technology" ADD CONSTRAINT "onboarding_technology_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_outreach" ADD CONSTRAINT "onboarding_outreach_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_lab_pharmacy" ADD CONSTRAINT "onboarding_lab_pharmacy_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_compliance" ADD CONSTRAINT "onboarding_compliance_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_care_program" ADD CONSTRAINT "onboarding_care_program_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_event_logs" ADD CONSTRAINT "stripe_event_logs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_partners" ADD CONSTRAINT "channel_partners_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_selected_services" ADD CONSTRAINT "deal_selected_services_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_selected_services" ADD CONSTRAINT "deal_selected_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingMarketing" ADD CONSTRAINT "OnboardingMarketing_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboardings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_practice_id_fkey" FOREIGN KEY ("practice_id") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_requests" ADD CONSTRAINT "credentialing_requests_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_plans" ADD CONSTRAINT "insurance_plans_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "insurance_carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_follow_up_logs" ADD CONSTRAINT "credentialing_follow_up_logs_credentialing_request_id_fkey" FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_follow_up_logs" ADD CONSTRAINT "credentialing_follow_up_logs_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_documents" ADD CONSTRAINT "credentialing_documents_credentialing_request_id_fkey" FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_documents" ADD CONSTRAINT "credentialing_documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_activity_logs" ADD CONSTRAINT "credentialing_activity_logs_credentialing_request_id_fkey" FOREIGN KEY ("credentialing_request_id") REFERENCES "credentialing_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentialing_activity_logs" ADD CONSTRAINT "credentialing_activity_logs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PracticeGroupNpis" ADD CONSTRAINT "_PracticeGroupNpis_A_fkey" FOREIGN KEY ("A") REFERENCES "group_npis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PracticeGroupNpis" ADD CONSTRAINT "_PracticeGroupNpis_B_fkey" FOREIGN KEY ("B") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgreementToService" ADD CONSTRAINT "_AgreementToService_A_fkey" FOREIGN KEY ("A") REFERENCES "agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgreementToService" ADD CONSTRAINT "_AgreementToService_B_fkey" FOREIGN KEY ("B") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

