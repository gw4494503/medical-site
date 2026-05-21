# Handoff — gordonwongmd.com

*Read this before doing anything else in this repo.*
*Last updated: 2026-05-04.*

This repo is the public website for Gordon Wong M.D., M.P.H. (private
psychiatry, Palo Alto, California). Served from `main` via GitHub
Pages at https://gordonwongmd.com.

---

## Where everything lives

| Concern | Lives in |
|---|---|
| **Public website source** | this repo (`gw4494503/medical-site`) |
| **Cloud Functions backend** | `/Users/gwai/Claude projects AI/Billing/functions/` — Firebase project `gordonwongmd-billing`, region `us-west1`. Every patient-facing form on this website POSTs to a Cloud Function in that project. |
| **Billing app (internal MA tool)** | same project as Cloud Functions. Lives at `gordonwongmd-billing.web.app`. |
| **Drive: invoices** | folder ID `1eyWFlWBhNadoggDc1D_8rraCfJEN0lfD` (Shared Drive). |
| **Drive: signed forms** | folder ID `1KF3DPA7WH93KDt_O1GFh5QVzrQjhX5VI` (Shared Drive). Filename pattern `LastName FirstName MMDDYY [FormName]`. |
| **Firestore patients collection** | `patients` (~714 records). DOB stored as MMDDYY. Read by `verifyPatient`, `submitSignedForm`, `lookupBackSignRecord` — never written by website-side code. |
| **Firestore signed-documents collection** | `signed_documents`. One record per signed form submission. Schema in `intake/CHANGELOG.md`. |
| **Practice-internal billing project handoff** | `/Users/gwai/Claude projects AI/Billing/HANDOFF.md` |
| **Medicare back-sign project docs** | `/Users/gwai/Claude Project AI-Frozen/Website Gordon/medicare-backsign/` |
| **Reusable form-building skill** | `~/.claude/skills/medical-form-builder/` (read SKILL.md + references/) |

---

## Read in this order for orientation

1. **`intake/CHANGELOG.md`** — architecture overview, file map, Cloud
   Function reference, parallel pipelines (new audit-Doc vs legacy
   Google Form/Sheet), secrets, backup branches, open items, full
   commit log. This is the single best source of truth for *what
   exists and why*.

2. **`~/.claude/skills/medical-form-builder/SKILL.md`** — encodes 25
   hard-won corrections from the practice owner during the iterative
   mockup phase. **Read before writing any patient-facing markup.**
   Includes `references/corrections-log.md`, `form-types.md`,
   `california-legal.md`, `architecture.md`.

3. **`/Users/gwai/Claude projects AI/Billing/HANDOFF.md` and
   `/SYSTEM_OVERVIEW.md`** — the Cloud Function side. Contains
   patients-collection schema, Elavon integration details, secrets,
   deployment commands.

---

## Live URLs

| Page | URL |
|---|---|
| Homepage | https://gordonwongmd.com |
| Schedule (patient verification gate) | https://gordonwongmd.com/schedule.html |
| Intake hub (new patients) | https://gordonwongmd.com/intake/intake.html |
| Update Card on File | https://gordonwongmd.com/intake/card-on-file.html |
| Medicare back-sign (existing 65+ patients) | https://gordonwongmd.com/intake/medicare-paperwork.html |
| Refill request | https://gordonwongmd.com/form-refill.html |
| Receipts portal | https://receipts.gordonwongmd.com |

---

## Backup branches (for emergency revert)

| Branch | Captures | Created |
|---|---|---|
| `backup-pre-intake-2026-05-01` | State before intake flow was deployed | 2026-05-01 |
| `backup-before-content-edits-2026-05-01-1852` | State before homepage content edits | 2026-05-01 |
| `backup-pre-card-pause-2026-05-03-2350` | State before the temporary card-on-file pause | 2026-05-03 |

To revert main to a backup:

```bash
cd /tmp/medical-site
git push origin <backup-branch-name>:main --force
```

---

## Hard rules (do not violate)

1. **Limited patient emails — one acknowledgment only, no PHI.** As of
   2026-05-04, new-patient inquiry submissions trigger ONE warm
   acknowledgment email from `noreply@gordonwongmd.com` to the
   submitting patient (handled by `notifyPatient.ts`). It contains no
   PHI — just a thank-you and honest-capacity messaging. **No other
   form type sends patient-side email.** Office notifications still
   route to `gordon@gordonwongmd.com` via `notifyOffice.ts` for
   `cardonfile` and `newpatient` form types.
2. **CMS Medicare contract text is verbatim.** Don't paraphrase. Only
   per-interval effective/expiration dates change between back-sign forms.
3. **Full credit card PANs are never stored on practice systems.**
   Tokenized via Elavon Converge or transmitted directly to the
   processor; this codebase only retains last 4 + exp + addr.
4. **Drive folders must be on a Shared Drive.** Service accounts have
   zero personal storage; My Drive parents fail with
   "user storage quota exceeded."
5. **No `mode: 'no-cors'` for anything that needs to confirm success.**
   It silently swallows server-side rejections. Use CORS-enabled
   Cloud Function endpoints.
6. **No `<input type="date">` for DOB.** It displays in OS locale
   (DD/MM/YYYY in Canada, MM/DD/YYYY in US). Always use a text input
   with MM/DD/YYYY placeholder and JS auto-format.
7. **Single source of truth for validators.** All `Intake.isValid`
   types live inside `intake-shared.js`. Don't patch from outside —
   inline error rendering uses a closure-private function the
   external patch can't reach.

---

## Operational notes

- **Deploys** are automatic via GitHub Pages on push to `main`.
  Typically live within 1–2 minutes.
- **Cloud Function logs**:
  ```
  cd "/Users/gwai/Claude projects AI/Billing"
  firebase functions:log --only submitSignedForm
  firebase functions:log --only verifyPatient
  firebase functions:log --only lookupBackSignRecord
  ```
- **Cache-busting**: `intake-shared.js` is loaded with a `?v=N` query
  parameter from every HTML. Bump N when updating the shared script.
- **Drive folder permissions**: if Doc creation starts failing with
  "File not found", re-share the target folder with
  `667274028685-compute@developer.gserviceaccount.com` as Editor.
- **Email troubleshooting**: notification emails depend on the
  `SMTP_APP_PASS` secret (Gmail App Password). Regenerate at
  https://myaccount.google.com/apppasswords and update:
  ```
  printf "<new>" | firebase functions:secrets:set SMTP_APP_PASS
  firebase deploy --only functions:submitSignedForm
  ```
- **Patient acknowledgment emails** are sent FROM
  `noreply@gordonwongmd.com` (Send-As alias on the gordon@ Gmail
  account). If patients stop getting them, the most common cause is
  the alias being removed from Gmail settings. Re-add in Gmail →
  Settings → Accounts → Send mail as → Add another email address →
  `noreply@gordonwongmd.com`.
- **Auto-save** on the new-patient form persists field values to
  `localStorage['intake-newpatient-draft']` so patients can resume a
  partial submission. Banner offers a "Start fresh" reset link. Draft
  is cleared automatically on successful submission.
