// Frontend/public/register.js
// Handles registration + Guidelines acceptance + password strength toggle (CSP-safe)
import { api, q } from './main.js';

const form       = q('#regForm');
const nameEl     = q('#name');
const mailEl     = q('#email');
const passEl     = q('#password');
const agreeBox   = q('#termsCheckbox');
const errEl      = q('#err');
const btnEl      = q('#submitBtn');
const toggleShow = q('#toggleShowPwd');
const strengthFill = q('#pwdStrengthFill');
const strengthLbl  = q('#pwdStrengthLabel');

// Toggle password visibility
toggleShow?.addEventListener('click', () => {
  if (passEl.type === 'password') {
    passEl.type = 'text';
    toggleShow.textContent = 'Hide password';
  } else {
    passEl.type = 'password';
    toggleShow.textContent = 'Show password';
  }
});

// Password strength evaluation
function evalStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

function updateStrength(pwd) {
  const score = evalStrength(pwd);
  const pct = (score / 5) * 100;
  strengthFill.style.width = pct + '%';

  let color = '#ef4444', label = 'Very weak';
  if (score === 2) { color = '#f59e0b'; label = 'Weak'; }
  else if (score === 3) { color = '#60a5fa'; label = 'Moderate'; }
  else if (score === 4) { color = '#22c55e'; label = 'Good'; }
  else if (score === 5) { color = '#059669'; label = 'Strong'; }

  strengthFill.style.background = color;
  strengthLbl.textContent = 'Strength: ' + label;
}

// Revalidate form for password length + terms checkbox
function validateForm() {
  const valid = passEl.value.length >= 8 && agreeBox.checked;
  btnEl.disabled = !valid;
}

passEl?.addEventListener('input', () => {
  updateStrength(passEl.value);
  validateForm();
});
agreeBox?.addEventListener('change', validateForm);

// Final form submit logic
form?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  errEl.textContent = '';

  const name = nameEl.value.trim();
  const email = mailEl.value.trim();
  const password = passEl.value || '';
  const acceptedGuidelines = !!agreeBox.checked;

  if (!name || !email || !password) {
    errEl.textContent = 'Please fill all fields.';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (!acceptedGuidelines) {
    errEl.textContent = 'You must agree to the Community Guidelines.';
    return;
  }

  btnEl.disabled = true;
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: { name, email, password, acceptedGuidelines }
    });
    window.location.href = '/account.html';
  } catch (e) {
    errEl.textContent = e?.message || 'Registration failed.';
  } finally {
    btnEl.disabled = false;
  }
});
