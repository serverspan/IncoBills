/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Options Page Script
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const HISTORY_PAGE_SIZE = 50;
let historyOffset = 0;
let allHistory = [];

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await loadAccounts();
  await loadHistory();
  await loadSagaCompanies();
  await loadSagaQueue();
  bindEvents();
  bindSagaEvents();
  setDefaultScanDates();
});

// ============================================================
//  Load settings into form
// ============================================================

async function loadSettings() {
  const s = await browser.runtime.sendMessage({ type: "getSettings" });

  // Backend radio
  const radio = document.querySelector(`input[name="aiBackend"][value="${s.aiBackend}"]`);
  if (radio) radio.checked = true;

  // API fields
  document.getElementById("claudeApiUrl").value = s.claudeApiUrl || "";
  document.getElementById("claudeApiKey").value = s.claudeApiKey || "";
  document.getElementById("claudeModel").value = s.claudeModel || "";
  document.getElementById("openaiApiUrl").value = s.openaiApiUrl || "";
  document.getElementById("openaiApiKey").value = s.openaiApiKey || "";
  document.getElementById("openaiModel").value = s.openaiModel || "";
  document.getElementById("ollamaUrl").value = s.ollamaUrl || "";
  document.getElementById("ollamaModel").value = s.ollamaModel || "";

  // Threshold
  const slider = document.getElementById("confidenceThreshold");
  slider.value = s.confidenceThreshold;
  document.getElementById("thresholdValue").textContent = Number(s.confidenceThreshold).toFixed(2);

  // Folder name
  document.getElementById("folderName").value = s.folderName || "Invoices";

  // Folder mode
  const folderModeRadio = document.querySelector(`input[name="folderMode"][value="${s.folderMode || "perAccount"}"]`);
  if (folderModeRadio) folderModeRadio.checked = true;

  // Mail action
  const mailActionRadio = document.querySelector(`input[name="mailAction"][value="${s.mailAction || "move"}"]`);
  if (mailActionRadio) mailActionRadio.checked = true;

  // Behavior
  document.getElementById("autoMove").checked = s.autoMove !== false;
  document.getElementById("showNotification").checked = s.showNotification !== false;
  document.getElementById("notifyOnly").checked = s.notifyOnly === true;
}

// ============================================================
//  Load accounts
// ============================================================

async function loadAccounts() {
  const accounts = await browser.runtime.sendMessage({ type: "getAccounts" });
  const settings = await browser.runtime.sendMessage({ type: "getSettings" });
  const monitored = settings.monitoredAccounts || [];

  const listEl = document.getElementById("accountsList");
  const scanSelect = document.getElementById("scanAccount");
  const unifiedSelect = document.getElementById("unifiedAccount");
  while (listEl.lastChild) {
    listEl.removeChild(listEl.lastChild);
  }

  // Clear and repopulate unified dropdown (keep first placeholder option)
  unifiedSelect.length = 1;

  for (const account of accounts) {
    // Checkbox list
    const div = document.createElement("div");
    div.className = "account-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "account-check";
    checkbox.value = account.id;
    checkbox.checked = monitored.length === 0 || monitored.includes(account.id);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = account.name || account.id;

    const typeSpan = document.createElement("span");
    typeSpan.className = "account-type";
    typeSpan.textContent = account.type || "";

    div.appendChild(checkbox);
    div.appendChild(nameSpan);
    div.appendChild(typeSpan);
    listEl.appendChild(div);

    // Scan dropdown
    const opt = document.createElement("option");
    opt.value = account.id;
    opt.textContent = account.name || account.id;
    scanSelect.appendChild(opt);

    // Unified account dropdown
    const opt2 = document.createElement("option");
    opt2.value = account.id;
    opt2.textContent = account.name || account.id;
    if (settings.unifiedAccountId === account.id) opt2.selected = true;
    unifiedSelect.appendChild(opt2);
  }

  if (accounts.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "loading";
    emptyDiv.textContent = "No mail accounts found.";
    listEl.appendChild(emptyDiv);
  }
}

