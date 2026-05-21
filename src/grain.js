const GRAIN_BASE = "https://api.grain.com";

async function grainPost(path, body = {}) {
  const res = await fetch(`${GRAIN_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GRAIN_API_TOKEN}`,
      "Content-Type": "application/json",
      "Public-Api-Version": "2025-10-31",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grain API error ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

async function grainGet(path) {
  const res = await fetch(`${GRAIN_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GRAIN_API_TOKEN}`,
      "Content-Type": "application/json",
      "Public-Api-Version": "2025-10-31",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grain API error ${res.status} on ${path}: ${text}`);
  }
  return res.json();
}

export async function fetchMeetingData(recordingId) {
  console.log(`[Grain] Fetching: ${recordingId}`);

  const [meeting, transcriptData] = await Promise.all([
    grainPost(`/_/public-api/v2/recordings/${recordingId}`, {
      include: { participants: true, ai_action_items: true, ai_summary: true }
    }),
    grainGet(`/_/public-api/v2/recordings/${recordingId}/transcript`).catch(() => null),
  ]);

  const transcript = Array.isArray(transcriptData)
    ? transcriptData.map(s => `[${s.speaker}]: ${s.text}`).join("\n")
    : "Transcript not available";

  const notes = meeting.ai_summary?.text || "";
  const actionItems = meeting.ai_action_items
    ? meeting.ai_action_items.map(a => `• ${a.text}`).join("\n")
    : "";

  const durationSec = meeting.duration_ms ? Math.round(meeting.duration_ms / 1000) : 0;
  const durationFormatted = durationSec
    ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`
    : "Unknown";

  const hostParticipant = meeting.participants?.find(p => p.confirmed_attendee && p.scope === "internal");

  return {
    meetingId: recordingId,
    title: meeting.title || "Untitled meeting",
    hostEmail: hostParticipant?.email || null,
    startTime: meeting.start_datetime,
    duration: durationFormatted,
    grainUrl: meeting.url || `https://grain.com/share/recording/${recordingId}`,
    participants: meeting.participants?.map(p => p.name || p.email) || [],
    transcript,
    notes,
    actionItems,
  };
}

export async function fetchRecentRecordings() {
  const data = await grainPost('/_/public-api/v2/recordings', { filter: {} });
  return data.recordings || [];
}
