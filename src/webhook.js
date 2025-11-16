import express from "express";
import axios from "axios";
import { db } from "./../firebase.js";

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
  console.log("🚀 ~ verifyWebhookSignature ~ body:", body);
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
    console.log("🚀 ~ verifyWebhookSignature ~ data:", data);

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
  console.log("🚀 ~ rawBody:", rawBody);

  const isValid = await verifyWebhookSignature(headers, rawBody);
  if (!isValid) {
    return res.send({ error: "Webhook no verificado" }).sendStatus(400);
  }

  const event = rawBody;

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.CANCELLED":
      console.log(`❌ Suscripción ${event.resource.id} cancelada`);
      await deactivateUserPlan(event.resource.id);
      break;
    case "BILLING.SUBSCRIPTION.ACTIVATED":
      console.log(`✅ Suscripción ${event.resource.id} activada`);
      await activateUserPlan(event.resource.id);
      break;
    case "BILLING.SUBSCRIPTION.EXPIRED":
      console.log(`⏰ Suscripción ${event.resource.id} expirada`);
      await deactivateUserPlan(event.resource.id);
      break;
    default:
      console.log("Evento no manejado:", event.event_type);
  }

  res.sendStatus(200);
});

async function deactivateUserPlan(subscriptionId) {
  try {
    const snapshot = await db
      .collection("users")
      .where("plan.paypalData.subscriptionID", "==", subscriptionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn("Usuario no encontrado para esa suscripción");
      return;
    }

    const userDoc = snapshot.docs[0].ref;

    await userDoc.update({
      "plan.planId": "trial",
      "plan.endDate": new Date(),
      "plan.cancelReason": "subscription_cancelled",
      "plan.trialPeriod":false,
      "plan.cancelledAt": new Date()
    });

    console.log(`🛑 Usuario ${userDoc.id} desactivado correctamente`);
  } catch (err) {
    console.error("Error actualizando Firestore:", err);
  }
}
async function activateUserPlan(subscriptionId) {
  try {
    const snapshot = await db
      .collection("users")
      .where("plan.paypalData.subscriptionID", "==", subscriptionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.warn(
        `⚠️ No se encontró usuario con subscriptionID: ${subscriptionId}`
      );
      return;
    }

    const userDoc = snapshot.docs[0].ref;

    await userDoc.update({
      "plan.planId": "premium",
      "plan.cancelReason": null,
      "plan.startDate": new Date(),
      "plan.invoicedDay": new Date().getDate(),
    });

    console.log(`🚀 Plan activado para usuario ${userDoc.id}`);
  } catch (err) {
    console.error("🔥 Error al actualizar Firestore:", err);
  }
}

export default router;
