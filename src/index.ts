import app from "./app";
import { startPricingTermExpiryJob } from "./services/pricingTermStatus.service";

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startPricingTermExpiryJob();
});
