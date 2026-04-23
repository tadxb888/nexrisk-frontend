# Secret rotation

## At a glance

This is the page where you rotate Taiga's cryptographic credentials — the keys and shared secrets that keep different processes authenticated to each other, keep user sessions signed, and keep sensitive data encrypted at rest. Three rotatable secrets, each with its own workflow and set of consequences. **Only root users can see this page.**

Settings page path: **Settings → Secret rotation**
Route: `/settings/rotation`

## What this page controls

This page does not write a config file. It calls four endpoints under `/auth/rotate/*` that generate fresh cryptographic material and return it **exactly once**. No rotated secret is persisted anywhere you can retrieve it again — after the modal closes, the plaintext is gone.

The three secrets:

1. **Internal secret** — `NEXRISK_INTERNAL_SECRET`. Shared secret used by the BFF to authenticate with the C++ backend on every request.
2. **JWT secret** — `NEXRISK_JWT_SECRET`. Signing key for user access and refresh tokens.
3. **Encryption key** — `NEXRISK_ENCRYPTION_KEY`. At-rest encryption key for LP credentials and user TOTP secrets.

## Who can access it

**`root` role only.** Other roles — including `administrator` and `sysadmin` — do not see the Secret rotation tile on the Settings hub at all; the tile is filtered out before the grid renders. If a non-root user somehow navigates to `/settings/rotation` directly, the route redirects them back to the hub.

This is deliberate. Rotating these secrets has blast-radius-wide consequences (session invalidation, BFF→backend handshake break, re-encryption of stored credentials). Only operators with root-level operational responsibility should do it.

## Before you change anything

Go through this checklist before clicking any **Rotate** button. Each rotation is a one-way operation — there is no "copy it from elsewhere later" option.

- [ ] A password manager or encrypted vault is open and ready to receive the new secret.
- [ ] You have SSH access to the host and can edit the service environment files.
- [ ] The service restart has been coordinated with anyone on the desk — rotating the JWT secret mid-session forces users to re-authenticate.
- [ ] The previous secret is archived (in case a roll-back is needed within the same service lifecycle, before restart).

The page itself shows this checklist in the right-hand column.

## The three rotations

