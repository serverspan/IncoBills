/**
 * IncoBills — AI-Powered Invoice Detection for Thunderbird
 * https://github.com/serverspan/incobills
 *
 * Storage Wrapper
 * Thin wrapper around browser.storage.local with defaults merging.
 *
 * @author    ServerSpan <https://www.serverspan.com>
 * @copyright 2026 ServerSpan
 * @license   MIT
 * @version   1.0.0
 */

const Storage = {
  async get(key) {
    const result = await browser.storage.local.get(key);
    if (typeof key === "string") {
      return result[key] !== undefined ? result[key] : DEFAULTS[key];
    }
    return { ...DEFAULTS, ...result };
  },

  async set(data) {
    await browser.storage.local.set(data);
  },

  async getAll() {
    const result = await browser.storage.local.get(null);
    return { ...DEFAULTS, ...result };
  },

  async remove(keys) {
    await browser.storage.local.remove(keys);
  },
};
