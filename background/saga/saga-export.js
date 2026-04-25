/**
 * IncoBills SAGA Export — Main Orchestrator
 *
 * Coordinates the full SAGA export pipeline:
 *   PDF attachment → AI extraction → XML generation → Queue → Download
 *
 * Also manages the sagaQueue CRUD operations.
 */

const SAGAExport = {
  /**
   * Process an email with invoice detection + PDF attachment.
   * This is called from email-monitor.js when an invoice is detected.
   * @param {Object} message — Thunderbird message object
   * @param {Object} classification — IncoBills classification result
   * @returns {Promise<Object|null>} Extracted invoice or null
   */
  async processEmail(message, classification) {
    try {
      // Check if SAGA module is enabled (user has companies configured)
      const companies = await CompanyRegistry.getAll()
      if (companies.length === 0) return null

      // Check settings
      const settingsResult = await browser.storage.local.get(SAGA_STORAGE_KEYS.SETTINGS)
      const sagaSettings = { ...SAGA_DEFAULT_SETTINGS, ...(settingsResult[SAGA_STORAGE_KEYS.SETTINGS] || {}) }
      if (!sagaSettings.autoExtractPDFs) return null

      // Get message attachments
      const attachments = await this.getMessageAttachments(message.id)
      const pdfAttachments = attachments.filter((a) =
        a.contentType === "application/pdf" || a.name?.toLowerCase().endsWith(".pdf")
      )
      if (pdfAttachments.length === 0) return null

      // Get AI backend settings from main settings
      const mainSettings = await Storage.getSettings()
      const backend = mainSettings.aiBackend
      const apiConfig = this.getBackendConfig(mainSettings, backend)

      // Process first PDF attachment
      const pdfAttachment = pdfAttachments[0]
      const pdfFile = await browser.messages.getAttachmentFile(message.id, pdfAttachment.partName)
      const pdfBytes = await pdfFile.arrayBuffer()

      console.log(`[SAGA] Processing PDF attachment for message ${message.id}`)

      // Extract data via AI
      let extractedData
      try {
        extractedData = await PDFExtractor.extract(pdfBytes, backend, apiConfig)
      } catch (err) {
        console.error("[SAGA] PDF extraction failed:", err)
        await this.addToQueue({
          messageId: message.id,
          status: SAGA_QUEUE_STATUS.FAILED,
          error: err.message,
          rawData: null,
          xmlContent: null,
          direction: SAGA_INVOICE_DIRECTION.UNKNOWN,
        })
        return null
      }

      // Check if it's actually an invoice
      if (!extractedData.isInvoice) {
        console.log(`[SAGA] Document is not an invoice: ${extractedData.reason}`)
        await this.addToQueue({
          messageId: message.id,
          status: SAGA_QUEUE_STATUS.NON_INVOICE,
          error: extractedData.reason,
          rawData: extractedData,
          xmlContent: null,
          direction: SAGA_INVOICE_DIRECTION.UNKNOWN,
        })
        return null
      }

      // Determine direction
      const direction = await CompanyRegistry.determineDirection(
        extractedData.furnizorCif,
        extractedData.clientCif
      )

      // Find matching company for XML generation
      const company =
        (await CompanyRegistry.findByCIF(extractedData.furnizorCif)) ||
        (await CompanyRegistry.findByCIF(extractedData.clientCif)) ||
        companies[0]

      // Generate XML
      let xmlResult
      try {
        xmlResult = SAGAXMLGenerator.generate(extractedData, company, direction)
      } catch (err) {
        console.error("[SAGA] XML generation failed:", err)
        await this.addToQueue({
          messageId: message.id,
          status: SAGA_QUEUE_STATUS.FAILED,
          error: err.message,
          rawData: extractedData,
          xmlContent: null,
          direction,
        })
        return null
      }

      // Add to queue
      const queueItem = await this.addToQueue({
        messageId: message.id,
        status: SAGA_QUEUE_STATUS.EXTRACTED,
        error: null,
        rawData: extractedData,
        xmlContent: xmlResult.xml,
        xmlFilename: xmlResult.filename,
        direction,
        needsReview: direction === SAGA_INVOICE_DIRECTION.UNKNOWN,
      })

      console.log(`[SAGA] Invoice queued: ${xmlResult.filename}`)
      return queueItem
    } catch (err) {
      console.error("[SAGA] processEmail failed:", err)
      return null
    }
  },

  /**
   * Get API config for the selected backend.
   */
  getBackendConfig(settings, backend) {
    switch (backend) {
      case "claude":
        return {
          apiUrl: settings.claudeApiUrl || "https://api.anthropic.com",
          apiKey: settings.claudeApiKey,
          model: settings.claudeModel || "claude-3-5-sonnet-20241022",
        }
      case "openai":
        return {
          apiUrl: settings.openaiApiUrl || "https://api.openai.com",
          apiKey: settings.openaiApiKey,
          model: settings.openaiModel || "gpt-4o-mini",
        }
      case "ollama":
        return {
          url: settings.ollamaUrl || "http://127.0.0.1:11434",
          model: settings.ollamaModel || "llama3.2:3b",
        }
      default:
        throw new Error(`Unsupported backend: ${backend}`)
    }
  },

  /**
   * Get attachments for a message.
   */
  async getMessageAttachments(messageId) {
    try {
      // Thunderbird API: messages.listAttachments exists in newer versions
      if (browser.messages.listAttachments) {
        return await browser.messages.listAttachments(messageId)
      }
      // Fallback: parse from message parts
      const full = await browser.messages.getFull(messageId)
      return this.parseAttachmentsFromParts(full.parts || [])
    } catch (err) {
      console.error("[SAGA] Failed to get attachments:", err)
      return []
    }
  },

  /**
   * Recursively parse attachments from message parts.
   */
  parseAttachmentsFromParts(parts) {
    const attachments = []
    for (const part of parts) {
      if (part.attachmentName || part.contentType?.startsWith("application/")) {
        attachments.push({
          partName: part.partName,
          name: part.attachmentName || part.name || "unknown",
          contentType: part.contentType || "application/octet-stream",
          size: part.size || 0,
        })
      }
      if (part.parts) {
        attachments.push(...this.parseAttachmentsFromParts(part.parts))
      }
    }
    return attachments
  },

  // ============================================================
  //  Queue Management
  // ============================================================

  async getQueue() {
    const result = await browser.storage.local.get(SAGA_STORAGE_KEYS.QUEUE)
    return result[SAGA_STORAGE_KEYS.QUEUE] || []
  },

  async addToQueue(item) {
    const queue = await this.getQueue()
    const newItem = {
      id: crypto.randomUUID(),
      extractedAt: new Date().toISOString(),
      exportedAt: null,
      ...item,
    }

    // Check for duplicates: same messageId + same invoice number
    const isDuplicate = queue.some(
      (q) =>
        q.messageId === newItem.messageId &&
        q.rawData?.facturaNumar === newItem.rawData?.facturaNumar
    )
    if (isDuplicate) {
      console.log("[SAGA] Duplicate invoice detected, skipping:", newItem.rawData?.facturaNumar)
      return null
    }

    queue.unshift(newItem) // Most recent first
    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.QUEUE]: queue })
    return newItem
  },

  async updateQueueItem(id, updates) {
    const queue = await this.getQueue()
    const index = queue.findIndex((q) => q.id === id)
    if (index === -1) return null
    queue[index] = { ...queue[index], ...updates }
    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.QUEUE]: queue })
    return queue[index]
  },

  async removeFromQueue(id) {
    const queue = await this.getQueue()
    const filtered = queue.filter((q) => q.id !== id)
    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.QUEUE]: filtered })
    return filtered.length < queue.length
  },

  async clearQueue() {
    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.QUEUE]: [] })
  },

  // ============================================================
  //  Export / Download
  // ============================================================

  /**
   * Export queue items as XML files via browser.downloads.
   * @param {Array<string>} itemIds — IDs to export
   * @returns {Promise<Array>} Download results
   */
  async exportItems(itemIds) {
    const queue = await this.getQueue()
    const items = queue.filter((q) => itemIds.includes(q.id))
    const results = []

    const settingsResult = await browser.storage.local.get(SAGA_STORAGE_KEYS.SETTINGS)
    const settings = { ...SAGA_DEFAULT_SETTINGS, ...(settingsResult[SAGA_STORAGE_KEYS.SETTINGS] || {}) }

    for (const item of items) {
      if (!item.xmlContent) {
        results.push({ id: item.id, success: false, error: "No XML content" })
        continue
      }

      try {
        const blob = new Blob([item.xmlContent], { type: "application/xml" })
        const url = URL.createObjectURL(blob)
        const filename = `${settings.exportSubdirectory}/${item.xmlFilename}`

        const downloadId = await browser.downloads.download({
          url: url,
          filename: filename,
          saveAs: false,
        })

        await this.updateQueueItem(item.id, {
          status: SAGA_QUEUE_STATUS.EXPORTED,
          exportedAt: new Date().toISOString(),
        })

        results.push({ id: item.id, success: true, downloadId, filename })
      } catch (err) {
        results.push({ id: item.id, success: false, error: err.message })
      }
    }

    return results
  },

  /**
   * Export all non-exported items.
   */
  async exportAll() {
    const queue = await this.getQueue()
    const pending = queue
      .filter((q) => q.status !== SAGA_QUEUE_STATUS.EXPORTED)
      .map((q) => q.id)
    return await this.exportItems(pending)
  },

  // ============================================================
  //  Settings
  // ============================================================

  async getSettings() {
    const result = await browser.storage.local.get(SAGA_STORAGE_KEYS.SETTINGS)
    return { ...SAGA_DEFAULT_SETTINGS, ...(result[SAGA_STORAGE_KEYS.SETTINGS] || {}) }
  },

  async saveSettings(settings) {
    await browser.storage.local.set({
      [SAGA_STORAGE_KEYS.SETTINGS]: { ...SAGA_DEFAULT_SETTINGS, ...settings },
    })
  },
}

// Expose for module usage if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SAGAExport }
}
