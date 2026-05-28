import { fetchPastCallsByProspect } from "./grain.js";

const MODEL = "claude-sonnet-4-5";

function buildSystemPrompt(ae, callType, pastCallCount) {
  const baseContext = `You are a CallHippo sales coach reviewing recorded calls for Account Executives.
AE CONTEXT:
- Name: ${ae.name}
- Team: ${ae.team} (${ae.segment})
- Product: CallHippo (cloud telephony, VoIP, AI voice agents)
- Past calls with this prospect: ${pastCallCount}

IMPORTANT RULES:
- Give specific, actionable feedback based ONLY on what happened in THIS call
- Do NOT compare to "world-class AEs" or use benchmark comparison language
- Do NOT say things like "World-class AEs do X" or "Top performers always Y"
- Focus on: what was done, what was missed, what to do next time
- Be direct and constructive, not preachy`;

  const callTypePrompts = {
    discovery: `
CALL TYPE: Discovery Call (First call with this prospect)
YOUR JOB: Evaluate how well the AE uncovered the prospect's pain, situation, and needs.

SCORING CRITERIA & WEIGHTS:
- Discovery Depth (30%): Did they ask open-ended questions? Understand current setup, pain points, urgency?
- Next Steps Confirmed (20%): Was a clear next meeting booked with date/time during the call?
- Compliance Awareness (15%): Were legal/regulatory topics handled correctly if raised?
- Prep & Punctuality (15%): Was the AE prepared? Did they know the prospect's background?
- Audio & Technical (10%): Call quality, no dead air, professional setup
- Stakeholder Management (10%): Did they identify decision makers?

SCORING: 9-10: Excellent | 7-8: Good | 5-6: Average | 3-4: Below average | 1-2: Critical issues`,

    demo: `
CALL TYPE: Demo Call (Prospect has had 1 prior call)
YOUR JOB: Evaluate how well the AE demonstrated value relevant to the prospect's specific needs.

SCORING CRITERIA & WEIGHTS:
- Demo Quality (30%): Was demo tailored to prospect's pain? Did it show relevant features?
- Pricing & Objections (25%): Was pricing presented confidently? Were objections handled well?
- Next Steps Confirmed (20%): Was a clear next step committed to during the call?
- Prep & Punctuality (15%): Was the AE prepared with prospect context from previous call?
- Audio & Technical (10%): Call quality, demo technical issues

SCORING: 9-10: Excellent | 7-8: Good | 5-6: Average | 3-4: Below average | 1-2: Critical issues`,

    followup: `
CALL TYPE: Follow-up Call (Prospect has had ${pastCallCount} prior calls)
YOUR JOB: Evaluate how well the AE moved the deal forward from previous interactions.

SCORING CRITERIA & WEIGHTS:
- Continuity (25%): Did the AE reference previous conversations correctly? Did they follow through on promises?
- Objection Handling (25%): Were pending objections addressed effectively?
- Next Steps Confirmed (25%): Was a clear next step committed to with date/time?
- Pricing & Closing (15%): Was there an attempt to advance or close appropriately?
- Audio & Technical (10%): Call quality and professionalism

SCORING: 9-10: Excellent | 7-8: Good | 5-6: Average | 3-4: Below average | 1-2: Critical issues`,

    retention: `
CALL TYPE: Retention / CSM Handoff Call
YOUR JOB: Evaluate how well the AE handled the retention situation or handoff.

SCORING CRITERIA & WEIGHTS:
- Issue Understanding (30%): Did the AE fully understand the customer's concern or churn reason?
- Resolution & Next Steps (25%): Was there a clear resolution plan with committed next actions?
- Relationship Management (20%): Was the conversation empathetic and relationship-preserving?
- Product Knowledge (15%): Did the AE correctly explain features, workarounds, or solutions?
- Audio & Technical (10%): Call quality and professionalism

SCORING: 9-10: Excellent | 7-8: Good | 5-6: Average | 3-4: Below average | 1-2: Critical issues`
  };

  const criteriaPrompt = callTypePrompts[callType] || callTypePrompts.discovery;

  return baseContext + criteriaPrompt + `

Respond ONLY with valid JSON:
{
  "callScore": 0.0,
  "riskFlag": "At Risk or Average or Good",
  "callType": "${callType}",
  "criteriaScores": {
    "score1Name": 0,
    "score2Name": 0,
    "score3Name": 0,
    "score4Name": 0,
    "score5Name": 0
  },
  "whatWasGood": ["specific thing 1", "specific thing 2", "specific thing 3"],
  "whatCanBeBetter": ["specific actionable improvement 1", "specific actionable improvement 2", "specific actionable improvement 3"],
  "hotTake": "one honest sentence about the single most important thing to improve",
  "nextCallFocus": "one specific thing to practice on the very next call",
  "remarkNextSteps": "what AE must do in next 24 hours"
}`;
}

async function detectCallType(meetingData) {
  const title = (meetingData.title || "").toLowerCase();
  const notes = (meetingData.notes || "").toLowerCase();
  const combined = title + " " + notes;

  // Retention check first - title based
  if (combined.includes("retention") || combined.includes("churn") ||
      combined.includes("csm") || combined.includes("handoff") ||
      combined.includes("cancel") || combined.includes("onboarding")) {
    return { callType: "retention", pastCallCount: 0 };
  }

  // Get prospect name from participants (external/non-callhippo person)
  const prospectParticipant = meetingData.participants?.find(p =>
    p && !String(p).toLowerCase().includes("callhippo")
  );
  const prospectName = prospectParticipant || "";

  if (!prospectName) {
    return { callType: "discovery", pastCallCount: 0 };
  }

  // Fetch past calls with this prospect
  try {
    const pastCalls = await fetchPastCallsByProspect(prospectName, meetingData.meetingId);
    const pastCallCount = pastCalls.length;

    console.log(`[Scorer] Prospect: ${prospectName} | Past calls: ${pastCallCount}`);

    if (pastCallCount === 0) {
      return { callType: "discovery", pastCallCount: 0 };
    } else if (pastCallCount === 1) {
      return { callType: "demo", pastCallCount: 1 };
    } else {
      return { callType: "followup", pastCallCount };
    }
  } catch (err) {
    console.error("[Scorer] detectCallType error:", err.message);
    return { callType: "discovery", pastCallCount: 0 };
  }
}

export async function scoreCall(meetingData, ae) {
  console.log("[Claude] Scoring call for " + ae.name);

  const { callType, pastCallCount } = await detectCallType(meetingData);
  console.log(`[Claude] Detected call type: ${callType} (past calls: ${pastCallCount})`);

  const userMessage = `Analyze this sales call.

Meeting: ${meetingData.title}
Duration: ${meetingData.duration}
Participants: ${meetingData.participants.join(", ")}

AI Notes:
${meetingData.notes || "None"}

Action Items:
${meetingData.actionItems || "None"}

Transcript:
${meetingData.transcript}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: buildSystemPrompt(ae, callType, pastCallCount),
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error("Claude API error " + response.status + ": " + body);
  }

  const data = await response.json();
  const text = data.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("");
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned);
}
