'use strict';
// Private Railway-shell recovery only. Never expose these values in logs or source control.
// Usage: ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='new-strong-password' RECOVERY_CONFIRM=I_AM_THE_STORE_OWNER node scripts/recover-admin.js
const crypto = require('crypto');
const db = require('../db');
const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const confirmation = String(process.env.RECOVERY_CONFIRM || '');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set ADMIN_EMAIL to the exact account email to recover.');
if (password.length < 16 || password.length > 128) throw new Error('ADMIN_PASSWORD must be 16–128 characters.');
if (confirmation !== 'I_AM_THE_STORE_OWNER') throw new Error('Set RECOVERY_CONFIRM=I_AM_THE_STORE_OWNER after verifying this is your store.');
const target = db.prepare('SELECT id,role FROM users WHERE email=?').get(email);
if (!target) throw new Error('No account exists for this email. Refusing to create an account during recovery.');
const admin = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
if (admin && (target.role !== 'admin' || Number(admin.id) !== Number(target.id))) {
  throw new Error('A different Admin already exists. Recovery will not replace or demote that account.');
}
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
const tx = db.transaction(() => {
  if (!admin && target.role !== 'admin') db.prepare("UPDATE users SET role='admin' WHERE id=?").run(target.id);
  db.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=?').run(hash,salt,target.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(target.id);
});
tx();
console.log('Owner access recovered for ' + email + '. All previous sessions for this account were revoked. Remove ADMIN_PASSWORD and RECOVERY_CONFIRM from the shell environment.');
