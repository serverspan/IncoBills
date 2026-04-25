# IncoBills SAGA Export — Design Document

**Date:** 2026-04-25
**Status:** Design validat, gata pentru implementare
**Autor:** Design explorat cu proprietarul proiectului

---

## 1. Overview

Modul opțional **SAGA Export** integrat în IncoBills. Extrage date din atașamente PDF ale facturilor detectate, le convertește în format XML importabil în softul de contabilitate SAGA (sagasoft.ro), și le exportă pentru import.

**Public țintă:** Business owners din România care folosesc SAGA.
**Separare:** Modul complet izolat — tab separat în popup, secțiune separată în Options. Nu afectează utilizatorii non-RO.

---

## 2. Arhitectură & Flux de Date

```
Email cu factură detectată de IncoBills
           │
           ▼
   Are atașament PDF?
       │         │
      DA         NU
       │         │
       ▼         ▼
 Descarcă PDF   Skip
       │
       ▼
 Trimite la Claude 3.5 Sonnet
 (base64 PDF + prompt structurat)
       │
       ▼
 Primește JSON cu date factură
       │
       ▼
 Compară CIF-uri cu Company Registry
       │
       ▼
 Determină direcția: Intrări / Ieșiri
       │
       ▼
 Generează XML SAGA conform schemei
       │
       ▼
 Salvează în sagaQueue (storage.local)
       │
       ▼
 Utilizatorul review-ează în tab-ul SAGA
       │
       ▼
 Exportă XML prin browser.downloads
       │
       ▼
 Fișier salvat în Downloads/SAGA-Import/
```

---

## 3. Company Registry

Stocat în `browser.storage.local` sub cheia `sagaCompanies`.

```javascript
{
  "id": "uuid",
  "name": "MyCompany SRL",
  "cif": "RO12345678",
  "regCom": "J40/1234/2020",
  "address": "Str. Exemplu 1",
  "city": "Bucuresti",
  "county": "B",
  "country": "RO",
  "bank": "Banca Transilvania",
  "iban": "RO49AAAA...",
  "phone": "0712345678",
  "email": "contact@mycompany.ro",
  "capital": "200"
}
```

**UI:** Secțiune "Firmele Mele" în Options → SAGA. Formular cu toate câmpurile obligatorii pentru XML SAGA.

---

## 4. AI Prompting (Claude 3.5 Sonnet)

### Trimitere PDF

```javascript
{
  type: "document",
  source: {
    type: "base64",
    media_type: "application/pdf",
    data: "<base64-pdf-content>"
  }
}
```

### Prompt Structură

```
Extrage datele din această factură și returnează strict JSON valid cu structura:

{
  "furnizorNume": "string",
  "furnizorCif": "string",
  "furnizorRegCom": "string",
  "furnizorAdresa": "string",
  "clientNume": "string",
  "clientCif": "string",
  "facturaNumar": "string",
  "facturaData": "YYYY-MM-DD",
  "facturaScadenta": "YYYY-MM-DD",
  "totalFaraTVA": number,
  "totalTVA": number,
  "moneda": "RON",
  "taxareInversa": false,
  "tvaIncasare": false,
  "linii": [
    {
      "nrCrt": 1,
      "descriere": "string",
      "um": "buc",
      "cantitate": number,
      "pret": number,
      "valoare": number,
      "tva": number
    }
  ]
}

Reguli:
- Dacă un câmp nu există în factură, folosește null
- Data întotdeauna în format YYYY-MM-DD
- Valorile numerice fără simbol monetar
- TVA-ul pe linie = valoare * procent TVA
```

### Validare Răspuns

- `JSON.parse()` strict
- Verificare câmpuri obligatorii: `furnizorNume`, `furnizorCif`, `clientNume`, `facturaNumar`, `facturaData`
- Fallback: dacă parsing eșuează → status `extragereEsuata`, utilizator reîncearcă manual

---

## 5. XML SAGA — Generare

### Structură Generală

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Facturi>
  <Factura>
    <Antet>
      <!-- Furnizor -->
      <!-- Client -->
      <!-- Detalii factură -->
    </Antet>
    <Detalii>
      <Continut>
        <!-- Linii -->
      </Continut>
    </Detalii>
  </Factura>
