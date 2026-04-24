/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Ollama Local Classifier
 * Runs classification against a local Ollama instance — fully private, zero cost.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const OllamaClassifier = {
  async classify(metadata) {
    const settings = await Storage.getAll();
    const baseUrl = (settings.ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
    const model = settings.ollamaModel || "llama3.2:3b";

    const prompt = CLASSIFICATION_USER_PROMPT
      .replace("{{from}}", metadata.from || "unknown")
      .replace("{{subject}}", metadata.subject || "(no subject)")
      .replace("{{attachments}}", (metadata.attachmentNames || []).join(", ") || "none")
      .replace("{{body}}", metadata.bodySnippet || "(empty)");

    const fullPrompt = CLASSIFICATION_SYSTEM_PROMPT + "\n\n" + prompt;

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        format: "json",
        options: { temperature: 0 },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    return OllamaClassifier._parseResponse(data.response || "");
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
      console.warn("IncoBills: Failed to parse Ollama response:", text);
      return { isInvoice: false, confidence: 0, reason: "failed to parse AI response" };
    }
  },

  async testConnection(url, model) {
    const baseUrl = (url || "http://localhost:11434").replace(/\/+$/, "");
    let tagsResp;
    try {
      tagsResp = await fetch(`${baseUrl}/api/tags`);
    } catch (err) {
      throw new Error(
        `Cannot reach Ollama at ${baseUrl}. Make sure it's running. ` +
        `If it is, set OLLAMA_ORIGINS="*,moz-extension://*" and restart. ` +
        `Detail: ${err.message}`
      );
    }
    if (tagsResp.status === 403) {
      throw new Error(
        `Ollama returned 403 (CORS blocked). Fix: restart Ollama with:\n` +
        `  PowerShell: $env:OLLAMA_ORIGINS = "*,moz-extension://*"\n` +
        `  CMD: set OLLAMA_ORIGINS=*,moz-extension://*\n` +
        `Then run: ollama serve`
      );
    }
    if (!tagsResp.ok) {
      throw new Error(`Ollama returned ${tagsResp.status} at ${baseUrl}`);
    }
    // Check if the requested model is available
    const tags = await tagsResp.json();
    const models = (tags.models || []).map((m) => m.name);
    if (model && !models.some((m) => m.startsWith(model))) {
      throw new Error(`Model "${model}" not found. Available: ${models.join(", ") || "none"}`);
    }
    return true;
  },
};