// ============================================================
//  Load history
// ============================================================

async function loadHistory() {
  allHistory = await browser.runtime.sendMessage({ type: "getHistory" });
  historyOffset = 0;
  sortAndRender();
}

let historySortDesc = true;

function sortAndRender() {
  if (historySortDesc) {
    allHistory.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  } else {
    allHistory.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  }
  historyOffset = 0;
  renderHistoryPage();
}

function renderHistoryPage() {
  const tbody = document.getElementById("historyBody");
  const page = allHistory.slice(0, historyOffset + HISTORY_PAGE_SIZE);

  if (page.length === 0) {
    while (tbody.lastChild) {
      tbody.removeChild(tbody.lastChild);
    }
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.className = "empty-cell";
    td.textContent = "No history yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    document.getElementById("btnLoadMore").hidden = true;
    return;
  }

  while (tbody.lastChild) {
    tbody.removeChild(tbody.lastChild);
  }
  for (const entry of page) {
    const tr = document.createElement("tr");
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const conf = entry.classification ? Math.round(entry.classification.confidence * 100) + "%" : "-";
    const actionClass = `action-${entry.action || "skipped"}`;

    const tdDate = document.createElement("td");
    tdDate.title = entry.timestamp;
    tdDate.textContent = dateStr;

    const tdFrom = document.createElement("td");
    tdFrom.title = entry.from || "";
    tdFrom.textContent = extractSenderName(entry.from || "");

    const tdSubject = document.createElement("td");
    tdSubject.title = entry.subject || "";
    tdSubject.textContent = entry.subject || "(no subject)";

    const tdConf = document.createElement("td");
    tdConf.textContent = conf;

    const tdBackend = document.createElement("td");
    tdBackend.textContent = entry.backend || "-";

    const tdAction = document.createElement("td");
    tdAction.className = actionClass;
    tdAction.textContent = entry.action || "-";

    tr.appendChild(tdDate);
    tr.appendChild(tdFrom);
    tr.appendChild(tdSubject);
    tr.appendChild(tdConf);
    tr.appendChild(tdBackend);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  }

  historyOffset = page.length;
  document.getElementById("btnLoadMore").hidden = historyOffset >= allHistory.length;
}

// ============================================================
//  Event binding
// ============================================================

function bindEvents() {
  // Threshold slider live update
  const slider = document.getElementById("confidenceThreshold");
  slider.addEventListener("input", () => {
    document.getElementById("thresholdValue").textContent = Number(slider.value).toFixed(2);
  });

  // Folder mode toggle: show/hide unified account dropdown
  document.querySelectorAll('input[name="folderMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      document.getElementById("unifiedAccountGroup").hidden =
        document.querySelector('input[name="folderMode"]:checked').value !== "unified";
    });
  });
  // Fire once to set initial state
  document.getElementById("unifiedAccountGroup").hidden =
    document.querySelector('input[name="folderMode"]:checked').value !== "unified";

  // Save
  document.getElementById("btnSave").addEventListener("click", saveSettings);

  // Test buttons
  document.getElementById("testClaude").addEventListener("click", (e) => {
    e.preventDefault();
    testBackend("claude", {
      apiKey: document.getElementById("claudeApiKey").value,
      apiUrl: document.getElementById("claudeApiUrl").value,
    });
  });
  document.getElementById("testOpenai").addEventListener("click", (e) => {
    e.preventDefault();
    testBackend("openai", {
      apiKey: document.getElementById("openaiApiKey").value,
      apiUrl: document.getElementById("openaiApiUrl").value,
    });
  });
  document.getElementById("testOllama").addEventListener("click", (e) => {
    e.preventDefault();
    testBackend("ollama", {
      url: document.getElementById("ollamaUrl").value,
      model: document.getElementById("ollamaModel").value,
    });
  });

  // History
  document.getElementById("sortDate").addEventListener("click", () => {
    historySortDesc = !historySortDesc;
    document.getElementById("sortDate").textContent =
      historySortDesc ? "Date \u25BC" : "Date \u25B2";
    sortAndRender();
  });
  document.getElementById("btnLoadMore").addEventListener("click", () => {
    renderHistoryPage();
  });
  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
  document.getElementById("btnClearHistory").addEventListener("click", async () => {
    if (confirm("Clear all classification history? This cannot be undone.")) {
      await browser.runtime.sendMessage({ type: "clearHistory" });
      await loadHistory();
    }
  });

  // Scan
  document.getElementById("btnScan").addEventListener("click", startScan);
}

