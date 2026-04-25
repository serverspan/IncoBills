/**
 * IncoBills SAGA Export — XML Generator
 *
 * Converts extracted invoice JSON data into valid SAGA XML format.
 * Handles direction (Intrări/Ieșiri), company mapping, and proper escaping.
 */

const SAGAXMLGenerator = {
  /**
   * Generate SAGA XML from extracted invoice data and company registry.
   * @param {Object} extractedData — JSON from PDFExtractor
   * @param {Object} company — Company from registry (the user's company)
   * @param {string} direction — 'intrari' | 'iesiri'
   * @returns {Object} { xml: string, filename: string }
   */
  generate(extractedData, company, direction) {
    if (!extractedData || !extractedData.isInvoice) {
      throw new Error("Invalid or non-invoice data provided")
    }

    const d = extractedData
    const isIesiri = direction === SAGA_INVOICE_DIRECTION.IESIRI

    // Determine furnizor and client based on direction
    const furnizor = isIesiri ? company : this.mapPartyToSaga(d, "furnizor")
    const client = isIesiri ? this.mapPartyToSaga(d, "client") : company

    // Build XML
    let xml = SAGA_XML_TEMPLATE.XML_HEADER + "\n"
    xml += SAGA_XML_TEMPLATE.ROOT_OPEN + "\n"
    xml += SAGA_XML_TEMPLATE.INVOICE_OPEN + "\n"

    // Antet
    xml += this.buildAntet(furnizor, client, d)

    // Detalii
    xml += this.buildDetalii(d.linii || [], d)

    xml += SAGA_XML_TEMPLATE.INVOICE_CLOSE + "\n"
    xml += SAGA_XML_TEMPLATE.ROOT_CLOSE + "\n"

    // Validate XML is well-formed
    this.validateXML(xml)

    // Generate filename
    const cifForFilename = (company.cif || "UNKNOWN").replace(/[^a-zA-Z0-9]/g, "")
    const numarForFilename = (d.facturaNumar || "UNKNOWN").replace(/[^a-zA-Z0-9_-]/g, "_")
    const dataForFilename = (d.facturaData || "0000-00-00").replace(/-/g, "")
    const filename = `F_${cifForFilename}_${numarForFilename}_${dataForFilename}.xml`

    return { xml, filename }
  },

  /**
   * Build the Antet section of SAGA XML.
   */
  buildAntet(furnizor, client, d) {
    let xml = "    <Antet>\n"

    // Furnizor
    xml += this.buildPartyXml(furnizor, "Furnizor")

    // Client
    xml += this.buildPartyXml(client, "Client")

    // Factura details
    xml += this.buildTag("FacturaNumar", d.facturaNumar)
    xml += this.buildTag("FacturaData", d.facturaData)
    xml += this.buildTag("FacturaScadenta", d.facturaScadenta || d.facturaData)
    xml += this.buildTag("FacturaTaxareInversa", d.taxareInversa ? "Da" : "Nu")
    xml += this.buildTag("FacturaTVAIncasare", d.tvaIncasare ? "Da" : "Nu")
    xml += this.buildTag("FacturaInformatiiSuplimentare", "Importat prin IncoBills")
    xml += this.buildTag("FacturaMoneda", d.moneda && d.moneda !== "RON" ? d.moneda : "")
    xml += this.buildTag("FacturaGreutate", "0")
    xml += this.buildTag("FacturaAccize", "")
    xml += this.buildTag("FacturaIndexSPV", "")
    xml += this.buildTag("FacturaIndexDescarcareSPV", "")
    xml += this.buildTag("Cod", "")

    xml += "    </Antet>\n"
    return xml
  },

  /**
   * Build party (Furnizor/Client) XML tags.
   */
  buildPartyXml(party, prefix) {
    let xml = ""
    xml += this.buildTag(`${prefix}Nume`, party.name)
    xml += this.buildTag(`${prefix}CIF`, party.cif)
    xml += this.buildTag(`${prefix}NrRegCom`, party.regCom)
    xml += this.buildTag(`${prefix}Capital`, party.capital)
    xml += this.buildTag(`${prefix}Tara`, party.country || "RO")
    xml += this.buildTag(`${prefix}Localitate`, party.city)
    xml += this.buildTag(`${prefix}Judet`, party.county)
    xml += this.buildTag(`${prefix}Adresa`, party.address)
    xml += this.buildTag(`${prefix}Telefon`, party.phone)
    xml += this.buildTag(`${prefix}Mail`, party.email)
    xml += this.buildTag(`${prefix}Banca`, party.bank)
    xml += this.buildTag(`${prefix}IBAN`, party.iban)
    xml += this.buildTag(`${prefix}InformatiiSuplimentare`, "")
    return xml
  },

  /**
   * Build Detalii section with line items.
   */
  buildDetalii(linii, d) {
    let xml = "    <Detalii>\n"
    xml += "      <Continut>\n"

    if (!linii || linii.length === 0) {
      // Fallback single line for invoices without details
      const totalFaraTVA = parseFloat(d.totalFaraTVA) || 0
      const totalTVA = parseFloat(d.totalTVA) || 0
      xml += this.buildLinie({
        nrCrt: 1,
        descriere: "Servicii conform factura",
        um: "serviciu",
        cantitate: 1,
        pret: totalFaraTVA,
        valoare: totalFaraTVA,
        procTVA: totalFaraTVA > 0 ? Math.round((totalTVA / totalFaraTVA) * 100) : 19,
        tva: totalTVA,
      })
    } else {
      linii.forEach((linie, index) => {
        xml += this.buildLinie({
          nrCrt: linie.nrCrt || index + 1,
          descriere: linie.descriere || "Servicii",
          um: linie.um || "buc",
          cantitate: parseFloat(linie.cantitate) || 1,
          pret: parseFloat(linie.pret) || 0,
          valoare: parseFloat(linie.valoare) || 0,
          procTVA: parseFloat(linie.procTVA) || 19,
          tva: parseFloat(linie.tva) || 0,
        })
      })
    }

    xml += "      </Continut>\n"
    xml += "    </Detalii>\n"
    return xml
  },

  /**
   * Build a single Linie XML block.
   */
  buildLinie(linie) {
    let xml = "        <Linie>\n"
    xml += this.buildTag("LinieNrCrt", linie.nrCrt.toString())
    xml += this.buildTag("Gestiune", "")
    xml += this.buildTag("Activitate", "")
    xml += this.buildTag("Descriere", linie.descriere)
    xml += this.buildTag("CodArticolFurnizor", "")
    xml += this.buildTag("CodArticolClient", "")
    xml += this.buildTag("GUID_cod_articol", "")
    xml += this.buildTag("CodBare", "")
    xml += this.buildTag("InformatiiSuplimentare", "")
    xml += this.buildTag("UM", linie.um)
    xml += this.buildTag("Cantitate", this.formatNumber(linie.cantitate))
    xml += this.buildTag("Pret", this.formatNumber(linie.pret))
    xml += this.buildTag("Valoare", this.formatNumber(linie.valoare))
    xml += this.buildTag("ProcTVA", linie.procTVA.toString())
    xml += this.buildTag("TVA", this.formatNumber(linie.tva))
    xml += this.buildTag("Cont", "")
    xml += this.buildTag("TipDeducere", "")
    xml += this.buildTag("PretVanzare", "")
    xml += "        </Linie>\n"
    return xml
  },

  /**
   * Build a single XML tag with proper escaping.
   */
  buildTag(tagName, value) {
    const safeValue = this.escapeXml(value || "")
    return `      <${tagName}>${safeValue}</${tagName}>\n`
  },

  /**
   * Escape XML special characters.
   */
  escapeXml(text) {
    if (text == null) return ""
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  },

  /**
   * Format number for XML (2 decimals, dot separator).
   */
  formatNumber(num) {
    const parsed = parseFloat(num)
    if (isNaN(parsed)) return "0.00"
    return parsed.toFixed(2)
  },

  /**
   * Map extracted party data to saga format.
   */
  mapPartyToSaga(data, prefix) {
    return {
      name: data[`${prefix}Nume`] || "",
      cif: data[`${prefix}Cif`] || "",
      regCom: data[`${prefix}RegCom`] || "",
      address: data[`${prefix}Adresa`] || "",
      city: data[`${prefix}Localitate`] || "",
      county: data[`${prefix}Judet`] || "",
      country: data[`${prefix}Tara`] || "RO",
      bank: data[`${prefix}Banca`] || "",
      iban: data[`${prefix}IBAN`] || "",
      phone: data[`${prefix}Telefon`] || "",
      email: data[`${prefix}Mail`] || "",
      capital: "0",
    }
  },

  /**
   * Validate that generated string is well-formed XML.
   * Uses DOMParser available in Thunderbird extension context.
   */
  validateXML(xmlString) {
    if (typeof DOMParser === "undefined") {
      // In background script context without DOMParser, skip validation
      return true
    }
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlString, "application/xml")
    const errorNode = doc.querySelector("parsererror")
    if (errorNode) {
      throw new Error(`Generated XML is invalid: ${errorNode.textContent}`)
    }
    return true
  },
}

// Expose for module usage if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = { SAGAXMLGenerator }
}
