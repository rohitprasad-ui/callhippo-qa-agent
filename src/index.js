import cron from "node-cron";
import Anthropic from "@anthropic-ai/sdk";
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

// ═══════════════════════════════════════════════════════════════
// QA REPORT ENGINE — Weekly / Monthly / Quarterly
// ═══════════════════════════════════════════════════════════════


async function generateAndPostQAReport(reportType) {
  const now = new Date();
  let daysBack, reportLabel, emoji;

  if (reportType === 'weekly') {
    daysBack = 7;
    reportLabel = `Week of ${now.toDateString()}`;
    emoji = '📊';
  } else if (reportType === 'monthly') {
    daysBack = 30;
    reportLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
    emoji = '📅';
  } else if (reportType === 'quarterly') {
    daysBack = 90;
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    reportLabel = `Q${quarter} ${now.getFullYear()}`;
    emoji = '📈';
  }

  console.log(`${emoji} Generating ${reportType} QA report...`);

  try {
    const oldest = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
    const slackRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${process.env.SLACK_CHANNEL}&oldest=${oldest}&limit=1000`,
      { headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
    );
    const { messages = [] } = await slackRes.json();

    const feedbackMsgs = messages.filter(m =>
      m.bot_id &&
      m.text?.includes('Call Feedback for') &&
      !m.text?.includes('has joined')
    );

    if (feedbackMsgs.length === 0) {
      console.log('No feedback messages found — skipping report.');
      return;
    }

    const aeData = {};
    const scoreRegex = /Call Feedback for (.+?): ([\d.]+)\/10/;

    feedbackMsgs.forEach(m => {
      const match = m.text.match(scoreRegex);
      if (!match) return;
      const [, name, scoreStr] = match;
      const score = parseFloat(scoreStr);
      if (score < 2.5) return;
      if (!aeData[name]) aeData[name] = { scores: [], good: 0, atRisk: 0 };
      aeData[name].scores.push(score);
      if (score >= 7) aeData[name].good++;
      else if (score < 5) aeData[name].atRisk++;
    });

    const totalCalls = Object.values(aeData).reduce((s, d) => s + d.scores.length, 0);
    const allScores = Object.values(aeData).flatMap(d => d.scores);
    const teamAvg = (allScores.reduce((a,b) => a+b, 0) / allScores.length).toFixed(1);

    const aeSummary = Object.entries(aeData)
      .sort(([,a],[,b]) => {
        const avgA = a.scores.reduce((s,v)=>s+v,0)/a.scores.length;
        const avgB = b.scores.reduce((s,v)=>s+v,0)/b.scores.length;
        return avgB - avgA;
      })
      .map(([name, d]) => {
        const avg = (d.scores.reduce((s,v)=>s+v,0)/d.scores.length).toFixed(1);
        const status = avg >= 7 ? 'Good' : avg >= 5 ? 'Average' : 'At Risk';
        return `${name}: ${d.scores.length} calls | avg ${avg}/10 | ${status} | best: ${Math.max(...d.scores)} | worst: ${Math.min(...d.scores)}`;
      }).join('\n');

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `You are a sales coaching analyst for CallHippo AEs.
Generate a ${reportType} QA performance report for Slack.

Period: ${reportLabel}
Total external calls reviewed: ${totalCalls}
Team average score: ${teamAvg}/10

AE breakdown (sorted best to worst):
${aeSummary}

Write the Slack report with these sections:
1. 🏆 Team overview (total calls, team avg, how many AEs are Good/Average/At Risk)
2. 👤 Individual AE scoreboard (each AE with avg score, call count, and one-line coaching tip)
3. 🔁 Top 3 most repeated mistakes across all calls this ${reportType}
4. ✅ Top 3 things the team is doing well
5. 🎯 One priority focus for next ${reportType}

Rules:
- Use Slack markdown (*bold*, _italic_)
- Keep each AE line to one line max
- Be direct and coaching-focused, not generic
- Under 500 words total`
      }]
    });

    const reportText = response.content[0].text;
    const header = `${emoji} *${reportType.charAt(0).toUpperCase() + reportType.slice(1)} QA Report — ${reportLabel}*\n_External calls only · Internal & no-show excluded · ${totalCalls} calls reviewed_\n\n`;

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: process.env.SLACK_CHANNEL,
        text: header + reportText,
        username: 'CH QA Report Agent',
        icon_emoji: ':bar_chart:'
      })
    });

    console.log(`✅ ${reportType} report posted!`);

  } catch (err) {
    console.error(`❌ ${reportType} report failed:`, err);
  }
}

// 📊 Weekly — Every Monday 10:00 AM IST (04:30 UTC)
cron.schedule('30 4 * * 1', () => generateAndPostQAReport('weekly'), { timezone: 'UTC' });

// 📅 Monthly — 1st of every month 10:00 AM IST (04:30 UTC)
cron.schedule('30 4 1 * *', () => generateAndPostQAReport('monthly'), { timezone: 'UTC' });

// 📈 Quarterly — Jan 1, Apr 1, Jul 1, Oct 1 at 10:00 AM IST
cron.schedule('30 4 1 1,4,7,10 *', () => generateAndPostQAReport('quarterly'), { timezone: 'UTC' });

console.log('✅ QA report crons scheduled: weekly (Mon), monthly (1st), quarterly (Jan/Apr/Jul/Oct)');

// ── TEAM DEFINITIONS ─────────────────────────────────────────────
const TEAMS = {
  'SOHO': ['Anshuman Srivastava', 'Ayushi Gupta', 'Aban Ali'],
  'SMB': ['Atul Verma', 'Pranav Chillawar', 'Pushpendra Rathore', 'Vishali Pandita'],
  'Mid Market': ['Prabhat Singh', 'Vishal Dubey', 'Saikat Sinha'],
};

async function generateTeamReport(teamName, memberNames, reportType) {
  const now = new Date();
  let daysBack, reportLabel, emoji;
  if (reportType === 'weekly') { daysBack = 7; reportLabel = `Week of ${now.toDateString()}`; emoji = '📊'; }
  else if (reportType === 'monthly') { daysBack = 30; reportLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' }); emoji = '📅'; }
  else { daysBack = 90; const q = Math.ceil((now.getMonth()+1)/3); reportLabel = `Q${q} ${now.getFullYear()}`; emoji = '📈'; }

  console.log(`${emoji} Generating ${reportType} report for ${teamName} team...`);
  try {
    const oldest = Math.floor(Date.now()/1000) - (daysBack * 24 * 60 * 60);
    const slackRes = await fetch(
      `https://slack.com/api/conversations.history?channel=${process.env.SLACK_CHANNEL}&oldest=${oldest}&limit=1000`,
      { headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}` } }
    );
    const { messages = [] } = await slackRes.json();
    const feedbackMsgs = messages.filter(m => m.bot_id && m.text?.includes('Call Feedback for') && !m.text?.includes('has joined'));
    if (!feedbackMsgs.length) { console.log(`No data for ${teamName}`); return; }

    const aeData = {};
    const scoreRegex = /Call Feedback for (.+?): ([\d.]+)\/10/;
    feedbackMsgs.forEach(m => {
      const match = m.text.match(scoreRegex);
      if (!match) return;
      const [, name, scoreStr] = match;
      if (!memberNames.includes(name)) return;
      const score = parseFloat(scoreStr);
      if (score < 2.5) return;
      if (!aeData[name]) aeData[name] = { scores: [] };
      aeData[name].scores.push(score);
    });

    if (!Object.keys(aeData).length) { console.log(`No external calls for ${teamName}`); return; }

    const allScores = Object.values(aeData).flatMap(d => d.scores);
    const teamAvg = (allScores.reduce((a,b)=>a+b,0)/allScores.length).toFixed(1);
    const totalCalls = allScores.length;

    const aeSummary = Object.entries(aeData)
      .sort(([,a],[,b]) => (b.scores.reduce((s,v)=>s+v,0)/b.scores.length) - (a.scores.reduce((s,v)=>s+v,0)/a.scores.length))
      .map(([name, d]) => {
        const avg = (d.scores.reduce((s,v)=>s+v,0)/d.scores.length).toFixed(1);
        const status = avg >= 7 ? 'Good' : avg >= 5 ? 'Average' : 'At Risk';
        return `${name}: ${d.scores.length} calls | avg ${avg}/10 | ${status} | best: ${Math.max(...d.scores)} | worst: ${Math.min(...d.scores)}`;
      }).join('\n');

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: `You are a sales coaching analyst for CallHippo.
Generate a ${reportType} QA report for the ${teamName} team for Slack.
Period: ${reportLabel} | Total calls: ${totalCalls} | Team avg: ${teamAvg}/10

AE breakdown:
${aeSummary}

Write with sections: 1) 🏆 Team overview 2) 👤 Each AE score + one coaching tip 3) 🔁 Top 3 mistakes 4) ✅ Top 3 strengths 5) 🎯 One priority focus.
Use Slack markdown. Under 400 words.` }]
    });

    const header = `${emoji} *${teamName} Team — ${reportType.charAt(0).toUpperCase()+reportType.slice(1)} QA Report — ${reportLabel}*\n_External calls only · ${totalCalls} calls reviewed_\n\n`;
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: process.env.SLACK_CHANNEL, text: header + response.content[0].text, username: 'CH QA Report Agent', icon_emoji: ':bar_chart:' })
    });
    console.log(`✅ ${teamName} ${reportType} report posted!`);
  } catch(err) { console.error(`❌ ${teamName} ${reportType} failed:`, err); }
}

// 📊 Weekly — Every Monday 10:00 AM IST (04:30 UTC)
cron.schedule('30 4 * * 1', () => { Object.entries(TEAMS).forEach(([team, members]) => generateTeamReport(team, members, 'weekly')); }, { timezone: 'UTC' });

// 📅 Monthly — 1st of month 10:00 AM IST
cron.schedule('30 4 1 * *', () => { Object.entries(TEAMS).forEach(([team, members]) => generateTeamReport(team, members, 'monthly')); }, { timezone: 'UTC' });

// 📈 Quarterly — Jan/Apr/Jul/Oct 1st 10:00 AM IST
cron.schedule('30 4 1 1,4,7,10 *', () => { Object.entries(TEAMS).forEach(([team, members]) => generateTeamReport(team, members, 'quarterly')); }, { timezone: 'UTC' });

console.log('✅ Team QA report crons scheduled: SOHO + SMB + Mid Market');