// ============================================================
//  Save settings
// ============================================================

async function saveSettings() {
  const backend = document.querySelector('input[name="aiBackend"]:checked');
  const accountChecks = document.querySelectorAll(".account-check");
  const allChecked = Array.from(accountChecks).every((cb) => cb.checked);
  const monitored = allChecked
    ? []
    : Array.from(accountChecks).filter((cb) => cb.checked).map((cb) => cb.value);

  const data = {
    aiBackend: backend ? backend.value : "keywords",
    claudeApiUrl: document.getElementById("claudeApiUrl").value.trim() || "https://api.anthropic.com",
    claudeApiKey: document.getElementById("claudeApiKey").value.trim(),
    claudeModel: document.getElementById("claudeModel").value.trim() || "claude-haiku-4-5-20251001",
    openaiApiUrl: document.getElementById("openaiApiUrl").value.trim() || "https://api.openai.com",
    openaiApiKey: document.getElementById("openaiApiKey").value.trim(),
    openaiModel: document.getElementById("openaiModel").value.trim() || "gpt-4o-mini",
    ollamaUrl: document.getElementById("ollamaUrl").value.trim() || "http://127.0.0.1:11434",
    ollamaModel: document.getElementById("ollamaModel").value.trim() || "llama3.2:3b",
    confidenceThreshold: parseFloat(document.getElementById("confidenceThreshold").value),
    folderName: document.getElementById("folderName").value.trim() || "Invoices",
    folderMode: (document.querySelector('input[name="folderMode"]:checked') || {}).value || "perAccount",
    unifiedAccountId: document.getElementById("unifiedAccount").value || "",
    mailAction: (document.querySelector('input[name="mailAction"]:checked') || {}).value || "move",
    autoMove: document.getElementById("autoMove").checked,
    showNotification: document.getElementById("showNotification").checked,
    notifyOnly: document.getElementById("notifyOnly").checked,
    monitoredAccounts: monitored,
  };

  await browser.runtime.sendMessage({ type: "saveSettings", data });

  // Save SAGA settings
  const sagaSettings = {
    exportSubdirectory: document.getElementById("sagaExportSubdir").value.trim() || "SAGA-Import",
    autoExtractPDFs: document.getElementById("sagaAutoExtract").checked,
  };
  await browser.runtime.sendMessage({ type: "sagaSaveSettings", data: sagaSettings });

  const status = document.getElementById("saveStatus");
  status.textContent = "Settings saved!";
  setTimeout(() => { status.textContent = ""; }, 3000);
}

// ============================================================
//  Test backend connection
// ============================================================

async function testBackend(backend, options) {
  const btn = document.getElementById("test" + backend.charAt(0).toUpperCase() + backend.slice(1));
  const origText = btn.textContent;
  btn.textContent = "Testing...";
  btn.disabled = true;

  try {
    const result = await browser.runtime.sendMessage({ type: "testBackend", backend, options });
    if (result.success) {
      btn.textContent = "OK!";
      btn.style.background = "#dcfce7";
    } else {
      btn.textContent = "Failed";
      btn.style.background = "#fee2e2";
      alert("Connection test failed:\n" + (result.error || "Unknown error"));
    }
  } catch (err) {
    btn.textContent = "Error";
    btn.style.background = "#fee2e2";
    alert("Test error: " + err.message);
  }

  setTimeout(() => {
    btn.textContent = origText;
    btn.disabled = false;
    btn.style.background = "";
  }, 3000);
}

