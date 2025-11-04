import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// Usar una instancia con timeout y máximo body length configurable
const axiosClient = axios.create({ timeout: 8000, maxBodyLength: Infinity });

// Helper para validar variables de entorno cuando se necesitan
function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Environment variable ${name} is required but was not set`);
  }
  return v;
}

// 🧩 Obtener token de acceso con validaciones y reintentos simples
export async function getAccessToken({ retries = 2, retryDelayMs = 1000 } = {}) {
  const PAYPAL_API = getRequiredEnv("PAYPAL_API");
  const PAYPAL_CLIENT_ID = getRequiredEnv("PAYPAL_CLIENT_ID");
  const PAYPAL_SECRET = getRequiredEnv("PAYPAL_SECRET");

  const url = `${PAYPAL_API.replace(/\/+$/, "")}/v1/oauth2/token`;
  const auth = `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64")}`;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axiosClient.post(url, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: auth,
        },
      });

      if (res?.data?.access_token) {
        return res.data.access_token;
      }

      throw new Error("No access_token in PayPal response");
    } catch (err) {
      lastError = err;
      const isLast = attempt === retries;
      const status = err?.response?.status;
      // For 4xx errors (except 429) don't retry
      if (status && status >= 400 && status < 500 && status !== 429) {
        console.error("❌ getAccessToken - non-retriable error:", err.response?.data || err.message);
        throw err;
      }

      console.warn(`⚠️ getAccessToken attempt ${attempt + 1} failed: ${err.message}`);
      if (isLast) break;
      // backoff
      await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
  }

  console.error("❌ Error al obtener token de acceso después de reintentos:", lastError?.response?.data || lastError?.message || lastError);
  throw lastError;
}

// ❌ Cancelar suscripción — devuelve booleano seguro (no lanza si falla internamente)
export async function cancelSubscription(subscriptionId, reason = "User requested cancellation") {
  if (!subscriptionId || typeof subscriptionId !== "string") {
    console.error("cancelSubscription: subscriptionId inválido:", subscriptionId);
    return false;
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error("cancelSubscription: no se pudo obtener token:", err.message || err);
    return false;
  }

  const PAYPAL_API = process.env.PAYPAL_API || "";
  if (!PAYPAL_API) {
    console.error("cancelSubscription: PAYPAL_API no está configurado");
    return false;
  }

  const url = `${PAYPAL_API.replace(/\/+$/, "")}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`;

  try {
    await axiosClient.post(
      url,
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
    // Mostrar la info más útil posible sin romper
    console.error("❌ Error al cancelar suscripción:", err.response?.data || err.message || err);
    return false;
  }
}

// 🔒 Verificar firma del webhook — validaciones y manejo seguro
export async function verifyWebhookSignature(headers = {}, body = {}) {
  // headers puede venir de express y suele estar en minúsculas
  if (!headers || typeof headers !== "object") {
    console.error("verifyWebhookSignature: headers inválidos");
    return false;
  }

  // Recoger valores de headers de forma tolerante (case-insensitive)
  const getHeader = (key) => headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];

  const needed = {
    auth_algo: getHeader("paypal-auth-algo"),
    cert_url: getHeader("paypal-cert-url"),
    transmission_id: getHeader("paypal-transmission-id"),
    transmission_sig: getHeader("paypal-transmission-sig"),
    transmission_time: getHeader("paypal-transmission-time"),
  };

  const missing = Object.entries(needed).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error("verifyWebhookSignature: faltan headers necesarios:", missing);
    return false;
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error("verifyWebhookSignature: no se pudo obtener token:", err.message || err);
    return false;
  }

  const webhookId = process.env.WEBHOOK_ID;
  if (!webhookId) {
    console.error("verifyWebhookSignature: WEBHOOK_ID no está configurado");
    return false;
  }

  const PAYPAL_API = process.env.PAYPAL_API || "";
  if (!PAYPAL_API) {
    console.error("verifyWebhookSignature: PAYPAL_API no está configurado");
    return false;
  }

  try {
    const res = await axiosClient.post(
      `${PAYPAL_API.replace(/\/+$/, "")}/v1/notifications/verify-webhook-signature`,
      {
        auth_algo: needed.auth_algo,
        cert_url: needed.cert_url,
        transmission_id: needed.transmission_id,
        transmission_sig: needed.transmission_sig,
        transmission_time: needed.transmission_time,
        webhook_id: webhookId,
        webhook_event: body,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res?.data?.verification_status === "SUCCESS";
  } catch (err) {
    console.error("⚠️ Error verificando webhook:", err.response?.data || err.message || err);
    return false;
  }
}
