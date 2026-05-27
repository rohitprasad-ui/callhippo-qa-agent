import { fetchRecentRecordings } from "./grain.js";
import { handleRecordingCompleted } from "./agent.js";

const POLL_INTERVAL = 5 * 60 * 1000;
const seen = new Set();

async function poll() {
  console.log("[Poller] Checking new recordings...");
  try {
    const recordings = await fetchRecentRecordings();
    for (const rec of recordings) {
      if (!seen.has(rec.id)) {
        seen.add(rec.id);
        console.log(`[Poller] New recording: ${rec.id}`);
        await handleRecordingCompleted({ recording_id: rec.id });
      }
    }
  } catch (err) {
    console.error("[Poller] Error:", err.message);
  }
}

export function startPoller() {
  console.log("[Poller] Starting — checking every 5 minutes...");
  poll();
  setInterval(poll, POLL_INTERVAL);
}
