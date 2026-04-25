/**
 * IncoBills SAGA Export — Constants
 *
 * Shared constants for the SAGA XML export module.
 */

const SAGA_STORAGE_KEYS = {
  COMPANIES: "sagaCompanies",
  QUEUE: "sagaQueue",
  SETTINGS: "sagaSettings",
}

const SAGA_DEFAULT_SETTINGS = {
  exportSubdirectory: "SAGA-Import",
  defaultCurrency: "RON",
  defaultTVARate: 19,
  autoExtractPDFs: true,
  skipNonInvoices: true,
}

const SAGA_COMPANY_TEMPLATE = {
  id: "",
  name: "",
  cif: "",
  regCom: "",
  address: "",
  city: "",
  county: "B",
  country: "RO",
  bank: "",
  iban: "",
  phone: "",
  email: "",
  capital: "",
}

const SAGA_COUNTY_CODES = {
  Alba: "AB",
  Arad: "AR",
  Arges: "AG",
  Bacau: "BC",
  Bihor: "BH",
  BistritaNasaud: "BN",
  Botosani: "BT",
  Brasov: "BV",
  Braila: "BR",
  Bucuresti: "B",
  Buzau: "BZ",
  CarasSeverin: "CS",
  Calarasi: "CL",
  Cluj: "CJ",
  Constanta: "CT",
  Covasna: "CV",
  Dambovita: "DB",
  Dolj: "DJ",
  Galati: "GL",
  Giurgiu: "GR",
  Gorj: "GJ",
  Harghita: "HR",
  Hunedoara: "HD",
  Ialomita: "IL",
  Iasi: "IS",
  Ilfov: "IF",
  Maramures: "MM",
  Mehedinti: "MH",
  Mures: "MS",
  Neamt: "NT",
  Olt: "OT",
  Prahova: "PH",
  SatuMare: "SM",
  Salaj: "SJ",
  Sibiu: "SB",
  Suceava: "SV",
  Teleorman: "TR",
  Timis: "TM",
  Tulcea: "TL",
  Vaslui: "VS",
  Valcea: "VL",
  Vrancea: "VN",
}

const SAGA_QUEUE_STATUS = {
  EXTRACTED: "extracted",
  REVIEWED: "reviewed",
  EXPORTED: "exported",
  FAILED: "extragereEsuata",
  NON_INVOICE: "nonFactura",
}

const SAGA_INVOICE_DIRECTION = {
  INTRARI: "intrari",
  IESIRI: "iesiri",
  UNKNOWN: "unknown",
}

const SAGA_XML_TEMPLATE = {
  XML_HEADER: '<?xml version="1.0" encoding="UTF-8"?>',
  ROOT_OPEN: "<Facturi>",
  ROOT_CLOSE: "</Facturi>",
  INVOICE_OPEN: "  <Factura>",
  INVOICE_CLOSE: "  </Factura>",
}

// Expose for background scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SAGA_STORAGE_KEYS,
    SAGA_DEFAULT_SETTINGS,
    SAGA_COMPANY_TEMPLATE,
    SAGA_COUNTY_CODES,
    SAGA_QUEUE_STATUS,
    SAGA_INVOICE_DIRECTION,
    SAGA_XML_TEMPLATE,
  }
}
