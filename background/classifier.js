/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Classifier Dispatcher
 * Routes classification to the active backend with automatic keyword fallback.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const Classifier = {
  async classify(metadata) {
    const settings = await Storage.getAll();
    const backend = settings.aiBackend || "keywords";

    // Keywords run locally — no fallback needed
    if (backend === "keywords") {
      return KeywordClassifier.classify(metadata);
    }

    // AI backends: try primary, fall back to keywords on failure
    try {
      switch (backend) {
        case "claude":
          return await ClaudeClassifier.classify(metadata);
        case "openai":
          return await OpenAIClassifier.classify(metadata);
        case "ollama":
          return await OllamaClassifier.classify(metadata);
        default:
          console.warn(`IncoBills: Unknown backend "${backend}", using keywords`);
          return KeywordClassifier.classify(metadata);
      }
    } catch (err) {
      console.warn(`IncoBills: ${backend} failed, falling back to keywords:`, err.message);
      const result = KeywordClassifier.classify(metadata);
      result.reason = `[fallback] ${result.reason} (${backend} error: ${err.message})`;
      return result;
    }
  },

  async testBackend(backend, options) {
    switch (backend) {
      case "claude":
        return ClaudeClassifier.testConnection(options.apiKey, options.apiUrl);
      case "openai":
        return OpenAIClassifier.testConnection(options.apiKey, options.apiUrl);
      case "ollama":
        return OllamaClassifier.testConnection(options.url, options.model);
      case "keywords":
        return true;
      default:
        throw new Error(`Unknown backend: ${backend}`);
    }
  },
};
