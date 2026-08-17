import { Client } from "@microsoft/microsoft-graph-client";
import { ConfidentialClientApplication } from "@azure/msal-node";
import "isomorphic-fetch";
import dotenv from "dotenv";

dotenv.config();

const getMsalConfig = () => {
  const clientId = process.env.MS_CLIENT_ID;
  const tenantId = process.env.MS_TENANT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;

  if (!clientId || !tenantId || !clientSecret) {
    throw new Error(
      `Missing Microsoft Graph configuration. Ensure MS_CLIENT_ID, MS_TENANT_ID, and MS_CLIENT_SECRET are set in .env. ` +
      `(Found: clientId=${!!clientId}, tenantId=${!!tenantId}, clientSecret=${!!clientSecret})`
    );
  }

  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  };
};

const tokenRequest = {
  scopes: ["https://graph.microsoft.com/.default"],
};

let cca: ConfidentialClientApplication | null = null;

function getCCA() {
  if (!cca) {
    cca = new ConfidentialClientApplication(getMsalConfig());
  }
  return cca;
}

async function getAccessToken() {
  const clientApp = getCCA();
  const authResponse = await clientApp.acquireTokenByClientCredential(tokenRequest);
  return authResponse?.accessToken;
}

async function getAuthenticatedClient() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("Could not acquire access token for Microsoft Graph");
  }

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

type EmailAttachment = {
  name: string;
  contentType: string;
  contentBytes: string; // Base64 encoded string
};

type SendOutlookEmailOptions = {
  cc?: string[];
  attachments?: EmailAttachment[];
};

