/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * OpenAI API Classifier
 * Uses OpenAI Chat Completions API with gpt-4o-mini.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const OpenAIClassifier = {
  async classify(metadata) {
    const settings = await Storage.getAll();
    if (!settings.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    const baseUrl = (settings.openaiApiUrl || "https://api.openai.com").replace(/\/+$/, "");

    const userPrompt = CLASSIFICATION_USER_PROMPT
      .replace("{{from}}", metadata.from || "unknown")
      .replace("{{subject}}", metadata.subject || "(no subject)")
      .replace("{{attachments}}", (metadata.attachmentNames || []).join(", ") || "none")
      .replace("{{body}}", metadata.bodySnippet || "(empty)");

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.openaiModel || "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0,
        messages: [
          { role: "system", content: CLASSIFICATION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const text =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    return OpenAIClassifier._parseResponse(text);
  },

  _parseResponse(text) {
    try {
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        isInvoice: Boolean(parsed.isInvoice),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reason: String(parsed.reason || ""),
      };
    } catch {
      console.warn("IncoBills: Failed to parse OpenAI response:", text);
      return { isInvoice: false, confidence: 0, reason: "failed to parse AI response" };
    }
  },

  async testConnection(apiKey, apiUrl) {
    const baseUrl = (apiUrl || "https://api.openai.com").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 10,
        messages: [{ role: "user", content: "Reply with: ok" }],
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errorBody}`);
    }
    return true;
  },
};
