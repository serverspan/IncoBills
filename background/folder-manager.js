/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Folder Manager
 * Creates and caches "Invoices/YYYY-MM" folder trees per account or unified.
 * Handles IMAP, POP3, and local folder accounts with fallbacks.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const FolderManager = {
  // cache key → folderId  (key = "acctId" for parent, "acctId:YYYY-MM" for monthly)
  _cache: {},

  // ---- Public API ----

  async moveToInvoices(messageId, sourceAccountId, messageDate) {
    const settings = await Storage.getAll();
    const targetFolderId = await this.getTargetFolder(sourceAccountId, messageDate);
    const action = settings.mailAction || "move";

    if (action === "copy") {
      await browser.messages.copy([messageId], targetFolderId);
      return "copied";
    }

    // Move (with fallback)
    try {
      await browser.messages.move([messageId], targetFolderId);
    } catch (moveErr) {
      console.warn("IncoBills: move() failed, trying copy+delete:", moveErr.message);
      try {
        await browser.messages.copy([messageId], targetFolderId);
        await browser.messages.delete([messageId], false);
      } catch (copyErr) {
        throw new Error(`Failed to move message: ${moveErr.message}`);
      }
    }
    return "moved";
  },

  async getTargetFolder(sourceAccountId, messageDate) {
    const settings = await Storage.getAll();
    const folderName = settings.folderName || "Invoices";

    // Determine which account holds the Invoices tree
    let targetAccountId;
    if (settings.folderMode === "unified") {
      targetAccountId = settings.unifiedAccountId;
      if (!targetAccountId) {
        // Auto-pick first account
        const accounts = await browser.accounts.list();
        targetAccountId = accounts.length > 0 ? accounts[0].id : sourceAccountId;
      }
    } else {
      targetAccountId = sourceAccountId;
    }

    // Ensure the parent folder (e.g. "Invoices") exists
    const parentId = await this.ensureParentFolder(targetAccountId, folderName);

    // Compute monthly subfolder name
    const date = messageDate ? new Date(messageDate) : new Date();
    const monthKey = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");

    // Check cache
    const cacheKey = `${targetAccountId}:${monthKey}`;
    if (this._cache[cacheKey]) {
      try {
        await browser.folders.get(this._cache[cacheKey]);
        return this._cache[cacheKey];
      } catch {
        delete this._cache[cacheKey];
      }
    }

    // Look for existing monthly subfolder
    try {
      const subFolders = await browser.folders.getSubFolders(parentId, false);
      const existing = subFolders.find((f) => f.name === monthKey);
      if (existing) {
        this._cache[cacheKey] = existing.id;
        return existing.id;
      }
    } catch {
      // getSubFolders may fail, try creating directly
    }

    // Create the monthly subfolder
    try {
      const newFolder = await browser.folders.create(parentId, monthKey);
      this._cache[cacheKey] = newFolder.id;
      console.log(`IncoBills: Created "${folderName}/${monthKey}" in account ${targetAccountId}`);
      return newFolder.id;
    } catch (err) {
      console.warn(`IncoBills: Can't create monthly folder "${monthKey}":`, err.message);
      // Fall back to the parent folder itself
      return parentId;
    }
  },

  // ---- Parent folder creation (with fallback chain) ----

  async ensureParentFolder(accountId, folderName) {
    const cacheKey = accountId;

    // Check cache
    if (this._cache[cacheKey]) {
      try {
        await browser.folders.get(this._cache[cacheKey]);
        return this._cache[cacheKey];
      } catch {
        delete this._cache[cacheKey];
      }
    }

    // Search for existing folder
    const existing = await browser.folders.query({ accountId, name: folderName });
    if (existing.length > 0) {
      this._cache[cacheKey] = existing[0].id;
      return existing[0].id;
    }

    // Strategy 1: under account root
    const account = await browser.accounts.get(accountId);
    if (account && account.rootFolder) {
      try {
        const f = await browser.folders.create(account.rootFolder.id, folderName);
        this._cache[cacheKey] = f.id;
        console.log(`IncoBills: Created "${folderName}" under root of ${accountId}`);
        return f.id;
      } catch (err) {
        console.warn(`IncoBills: Can't create under root of ${accountId}:`, err.message);
      }
    }

    // Strategy 2: sibling of inbox
    try {
      const inboxFolders = await browser.folders.query({ accountId, specialUse: ["inbox"] });
      if (inboxFolders.length > 0 && inboxFolders[0].parentFolderId) {
        const f = await browser.folders.create(inboxFolders[0].parentFolderId, folderName);
        this._cache[cacheKey] = f.id;
        return f.id;
      }
    } catch (err) {
      console.warn(`IncoBills: Can't create as inbox sibling in ${accountId}:`, err.message);
    }

    // Strategy 3: Local Folders
    const localId = await this._findLocalFoldersFolder(folderName);
    if (localId) {
      this._cache[cacheKey] = localId;
      return localId;
    }

    throw new Error(
      `Could not create "${folderName}" folder for account ${accountId}. ` +
      `Try creating it manually in Thunderbird first.`
    );
  },

  async _findLocalFoldersFolder(folderName) {
    const accounts = await browser.accounts.list();
    for (const acct of accounts) {
      const isLocal =
        acct.type === "none" ||
        (acct.name && acct.name.toLowerCase().includes("local folder"));
      if (!isLocal) continue;

      const existing = await browser.folders.query({ accountId: acct.id, name: folderName });
      if (existing.length > 0) return existing[0].id;

      try {
        const f = await browser.folders.create(acct.rootFolder.id, folderName);
        console.log(`IncoBills: Created "${folderName}" in Local Folders`);
        return f.id;
      } catch (err) {
        console.warn("IncoBills: Can't create in Local Folders:", err.message);
      }
    }
    return null;
  },

  clearCache() {
    this._cache = {};
  },
};