function wrapEmailInTheme(body: string, subject: string): string {
  if (body.includes("<!DOCTYPE html") || body.includes("<html") || body.includes("<body")) {
    return body;
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
    <!--[if !mso]><!-- -->
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
    />
    <!--<![endif]-->
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      body,
      table,
      td,
      p,
      a,
      h1,
      h2,
      h3,
      span,
      li,
      ul,
      ol,
      div {
        font-family: 'Google Sans', 'Inter', 'Segoe UI', Roboto, Arial, sans-serif !important;
      }

      body {
        margin: 0;
        padding: 0;
        background-color: #f4f6f8;
        color: #243b53;
        -webkit-font-smoothing: antialiased;
      }
      .email-wrapper {
        width: 100%;
        background-color: #f4f6f8;
        padding: 40px 0;
      }
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        overflow: hidden;
      }
      .email-header {
        background: linear-gradient(135deg, #ffffff 0%, #ffffff 100%);
        padding: 32px;
        text-align: center;
        border-bottom: 1px solid #e2e8f0;
      }
      .email-logo-container {
        display: inline-block;
        background-color: #ffffff;
        border-radius: 12px;
        padding: 10px 20px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      }
      .logo-img {
        display: block;
        max-width: 180px;
        height: auto;
        border: 0;
      }
      .email-body {
        padding: 40px 32px;
        font-size: 15px;
        line-height: 1.6;
      }
      .email-body h1, .email-body h2, .email-body h3 {
        color: #0f2d46;
        margin-top: 0;
        font-weight: 700;
      }
      .email-body p {
        margin-top: 0;
        margin-bottom: 16px;
      }
      .email-body a {
        color: #4f63ea;
        text-decoration: none;
        font-weight: 600;
      }
      .email-body a:hover {
        text-decoration: underline;
      }
      .email-footer {
        background-color: #fafbfc;
        border-top: 1px solid #e2e8f0;
        padding: 24px 32px;
        text-align: center;
        font-size: 12px;
        color: #627d98;
      }
      .email-footer p {
        margin: 0 0 8px 0;
      }
      .email-footer p:last-child {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        <div class="email-header">
          <div class="email-logo-container">
            <img
              src="https://tristatemso.com/wp-content/uploads/tristate-health-mso-logo.png"
              alt="Tristate MSO"
              class="logo-img"
            />
          </div>
        </div>
        <div class="email-body">
          ${body}
        </div>
        <div class="email-footer">
          <p>This is an automated notification from Tristate MSO. Please do not reply directly to this email.</p>
          <p>&copy; ${new Date().getFullYear()} Tristate MSO. All rights reserved.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export async function sendOutlookEmail(
  to: string,
  subject: string,
  body: string,
  options: SendOutlookEmailOptions = {},
) {
  try {
    const client = await getAuthenticatedClient();
    const formattedBody = wrapEmailInTheme(body, subject);

    const sendMail = {
      message: {
        subject: subject,
        body: {
          contentType: "HTML",
          content: formattedBody,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
        ccRecipients: (options.cc || []).map((email) => ({
          emailAddress: {
            address: email,
          },
        })),
        attachments: (options.attachments || []).map((att) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: att.name,
          contentType: att.contentType,
          contentBytes: att.contentBytes,
        })),
      },
      saveToSentItems: "true",
    };

    const senderEmail = process.env.MS_SENDER_EMAIL;
    if (!senderEmail) {
      throw new Error("MS_SENDER_EMAIL is not defined in environment variables");
    }

    // Note: sendMail doesn't return the message ID directly.
    // To get the ID, one would usually need to search the Sent Items after sending.
    // For now, we return success.
    await client.api(`/users/${senderEmail}/sendMail`).post(sendMail);
    return { success: true };
  } catch (error) {
    console.error("Error sending email via Microsoft Graph:", error);
    throw error;
  }
}

export async function listOutlookEmails(contactEmail: string) {
  try {
    const client = await getAuthenticatedClient();
    const senderEmail = process.env.MS_SENDER_EMAIL;

    if (!senderEmail) {
      throw new Error("MS_SENDER_EMAIL is not defined in environment variables");
    }

    // Search for emails involving the contact email
    const response = await client.api(`/users/${senderEmail}/messages`)
      .search(`"${contactEmail}"`)
      .select("id,subject,body,from,toRecipients,sentDateTime,receivedDateTime")
      .top(20)
      .get();

    return response.value;
  } catch (error) {
    console.error("Error listing emails via Microsoft Graph:", error);
    throw error;
  }
}

type ListSentEmailOptions = {
  senderOverride?: string;
  recipientEmail?: string;
  sentFrom?: string;
  sentTo?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type SentEmailsPage = {
  messages: unknown[];
  total: number;
  page: number;
  limit: number;
};

const SENT_EMAIL_SELECT =
  "id,subject,bodyPreview,body,from,toRecipients,ccRecipients,sentDateTime,internetMessageId";
const SENT_EMAIL_MAX_PAGE_SIZE = 100;
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function extractEmails(value: string) {
  return [...value.matchAll(EMAIL_PATTERN)].map((match) => match[0].toLowerCase());
}

function sanitizeSearchTerm(rawValue: string) {
  return rawValue
    .replace(EMAIL_PATTERN, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .replace(/\b(?:AND|OR|NOT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeywordSearch(options: ListSentEmailOptions) {
  const rawSearch = options.search?.trim() ?? "";
  const recipient = options.recipientEmail?.trim().toLowerCase();
  const term = rawSearch ? sanitizeSearchTerm(rawSearch) : "";
  const emails = new Set<string>(extractEmails(rawSearch));
  if (recipient) {
    emails.add(recipient);
  }

  const parts: string[] = [];
  if (term) {
    parts.push(term);
  }
  for (const email of emails) {
    parts.push(`"${email}"`);
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function getMessageSentDate(message: unknown) {
  const sentDateTime = (message as { sentDateTime?: string }).sentDateTime;
  if (!sentDateTime) return null;
  const parsed = new Date(sentDateTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function matchesSentDateRange(
  message: unknown,
  sentFrom?: string,
  sentTo?: string,
) {
  if (!sentFrom && !sentTo) return true;
  const sentDate = getMessageSentDate(message);
  if (!sentDate) return false;
  if (sentFrom && sentDate < new Date(sentFrom)) return false;
  if (sentTo && sentDate > new Date(sentTo)) return false;
  return true;
}

function buildSentEmailDateFilter(options: ListSentEmailOptions) {
  const filterParts: string[] = [];
  if (options.sentFrom) {
    filterParts.push(`sentDateTime ge ${options.sentFrom}`);
  }
  if (options.sentTo) {
    filterParts.push(`sentDateTime le ${options.sentTo}`);
  }
  return filterParts.length > 0 ? filterParts.join(" and ") : undefined;
}

type GraphMessagesResponse = {
  value?: unknown[];
  "@odata.count"?: number;
  "@odata.nextLink"?: string;
};

function resolveMessagesTotal(
  response: GraphMessagesResponse,
  loadedBefore: number,
  loadedNow: number,
) {
  if (typeof response["@odata.count"] === "number") {
    return response["@odata.count"];
  }
  return loadedBefore + loadedNow + (response["@odata.nextLink"] ? 1 : 0);
}

export async function listOutlookSentEmails(
  options: ListSentEmailOptions = {},
): Promise<SentEmailsPage> {
  try {
    const client = await getAuthenticatedClient();
    const senderEmail =
      options.senderOverride?.trim() || process.env.MS_SENDER_EMAIL;

    if (!senderEmail) {
      throw new Error("MS_SENDER_EMAIL is not defined in environment variables");
    }

    const page = Math.max(1, Math.floor(options.page ?? 1));
    const limit = Math.min(
      SENT_EMAIL_MAX_PAGE_SIZE,
      Math.max(1, Math.floor(options.limit ?? 25)),
    );
    const skip = (page - 1) * limit;
    const keywordSearch = buildKeywordSearch(options);
    const dateFilter = keywordSearch
      ? undefined
      : buildSentEmailDateFilter(options);

    let request = client
      .api(`/users/${senderEmail}/mailFolders/SentItems/messages`)
      .select(SENT_EMAIL_SELECT)
      .top(limit)
      .count(true)
      .header("ConsistencyLevel", "eventual");

    if (keywordSearch) {
      request = request.search(keywordSearch);
    } else {
      request = request.orderby("sentDateTime DESC").skip(skip);
      if (dateFilter) {
        request = request.filter(dateFilter);
      }
    }

    let response = (await request.get()) as GraphMessagesResponse;

    if (!keywordSearch) {
      const messages = response.value ?? [];
      const total = resolveMessagesTotal(response, skip, messages.length);
      return { messages, total, page, limit };
    }

    const needsDateMatch = Boolean(options.sentFrom || options.sentTo);
    const matched: unknown[] = [];
    let skippedMatches = 0;
    let scannedCount = 0;
    let hasMore = Boolean(response["@odata.nextLink"]);

    while (true) {
      const pageValues = response.value ?? [];
      scannedCount += pageValues.length;
      const eligible = needsDateMatch
        ? pageValues.filter((message) =>
            matchesSentDateRange(message, options.sentFrom, options.sentTo),
          )
        : pageValues;

      for (const message of eligible) {
        if (skippedMatches < skip) {
          skippedMatches += 1;
          continue;
        }
        matched.push(message);
        if (matched.length >= limit) {
          break;
        }
      }

      hasMore = Boolean(response["@odata.nextLink"]);
      if (matched.length >= limit || !response["@odata.nextLink"]) {
        break;
      }
      response = (await client.api(response["@odata.nextLink"]).get()) as GraphMessagesResponse;
    }

    const countedTotal = response["@odata.count"];
    const total = needsDateMatch
      ? skippedMatches + matched.length + (hasMore && matched.length >= limit ? 1 : 0)
      : typeof countedTotal === "number"
        ? countedTotal
        : scannedCount + (hasMore ? 1 : 0);

    return { messages: matched.slice(0, limit), total, page, limit };
  } catch (error) {
    console.error("Error listing sent emails via Microsoft Graph:", error);
    throw error;
  }
}

export async function deleteOutlookEmail(messageId: string) {
  try {
    const client = await getAuthenticatedClient();
    const senderEmail = process.env.MS_SENDER_EMAIL;

    if (!senderEmail) {
      throw new Error("MS_SENDER_EMAIL is not defined in environment variables");
    }

    await client.api(`/users/${senderEmail}/messages/${messageId}`).delete();
    return { success: true };
  } catch (error) {
    console.error("Error deleting email via Microsoft Graph:", error);
    throw error;
  }
}
