/**
 * IncoBills SAGA Export — Unified PDF Extractor
 *
 * Extracts structured invoice data from PDF attachments using the user's
 * configured AI backend (Claude, OpenAI, or Ollama).
 *
 * Claude & OpenAI: native PDF support (base64 document)
 * Ollama: local text extraction + text prompt (no native PDF support)
 */

const PDFExtractor = {
  /**
   * Main entry point. Extract invoice data from PDF bytes.
   * @param {ArrayBuffer} pdfBytes
   * @param {string} backend - 'claude' | 'openai' | 'ollama'
   * @param {Object} config - API credentials and settings
   * @returns {Promise<Object>} Extracted invoice JSON
   */
  async extract(pdfBytes, backend, config) {
    if (!pdfBytes || pdfBytes.byteLength === 0) {
      throw new Error("PDF bytes are empty")
    }

    switch (backend) {
      case "claude":
        return await this.extractWithClaude(pdfBytes, config)
      case "openai":
        return await this.extractWithOpenAI(pdfBytes, config)
      case "ollama":
        return await this.extractWithOllama(pdfBytes, config)
      default:
        throw new Error(`Unsupported backend: ${backend}`)
    }
  },

  /**
   * Claude 3.5 Sonnet — native PDF support via document type.
   */
  async extractWithClaude(pdfBytes, config) {
    const base64 = this.arrayBufferToBase64(pdfBytes)
    const prompt = this.buildExtractionPrompt()

    const response = await fetch(config.apiUrl + "/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model || "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Claude API error: ${response.status} ${err}`)
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || data.completion || ""
    return this.parseExtractionResponse(content)
  },

  /**
   * OpenAI GPT-4o — PDF support via vision API (base64 image_url).
   * GPT-4o can interpret PDF content when sent as base64 data URL.
   */
  async extractWithOpenAI(pdfBytes, config) {
    const base64 = this.arrayBufferToBase64(pdfBytes)
    const prompt = this.buildExtractionPrompt()

    const response = await fetch(config.apiUrl + "/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || "gpt-4o-mini",
        max_tokens: 4096,
        messages: [
          {
            role: "system",
            content:
              "You are an invoice data extraction assistant. Extract structured data from the provided PDF document and return only valid JSON.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64}`,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${err}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ""
    return this.parseExtractionResponse(content)
  },

  /**
   * Ollama — local text extraction + text prompt.
   * Ollama models do not natively support PDF input.
   * We extract text locally from the PDF, then send to the model.
   */
  async extractWithOllama(pdfBytes, config) {
    // Extract text from PDF locally
    const extractedText = await this.extractTextFromPDF(pdfBytes)

    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error(
        "Could not extract sufficient text from PDF for Ollama processing. " +
          "Consider using Claude or OpenAI backend for PDF invoices."
      )
    }

    const prompt = this.buildExtractionPrompt() +
      "\n\n---\nTEXT EXTRACTED FROM PDF:\n" +
      extractedText.substring(0, 8000) // Limit context window

    const response = await fetch(config.url + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model || "llama3.2:3b",
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 2048,
        },
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Ollama API error: ${response.status} ${err}`)
    }

    const data = await response.json()
    const content = data.response || ""
    return this.parseExtractionResponse(content)
  },

  /**
   * Lightweight PDF text extraction for Ollama backend.
   * Uses basic text stream parsing from PDF bytes.
   * NOTE: For complex PDFs (scanned images, heavy formatting), accuracy is limited.
   * For production use with Ollama, consider bundling pdfjs-dist for better extraction.
   */
  async extractTextFromPDF(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer)
    let text = ""

    // Try to decode as UTF-8 text first
    try {
      const decoder = new TextDecoder("utf-8", { fatal: false })
      const raw = decoder.decode(bytes)

      // Extract text between common PDF text markers
      // Look for text inside parentheses in content streams
      const parenRegex = /\(([^\\()]*(?:\\.[^\\()]*)*)\)/g
      let match
      const found = []
      while ((match = parenRegex.exec(raw)) !== null) {
        const cleaned = match[1]
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\")
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
        if (cleaned.length > 1 && /[a-zA-Z0-9]/.test(cleaned)) {
          found.push(cleaned)
        }
      }

      // Also look for text after /T (Title) and other common tags
      const titleRegex = /\/(?:T|Title|Subject)\s*\(([^)]*)\)/gi
      while ((match = titleRegex.exec(raw)) !== null) {
        if (match[1].length > 1) found.push(match[1])
      }

      text = found.join(" ")
    } catch (e) {
      console.warn("PDF text extraction failed:", e)
    }

    // Fallback: try latin-1 decoding for older PDFs
    if (!text || text.length < 100) {
      try {
        const decoder = new TextDecoder("iso-8859-1", { fatal: false })
        const raw = decoder.decode(bytes)
        const lines = raw
          .split(/[\r\n]+/)
          .map((l) => l.trim())
          .filter((l) => l.length > 3 && /[a-zA-Z]{3,}/.test(l))
        text = lines.join(" ")
      } catch (e) {
        // ignore
      }
    }

    return text
  },

  /**
   * Build the extraction prompt (shared across all backends).
   */
  buildExtractionPrompt() {
    return `Extrage datele din această factură și returnează STRICT un obiect JSON valid cu următoarea structură exactă:

{
  "tipDocument": "factura",
  "furnizorNume": "string",
  "furnizorCif": "string (format ROxxxxxxxx sau xxxxxxxx)",
  "furnizorRegCom": "string",
  "furnizorAdresa": "string",
  "furnizorLocalitate": "string",
  "furnizorJudet": "string",
  "furnizorTara": "RO",
  "furnizorBanca": "string",
  "furnizorIBAN": "string",
  "furnizorTelefon": "string",
  "furnizorMail": "string",
  "clientNume": "string",
  "clientCif": "string (format ROxxxxxxxx sau xxxxxxxx)",
  "clientRegCom": "string",
  "clientAdresa": "string",
  "clientLocalitate": "string",
  "clientJudet": "string",
  "clientTara": "RO",
  "clientBanca": "string",
  "clientIBAN": "string",
  "clientTelefon": "string",
  "clientMail": "string",
  "facturaNumar": "string",
  "facturaData": "YYYY-MM-DD",
  "facturaScadenta": "YYYY-MM-DD",
  "totalFaraTVA": number,
  "totalTVA": number,
  "totalCuTVA": number,
  "moneda": "RON sau EUR sau USD",
  "taxareInversa": false,
  "tvaIncasare": false,
  "linii": [
    {
      "nrCrt": 1,
      "descriere": "string",
      "um": "buc|ore|serviciu|luna|kg|set",
      "cantitate": number,
      "pret": number,
      "valoare": number,
      "procTVA": number,
      "tva": number
    }
  ]
}

REGULI CRITICE:
1. Returnează DOAR JSON valid. Fără text explicativ, fără markdown code blocks.
2. Dacă documentul NU este factură, returnează {"tipDocument": "non-factura", "motiv": "descriere scurtă"}
3. Data întotdeauna în format YYYY-MM-DD.
4. Valorile numerice fără simbol monetar, cu punct ca separator zecimal.
5. CIF-ul fără spații. Dacă e doar numeric, adaugă prefixul RO.
6. Pentru facturi fără linii detaliate (doar total), creează o singură linie generică: descriere="Servicii conform factura", cantitate=1, pret=totalFaraTVA.
7. Dacă un câmp nu poate fi determinat, folosește null sau string gol "".`
  },

  /**
   * Parse the AI response and extract JSON.
   */
  parseExtractionResponse(content) {
    if (!content) {
      throw new Error("Empty response from AI")
    }

    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim()

    // Try to find JSON object boundaries
    const objectMatch = jsonText.match(/\{[\s\S]*\}/)
    const cleanJson = objectMatch ? objectMatch[0] : jsonText

    try {
      const data = JSON.parse(cleanJson)

      // Validate it's an invoice
      if (data.tipDocument === "non-factura") {
        return {
          isInvoice: false,
          reason: data.motiv || "Document is not an invoice",
        }
      }

      // Normalize CIFs
      if (data.furnizorCif && !data.furnizorCif.toUpperCase().startsWith("RO")) {
        data.furnizorCif = "RO" + data.furnizorCif.replace(/\D/g, "")
      }
      if (data.clientCif && !data.clientCif.toUpperCase().startsWith("RO")) {
        data.clientCif = "RO" + data.clientCif.replace(/\D/g, "")
      }

      return {
        isInvoice: true,
        ...data,
      }
    } catch (e) {
      throw new Error(`Failed to parse AI response as JSON: ${e.message}. Raw content: ${content.substring(0, 500)}`)
    }
  },

  /**
   * Convert ArrayBuffer to base64 string.
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ""
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  },
}

// Expose for module usage if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = { PDFExtractor }
}
