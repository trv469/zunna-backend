import express from "express";
import { verifyWebhookSignature } from "./paypal.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const headers = req.headers;
  const body = req.body;

  const isValid = await verifyWebhookSignature(headers, body);
  if (!isValid) {
    console.warn("⚠️ Webhook no verificado");
    return res.sendStatus(400);
  }

  const event = body;
  console.log("📩 Evento recibido:", event.event_type);

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.CANCELLED":
      // Aquí actualizarías tu BD
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