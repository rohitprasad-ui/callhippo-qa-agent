import express from "express";
import crypto from "crypto";
import { handleRecordingCompleted } from "./agent.js";

const app = express();
app.use(express.json());

function verifyGrainSignature(req) {
  const secret = process.env.GRAIN_WEBHOOK_SECRET;
  if (!secret) return true;
  const sig = req.headers["x-grain-signature"];
  if (!sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
  return sig === expected;
}

app.post("/webhook/grain", async (req, res) => {
  if (!verifyGrainSignature(req)) return res.status(401).json({ error: "Invalid signature" });
  const event = req.body;
  console.log(`[Webhook] Event: ${event.event_type}`);
  res.status(200).json({ received: true });
  if (event.event_type === "recording.completed") {
    handleRecordingCompleted(event).catch(err => console.error("[Agent] Error:", err.message));
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CallHippo QA Agent running on port ${PORT}`));
