const STORAGE_KEY = 'sessionId';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // Older browsers / non-secure contexts, where crypto.randomUUID is absent.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The anonymous id identifying this browser's workspace on the API.
 *
 * There are no accounts: this id is what keeps a visitor's indexed resumes and chat memory
 * attached to them across reloads. It is minted on first use and kept in localStorage, so
 * clearing site data simply starts a fresh, empty workspace.
 */
export function getSessionId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = randomId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // Private mode with storage blocked: fall back to a per-tab id so requests still work,
    // at the cost of the library not surviving a reload.
    return randomId();
  }
}
