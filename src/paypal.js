import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const { PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_API } = process.env;

// 🧩 Obtener token de acceso
export async function getAccessToken() {
  try {
    let data = {
      grant_type: "client_credentials",
    };

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: `${PAYPAL_API}/v1/oauth2/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64")}`,
      },
      data: data,
    };

    const res = await axios.post(config.url, data, { headers: config.headers, maxBodyLength: config.maxBodyLength });

    return res.data.access_token;
  } catch (error) {
    console.error("❌ Error al obtener token de acceso:", error);
    throw error;
  }
}

// ❌ Cancelar suscripción
export async function cancelSubscription(
  subscriptionId,
  reason = "User requested cancellation"
) {
  const token = await getAccessToken();
  console.log("🚀 ~ cancelSubscription ~ token:", token);

  try {
    await axios.post(
      `${PAYPAL_API}/v1/billing/subscriptions/${subscriptionId}/cancel`,
      { reason },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`✅ Suscripción ${subscriptionId} cancelada`);
    return true;
  } catch (err) {
    console.error("❌ Error al cancelar:", err.response?.data || err.message);
    return false;
  }
}

// 🔒 Verificar firma del webhook
export async function verifyWebhookSignature(headers, body) {
  const token = await getAccessToken();

  try {
    const res = await axios.post(
      `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: process.env.WEBHOOK_ID,
        webhook_event: body,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.data.verification_status === "SUCCESS";
  } catch (err) {
    console.error(
      "⚠️ Error verificando webhook:",
      err.response?.data || err.message
    );
    return false;
  }
}
