export const AE_ROSTER = {
  "abanali@callhippo.com": {
    name: "Aban Ali", team: "SOHO", segment: "SOHO",
    avgRating: 6.75, callsReviewed: 2,
    knownWeaknesses: ["Refuses discounts without exploring alternatives", "Starts calls late without apology", "Calls ending without clear next step"],
    topStrengths: ["Good inbound product knowledge", "Clear discount threshold communication"],
    riskFlag: "🟡 Average",
  },
  "anshumansrivastava@callhippo.com": {
    name: "Anshuman Srivastava", team: "SOHO", segment: "SOHO",
    avgRating: 7.25, callsReviewed: 2,
    knownWeaknesses: ["Routes single-user prospects to support before conversion", "Accepts declined follow-ups without alternatives", "Never qualifies budget when prospect deflects"],
    topStrengths: ["Strong compliance knowledge", "Excellent HubSpot demo", "Detailed pricing breakdown"],
    riskFlag: "🟡 Average",
  },
  "atulverma@callhippo.com": {
    name: "Atul Verma", team: "SMB", segment: "SMB",
    avgRating: 6.0, callsReviewed: 2,
    knownWeaknesses: ["CRITICAL: Recurring audio/network failures", "Confusing pricing explanations", "No concrete follow-up scheduled"],
    topStrengths: ["Correct product qualification", "Good discovery on complex calls"],
    riskFlag: "🔴 At Risk",
  },
  "ayushigupta@callhippo.com": {
    name: "Ayushi Gupta", team: "SOHO", segment: "SOHO",
    avgRating: 6.75, callsReviewed: 2,
    knownWeaknesses: ["Weak structured discovery", "No next steps confirmed", "Audio quality issues on trial calls"],
    topStrengths: ["Good technical product knowledge", "Thorough feature demos"],
    riskFlag: "🟡 Average",
  },
  "pranavchillawar@callhippo.com": {
    name: "Pranav Chillawar", team: "SMB", segment: "SMB",
    avgRating: 8.25, callsReviewed: 2,
    knownWeaknesses: ["Not probing decision-maker influence", "Dismissing AI product questions", "No calendar invite confirmed on call"],
    topStrengths: ["Excellent agenda-setting", "Smooth discovery-to-demo transitions", "Transparent pricing"],
    riskFlag: "🟢 Good",
  },
  "pushpendrarathore@callhippo.com": {
    name: "Pushpendra Rathore", team: "SMB", segment: "SMB",
    avgRating: 6.75, callsReviewed: 2,
    knownWeaknesses: ["Poor billing/retention call handling", "Missing upsell opportunities", "No next steps on retention calls"],
    topStrengths: ["Strong AI Voice Agent knowledge", "Excellent live demos"],
    riskFlag: "🟡 Average",
  },
  "prabhatsingh@callhippo.com": {
    name: "Prabhat Singh", team: "Mid Market", segment: "Mid Market",
    avgRating: null, callsReviewed: 0,
    knownWeaknesses: [], topStrengths: [], riskFlag: "⚪ New",
  },
  "vishaldubey@callhippo.com": {
    name: "Vishal Dubey", team: "Mid Market", segment: "Mid Market",
    avgRating: null, callsReviewed: 0,
    knownWeaknesses: [], topStrengths: [], riskFlag: "⚪ New",
  },
  "vishalipandita@callhippo.com": {
    name: "Vishali Pandita", team: "SMB", segment: "SMB",
    avgRating: 8.25, callsReviewed: 2,
    knownWeaknesses: ["Ends large-account conversations too quickly", "CRM integration probing too late"],
    topStrengths: ["Exceptional compliance briefings", "Outstanding UAE-market knowledge"],
    riskFlag: "🟢 Good",
  },
};

export function getAEByEmail(email) {
  if (!email) return null;
  return AE_ROSTER[email.toLowerCase().trim()] || null;
}

export function updateAEStats(email, newRating) {
  const ae = AE_ROSTER[email];
  if (!ae) return;
  if (ae.avgRating === null) {
    ae.avgRating = newRating;
    ae.callsReviewed = 1;
  } else {
    const total = ae.avgRating * ae.callsReviewed + newRating;
    ae.callsReviewed += 1;
    ae.avgRating = Math.round((total / ae.callsReviewed) * 100) / 100;
  }
  ae.riskFlag = newRating >= 7.5 ? "🟢 Good" : newRating >= 6.5 ? "🟡 Average" : "🔴 At Risk";
}
