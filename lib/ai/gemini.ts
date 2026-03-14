import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIInsights, UsageData } from './types';

const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const genAI = new GoogleGenerativeAI(apiKey);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildPrompt(data: UsageData): string {
  const topHours = [...new Set(data.blockEventHours)]
    .map(h => `${h}:00`)
    .join(', ') || 'N/A';

  const topDays = [...new Set(data.blockEventDays)]
    .map(d => DAY_NAMES[d])
    .join(', ') || 'N/A';

  const approvalPct = data.unlockRequestCount > 0
    ? `${Math.round(data.unlockApprovalRate * 100)}%`
    : 'N/A (no requests)';

  return `You are an expert digital wellness coach. Analyze this user's Screen Time accountability data and return a JSON object only — no markdown, no explanation.

DATA:
- Locks created: ${data.totalLocksCreated}
- Active locks: ${data.activeLocks}
- Cancelled locks: ${data.cancelledLocks}
- Times blocked in last 30 days: ${data.blockEventsLast30Days}
- Hours of day most often blocked: ${topHours}
- Days of week most often blocked: ${topDays}
- Unlock requests sent: ${data.unlockRequestCount}
- Unlock approval rate: ${approvalPct}
- Average daily time limit configured: ${data.avgDailyMinutes} minutes

RULES:
- Be encouraging, not judgmental
- Be specific to the data
- If data is sparse (e.g. 0 block events), note that insights will improve with more usage
- Keep patterns factual and tips actionable

Return ONLY valid JSON in this exact shape:
{
  "summary": "1-2 sentence overview of their screen time habits",
  "patterns": ["observation 1", "observation 2", "observation 3"],
  "tips": ["tip 1", "tip 2", "tip 3"]
}`;
}

export async function generateInsightsFromData(data: UsageData): Promise<AIInsights> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = buildPrompt(data);

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown code fences if present
  const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: { summary: string; patterns: string[]; tips: string[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.patterns) || !Array.isArray(parsed.tips)) {
    throw new Error('Gemini response missing required fields');
  }

  return {
    summary: parsed.summary,
    patterns: parsed.patterns.slice(0, 3),
    tips: parsed.tips.slice(0, 3),
    generatedAt: Date.now(),
  };
}
