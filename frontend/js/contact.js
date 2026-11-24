/* Chandrahasa — contact form */
'use strict';
document.getElementById('contactForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('contactError');
  errorBox.classList.remove('show');
  const name = document.getElementById('ctName').value.trim();
  const email = document.getElementById('ctEmail').value.trim();
  const subject = document.getElementById('ctSubject').value.trim();
  const message = document.getElementById('ctMessage').value.trim();
  if (message.length < 10) { errorBox.textContent = 'Please write at least a sentence or two (10+ characters).'; errorBox.classList.add('show'); return; }
  const btn = document.getElementById('contactBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Sending…';
  try {
    const d = await CH.api('/api/contact', { body: { name, email, subject, message } });
    CH.toast(d.message || 'Message received ✦');
    e.target.reset();
  } catch (err) {
    errorBox.textContent = err.message || 'Could not send — please try WhatsApp instead.';
    errorBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = 'Send message';
  }
});