Each rotation has its own card on the page. Each card has an **Env var** badge (the name of the environment variable you'll need to update), a **Restart** badge (what needs to restart after you save the new secret), and — for the encryption key only — a **501 stub** badge indicating the endpoint isn't fully implemented yet.

### 1. Internal secret

- **Env var:** `NEXRISK_INTERNAL_SECRET`
- **Restart:** `nexrisk_service` + `bff`
- **Confirmation phrase:** `ROTATE`
- **Value format:** 96-hex-character string
- **Available:** Yes, endpoint is live.

**What it's for:** every API call from the BFF to the C++ backend carries an `X-Internal-Secret` header. Both sides compare the header to their env var. If they don't match, the call is rejected with 401.

**Consequences of rotating:**

- A fresh 96-hex-character value is generated and shown once.
- The new value must be written to `NEXRISK_INTERNAL_SECRET` in **BOTH** the BFF environment **AND** the `nexrisk_service` environment.
- Restart the **BFF first**, then `nexrisk_service`. Order matters.
- If the BFF restarts with the old value, every BFF→backend call will fail with 401 until `nexrisk_service` also catches up.

### 2. JWT secret

- **Env var:** `NEXRISK_JWT_SECRET`
- **Restart:** `nexrisk_service`
- **Confirmation phrase:** `ROTATE`
- **Value format:** 128-hex-character string
- **Available:** Yes, endpoint is live.

**What it's for:** the HMAC signing key for user session tokens. Access tokens and refresh tokens both carry signatures derived from this key.

**Consequences of rotating:**

- A fresh 128-hex-character value is generated and shown once.
- The new value must be written to `NEXRISK_JWT_SECRET` in the `nexrisk_service` environment only.
- On service restart, **all outstanding access tokens become invalid immediately**. Every user sees their next API call fail with 401.
- Refresh tokens remain valid (they are not signed with the rotated key). Browsers will automatically use them to get fresh access tokens, so most users won't notice unless they're mid-request.
- Users actively making requests at the moment of restart will see a brief error and then recover on retry.

### 3. Encryption key

- **Env var:** `NEXRISK_ENCRYPTION_KEY`
- **Restart:** `nexrisk_service`
- **Confirmation phrase:** `ROTATE ENCRYPTION KEY` (longer and stricter — this is the destructive one)
- **Available:** Not yet — the POST endpoint returns 501. Only the preflight probe is live.

**What it's for:** at-rest encryption of LP credentials and user TOTP secrets. Every encrypted row in the database is decrypted on read with this key and encrypted on write with the same key.

**Consequences of rotating (once implemented):**

- A fresh encryption key is generated and shown once.
- Every LP credential record and every TOTP-enrolled user is **re-encrypted in place** during the call — an O(n) migration, not a config change.
- Settings writes and new-user enrolments are blocked for the duration of the migration.
- Estimated duration depends on how many encrypted rows exist. The preflight tells you the count and a rough ETA.

**Why it's gated behind a stricter phrase:** this is the rotation that touches the most rows and has the longest window of operational impact. A stricter phrase is a deliberate speed bump.

## The rotation modal

Clicking **Rotate <secret name>…** on any card opens a modal. The modal goes through up to four phases:

### Phase 1: Preflight (encryption key only)

For the encryption-key rotation, the modal first fetches `/auth/rotate/encryption-key/preflight`. This returns counts of encrypted rows and an ETA. Three fields shown:

- **LP accounts** — count of encrypted LP credential records.
- **TOTP users** — count of users with TOTP enrolment (encrypted TOTP secrets).
- **Est. duration** — seconds the re-encryption is expected to take.

Plus an `ok_to_proceed` signal. If the backend returns `false`, the rotation button is disabled with any blockers listed inline.

(For internal and JWT rotations, the modal skips straight to phase 2.)

### Phase 2: Confirm

Shows:

- **Consequences** — a bulleted warning box listing what will happen. Read this.
- **501 stub notice** (encryption only) — a blue banner saying the destructive endpoint isn't wired yet.
- **Preflight counts** (encryption only) — the numbers from phase 1.
- **Typed confirmation input** — you must type the exact confirmation phrase (case-sensitive, spaces matter) to enable the Rotate button.

The input border turns teal when the phrase matches. Until it matches, the **Rotate now** button is disabled.

Pressing **Esc** closes the modal in this phase. You can also cancel.

### Phase 3: Rotating

The rotation request is in flight. The modal shows "Rotating <secret>…" with a warning not to close the window. Esc is disabled in this phase. Don't navigate away.

### Phase 4: Reveal

The new secret is displayed in a large monospace block. This is the **only** time you will ever see the plaintext.

The reveal panel has:

- **A large amber warning** reading "This value will not be shown again."
- **The secret itself** in a copy-friendly block. Triple-click to select. Or click **Copy to clipboard**.
- **The backend's hard-copy message** (a blue info panel) — e.g. the internal secret's message spells out the "update BFF env before restarting nexrisk" ordering rule.
- **Restart + side-effects block** — which services must restart, plus (for JWT) the note that all access tokens will be invalidated.

**Esc is intentionally disabled in this phase.** The only way out is the **Done** button in the footer. This is a deliberate friction to prevent accidentally dismissing the plaintext before you've saved it.

Once **Done** is clicked, the modal closes and the plaintext is gone forever. No endpoint returns it, no log contains it (it's never logged), the BFF doesn't cache it.

## Common tasks

### Rotate the internal secret (most common)

1. Verify the checklist at the top of this document.
2. On the Internal secret card, click **Rotate internal secret…**.
3. Read the consequences box.
4. Type `ROTATE` in the confirmation input.
5. Click **Rotate now**.
6. When the new secret appears: click **Copy to clipboard**, then immediately paste it into your password manager AND into the two environment files (BFF and `nexrisk_service`).
7. Click **Done** — only after you've saved both copies.
8. SSH to the host. Restart the **BFF first**, then restart `nexrisk_service`.
9. Verify: open Taiga in a browser. If it works, you're good. If it doesn't, the env var is wrong somewhere — fix it, then restart the affected service.

### Rotate the JWT secret (when session compromise is suspected)

1. Coordinate with the desk. Everyone currently using Taiga will briefly see an error.
2. Verify the checklist.
3. On the JWT secret card, click **Rotate JWT secret…**.
4. Type `ROTATE`, confirm.
5. Copy the new secret into your password manager and into the `nexrisk_service` env file.
6. Click **Done**.
7. Restart `nexrisk_service`.
8. Users may see a brief error on their next request. Their browsers will automatically refresh their access tokens using the (still-valid) refresh tokens. Normal service resumes within seconds.

### Rotate the encryption key (not yet possible)

Preflight works. The destructive POST returns 501 today. When the backend lands:

1. Check preflight counts first (the modal does this automatically).
2. Confirm `ok_to_proceed: true` and no blockers.
3. Pick a low-activity window — settings writes and TOTP enrolments are blocked during migration.
4. Type `ROTATE ENCRYPTION KEY` (stricter phrase).
5. Confirm. Wait for the migration.
6. Save the new key, update env var, restart `nexrisk_service`.

## What's not implemented yet

### Encryption key rotation POST endpoint

Preflight is live. The destructive rotate endpoint is 501. The modal detects this and shows a blue informational banner in the Confirm phase, but still lets you see consequences and preflight counts. The Rotate button is disabled when `available: false`.

### Last rotation timestamps

The right-hand **Last rotation** panel shows `—` for all three secrets with "no GET endpoint" notes. There is no endpoint that reports "when was X last rotated" — rotations are deliberately not tracked in a queryable way (a log of rotation timestamps would itself be a secret-adjacent audit artefact). When audit-log integration lands, rotation events will appear there but the *values* will not.

### Audit-log integration

Same pattern as every other sub-page. Will land as a separate ticket.

## After you save

- The yellow restart banner appears site-wide — but the real work is the environment-variable update, not the banner clearance.
- The plaintext is gone. If you didn't save it, you'll need to rotate again to get a new one. The old one is already invalid (the backend accepted the new one, so the old one no longer works).
- **Expect a service outage during the restart.** Plan accordingly.

## Troubleshooting

### "I lost the secret before I saved it anywhere"

Rotate again. The secret from the previous rotation is already invalid (the backend has moved on). A fresh rotation gives you a fresh value. No harm done except the extra step.

### "I hit Done before copying"

Same as above — rotate again.

### "After restart, everything is 401"

For the internal secret: the BFF env and the `nexrisk_service` env don't match. Check both env files; they must contain the same string.

For the JWT secret: users will recover on refresh-token usage. If they don't — i.e. every single request stays 401 — the new JWT secret isn't actually loaded. Check the env file and confirm `nexrisk_service` was restarted cleanly.

### "The Rotate button won't enable"

Check you typed the confirmation phrase exactly. Case-sensitive. Spaces matter. For encryption key, the phrase is three words with single spaces between them: `ROTATE ENCRYPTION KEY`.

### "Preflight says ok_to_proceed: false"

Blockers are listed below the preflight counts. Address them (typically they're administrative — e.g. "an ongoing settings write is active; wait") and reload the modal.

### "The rotation returned an error mid-flight"

The modal moves to a **Rotate error** phase showing the error message. Nothing was changed — the backend either didn't generate or didn't commit. Click **Back** to retry, or **Close** to abort.