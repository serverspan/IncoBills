/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Classification History
 * Logs every classification decision for review, debugging, and CSV export.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const History = {
  async log(entry) {
    const settings = await Storage.getAll();
    let history = settings.classificationHistory || [];

    history.unshift({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...entry,
    });

    // Prune oldest entries beyond the cap
    const max = settings.historyMaxEntries || 500;
    if (history.length > max) {
      history = history.slice(0, max);
    }

    await Storage.set({ classificationHistory: history });
    return history[0];
  },

  async getAll() {
    return (await Storage.get("classificationHistory")) || [];
  },

  async getRecent(count) {
    const all = await this.getAll();
    return all.slice(0, count);
  },

  async isProcessed(messageId) {
    const history = await this.getAll();
    return history.some((entry) => entry.messageId === messageId);
  },

  async getStats() {
    const history = await this.getAll();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let today = 0;
    let thisMonth = 0;
    let total = 0;

    for (const entry of history) {
      if (entry.action === "moved") {
        total++;
        if (entry.timestamp >= monthStart) thisMonth++;
        if (entry.timestamp >= todayStart) today++;
      }
    }

    return { today, thisMonth, total };
  },

  async updateOverride(historyId, override) {
    const history = await this.getAll();
    const entry = history.find((e) => e.id === historyId);
    if (entry) {
      entry.userOverride = override;
      await Storage.set({ classificationHistory: history });
    }
  },

  async clear() {
    await Storage.set({ classificationHistory: [] });
  },

  async exportCSV() {
    const history = await this.getAll();
    const headers = ["Date", "From", "Subject", "Confidence", "Backend", "Action", "Reason"];
    const rows = history.map((e) => [
      e.timestamp,
      `"${(e.from || "").replace(/"/g, '""')}"`,
      `"${(e.subject || "").replace(/"/g, '""')}"`,
      e.classification ? e.classification.confidence : "",
      e.backend || "",
      e.action || "",
      e.classification ? `"${(e.classification.reason || "").replace(/"/g, '""')}"` : "",
    ]);
    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  },
};
