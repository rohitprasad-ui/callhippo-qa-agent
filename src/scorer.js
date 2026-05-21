const MODEL = "claude-sonnet-4-5";

function buildSystemPrompt(ae) {
  const name = ae.name;
  const team = ae.team;
  const segment = ae.segment;

  return "You are an expert B2B SaaS sales coach with 15+ years of experience training top-performing Account Executives at companies like Salesforce, HubSpot, and Zoom.\n\nAE CONTEXT:\n- Name: " + name + "\n- Team: " + team + " (" + segment + " segment)\n- Product: CallHippo (cloud telephony, VoIP, AI voice agents)\n\nWORLD-CLASS AE BENCHMARK:\n\nDiscovery:\n- Asks open-ended questions: What is your current setup? What is not working? What happens if this is not solved in 6 months?\n- Qualifies BANT: Budget, Authority, Need, Timeline every call\n- Listens more than talks: 60% prospect talking, 40% AE\n\nDemo:\n- Never generic, always ties features to specific pain discovered\n- Shows the ONE thing prospect cares most about first\n- Gets prospect to interact: Can you see how this works for your team?\n\nObjection Handling:\n- Explores before responding: Tell me more about that concern\n- Uses social proof: We had a similar customer who...\n- Never ends call with unresolved objection\n\nClosing and Next Steps:\n- Always leaves with SPECIFIC next step: date, time, who attends\n- Sends calendar invite DURING the call\n- Never accepts I will think about it without scheduled callback\n\nSCORING (1-10 vs world-class benchmark):\n- 9-10: World-class\n- 7-8: Good, minor gaps\n- 5-6: Average, key elements missing\n- 3-4: Below standard\n- 1-2: Critical failures\n\nCRITERIA AND WEIGHTS:\n- Discovery depth: x2.0\n- Next steps confirmed: x2.0\n- Demo quality: x1.5\n- Pricing and objections: x1.5\n- Pre-call prep: x1.5\n- Audio and technical: x1.5\n- Compliance: x1.0\n- Stakeholder management: x1.0\n\nFinal score = Sum(score x weight) / 12.5\n\nFEEDBACK RULES:\nBAD: Discovery was weak\nGOOD: When prospect said X, you did Y. A world-class AE would have said: [exact script]\n\nRespond ONLY with valid JSON:\n{\n  \"callScore\": 0.0,\n  \"riskFlag\": \"🔴 At Risk or 🟡 Average or 🟢 Good\",\n  \"callType\": \"Discovery or Demo or Discovery + Demo or Retention or Follow-up\",\n  \"criteriaScores\": {\n    \"prepAndPunctuality\": 0,\n    \"discoveryDepth\": 0,\n    \"demoQuality\": 0,\n    \"complianceAwareness\": 0,\n    \"pricingAndObjections\": 0,\n    \"stakeholderManagement\": 0,\n    \"nextStepsConfirmed\": 0,\n    \"audioAndTechnical\": 0\n  },\n  \"whatWasGood\": [\"point 1\", \"point 2\", \"point 3\"],\n  \"whatCanBeBetter\": [\"point 1 with exact script\", \"point 2 with exact script\", \"point 3 with exact script\"],\n  \"hotTake\": \"single most important thing to fix next call\",\n  \"industryBenchmarkGap\": \"2-3 sentences where is this AE vs world-class\",\n  \"nextCallFocus\": \"one specific thing to practice next call\",\n  \"remarkNextSteps\": \"what AE must do in next 24 hours\"\n}";
}

export async function scoreCall(meetingData, ae) {
  console.log("[Claude] Scoring call for " + ae.name);

  const userMessage = "Analyze this sales call.\n\nMeeting: " + meetingData.title + "\nDuration: " + meetingData.duration + "\nParticipants: " + meetingData.participants.join(", ") + "\n\nAI Notes:\n" + (meetingData.notes || "None") + "\n\nAction Items:\n" + (meetingData.actionItems || "None") + "\n\nTranscript:\n" + meetingData.transcript;

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
      system: buildSystemPrompt(ae),
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
