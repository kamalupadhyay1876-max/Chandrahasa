'use strict';
/**
 * One-time production admin bootstrap.
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... node scripts/create-admin.js
 * Never commit credentials or place them in source control.
 */
const crypto = require('crypto');
const db = require('../db');

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const name = String(process.env.ADMIN_NAME || 'Store Administrator').trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('ADMIN_EMAIL must be a valid email address.');
  process.exit(1);
}
if (password.length < 16 || password.length > 128) {
  console.error('ADMIN_PASSWORD must be 16–128 characters.');
  process.exit(1);
}
if (db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()) {
  console.error('An admin account already exists. Refusing to create another through bootstrap.');
  process.exit(1);
}
if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
  console.error('That email already exists. Use a different email; this script never promotes existing accounts.');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
db.prepare("INSERT INTO users (name,email,password_hash,salt,role) VALUES (?,?,?,?, 'admin')")
  .run(name || 'Store Administrator', email, hash, salt);
console.log(`Admin account created for ${email}. Remove ADMIN_PASSWORD from the environment now.`);
