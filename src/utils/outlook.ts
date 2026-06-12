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

type SendOutlookEmailOptions = {
  cc?: string[];
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
