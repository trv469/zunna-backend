import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_API } = process.env;

export async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString(
    "base64"
  );

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  return data.access_token;
}

export async function cancelSubscription(
  subscriptionId,
  reason = "User requested cancellation"
) {
  const token = await getAccessToken();

  const res = await fetch(
    `${PAYPAL_API}/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    }
  );

  if (res.status === 204) {
    console.log(`✅ Suscripción ${subscriptionId} cancelada`);
    return true;
  } else {
    const err = await res.text();
    console.error("❌ Error al cancelar:", err);
    return false;
  }
}

export async function verifyWebhookSignature(headers, body) {
  const token = await getAccessToken();

  const res = await fetch(
    `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: process.env.WEBHOOK_ID,
        webhook_event: body,
      }),
    }
  );

  const data = await res.json();
  return data.verification_status === "SUCCESS";
}
