/**
 * IncoBills SAGA Export — Company Registry
 *
 * CRUD operations for managing companies in browser.storage.local.
 * Each company maps a business name to its fiscal data for SAGA XML generation.
 */

const CompanyRegistry = {
  /**
   * Get all registered companies.
   * @returns {Promise<Array>}
   */
  async getAll() {
    const result = await browser.storage.local.get(SAGA_STORAGE_KEYS.COMPANIES)
    return result[SAGA_STORAGE_KEYS.COMPANIES] || []
  },

  /**
   * Get a single company by ID.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const companies = await this.getAll()
    return companies.find((c) => c.id === id) || null
  },

  /**
   * Find company by CIF (case-insensitive).
   * @param {string} cif
   * @returns {Promise<Object|null>}
   */
  async findByCIF(cif) {
    if (!cif) return null
    const companies = await this.getAll()
    const normalized = cif.toUpperCase().trim()
    return companies.find((c) => c.cif.toUpperCase().trim() === normalized) || null
  },

  /**
   * Find company by name (fuzzy match for PDF extraction).
   * Tries exact match first, then partial.
   * @param {string} name
   * @returns {Promise<Object|null>}
   */
  async findByName(name) {
    if (!name) return null
    const companies = await this.getAll()
    const normalized = name.toLowerCase().trim()

    // Exact match
    let match = companies.find((c) => c.name.toLowerCase().trim() === normalized)
    if (match) return match

    // Partial match: company name appears in the text
    match = companies.find((c) => normalized.includes(c.name.toLowerCase().trim()))
    if (match) return match

    // Reverse partial: text appears in company name
    match = companies.find((c) => c.name.toLowerCase().trim().includes(normalized))
    return match || null
  },

  /**
   * Determine invoice direction based on CIF matching.
   * @param {string} furnizorCif
   * @param {string} clientCif
   * @returns {Promise<string>} intrari | iesiri | unknown
   */
  async determineDirection(furnizorCif, clientCif) {
    const furnizor = await this.findByCIF(furnizorCif)
    const client = await this.findByCIF(clientCif)

    if (furnizor) return SAGA_INVOICE_DIRECTION.IESIRI
    if (client) return SAGA_INVOICE_DIRECTION.INTRARI
    return SAGA_INVOICE_DIRECTION.UNKNOWN
  },

  /**
   * Add a new company.
   * @param {Object} company
   * @returns {Promise<Object>} The saved company with generated ID
   */
  async add(company) {
    const validated = this.validate(company)
    if (!validated.valid) {
      throw new Error(`Validation failed: ${validated.errors.join(", ")}`)
    }

    const companies = await this.getAll()
    const newCompany = {
      ...SAGA_COMPANY_TEMPLATE,
      ...company,
      id: company.id || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }

    // Prevent duplicate CIF
    const existing = await this.findByCIF(newCompany.cif)
    if (existing) {
      throw new Error(`Company with CIF ${newCompany.cif} already exists`)
    }

    companies.push(newCompany)
    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.COMPANIES]: companies })
    return newCompany
  },

  /**
   * Update an existing company.
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(id, updates) {
    const companies = await this.getAll()
    const index = companies.findIndex((c) => c.id === id)
    if (index === -1) {
      throw new Error(`Company with ID ${id} not found`)
    }

    const updated = { ...companies[index], ...updates, id }
    const validated = this.validate(updated)
    if (!validated.valid) {
      throw new Error(`Validation failed: ${validated.errors.join(", ")}`)
    }

    companies[index] = updated
    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.COMPANIES]: companies })
    return updated
  },

  /**
   * Delete a company by ID.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const companies = await this.getAll()
    const filtered = companies.filter((c) => c.id !== id)
    if (filtered.length === companies.length) return false

    await browser.storage.local.set({ [SAGA_STORAGE_KEYS.COMPANIES]: filtered })
    return true
  },

  /**
   * Validate company data.
   * @param {Object} company
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate(company) {
    const errors = []

    if (!company.name || company.name.trim().length === 0) {
      errors.push("Company name is required")
    }
    if (!company.cif || company.cif.trim().length === 0) {
      errors.push("CIF is required")
    }
    if (!company.regCom || company.regCom.trim().length === 0) {
      errors.push("Registrul Comertului is required")
    }
    if (!company.address || company.address.trim().length === 0) {
      errors.push("Address is required")
    }
    if (!company.city || company.city.trim().length === 0) {
      errors.push("City is required")
    }
    if (!company.county || company.county.trim().length === 0) {
      errors.push("County is required")
    }
    if (!company.country || company.country.trim().length === 0) {
      errors.push("Country is required")
    }
    if (!company.bank || company.bank.trim().length === 0) {
      errors.push("Bank is required")
    }
    if (!company.iban || company.iban.trim().length === 0) {
      errors.push("IBAN is required")
    }
    if (!company.phone || company.phone.trim().length === 0) {
      errors.push("Phone is required")
    }
    if (!company.email || company.email.trim().length === 0) {
      errors.push("Email is required")
    }
    if (!company.capital || company.capital.toString().trim().length === 0) {
      errors.push("Capital is required")
    }

    return { valid: errors.length === 0, errors }
  },
}

// Expose for module usage if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CompanyRegistry }
}
