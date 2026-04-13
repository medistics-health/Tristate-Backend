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

export async function sendOutlookEmail(to: string, subject: string, body: string) {
  try {
    const client = await getAuthenticatedClient();

    const sendMail = {
      message: {
        subject: subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
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
