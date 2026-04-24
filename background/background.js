/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Background Entry Point
 * Registers all event listeners and handles messaging from popup/options.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

// --- New mail listener ---
browser.messages.onNewMailReceived.addListener((folder, messages) => {
  EmailMonitor.handleNewMail(folder, messages);
});

// --- Notification click: clear it ---
browser.notifications.onClicked.addListener((notificationId) => {
  browser.notifications.clear(notificationId);
});

// --- Message handler for popup and options pages ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "getStats":
      return History.getStats();

    case "getHistory":
      return History.getAll();

    case "getRecentHistory":
      return History.getRecent(message.count || 5);

    case "clearHistory":
      return History.clear().then(() => ({ success: true }));

    case "exportCSV":
      return History.exportCSV();

    case "getSettings":
      return Storage.getAll();

    case "saveSettings":
      return Storage.set(message.data).then(() => {
        FolderManager.clearCache(); // folder name may have changed
        return { success: true };
      });

    case "getAccounts":
      return browser.accounts.list().then((accounts) =>
        accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))
      );

    case "testBackend":
      return Classifier.testBackend(message.backend, message.options)
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: err.message }));

    case "scanExisting":
      return EmailMonitor.scanExisting(
        message.accountId,
        message.fromDate,
        message.toDate
      );

    case "getEnabled":
      return Storage.get("enabled");

    case "setEnabled":
      return Storage.set({ enabled: message.enabled }).then(() => ({
        success: true,
      }));

    default:
      return Promise.resolve({ error: "Unknown message type" });
  }
});

// --- Startup log ---
console.log("IncoBills: Extension loaded. Monitoring for invoices across all accounts.");