</Facturi>
```

### Directionare Intrări/Ieșiri

- Dacă `furnizorCif` == CIF firmă din Company Registry → **Ieșiri** (tu ai emis factura)
- Dacă `clientCif` == CIF firmă din Company Registry → **Intrări** (ai primit factura)
- Dacă niciun match → `direction: "unknown"`, utilizator selectează manual

### Nume Fișier

```
F_<CIF>_<NumarFactura>_<DataFactura>.xml
```

Exemplu: `F_RO12345678_INV001_20260425.xml`

---

## 6. Stocare Internă (sagaQueue)

```javascript
{
  "id": "uuid-factura",
  "messageId": 12345,
  "status": "extracted",      // extracted | reviewed | exported | extragereEsuata
  "extractedAt": "2026-04-25T10:30:00Z",
  "direction": "intrari",     // intrari | iesiri | unknown
  "xmlContent": "<Factura>...</Factura>",
  "rawData": { /* JSON extras de AI */ },
  "needsReview": false,
  "errors": []
}
```

---

## 7. UI — Tab SAGA în Popup

### Structură Popup Actualizat

```
┌─────────────────────────────────┐
│  [IncoBills]  [SAGA]     ⚙️    │
├─────────────────────────────────┤
│                                 │
│  SAGA Export (3 facturi noi)   │
│                                 │
│  ┌─────────────────────────┐   │
│  │ FACT-001 - Vendor SRL   │   │
│  │ 2026-04-20 | 1,190 RON  │   │
│  │ [Review] [Exportă XML]  │   │
│  └─────────────────────────┘   │
│                                 │
│  [Exportă Tot]  [Deschide Folder]│
│                                 │
└─────────────────────────────────┘
```

### Options Page — Secțiuni

1. **General** (setări existente IncoBills)
2. **SAGA** (nou):
   - **Firmele Mele** — Company Registry
   - **Setări Export** — subdirector default (`SAGA-Import`)
   - **Coada Facturi** — listă completă cu editare inline
   - **Export Masiv** — selectează multiple, generează XML-uri

---

## 8. Salvare Fișiere

### Abordare Selectată: Subdirector în Downloads

```javascript
const filename = `SAGA-Import/F_RO12345678_INV001_20260425.xml`;
await browser.downloads.download({
  url: blobUrl,
  filename: filename,
  saveAs: false
});
```

**Permisiune necesară în manifest:** `downloads`

**UX:** Salvare directă, utilizatorul mută manual fișierele unde are nevoie.

---

## 9. Error Handling & Edge Cases

| Scenariu | Soluție |
|----------|---------|
| AI extrage incomplet | Flag `needsReview`, câmpuri problematice marcate |
| PDF nu e factură | AI returnează `{"tipDocument": "non-factura"}`, se ignoră |
| Factură fără linii | O linie generică: "Servicii conform factură" |
| Monedă non-RON | Păstrată în `<FacturaMoneda>` |
| Firma nu e în Registry | Direcție `unknown`, selectare manuală |
| Factură duplicată | Verificare `furnizorCif+numar+data`, flag `posibilDuplicat` |
| Eroare API AI | Retry 1x, apoi status `extragereEsuata` |

---

## 10. Depinde de

- IncoBills existent (detecție facturi, folder management)
- Claude API (preferat) sau OpenAI API pentru parsing PDF
- Permisiune `downloads` în manifest.json
- Company Registry configurat de utilizator

---

## 11. Note Implementare

- **PDF parsing:** Doar Claude 3.5 Sonnet sau OpenAI GPT-4o (suport nativ PDF). Ollama nu e viabil pentru parsing PDF structurat.
- **Cost estimat:** ~$0.03-0.05 per factură PDF (2 pagini) la Claude.
- **Performanță:** Operațiunea de extragere PDF → AI → XML se face async în background. Nu blochează UI.
- **Privacy:** PDF-ul se trimite la API-ul AI selectat de utilizator. Doar dacă folosește Local Ollama (cu model vision) rămâne local — dar acuratețea va fi semnificativ mai slabă.
