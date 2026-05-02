# gordonwongmd.com — Intake Flow Changelog

This file tracks every meaningful change to the patient intake flow on
**gordonwongmd.com** (GitHub repo `gw4494503/medical-site`, served via
GitHub Pages from the `main` branch). Includes architecture overview,
backup branches, open items, and a reverse-chronological commit log.

Companion mockup changelog (rounds 1–11 of the iterative mockup phase):
`/Users/gwai/Claude Project AI-Frozen/Website Gordon/intake-mockup/CHANGELOG.md`

---

## Architecture (current state, May 2026)

### Front-end (gordonwongmd.com)

```
medical-site/
├── index.html                       # homepage (Patient Portal section
│                                       links to intake flow + card update)
├── schedule.html                    # patient-only scheduling gate
├── form-billing.html                # legacy URL — redirects to
│                                       /intake/card-on-file.html
├── form-new-patient.html            # legacy URL — kept for old email links
├── form-refill.html                 # medication refill request
└── intake/
    ├── intake.html                  # the hub
    ├── intake-shared.js             # shared utility module (loaded by
    │                                  every form; ?v=N cache-buster)
    ├── new-patient.html             # Form 1 — full new-patient intake
    ├── hipaa.html                   # Form 2 — HIPAA Privacy Acknowledgment
    ├── telehealth.html              # Form 3 — Telehealth Informed Consent
    ├── financial.html               # Form 4 — Financial Policy + Card-on-File Authorization
    ├── card-on-file.html            # Form 5 — Update Card on File
    ├── medicare-optout.html         # Form 6 — Medicare Private Contract (65+)
    └── minor-consent.html           # Form 7 — Consent to Treat a Minor (<18)
```

### Back-end

