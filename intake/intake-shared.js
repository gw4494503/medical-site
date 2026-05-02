// ─── Shared utilities for intake forms ─────────────────────────────────────
// Loaded by every form via <script src="intake-shared.js"></script>.
// Provides:
//   • Identity prefill / save (so name+DOB+email+phone carry across forms)
//   • DOB and name normalization
//   • Field validators
//   • Inline visual validation (green when valid, clay when invalid+touched)
//   • "Still needed" summary builder near the submit button

window.Intake = (function () {

  // ─── Identity (shared across the 4 adult forms) ─────────────────────────
  // Stored under intake-identity in localStorage. Cleared by the hub's reset.
  function loadIdentity() {
    try { return JSON.parse(localStorage.getItem('intake-identity') || 'null'); }
    catch { return null; }
  }
  function saveIdentity(obj) {
    if (!obj || typeof obj !== 'object') return;
    const existing = loadIdentity() || {};
    localStorage.setItem('intake-identity', JSON.stringify({ ...existing, ...obj }));
  }

  // ─── Formatters ─────────────────────────────────────────────────────────
  function formatDob(el) {
    const d = el.value.replace(/\D/g, '').slice(0, 8);
    let o = d;
    if (d.length >= 5) o = d.slice(0,2) + '/' + d.slice(2,4) + '/' + d.slice(4);
    else if (d.length >= 3) o = d.slice(0,2) + '/' + d.slice(2);
    el.value = o;
    if (el.dataset.touched === '1') validateField(el);
  }
  function formatPhone(el) {
    const d = el.value.replace(/\D/g, '').slice(0, 10);
    let o = d;
    if (d.length >= 7) o = '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
    else if (d.length >= 4) o = '(' + d.slice(0,3) + ') ' + d.slice(3);
    else if (d.length >= 1) o = '(' + d;
    el.value = o;
    if (el.dataset.touched === '1') validateField(el);
  }
  function normalizeName(s) { return (s||'').trim().replace(/\s+/g,' ').toLowerCase(); }

  // ─── Validators ─────────────────────────────────────────────────────────
  const RX = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    dob:   /^\d{2}\/\d{2}\/\d{4}$/,
    phone: /^\(\d{3}\) \d{3}-\d{4}$/,
    exp:   /^(\d{2})\/(\d{4})$/,
    cvv:   /^\d{3,4}$/,
  };
  function luhnOk(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = parseInt(num[i], 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function expNotPast(val) {
    const m = RX.exp.exec(val); if (!m) return false;
    const mm = +m[1], yyyy = +m[2];
    if (mm < 1 || mm > 12) return false;
    const expEnd = new Date(yyyy, mm, 0);
    const now = new Date();
    return expEnd >= new Date(now.getFullYear(), now.getMonth(), 1);
  }
  // Single source of truth for field validation. All forms use this — the
  // inline error renderer (validateField) and the missing-summary builder
  // both call isValid(type, val), so they always agree.
  function isValid(type, val) {
    val = (val || '').trim();
    if (!val) return false;
    if (type === 'email') return RX.email.test(val);
    if (type === 'dob')   return RX.dob.test(val);
    if (type === 'phone') return RX.phone.test(val);
    if (type === 'cvv')   return RX.cvv.test(val);
    if (type === 'exp')   return expNotPast(val);
    if (type === 'card') {
      const digits = val.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 16 && luhnOk(digits);
    }
    if (type === 'text')  return val.length >= 1;
    return true;
  }
  function validationMessage(type, val) {
    val = (val || '').trim();
    if (!val) return 'Required';
    if (type === 'email' && !RX.email.test(val)) return 'Please enter a valid email';
    if (type === 'dob'   && !RX.dob.test(val))   return 'Use MM/DD/YYYY format';
    if (type === 'phone' && !RX.phone.test(val)) return 'Use a 10-digit phone number';
    if (type === 'cvv'   && !RX.cvv.test(val))   return 'CVV must be 3 or 4 digits';
    if (type === 'exp') {
      if (!RX.exp.test(val))         return 'Use MM/YYYY format';
      if (!expNotPast(val))           return 'Card is expired';
    }
    if (type === 'card') {
      const digits = val.replace(/\D/g, '');
      if (digits.length < 13)        return 'Card number is too short';
      if (digits.length > 16)        return 'Card number is too long';
      if (!luhnOk(digits))           return 'Card number does not look valid';
    }
    return '';
  }

  // ─── Inline visual validation ───────────────────────────────────────────
  // Each input may declare `data-validate="email|dob|phone|text"` and
  // `data-label="Email"`. On blur (and after first interaction) we toggle
  // .inp-ok / .inp-bad classes and show/hide a sibling .field-error span.
  function ensureErrorSpan(el) {
    let err = el.parentElement.querySelector(':scope > .field-error');
    if (!err) {
      err = document.createElement('span');
      err.className = 'field-error';
      el.insertAdjacentElement('afterend', err);
    }
    return err;
  }
  function validateField(el) {
    if (!el.dataset.validate) return true;
    const type = el.dataset.validate;
    const val = el.value;
    const ok = isValid(type, val);
    const touched = el.dataset.touched === '1';
    el.classList.toggle('inp-ok',  ok && val.trim().length > 0);
    el.classList.toggle('inp-bad', !ok && touched);
    const err = ensureErrorSpan(el);
    err.textContent = (!ok && touched) ? validationMessage(type, val) : '';
    err.style.display = (!ok && touched) ? 'block' : 'none';
    return ok;
  }
  function attachValidation(el) {
    if (!el || !el.dataset.validate) return;
    el.addEventListener('blur',  () => { el.dataset.touched = '1'; validateField(el); });
    el.addEventListener('input', () => { if (el.dataset.touched === '1') validateField(el); });
  }
  function attachAll(root = document) {
    root.querySelectorAll('input[data-validate], textarea[data-validate], select[data-validate]').forEach(attachValidation);
  }

  // ─── "Still needed" summary near submit button ──────────────────────────
  function setMissingSummary(containerEl, items) {
    if (!containerEl) return;
    if (!items || items.length === 0) {
      containerEl.style.display = 'none';
      containerEl.innerHTML = '';
      return;
    }
    containerEl.style.display = 'block';
    containerEl.innerHTML =
      '<span class="ms-label">Still needed</span><span class="ms-list">' +
      items.map(i => '<span class="ms-pill">' + i + '</span>').join('') +
      '</span>';
  }

  // ─── Identity prefill banner ────────────────────────────────────────────
  // Call once on page load, after wiring up the form. If identity exists,
  // populates given field IDs and shows a small dismissible banner.
  function applyIdentityPrefill(fieldMap, bannerSelector) {
    const id = loadIdentity();
    if (!id) return null;
    let any = false;
    Object.entries(fieldMap).forEach(([key, fieldId]) => {
      if (!fieldId) return;
      const el = document.getElementById(fieldId);
      if (!el || el.value) return;
      if (id[key]) { el.value = id[key]; any = true; }
    });
    if (any && bannerSelector) {
      const b = document.querySelector(bannerSelector);
      if (b) b.style.display = 'flex';
    }
    return id;
  }

  // ─── Cloud Function endpoint ────────────────────────────────────────────
  // Single submit endpoint shared by all 7 patient-facing forms. Each form
  // builds its own payload (formType, patient, signature, formData,
  // acknowledgments, optionally parent2) and calls Intake.submitSignedForm.
  // The function generates a Google Doc, saves it to the Drive folder, and
  // writes a Firestore record. See submitSignedForm.ts for the full flow.
  const SUBMIT_URL = "https://us-west1-gordonwongmd-billing.cloudfunctions.net/submitSignedForm";

  async function submitSignedForm(payload) {
    const res = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) {
      const msg = (data && data.error) || `Submission failed (HTTP ${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  // Split a single "Full Legal Name" field into firstName + lastName for the
  // Cloud Function payload (which uses them in the Drive filename pattern
  // "LastName FirstName MMDDYY [FormName]"). Heuristic: first whitespace
  // token is firstName; everything after is lastName. Imperfect for
  // multi-part first names, but matches how most forms collect names.
  function splitName(full) {
    const parts = (full || "").trim().split(/\s+/);
    if (parts.length === 0 || (parts.length === 1 && !parts[0])) {
      return { firstName: "", lastName: "" };
    }
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  // ─── Flow-aware navigation ──────────────────────────────────────────────
  // Patients arrive at a form one of two ways:
  //   (1) Through the intake hub (URL has ?flow=intake). The "← Intake Hub"
  //       back-link makes sense; the success screen's "Continue to next
  //       form" pointer makes sense.
  //   (2) Deep-linked from the homepage Patient Portal or an email. The
  //       patient is here for ONE form. A back-link to the intake hub
  //       would dump them into the new-patient flow, which is confusing.
  //       Redirect those links back to the homepage instead.
  //
  // Hub card links append ?flow=intake to each form URL. This helper runs
  // on every form load:
  //   • If flow=intake → propagate the param onto any other hub-internal
  //     links so the patient stays in the flow as they navigate.
  //   • If not → rewrite any "intake.html" link to "/" and soften the
  //     visible text accordingly.
  function applyFlowAwareNavigation() {
    const inHubFlow = new URLSearchParams(location.search).get("flow") === "intake";
    document.querySelectorAll("a[href]").forEach((a) => {
      const raw = a.getAttribute("href") || "";
      if (!raw) return;
      const isHubLink = raw === "intake.html" || raw === "./intake.html" || raw.endsWith("/intake.html");
      if (inHubFlow) {
        if (isHubLink && !raw.includes("?flow=")) {
          a.setAttribute("href", raw + "?flow=intake");
        }
      } else {
        if (isHubLink) {
          a.setAttribute("href", "/");
          const txt = a.textContent || "";
          if (/intake hub/i.test(txt)) {
            a.textContent = txt.replace(/intake hub/gi, "gordonwongmd.com");
          } else if (/continue to next form/i.test(txt)) {
            a.textContent = "← Return to gordonwongmd.com";
          }
        }
      }
    });
  }

  // Run automatically once the DOM is ready.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFlowAwareNavigation);
  } else {
    applyFlowAwareNavigation();
  }

  return {
    loadIdentity, saveIdentity,
    formatDob, formatPhone, normalizeName,
    isValid, validationMessage, validateField, attachAll,
    setMissingSummary, applyIdentityPrefill,
    submitSignedForm, splitName,
    applyFlowAwareNavigation,
  };
})();
