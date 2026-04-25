/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Email Monitor
 * Listens for new mail, extracts metadata, triggers classification + move.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const EmailMonitor = {
  async handleNewMail(folder, messages) {
    const settings = await Storage.getAll();
    if (!settings.enabled) return;

    // Skip accounts the user chose not to monitor
    if (
      settings.monitoredAccounts.length > 0 &&
      !settings.monitoredAccounts.includes(folder.accountId)
    ) {
      return;
    }

    const moved = [];

    for (const message of messages.messages) {
      try {
        // Skip already-processed messages
        if (await History.isProcessed(message.id)) continue;

        // Extract email metadata
        const metadata = await this.extractMetadata(message);

        // Classify
        const classification = await Classifier.classify(metadata);

        // Decide action
        let action = "skipped";
        const isMatch =
          classification.isInvoice &&
          classification.confidence >= settings.confidenceThreshold;

        if (isMatch) {
          if (settings.autoMove && !settings.notifyOnly) {
            try {
              action = await FolderManager.moveToInvoices(message.id, folder.accountId, message.date);
              moved.push(message);
            } catch (moveErr) {
              console.error("IncoBills: Move/copy failed for", message.id, moveErr.message);
              action = "move_failed";
            }
          } else {
            action = "flagged";
          }

          // Trigger SAGA PDF extraction (async, non-blocking)
          try {
            if (typeof SAGAExport !== "undefined") {
              SAGAExport.processEmail(message, classification).catch((err) =>
                console.error("[SAGA] Processing failed:", err)
              );
            }
          } catch (sagaErr) {
            console.error("[SAGA] Error triggering export:", sagaErr);
          }
        }

        // Log to history
        await History.log({
          messageId: message.id,
          from: message.author,
          subject: message.subject,
          accountId: folder.accountId,
          classification,
          backend: settings.aiBackend,
          action,
          userOverride: null,
        });

        // Per-message notification (only for single detections)
        if (isMatch && settings.showNotification && moved.length <= 1) {
          await browser.notifications.create(`incobills-${message.id}`, {
            type: "basic",
            iconUrl: "icons/icon-96.svg",
            title: "IncoBills \u2014 Invoice Detected",
            message: `${message.author}\n${message.subject}`,
          });
        }
      } catch (err) {
        console.error("IncoBills: Error processing message", message.id, err);
      }
    }

    // Batch notification if many invoices arrived at once
    if (moved.length > 1) {
      await browser.notifications.create("incobills-batch-" + Date.now(), {
        type: "basic",
        iconUrl: "icons/icon-96.svg",
        title: "IncoBills",
        message: `${moved.length} invoices detected and moved to Invoices folder.`,
      });
    }
  },

  // ---- Metadata extraction ----

  async extractMetadata(message) {
    const full = await browser.messages.getFull(message.id);
    const bodyText = this.extractBodyText(full);
    const attachmentNames = this.extractAttachmentNames(full);

    return {
      subject: message.subject || "",
      from: message.author || "",
      date: message.date,
      bodySnippet: bodyText.substring(0, BODY_MAX_LENGTH),
      attachmentNames,
    };
  },

  extractBodyText(part) {
    if (!part) return "";

    // Leaf node with content
    if (part.contentType === "text/plain" && part.body) {
      return part.body;
    }
    if (part.contentType === "text/html" && part.body) {
      return this.stripHtml(part.body);
    }

    // Multipart: prefer text/plain, recurse otherwise
    if (part.parts && part.parts.length > 0) {
      // First pass: look for text/plain at this level
      for (const sub of part.parts) {
        if (sub.contentType === "text/plain" && sub.body) {
          return sub.body;
        }
      }
      // Second pass: recurse into children
      for (const sub of part.parts) {
        const result = this.extractBodyText(sub);
        if (result) return result;
      }
    }

    return "";
  },

  extractAttachmentNames(part) {
    const names = [];
    if (!part) return names;

    // Check this part for attachment disposition
    if (part.headers) {
      const disposition = part.headers["content-disposition"];
      const dispValue = Array.isArray(disposition) ? disposition[0] : disposition;
      if (dispValue && dispValue.toLowerCase().includes("attachment")) {
        const match = dispValue.match(
          /filename\*?=(?:UTF-8''|"?)([^";]+)"?/i
        );
        if (match) {
          names.push(decodeURIComponent(match[1].trim()));
        }
      }
    }

    // Recurse into sub-parts
    if (part.parts) {
      for (const sub of part.parts) {
        names.push(...this.extractAttachmentNames(sub));
      }
    }

    return names;
  },

  stripHtml(html) {
    // Background scripts have no DOM; use regex-based stripping
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  },

  // ---- Scan existing emails (triggered from options page) ----

  async scanExisting(accountId, fromDate, toDate, progressCallback) {
    const settings = await Storage.getAll();
    const queryOpts = { accountId };
    if (fromDate) queryOpts.fromDate = new Date(fromDate);
    if (toDate) queryOpts.toDate = new Date(toDate);

    let page = await browser.messages.query(queryOpts);
    const allMessages = [...page.messages];
    while (page.id) {
      page = await browser.messages.continueList(page.id);
      allMessages.push(...page.messages);
    }

    let processed = 0;
    let found = 0;

    for (const message of allMessages) {
      if (await History.isProcessed(message.id)) {
        processed++;
        continue;
      }

      try {
        const metadata = await this.extractMetadata(message);
        const classification = await Classifier.classify(metadata);

        let action = "skipped";
        if (
          classification.isInvoice &&
          classification.confidence >= settings.confidenceThreshold
        ) {
          if (settings.autoMove && !settings.notifyOnly) {
            const msgDetail = await browser.messages.get(message.id);
            const moveAcctId = msgDetail.folder ? msgDetail.folder.accountId : accountId;
            try {
              action = await FolderManager.moveToInvoices(message.id, moveAcctId, message.date);
            } catch (moveErr) {
              console.error("IncoBills: Move failed for", message.id, moveErr.message);
              action = "move_failed";
            }
          } else {
            action = "flagged";
          }
          found++;

          // Trigger SAGA PDF extraction for retroactive scans (async, non-blocking)
          try {
            if (typeof SAGAExport !== "undefined") {
              SAGAExport.processEmail(message, classification).catch((err) =>
                console.error("[SAGA] Retroactive processing failed:", err)
              );
            }
          } catch (sagaErr) {
            console.error("[SAGA] Error triggering retroactive export:", sagaErr);
          }
        }

        await History.log({
          messageId: message.id,
          from: message.author,
          subject: message.subject,
          accountId,
          classification,
          backend: settings.aiBackend,
          action,
          userOverride: null,
        });
      } catch (err) {
        console.error("IncoBills: Error scanning message", message.id, err);
        await History.log({
          messageId: message.id,
          from: message.author || "",
          subject: message.subject || "",
          accountId,
          classification: { isInvoice: false, confidence: 0, reason: "scan error" },
          backend: settings.aiBackend,
          action: "error",
          userOverride: null,
        });
      }

      processed++;

      if (progressCallback) {
        progressCallback({ processed, total: allMessages.length, found });
      }
    }

    return { processed, total: allMessages.length, found };
  },
};