| Service | What it does |
|---|---|
| **Firebase project `gordonwongmd-billing`** | Hosts all Cloud Functions, Firestore, secrets. |
| **Cloud Function `verifyPatient`** | `onRequest`, public. Powers the scheduling-gate verification. DOB exact + fuzzy first/last name match against `patients` collection. Returns `{match, greeting}`. |
| **Cloud Function `submitSignedForm`** | `onRequest`, public. Receives every form's submit. (1) Tries to match patient via the same fuzzy rule. (2) Generates a Google Doc of the signed form (full policy text + signature + audit footer with IP, user-agent, timestamp, policy version). (3) Writes the Doc to the **Signed Forms Drive folder** with filename `LastName FirstName MMDDYY [FormName]`. (4) Writes a `signed_documents` Firestore record. (5) Calls `notifyOffice()` for `cardonfile` and `newpatient` form types. |
| **Cloud Function `notifyOffice` (helper)** | Sends a notification email via Gmail SMTP using nodemailer + `SMTP_APP_PASS` secret (Google Workspace App Password for `gordon@gordonwongmd.com`). Skip-if-not-configured: logs warning, returns gracefully if secret missing. |
| **Drive folder `Signed Forms`** | `1KF3DPA7WH93KDt_O1GFh5QVzrQjhX5VI` — on a Shared Drive (so files don't count against personal storage). All signed form Docs land here, sorted alphabetically by patient last name. |
| **Firestore collection `signed_documents`** | One record per submission. Fields: `patient_id`, `unmatched`, `form_type`, `signed_at`, `patient_name_first/last`, `patient_dob_mmddyy`, `patient_email/phone`, `signed_name`, `signer_role`, `ip_address`, `user_agent`, `policy_version`, `drive_doc_id`, `drive_doc_filename`, `parent2_pending`, `parent2_email/name`, `provider`, `created_at`. Read by future Intake Status dashboard. |
| **Existing `patients` Firestore collection** | Pre-existing from the billing app. `submitSignedForm` reads from it for patient matching and `verifyPatient` reads from it for the scheduling gate. **Never written to** by the new pipeline. |

### Patient-facing pipelines (parallel destinations)

For backwards compatibility with Dr. Wong's existing workflows, key forms
write to the *new* audit pipeline AND the *existing* Google Form/Sheet
pipeline simultaneously. Both submissions fire in parallel; failure of
either does not block the patient experience.

| Form | New pipeline (Cloud Function) | Legacy pipeline (Google Form → Sheet) |
|---|---|---|
| New Patient Intake | Audit Doc + Firestore + email | Existing new-patient inquiry Sheet (`197gUJqwvoNCbjQN9dIH2ePm-LvivXJbv2frErR52xjM`) |
| Card on File | Audit Doc + Firestore + email (last 4 only) | Existing billing Sheet (full PAN + CVV + exp + addr; manual Elavon entry by Dr. Wong) |
| HIPAA / Telehealth / Financial / Medicare / Minor | Audit Doc + Firestore (no Sheet feed) | n/a — these are new flows; no legacy pipeline existed |

### Secrets (Firebase Secret Manager)

| Secret | Purpose |
|---|---|
| `SMTP_APP_PASS` | Gmail App Password for gordon@gordonwongmd.com (16 chars, whitespace stripped at runtime). Used to send notification emails. Set 2026-05-01. |

Plus the existing billing-app secrets (`ELAVON_*`, `GOOGLE_SHEET_ID`,
`BILLING_LIVE`).

---

## Backup branches (for revert)

| Branch | Captures | Created |
|---|---|---|
| `backup-pre-intake-2026-05-01` | Site state immediately before the intake flow was deployed. | 2026-05-01 |
| `backup-before-content-edits-2026-05-01-1852` | Site state immediately before homepage content edits (removed Three Pillars, The Process, etc.). | 2026-05-01 |

To revert main to a backup:

```bash
cd /tmp/medical-site
git push origin <backup-branch-name>:main --force
```

---

## Open items (future work)

1. **Parent #2 invitation email** — minor-consent submissions with the
   "Email Consent Separately" option currently set `parent2_pending: true`
   in Firestore but do NOT actually send the invitation email. Implement
   in `notifyOffice.ts` (or a separate function) that sends the parent-#2
   email with a deep link to `/intake/minor-consent.html?for=...&token=...`
   for the second parent to complete their own consent. Update the chart
   flag in Firestore when their submission arrives.

2. **Intake Status dashboard** — add a tab to the existing billing app
   (`gordonwongmd-billing.web.app`) that reads from `signed_documents`
   collection and shows per-patient completion status. Computes
   age-based requirements (Medicare for 65+, Minor consent for <18).
   Surfaces "Consent Pending — Not Yet Authorized for Treatment" when
   minor + parent2_pending. About 200 lines of React/TypeScript reusing
   the billing app's existing patient-table styling.

3. **Direct Elavon tokenization** — replace the manual Sheet → Elavon
   workflow with a Cloud Function call that tokenizes the card via
   Elavon Converge API and writes the token directly to the patient's
   record. Eliminates the need for Dr. Wong to copy-paste card details.
   ~100 lines reusing `functions/src/gateway/`. After this is in place,
   the Sheet feed for card-on-file can be retired.

4. **Pronouns in new-patient Sheet** — currently captured in audit Doc
   and Firestore but not in the legacy Sheet (the Sheet's source Google
   Form has no Pronouns question). To add: open the Form in editor,
   add a "Preferred Pronouns" short-answer question, get its `entry.NNN`
   ID, add to `new-patient.html`'s Sheet post.

5. **Daily 65th-birthday alert** — small scheduled Cloud Function that
   runs daily and emails Dr. Wong a list of patients turning 65 within
   the next 30 days, so he can preemptively send the Medicare contract
   link. Trivial once `signed_documents` is populated.

6. **Policy version migration** — when policy text changes (e.g.
   cancellation window changes from 48 hr to 72 hr), bump
   `POLICY_VERSION` in `config.ts`, redeploy. Old signed Docs preserve
   the policy text they were signed under; future Intake Status
   dashboard could surface "Patients on v1.0" so they can be re-emailed
   to re-sign v2.0.

7. **Attorney review** — every form should be reviewed by a CA-licensed
   health-care attorney before being relied on for legal enforcement.
   Particularly:
     - Financial form's "unavoidable absence at the Practice's
       discretion" exception (humane but unconventional)
     - Minor-consent's parent-2 invitation flow
     - Medicare contract (CMS-prescribed text — must not be paraphrased)

---

## Commit log (reverse chronological)

### 2026-05-02 — Card form polish + dev cleanup

- **`66ec492`** — Card form splits billing address into Street + Zip
  (separate required fields, individually validated). Audit Doc shows
  them broken out. Sheet feed composes them back into the existing
  single billing-address column. Removed "Reset Mockup Progress" button
  from the live hub (was a dev-only aid). Cloud Function `formContent.ts`
  updated to render the new fields.

### 2026-05-02 — New-patient Sheet feed + Google Form fixes

- **`6784850`** — Fix DOB submission to legacy Google Form: must use
  split `_year`/`_month`/`_day` sub-fields (Google Date question type).
  Submitting MM/DD/YYYY as a single string was being silently rejected.
- **`6784850`** — Fix Gender "Other" submission: must use magic value
  `__other_option__` plus `.other_option_response` companion field.
- **`1bc16ce`** — New-patient form now also POSTs to the existing Google
  Form so the practice's new-patient inquiry Sheet
  (`197gUJqwvoNCbjQN9dIH2ePm-LvivXJbv2frErR52xjM`) keeps receiving rows
  exactly as it did under the old `form-new-patient.html`. Cloud Function
  `notifyOffice` extended to send `New patient inquiry — [Name]` email.

### 2026-05-02 — Card form Sheet feed + Elavon workflow restored

- **`dac4c2c`** — Card-on-file form now POSTs full card details (PAN,
  CVV, exp, addr) to the existing billing Google Form so the office
  Sheet keeps receiving them for manual Elavon entry. Cloud Function
  receives only last 4 + audit metadata (no full PAN ever stored on
  the practice's systems).

### 2026-05-02 — Header link + flipped back-link default

- **`9486b9d`** — "GORDON WONG MD" header text on every page is now a
  clickable link to `/`. Flipped back-link default: HTML now defaults
  to "← gordonwongmd.com" (deep-link case is the common one), JS only
  rewrites to "← Intake Hub" when `?flow=intake` is in the URL.
  Robust against JS being cached, blocked, or failing to run.
  `intake-shared.js` cache-busted to `?v=3`.
- **`5bfe689`** — Initial flow-aware navigation (later flipped in
  `9486b9d`).

### 2026-05-02 — Card form needs DOB

- **`13ac5c7`** — Add Patient DOB field to card-on-file form. Without it
  the form was unusable for existing patients arriving cold (no saved
  identity). Now: required field, MM/DD/YYYY auto-formatted, validated.

### 2026-05-01 — Email notification for card updates

- Cloud Function `notifyOffice` added: sends email to
  `gordon@gordonwongmd.com` after each card-on-file submission via
  Gmail SMTP (nodemailer + `SMTP_APP_PASS` Gmail App Password).
- Old `/form-billing.html` URL replaced with a redirect to
  `/intake/card-on-file.html` — old emailed links continue to work.

### 2026-05-01 — Homepage content edits

- **`71a2a08`** — Per Dr. Wong:
  - Removed "Three pillars of your care" (How We Work) section
  - Removed "From first conversation to lasting care" (The Process) section
  - "The Approach" → "My Approach" with new headline "I focus on
    compassionate evidence-based medical and psychiatric care"
  - Removed "Services designed for depth, not volume" subhead
  - Expanded bio (Stanford training detail, undergrad/med school
    + MPH at Northwestern, "guest lecturer" wording, hobbies sentence)
  - Replaced publications block with full chronological list,
    lead-author papers first
  - Removed "Precision. Partnership. Clarity." footer tagline
  - Removed "Practice Operational" status indicator from footer

### 2026-05-01 — Intake flow deployed live

- **`2a79f90`** — Deploy 7 hardened patient forms + hub to `/intake/`.
  Homepage Patient Portal section updated:
  - Action 02 "New Patient Inquiry" → `/intake/intake.html` (full flow)
  - Action 03 "Update Billing" → `/intake/card-on-file.html` (hardened)
  - Schedule (Action 01) and Refill (Action 04) unchanged.

### 2026-05-01 — Cloud Function backend deployed

- Cloud Function `submitSignedForm` deployed to
  `gordonwongmd-billing.us-west1`. Generates Google Docs in the
  `Signed Forms` Drive folder (`1KF3DPA7WH93KDt_O1GFh5QVzrQjhX5VI`,
  on Shared Drive so it has its own storage quota separate from the
  service account). Writes Firestore records to `signed_documents`.
- All 7 mockup forms wired to call the function.
- Firestore schema documented in this file (Architecture section).

### 2026-04-29 → 2026-05-01 — Mockup phase

See `/Users/gwai/Claude Project AI-Frozen/Website Gordon/intake-mockup/CHANGELOG.md`
for the full mockup history (11 rounds of corrections from the practice
owner). Highlights:

- 7 forms + hub built from scratch with shared utility module
- 25 specific corrections from Dr. Wong (cancellation window, fee
  policy, recording wording, custody options, no automatic emails, etc.)
- Inline validation (green/clay borders, "Still Needed" pills)
- Identity persistence across forms with "Not me?" reset link
- Conditional forms (Medicare for 65+, Minor for under-18) with
  age-based requirement detection
- "Intake Complete" celebration banner

---

## Operational notes

- **Cache-busting**: `intake-shared.js` is referenced as `?v=N` in every
  HTML. When updating the shared script, bump N to force browsers to
  refetch immediately. Currently at `?v=3`.
- **Cloud Function logs**: `firebase functions:log --only submitSignedForm`
- **Email troubleshooting**: if notification emails stop arriving, check
  function logs for `[notifyOffice]` messages. The most likely failure
  is an invalidated Gmail App Password — regenerate at
  https://myaccount.google.com/apppasswords and update the secret with
  `printf "<new>" | firebase functions:secrets:set SMTP_APP_PASS`.
- **Drive folder access**: if signed-form generation starts failing
  with "File not found", the most likely cause is the runtime service
  account losing access to the Drive folder. Re-share `Signed Forms`
  with `667274028685-compute@developer.gserviceaccount.com` as Editor.

---

## Companion skill

A reusable skill capturing the patterns from this build is at:

`/Users/gwai/.claude/skills/medical-form-builder/`

It bundles the form templates, validation patterns, legal references,
and the 25-correction log from the mockup phase. A future Claude
session can install it via `~/.claude/skills/medical-form-builder/` and
get the patterns + canonical `intake-shared.js` as starter assets.
