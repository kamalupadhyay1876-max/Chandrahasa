/* Chandrahasa — auth pages: signup, login, forgot, reset */
'use strict';

const $ = (s) => document.querySelector(s);

/* after login/signup: merge is handled by store.js on next load; send people where they came from */
function nextUrl() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') ? next : '/account';
}

function bindForm(formId, btnId, handler) {
  const form = $(formId); if (!form) return;
  const errorBox = $('#authError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('show');
    const btn = $(btnId);
    const original = btn.textContent;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>One moment…';
    try {
      await handler();
      window.location.href = nextUrl();
    } catch (err) {
      errorBox.textContent = err.message || 'Something went wrong. Please try again.';
      errorBox.classList.add('show');
      btn.disabled = false; btn.textContent = original;
    }
  });
}

/* SIGN UP */
bindForm('#signupForm', '#signupBtn', async () => {
  const name = $('#suName').value.trim(), email = $('#suEmail').value.trim(), phone = $('#suPhone').value.trim();
  const password = $('#suPassword').value, confirm = $('#suPassword2').value;
  if (password !== confirm) throw new Error('The two passwords do not match.');
  if (password.length < 16) throw new Error('Password must be at least 16 characters.');
  if (!/^\+?[0-9\s-]{10,15}$/.test(phone)) throw new Error('Enter a valid phone number (10–15 digits).');
  const ownerSetupKey = $('#suOwnerKey')?.value.trim() || '';
  await CH.api('/api/auth/signup', { body: { name, email, phone, password, ownerSetupKey } });
});

/* LOG IN */
bindForm('#loginForm', '#loginBtn', async () => {
  const email = $('#loginEmail').value.trim(), password = $('#loginPassword').value;
  await CH.api('/api/auth/login', { body: { email, password } });
});

/* FORGOT */
const forgotForm = document.querySelector('#forgotForm');
if (forgotForm) {
  const errorBox = $('#authError');
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('show');
    const email = $('#forgotEmail').value.trim();
    const btn = $('#forgotBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Sending…';
    try {
      const d = await CH.api('/api/auth/forgot', { body: { email } });
      const box = $('#resetLinkBox');
      box.innerHTML = d.resetLink
        ? '<b>Demo mode — no email server configured.</b><br>Your single-use reset link (valid 30 minutes):<br><a href="' + d.resetLink + '" style="color:var(--gold-deep);font-weight:700;word-break:break-all">' + d.resetLink + '</a>'
        : 'If an account exists for <b>' + email.replace(/</g, '&lt;') + '</b>, a reset link is on its way. Check your inbox (and spam, just in case).';
      box.classList.remove('hidden');
      btn.textContent = 'Link sent ✓';
    } catch (err) {
      errorBox.textContent = err.message; errorBox.classList.add('show');
      btn.disabled = false; btn.textContent = 'Send Reset Link';
    }
  });
}

/* RESET */
const resetForm = document.querySelector('#resetForm');
if (resetForm) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const errorBox = $('#authError');
  if (!token) { errorBox.textContent = 'This reset link is missing its token. Request a fresh one.'; errorBox.classList.add('show'); }
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.remove('show');
    const p = $('#resetPassword').value, p2 = $('#resetPassword2').value;
    if (p !== p2) { errorBox.textContent = 'The two passwords do not match.'; errorBox.classList.add('show'); return; }
    const btn = $('#resetBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Updating…';
    try {
      await CH.api('/api/auth/reset', { body: { token, password: p } });
      window.location.href = '/login?reset=1';
    } catch (err) {
      errorBox.textContent = err.message; errorBox.classList.add('show');
      btn.disabled = false; btn.textContent = 'Update Password';
    }
  });
}
