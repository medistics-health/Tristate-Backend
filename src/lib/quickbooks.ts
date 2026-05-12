import axios from "axios";
import crypto from "crypto";

type QuickBooksEnvironment = "sandbox" | "production";

export type QuickBooksConnectionTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
};

type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

type QuickBooksStatePayload = {
  companyId: string;
  userId?: string;
  isSandbox: boolean;
  issuedAt: number;
};

type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  x_refresh_token_expires_in?: number;
};

export function getQuickBooksEnvironment(
  isSandbox?: boolean | null,
): QuickBooksEnvironment {
  return isSandbox === false ? "production" : "sandbox";
}

export function getQuickBooksConfig(): QuickBooksConfig {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.QUICKBOOKS_REDIRECT_URI?.trim();
  const stateSecret = process.env.QUICKBOOKS_STATE_SECRET?.trim();

  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    throw new Error(
      "QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REDIRECT_URI and QUICKBOOKS_STATE_SECRET must be configured.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    stateSecret,
  };
}

export function buildQuickBooksAuthUrl(params: {
  companyId: string;
  userId?: string;
  isSandbox?: boolean;
}) {
  const config = getQuickBooksConfig();
  const state = encodeQuickBooksState({
    companyId: params.companyId,
    userId: params.userId,
    isSandbox: params.isSandbox ?? true,
    issuedAt: Date.now(),
  });

  const url = new URL("https://appcenter.intuit.com/connect/oauth2");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "com.intuit.quickbooks.accounting",
  );
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return url.toString().replace(/\+/g, "%20");
}

export function encodeQuickBooksState(payload: QuickBooksStatePayload) {
  const config = getQuickBooksConfig();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", config.stateSecret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

export function decodeQuickBooksState(state: string): QuickBooksStatePayload {
  const config = getQuickBooksConfig();
  const [body, signature] = state.split(".");

  if (!body || !signature) {
    throw new Error("Invalid QuickBooks state.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.stateSecret)
    .update(body)
    .digest("base64url");

  if (signature !== expectedSignature) {
    throw new Error("Invalid QuickBooks state signature.");
  }

  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as QuickBooksStatePayload;

  if (!payload.companyId || typeof payload.issuedAt !== "number") {
    throw new Error("Invalid QuickBooks state payload.");
  }

  return payload;
}

export async function exchangeQuickBooksCode(params: {
  code: string;
  realmId: string;
}) {
  const config = getQuickBooksConfig();
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const auth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await axios.post<QuickBooksTokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: config.redirectUri,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    },
  );

  return mapTokenResponse(response.data, params.realmId);
}

export async function refreshQuickBooksTokens(params: {
  refreshToken: string;
  realmId: string;
}) {
  const config = getQuickBooksConfig();
  const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
  const auth = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");

  const response = await axios.post<QuickBooksTokenResponse>(
    tokenUrl,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    },
  );

  return mapTokenResponse(response.data, params.realmId);
}

export function getQuickBooksApiBaseUrl(isSandbox: boolean, realmId: string) {
  const environment = getQuickBooksEnvironment(isSandbox);
  const host =
    environment === "sandbox"
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com";

  return `${host}/v3/company/${realmId}`;
}

function mapTokenResponse(data: QuickBooksTokenResponse, realmId: string) {
  const now = Date.now();
  return {
    realmId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: data.expires_in
      ? new Date(now + data.expires_in * 1000)
      : null,
    refreshTokenExpiresAt: data.x_refresh_token_expires_in
      ? new Date(now + data.x_refresh_token_expires_in * 1000)
      : null,
  };
}
