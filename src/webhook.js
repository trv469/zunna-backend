import express from "express";
import axios from "axios";

const router = express.Router();

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID; // el ID que ves en tu app en PayPal
const PAYPAL_API = process.env.PAYPAL_API || "https://api-m.paypal.com";

// 🔑 Obtener token de acceso PayPal
async function getAccessToken() {
  const { data } = await axios.post(
    `${PAYPAL_API}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      auth: {
        username: PAYPAL_CLIENT_ID,
        password: PAYPAL_SECRET,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return data.access_token;
}

// ✅ Verificar firma del webhook
async function verifyWebhookSignature(headers, body) {
  console.log("🚀 ~ verifyWebhookSignature ~ body:", body)
  try {
    const accessToken = await getAccessToken();

    const payload = {
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: body,
    };

    const { data } = await axios.post(
      `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return data.verification_status === "SUCCESS";
  } catch (err) {
    console.error("❌ Error verificando webhook:", err.response?.data || err);
    return false;
  }
}

// 🚀 Ruta principal del webhook
router.post("/", async (req, res) => {
  const headers = req.headers;
  const rawBody = req.body; // viene como Buffer

  const isValid = await verifyWebhookSignature(headers, rawBody);
  if (!isValid) {
    console.warn("⚠️ Webhook no verificado");
    return res.sendStatus(400);
  }

  const event = JSON.parse(rawBody.toString());
  console.log("📩 Evento recibido:", event.event_type);

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.CANCELLED":
      console.log(`❌ Suscripción ${event.resource.id} cancelada`);
      break;
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      console.log(`✅ Suscripción ${event.resource.id} activada`);
      break;
    case "BILLING.SUBSCRIPTION.EXPIRED":
      console.log(`⏰ Suscripción ${event.resource.id} expirada`);
      break;
    default:
      console.log("Evento no manejado:", event.event_type);
  }

  res.sendStatus(200);
});

export default router;