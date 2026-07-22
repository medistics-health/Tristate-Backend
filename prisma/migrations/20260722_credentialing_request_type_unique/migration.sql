DROP INDEX IF EXISTS "credentialing_requests_practice_id_provider_id_insurance_pa_key";

CREATE UNIQUE INDEX "credentialing_requests_practice_id_provider_id_insurance_pa_key"
ON "credentialing_requests"("practice_id", "provider_id", "insurance_payer_name", "request_type");
