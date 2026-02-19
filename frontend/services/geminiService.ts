import { AggregatedData } from "../types";

export class AIService {
  /**
   * Generates insights from aggregated survey data using OpenRouter.
   */
  async generateInsights(data: AggregatedData): Promise<string> {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    
    if (!apiKey) {
      return "OpenRouter API key not configured. Please set VITE_OPENROUTER_API_KEY in your .env.local file.";
    }
    
    const prompt = `
      Analyze the following college feedback summary data and provide a concise, professional executive summary with 3 key strengths, 3 areas for improvement, and a strategic recommendation for the Dean.
      
      Summary Stats:
      - Total Responses: ${data.totalResponses}
      - Overall Average Rating: ${data.averageRating}/5
      
      Department Performances:
      ${data.departmentWise.map(d => `- ${d.name}: ${d.score} average (${d.count} responses)`).join('\n')}
      
      Top Question Scores:
      ${data.questionScores.map(q => `- ${q.question}: ${q.score}/5`).join('\n')}
      
      Provide the response in structured Markdown format.
    `;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "MRU Feedback Data Filter Tool"
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
      }

      const result = await response.json();
      return result.choices?.[0]?.message?.content || "Could not generate insights at this time.";
    } catch (error) {
      console.error("OpenRouter Error:", error);
      return "AI analysis unavailable. Please check your API configuration.";
    }
  }
}

export const geminiService = new AIService();
