/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Keyword Heuristic Classifier
 * Zero-dependency fallback that scores emails against known invoice signals.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const KeywordClassifier = {
  classify(metadata) {
    let score = 0;
    const reasons = [];
    const subjectLower = (metadata.subject || "").toLowerCase();
    const fromLower = (metadata.from || "").toLowerCase();
    const bodyLower = (metadata.bodySnippet || "").toLowerCase();

    // --- Subject keywords (0.25 each, cap 0.5) ---
    let subjectHits = 0;
    for (const kw of INVOICE_KEYWORDS.subject) {
      if (subjectLower.includes(kw)) {
        subjectHits++;
        if (reasons.length < 5) reasons.push(`subject: "${kw}"`);
      }
    }
    score += Math.min(subjectHits * 0.25, 0.5);

    // --- Sender prefix patterns (0.15 each, cap 0.3) ---
    let senderHits = 0;
    const senderLocal = fromLower.split("@")[0] || "";
    const senderDomain = fromLower.split("@")[1] || "";

    for (const prefix of INVOICE_KEYWORDS.senderPrefixes) {
      if (senderLocal.includes(prefix)) {
        senderHits++;
        if (reasons.length < 5) reasons.push(`sender local: "${prefix}"`);
      }
    }
    for (const domKw of INVOICE_KEYWORDS.senderDomains) {
      if (senderDomain.includes(domKw)) {
        senderHits++;
        if (reasons.length < 5) reasons.push(`sender domain: "${domKw}"`);
      }
    }
    score += Math.min(senderHits * 0.15, 0.3);

    // --- Attachment signals (0.3 per matching doc) ---
    for (const att of metadata.attachmentNames || []) {
      const attLower = att.toLowerCase();
      if (/\.(pdf|xlsx?|docx?|odt|ods|csv)$/i.test(att)) {
        for (const kw of INVOICE_KEYWORDS.attachmentKeywords) {
          if (attLower.includes(kw)) {
            score += 0.3;
            if (reasons.length < 5) reasons.push(`attachment: "${att}"`);
            break; // one hit per attachment
          }
        }
      }
    }

    // --- Body keywords (0.1 each, cap 0.3) ---
    let bodyHits = 0;
    for (const kw of INVOICE_KEYWORDS.body) {
      if (bodyLower.includes(kw)) {
        bodyHits++;
        if (reasons.length < 5) reasons.push(`body: "${kw}"`);
      }
    }
    score += Math.min(bodyHits * 0.1, 0.3);

    // --- Currency patterns in body (0.15 once) ---
    for (const pattern of INVOICE_KEYWORDS.currencyPatterns) {
      if (new RegExp(pattern, "i").test(metadata.bodySnippet || "")) {
        score += 0.15;
        if (reasons.length < 5) reasons.push("currency amount in body");
        break;
      }
    }

    // --- Negative signals (-0.2 each) ---
    for (const neg of INVOICE_KEYWORDS.negative) {
      if (bodyLower.includes(neg)) {
        score -= 0.2;
      }
    }

    const confidence = Math.max(0, Math.min(1, score));
    return {
      isInvoice: confidence > 0,
      confidence,
      reason: reasons.join("; ") || "no invoice signals detected",
    };
  },
};
