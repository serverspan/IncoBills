/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Claude API Classifier
 * Uses Anthropic Messages API with Haiku for fast, cheap classification.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const ClaudeClassifier = {
  async classify(metadata) {
    const settings = await Storage.getAll();
    if (!settings.claudeApiKey) {
      throw new Error("Claude API key not configured");
    }

    const baseUrl = (settings.claudeApiUrl || "https://api.anthropic.com").replace(/\/+$/, "");

    const userPrompt = CLASSIFICATION_USER_PROMPT
      .replace("{{from}}", metadata.from || "unknown")
      .replace("{{subject}}", metadata.subject || "(no subject)")
      .replace("{{attachments}}", (metadata.attachmentNames || []).join(", ") || "none")
      .replace("{{body}}", metadata.bodySnippet || "(empty)");

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": settings.claudeApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: settings.claudeModel || "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: CLASSIFICATION_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";
    return ClaudeClassifier._parseResponse(text);
  },

  _parseResponse(text) {
    try {
      // Strip markdown code fences if the model wraps its response
      const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        isInvoice: Boolean(parsed.isInvoice),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reason: String(parsed.reason || ""),
      };
    } catch {
      console.warn("IncoBills: Failed to parse Claude response:", text);
      return { isInvoice: false, confidence: 0, reason: "failed to parse AI response" };
    }
  },

  async testConnection(apiKey, apiUrl) {
    const baseUrl = (apiUrl || "https://api.anthropic.com").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Reply with: ok" }],
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API ${response.status}: ${errorBody}`);
    }
    return true;
  },
};
