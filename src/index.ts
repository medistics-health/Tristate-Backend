import app from "./app";
import { startAgreementExpiryJob } from "./jobs/agreementExpiry.job";
import { startInvoiceReminderJob } from "./jobs/invoiceReminder.job";
import { startPricingTermExpiryJob } from "./services/pricingTermStatus.service";

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startAgreementExpiryJob();
  startInvoiceReminderJob();
  startPricingTermExpiryJob();
});
