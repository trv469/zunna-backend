import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { cancelSubscription } from "./src/paypal.js";
import webhookRouter from "./src/webhook.js";

dotenv.config();
const app = express();
const allowedOrigin = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [];

app.use(
  cors({
    origin: allowedOrigin,
    methods: ["GET", "POST"],
    // allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Endpoint para cancelar suscripción
app.post("/api/paypal/cancel", async (req, res) => {
  const { subscriptionId } = req?.body;

  if (!subscriptionId)
    return res.status(400).json({ error: "subscriptionId requerido" });

  const result = await cancelSubscription(subscriptionId);
  res.json({ success: result });
});

// Webhook listener (PayPal no requiere CORS aquí)
app.use("/api/paypal/webhook", webhookRouter);

app.listen(process.env.PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${process.env.PORT}`);
});
