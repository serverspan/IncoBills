/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Popup Script
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

document.addEventListener("DOMContentLoaded", async () => {
  const enableToggle = document.getElementById("enableToggle");
  const todayEl = document.getElementById("todayCount");
  const monthEl = document.getElementById("monthCount");
  const totalEl = document.getElementById("totalCount");
  const recentList = document.getElementById("recentList");

  // --- Load initial state ---
  const enabled = await browser.runtime.sendMessage({ type: "getEnabled" });
  enableToggle.checked = enabled !== false;

  const stats = await browser.runtime.sendMessage({ type: "getStats" });
  todayEl.textContent = stats.today;
  monthEl.textContent = stats.thisMonth;
  totalEl.textContent = stats.total;

  const recent = await browser.runtime.sendMessage({
    type: "getRecentHistory",
    count: 5,
  });

  const movedRecent = recent.filter((e) => e.action === "moved" || e.action === "flagged");
  if (movedRecent.length > 0) {
    while (recentList.lastChild) {
      recentList.removeChild(recentList.lastChild);
    }
    for (const entry of movedRecent) {
      recentList.appendChild(createRecentItem(entry));
    }
  }

  // --- Load SAGA data ---
  await loadSagaPopupData();

  // --- Toggle handler ---
  enableToggle.addEventListener("change", () => {
    browser.runtime.sendMessage({
      type: "setEnabled",
      enabled: enableToggle.checked,
    });
  });

  // --- Tab switching ---
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${tab}`).classList.add("active");
    });
  });

  // --- Open settings ---
  document.getElementById("btnSettings").addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  // --- SAGA export ---
  document.getElementById("btnSagaExport").addEventListener("click", async () => {
    try {
      const result = await browser.runtime.sendMessage({ type: "sagaExportAll" });
      const success = result.filter((r) => r.success).length;
      alert(`Export completat: ${success} fișier(e) salvat(e).`);
      await loadSagaPopupData();
    } catch (err) {
      alert("Eroare la export: " + err.message);
    }
  });
});

async function loadSagaPopupData() {
  try {
    const queue = await browser.runtime.sendMessage({ type: "sagaGetQueue" });
    const pending = queue.filter((q) => q.status !== "exported");

    // Update badge
    const badge = document.getElementById("sagaBadge");
    if (pending.length > 0) {
      badge.textContent = pending.length;
      badge.style.display = "inline";
    } else {
      badge.style.display = "none";
    }

    // Update count
    document.getElementById("sagaQueueCount").textContent = pending.length;

    // Render recent SAGA items
    const sagaList = document.getElementById("sagaRecentList");
    while (sagaList.lastChild) {
      sagaList.removeChild(sagaList.lastChild);
    }

    if (pending.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-state";
      emptyDiv.textContent = "Nicio factură în coadă.";
      sagaList.appendChild(emptyDiv);
      return;
    }

    // Show last 5 pending items
    const recentPending = pending.slice(0, 5);
    for (const item of recentPending) {
      sagaList.appendChild(createSagaPopupItem(item));
    }
  } catch (err) {
    console.error("[SAGA Popup] Failed to load data:", err);
  }
}

function createSagaPopupItem(item) {
  const div = document.createElement("div");
  div.className = "recent-item";

  const numar = item.rawData?.facturaNumar || "Necunoscut";
  const furnizor = item.rawData?.furnizorNume || "";
  const data = item.rawData?.facturaData || "";
  const total = item.rawData?.totalCuTVA || 0;
  const moneda = item.rawData?.moneda || "RON";
  const dir = item.direction === "intrari" ? "Intrări" : item.direction === "iesiri" ? "Ieșiri" : "?";

  const infoDiv = document.createElement("div");
  infoDiv.className = "recent-info";

  const numarDiv = document.createElement("div");
  numarDiv.className = "recent-from";
  numarDiv.textContent = `${numar} — ${furnizor}`;

  const metaDiv = document.createElement("div");
  metaDiv.className = "recent-subject";
  metaDiv.textContent = `${data} | ${dir} | ${total.toFixed(2)} ${moneda}`;

  infoDiv.appendChild(numarDiv);
  infoDiv.appendChild(metaDiv);

  div.appendChild(infoDiv);
  return div;
}

function createRecentItem(entry) {
  const div = document.createElement("div");
  div.className = "recent-item";

  const senderName = extractSenderName(entry.from || "");
  const timeAgo = formatTimeAgo(entry.timestamp);
  const confidence = entry.classification
    ? Math.round(entry.classification.confidence * 100) + "%"
    : "";

  const infoDiv = document.createElement("div");
  infoDiv.className = "recent-info";

  const fromDiv = document.createElement("div");
  fromDiv.className = "recent-from";
  fromDiv.textContent = senderName;

  const subjectDiv = document.createElement("div");
  subjectDiv.className = "recent-subject";
  subjectDiv.textContent = entry.subject || "(no subject)";

  infoDiv.appendChild(fromDiv);
  infoDiv.appendChild(subjectDiv);

  const metaDiv = document.createElement("div");
  metaDiv.className = "recent-meta";

  const timeSpan = document.createElement("span");
  timeSpan.className = "recent-time";
  timeSpan.textContent = timeAgo;

  const confSpan = document.createElement("span");
  confSpan.className = "recent-confidence";
  confSpan.textContent = confidence;

  metaDiv.appendChild(timeSpan);
  metaDiv.appendChild(confSpan);

  div.appendChild(infoDiv);
  div.appendChild(metaDiv);
  return div;
}

function extractSenderName(from) {
  // "John Doe <john@example.com>" → "John Doe"
  const match = from.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : from.split("@")[0] || from;
}

function formatTimeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
