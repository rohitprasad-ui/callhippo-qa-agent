import { fetchMeetingData } from "./grain.js";
import { getAEByEmail, updateAEStats } from "./roster.js";
import { scoreCall } from "./scorer.js";
import { postFeedbackToSlack } from "./slack.js";

const TIMEOUT_MS = 14 * 60 * 1000;

export async function handleRecordingCompleted(event) {
  const recordingId = event.recording_id || event.data?.recording_id;
  if (!recordingId) {
    console.warn("[Agent] No recording_id in event:", event);
    return;
  }
  console.log(`[Agent] Processing recording: ${recordingId}`);
  await Promise.race([
    runPipeline(recordingId),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS))
  ]);
}

async function runPipeline(recordingId) {
  const meetingData = await fetchMeetingData(recordingId);
  console.log(`[Agent] Meeting: "${meetingData.title}" — host: ${meetingData.hostEmail}`);

  const ae = getAEByEmail(meetingData.hostEmail);
  if (!ae) {
    console.log(`[Agent] ${meetingData.hostEmail} not in roster — skipping`);
    return;
  }
  console.log(`[Agent] AE: ${ae.name} (${ae.team})`);

  const scoring = await scoreCall(meetingData, ae);
  console.log(`[Agent] Score: ${scoring.callScore}/10 ${scoring.riskFlag}`);

  updateAEStats(meetingData.hostEmail, scoring.callScore);
  await postFeedbackToSlack(ae, meetingData, scoring);
  console.log(`[Agent] ✅ Done for ${ae.name}`);
}