// ============================================================
//  Scan existing emails
// ============================================================

async function startScan() {
  const btn = document.getElementById("btnScan");
  const progressEl = document.getElementById("scanProgress");
  const fillEl = document.getElementById("scanFill");
  const statusEl = document.getElementById("scanStatus");

  const accountId = document.getElementById("scanAccount").value || undefined;
  const fromDate = document.getElementById("scanFrom").value || undefined;
  const toDate = document.getElementById("scanTo").value || undefined;

  btn.disabled = true;
  btn.textContent = "Scanning...";
  progressEl.hidden = false;
  fillEl.style.width = "0%";
  statusEl.textContent = "Starting scan...";

  try {
    const result = await browser.runtime.sendMessage({
      type: "scanExisting",
      accountId,
      fromDate,
      toDate,
    });

    fillEl.style.width = "100%";
    statusEl.textContent = `Done! Scanned ${result.total} emails, found ${result.found} invoices.`;
    await loadHistory();
  } catch (err) {
    statusEl.textContent = "Scan failed: " + err.message;
  }

  btn.disabled = false;
  btn.textContent = "Scan Now";
}

// ============================================================
//  Export CSV
// ============================================================

async function exportCSV() {
  const csv = await browser.runtime.sendMessage({ type: "exportCSV" });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `incobills-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
//  Helpers
// ============================================================

function setDefaultScanDates() {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  document.getElementById("scanFrom").value = firstOfMonth.toISOString().slice(0, 10);
  document.getElementById("scanTo").value = now.toISOString().slice(0, 10);
}

function extractSenderName(from) {
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0] || from;
}

// ============================================================
//  SAGA Export — Company Registry
// ============================================================

async function loadSagaCompanies() {
  const companies = await browser.runtime.sendMessage({ type: "sagaGetCompanies" });
  renderSagaCompanies(companies || []);
}

function renderSagaCompanies(companies) {
  const listEl = document.getElementById("sagaCompaniesList");
  while (listEl.lastChild) {
    listEl.removeChild(listEl.lastChild);
  }

  if (companies.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "loading";
    emptyDiv.textContent = "Nicio firmă configurată. Adaugă cel puțin o firmă pentru a activa exportul SAGA.";
    listEl.appendChild(emptyDiv);
    return;
  }

  for (const comp of companies) {
    const div = document.createElement("div");
    div.className = "saga-company-item";
    div.dataset.id = comp.id;

    const infoDiv = document.createElement("div");
    infoDiv.className = "saga-company-info";

    const nameDiv = document.createElement("div");
    nameDiv.className = "saga-company-name";
    nameDiv.textContent = comp.name;

    const cifDiv = document.createElement("div");
    cifDiv.className = "saga-company-cif";
    cifDiv.textContent = `CIF: ${comp.cif} | Județ: ${comp.county}`;

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(cifDiv);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "saga-company-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-sm";
    editBtn.textContent = "Editează";
    editBtn.addEventListener("click", () => editSagaCompany(comp));

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-danger";
    delBtn.textContent = "Șterge";
    delBtn.addEventListener("click", () => deleteSagaCompany(comp.id));

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);

    div.appendChild(infoDiv);
    div.appendChild(actionsDiv);
    listEl.appendChild(div);
  }
}

function showCompanyForm(company) {
  const form = document.getElementById("sagaCompanyForm");
  const title = document.getElementById("sagaFormTitle");

  if (company) {
    title.textContent = "Editează Firmă";
    document.getElementById("sagaCompanyId").value = company.id;
    document.getElementById("sagaCompName").value = company.name;
    document.getElementById("sagaCompCif").value = company.cif;
    document.getElementById("sagaCompRegCom").value = company.regCom;
    document.getElementById("sagaCompCapital").value = company.capital;
    document.getElementById("sagaCompCountry").value = company.country;
    document.getElementById("sagaCompCounty").value = company.county;
    document.getElementById("sagaCompCity").value = company.city;
    document.getElementById("sagaCompAddress").value = company.address;
    document.getElementById("sagaCompBank").value = company.bank;
    document.getElementById("sagaCompIban").value = company.iban;
    document.getElementById("sagaCompPhone").value = company.phone;
    document.getElementById("sagaCompEmail").value = company.email;
  } else {
    title.textContent = "Adaugă Firmă";
    document.getElementById("sagaCompanyId").value = "";
    form.querySelectorAll("input[type=text], input[type=email], input[type=hidden]").forEach((input) => {
      if (input.id !== "sagaCompCountry") input.value = "";
    });
    document.getElementById("sagaCompCountry").value = "RO";
    document.getElementById("sagaCompCounty").value = "B";
  }

  form.hidden = false;
}

function hideCompanyForm() {
  document.getElementById("sagaCompanyForm").hidden = true;
}

async function saveSagaCompany() {
  const id = document.getElementById("sagaCompanyId").value;
  const data = {
    name: document.getElementById("sagaCompName").value.trim(),
    cif: document.getElementById("sagaCompCif").value.trim(),
    regCom: document.getElementById("sagaCompRegCom").value.trim(),
    capital: document.getElementById("sagaCompCapital").value.trim(),
    country: document.getElementById("sagaCompCountry").value.trim(),
    county: document.getElementById("sagaCompCounty").value,
    city: document.getElementById("sagaCompCity").value.trim(),
    address: document.getElementById("sagaCompAddress").value.trim(),
    bank: document.getElementById("sagaCompBank").value.trim(),
    iban: document.getElementById("sagaCompIban").value.trim(),
    phone: document.getElementById("sagaCompPhone").value.trim(),
    email: document.getElementById("sagaCompEmail").value.trim(),
  };

  // Basic validation
  const required = ["name", "cif", "regCom", "capital", "city", "address", "bank", "iban", "phone", "email"];
  for (const field of required) {
    if (!data[field]) {
      alert(`Câmpul obligatoriu lipsă: ${field}`);
      return;
    }
  }

  try {
    if (id) {
      await browser.runtime.sendMessage({ type: "sagaUpdateCompany", id, data });
    } else {
      await browser.runtime.sendMessage({ type: "sagaAddCompany", data });
    }
    hideCompanyForm();
    await loadSagaCompanies();
    await loadSagaQueue();
  } catch (err) {
    alert("Eroare la salvare: " + err.message);
  }
}

async function editSagaCompany(company) {
  showCompanyForm(company);
}

async function deleteSagaCompany(id) {
  if (!confirm("Sigur dorești să ștergi această firmă?")) return;
  try {
    await browser.runtime.sendMessage({ type: "sagaDeleteCompany", id });
    await loadSagaCompanies();
  } catch (err) {
    alert("Eroare la ștergere: " + err.message);
  }
}

// ============================================================
//  SAGA Export — Queue
// ============================================================

async function loadSagaQueue() {
  const queue = await browser.runtime.sendMessage({ type: "sagaGetQueue" });
  renderSagaQueue(queue || []);
}

function renderSagaQueue(queue) {
  const listEl = document.getElementById("sagaQueueList");
  const countEl = document.getElementById("sagaQueueCount");

  while (listEl.lastChild) {
    listEl.removeChild(listEl.lastChild);
  }

  const pending = queue.filter((q) => q.status !== "exported");
  countEl.textContent = pending.length;

  if (queue.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "loading";
    emptyDiv.textContent = "Nicio factură în coadă.";
    listEl.appendChild(emptyDiv);
    return;
  }

  for (const item of queue) {
    const div = document.createElement("div");
    div.className = `saga-queue-item saga-status-${item.status}`;

    const infoDiv = document.createElement("div");
    infoDiv.className = "saga-queue-info";

    const numarDiv = document.createElement("div");
    numarDiv.className = "saga-queue-numar";
    numarDiv.textContent = item.rawData?.facturaNumar || "Necunoscut";

    const metaDiv = document.createElement("div");
    metaDiv.className = "saga-queue-meta";
    const dirText = item.direction === "intrari" ? "Intrări" : item.direction === "iesiri" ? "Ieșiri" : "Necunoscut";
    const statusText = item.status === "extracted" ? "Nou" : item.status === "reviewed" ? "Verificat" : item.status === "exported" ? "Exportat" : "Eroare";
    metaDiv.textContent = `${item.rawData?.furnizorNume || ""} | ${item.rawData?.facturaData || ""} | ${dirText} | ${statusText}`;

    if (item.needsReview) {
      const reviewBadge = document.createElement("span");
      reviewBadge.className = "badge badge-danger";
      reviewBadge.textContent = "Necesită Review";
      metaDiv.appendChild(document.createTextNode(" "));
      metaDiv.appendChild(reviewBadge);
    }

    infoDiv.appendChild(numarDiv);
    infoDiv.appendChild(metaDiv);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "saga-queue-actions";

    if (item.status !== "exported") {
      const exportBtn = document.createElement("button");
      exportBtn.className = "btn btn-sm btn-primary";
      exportBtn.textContent = "Exportă XML";
      exportBtn.addEventListener("click", () => exportSagaItems([item.id]));
      actionsDiv.appendChild(exportBtn);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "btn btn-sm btn-danger";
    delBtn.textContent = "Șterge";
    delBtn.addEventListener("click", () => removeSagaQueueItem(item.id));
    actionsDiv.appendChild(delBtn);

    div.appendChild(infoDiv);
    div.appendChild(actionsDiv);
    listEl.appendChild(div);
  }
}

async function exportSagaItems(itemIds) {
  if (!itemIds || itemIds.length === 0) {
    alert("Selectează cel puțin o factură pentru export.");
    return;
  }
  try {
    const results = await browser.runtime.sendMessage({ type: "sagaExportItems", itemIds });
    const success = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    if (failed > 0) {
      alert(`Export completat: ${success} succes, ${failed} eșuat.`);
    } else {
      alert(`Export completat: ${success} fișier(e) salvat(e).`);
    }
    await loadSagaQueue();
  } catch (err) {
    alert("Eroare la export: " + err.message);
  }
}

async function removeSagaQueueItem(id) {
  if (!confirm("Sigur dorești să elimini această factură din coadă?")) return;
  try {
    await browser.runtime.sendMessage({ type: "sagaRemoveQueueItem", id });
    await loadSagaQueue();
  } catch (err) {
    alert("Eroare: " + err.message);
  }
}

async function clearSagaQueue() {
  if (!confirm("Sigur dorești să golești toată coada? Facturile exportate vor rămâne.")) return;
  try {
    await browser.runtime.sendMessage({ type: "sagaClearQueue" });
    await loadSagaQueue();
  } catch (err) {
    alert("Eroare: " + err.message);
  }
}

// ============================================================
//  SAGA Export — Event Binding
// ============================================================

function bindSagaEvents() {
  document.getElementById("btnAddCompany").addEventListener("click", () => showCompanyForm(null));
  document.getElementById("btnSaveCompany").addEventListener("click", saveSagaCompany);
  document.getElementById("btnCancelCompany").addEventListener("click", hideCompanyForm);
  document.getElementById("btnSagaExportAll").addEventListener("click", async () => {
    const queue = await browser.runtime.sendMessage({ type: "sagaGetQueue" });
    const pending = queue.filter((q) => q.status !== "exported").map((q) => q.id);
    exportSagaItems(pending);
  });
  document.getElementById("btnSagaClearQueue").addEventListener("click", clearSagaQueue);
}

// ============================================================
//  Helpers
// ============================================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
