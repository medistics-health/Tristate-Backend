import docuseal from "@docuseal/api";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.DOCUSEAL_TOKEN;

if (!apiKey) {
  console.error("DOCUSEAL_TOKEN is not defined in environment variables");
}

docuseal.configure({
  key: apiKey || "",
});

export { docuseal };
