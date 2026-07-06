import axios from "axios";
import Stripe from "stripe";

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  return secretKey;
}

function getStripeRequestHeaders() {
  return {
    Authorization: `Bearer ${getStripeSecretKey()}`,
    "Stripe-Version": Stripe.API_VERSION,
    "Content-Type": "application/x-www-form-urlencoded",
  } as Record<string, string>;
}

function appendStripeFormValue(form: URLSearchParams, key: string, value: unknown) {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      appendStripeFormValue(form, `${key}[]`, item);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      appendStripeFormValue(form, `${key}[${nestedKey}]`, nestedValue);
    }
    return;
  }

  form.append(key, String(value));
}

export async function stripeRequest<T = any>(
  method: "GET" | "POST",
  path: string,
  data?: Record<string, unknown>,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const url = `https://api.stripe.com${path}`;
  const headers = getStripeRequestHeaders();
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  try {
    if (method === "GET") {
      const response = await axios.get(url, { headers });
      return response.data as T;
    }

    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(data || {})) {
      appendStripeFormValue(body, key, value);
    }

    const response = await axios.post(url, body.toString(), { headers });
    return response.data as T;
  } catch (error: any) {
    const stripeMessage =
      error?.response?.data?.error?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "Unknown Stripe request error.";
    const details = error?.response?.data
      ? ` Response: ${JSON.stringify(error.response.data)}`
      : "";

    throw new Error(`Stripe request failed for ${method} ${path}: ${stripeMessage}.${details}`);
  }
}
