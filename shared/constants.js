/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Shared Constants
 * Loaded first in background script context; globals available to all modules.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const DEFAULTS = {
  enabled: true,
  aiBackend: "keywords",
  claudeApiUrl: "https://api.anthropic.com",
  claudeApiKey: "",
  claudeModel: "claude-haiku-4-5-20251001",
  openaiApiUrl: "https://api.openai.com",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "llama3.2:3b",
  confidenceThreshold: 0.70,
  autoMove: true,
  showNotification: true,
  notifyOnly: false,
  folderName: "Invoices",
  folderMode: "perAccount",
  unifiedAccountId: "",
  mailAction: "move",
  monitoredAccounts: [],
  classificationHistory: [],
  historyMaxEntries: 500,
};

const BODY_MAX_LENGTH = 1000;

const INVOICE_KEYWORDS = {
  subject: [
    "invoice", "factura", "rechnung", "fattura", "facture",
    "bill", "receipt", "payment due", "payment request",
    "amount due", "balance due", "statement", "remittance",
    "proforma", "credit note", "debit note",
    "nota de plata", "bon fiscal", "chitanta",
  ],
  senderPrefixes: [
    "billing", "invoice", "invoices", "accounts", "finance",
    "accounting", "payments", "facturare", "noreply", "no-reply",
  ],
  senderDomains: [
    "billing", "invoice", "payment", "factur",
  ],
  attachmentKeywords: [
    "invoice", "bill", "factura", "receipt", "rechnung",
    "fattura", "facture", "payment", "statement", "nota",
  ],
  body: [
    "total amount", "due date", "payment terms", "bank transfer",
    "invoice number", "invoice #", "invoice no", "inv-", "inv #",
    "bill to", "amount due", "please pay", "net 30", "net 60",
    "net 15", "remittance", "iban", "swift", "bic",
    "subtotal", "sub-total", "vat", "tax amount", "grand total",
    "total due", "balance due", "pay by", "payment due",
    "account number", "routing number", "wire transfer",
    "purchase order", "po number", "billing address",
  ],
  negative: [
    "unsubscribe", "view in browser", "email preferences",
    "notification settings", "manage subscriptions",
    "you are receiving this", "opt out", "opt-out",
  ],
  currencyPatterns: [
    "\\$\\s?[\\d,]+\\.\\d{2}",
    "\u20ac\\s?[\\d,]+[.,]\\d{2}",
    "\u00a3\\s?[\\d,]+\\.\\d{2}",
    "[\\d,.]+\\s?(USD|EUR|GBP|RON|CHF|LEI|HUF|CZK|PLN)",
  ],
};

const CLASSIFICATION_SYSTEM_PROMPT =
  "You classify emails as invoice-related or not. Respond ONLY with valid JSON.";

const CLASSIFICATION_USER_PROMPT = `Classify this email. Is it an invoice, bill, payment request, payment receipt, payment confirmation, subscription charge, or payment reminder?

An email IS invoice-related if it is:
- An invoice or bill for products/services
- A payment request or payment reminder
- A payment receipt or confirmation of payment
- A subscription charge notification with amount
- A credit note or debit note
- A utility/bank statement with amounts due

An email is NOT invoice-related if it is:
- A marketing email or newsletter (even with prices)
- A shipping/delivery notification without invoice
- An order confirmation with no payment details
- A social media or app notification
- General business correspondence

From: {{from}}
Subject: {{subject}}
Attachments: {{attachments}}
Body preview:
{{body}}

Respond with JSON only, no markdown, no explanation:
{"isInvoice": true or false, "confidence": 0.0 to 1.0, "reason": "brief explanation"}`;
