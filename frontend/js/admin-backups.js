'use strict';
(() => {
  const panel = document.querySelector('#backupPanel');
  if (!panel || !window.CH) return;
  const status = panel.querySelector('#backupStatus');
  const list = panel.querySelector('#backupList');
  const create = panel.querySelector('#createBackup');
  const refresh = panel.querySelector('#refreshBackups');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
  async function load() {
    list.textContent = 'Loading verified backups…';
    try {
      const result = await CH.api('/api/admin/backups');
      const backups = result.backups || [];
      if (!backups.length) { list.innerHTML = '<p>No backup files yet. Create the first verified backup.</p>'; return; }
      list.innerHTML = '<div class="backup-list">' + backups.map(b => `<article class="backup-row"><div><strong>${esc(b.name)}</strong><small>${bytes(Number(b.bytes)||0)} · ${esc(b.createdAt || b.modified || '')}</small><code>${esc(b.sha256 || 'Checksum metadata unavailable')}</code></div><span class="backup-state">${b.checksumPresent ? 'Checksum present' : 'Checksum missing'}</span></article>`).join('') + '</div>';
    } catch (error) { list.textContent = `Could not load backups: ${error.message}`; }
  }
  create.addEventListener('click', async () => {
    create.disabled = true; status.textContent = 'Creating snapshot and checking integrity…';
    try {
      const result = await CH.api('/api/admin/backups', {method:'POST', body:{}});
      const backup = result.backup || {};
      status.textContent = `Backup verified: ${backup.name || 'created'} · ${bytes(Number(backup.bytes)||0)} · SHA-256 ${backup.sha256 || 'recorded'}`;
      await load();
    } catch (error) { status.textContent = `Backup failed: ${error.message}`; }
    finally { create.disabled = false; }
  });
  refresh.addEventListener('click', load);
  load();
})();
