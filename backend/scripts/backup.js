'use strict';
// Consistent SQLite online backup. Safe while the storefront is serving traffic.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const Database = require('better-sqlite3');
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '..', 'data', 'chandrahasa.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DATA_PATH), 'backups');
const KEEP = Math.max(7, Math.min(90, Number(process.env.BACKUP_KEEP_DAYS || 30)));

async function createBackup() {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`Database does not exist: ${DATA_PATH}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `chandrahasa-${stamp}.sqlite`);
  const source = new Database(DATA_PATH, { readonly: true, fileMustExist: true });
  try {
    const integrity = source.pragma('quick_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`Source DB integrity check failed: ${integrity}`);
    await source.backup(target);
  } finally { source.close(); }
  const verify = new Database(target, { readonly: true, fileMustExist: true });
  try {
    const result = verify.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`Backup integrity check failed: ${result}`);
  } finally { verify.close(); }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  fs.writeFileSync(`${target}.sha256`, `${digest}  ${path.basename(target)}\n`, { mode: 0o600 });
  const stat = fs.statSync(target);
  // Keep at least the newest backup; prune only files older than retention.
  for (const name of fs.readdirSync(BACKUP_DIR).filter(n => /^chandrahasa-.*\.sqlite$/.test(n))) {
    const file = path.join(BACKUP_DIR, name);
    if (file !== target && Date.now() - fs.statSync(file).mtimeMs > KEEP * 86400000) {
      const mediaPath = file.replace(/\\.sqlite$/, '.media.tar.gz');
      fs.rmSync(file, { force: true }); fs.rmSync(`${file}.sha256`, { force: true });
      fs.rmSync(mediaPath, { force: true }); fs.rmSync(`${mediaPath}.sha256`, { force: true });
    }
  }
  return { file: target, bytes: stat.size, sha256: digest, integrity: 'ok', mediaArchive };
}

if (require.main === module) createBackup().then(x => { console.log(JSON.stringify(x, null, 2)); }).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { createBackup };
