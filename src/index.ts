import app from "./app";
import { startAgreementExpiryJob } from "./jobs/agreementExpiry.job";

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startAgreementExpiryJob();
});
