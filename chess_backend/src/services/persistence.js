const fs = require('fs/promises');
const path = require('path');

class PersistenceService {
  constructor() {
    this.filePath =
      process.env.REACT_APP_PERSISTENCE_FILE ||
      path.join(process.cwd(), 'data', 'games.json');
  }

  // PUBLIC_INTERFACE
  async load() {
    /** Load persisted JSON from disk. Returns an array of serialized games. */
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return [];
      return Array.isArray(parsed.games) ? parsed.games : [];
    } catch (err) {
      // If file doesn't exist, treat as empty.
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return [];
      throw err;
    }
  }

  // PUBLIC_INTERFACE
  async save(games) {
    /** Persist array of serialized games to disk using atomic write. */
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = `${this.filePath}.tmp`;
    const payload = JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        games,
      },
      null,
      2
    );

    await fs.writeFile(tmpPath, payload, 'utf-8');
    await fs.rename(tmpPath, this.filePath);
  }
}

module.exports = new PersistenceService();
