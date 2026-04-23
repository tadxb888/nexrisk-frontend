# Auth & session

## At a glance

This page controls how Taiga issues and expires authentication tokens, and what rules it enforces on user passwords. Six fields in total, all of them numbers or short strings, no secrets. Changes here shape how long users stay logged in, how often they re-authenticate, and what counts as an acceptable password.

Settings page path: **Settings → Auth & session**
Route: `/settings/auth`

## What this page controls

This page reads and writes the `auth` sub-object inside `config/nexrisk_config.json`. It is one of several subsections that live in the main NexRisk config file.

All changes on this page require a restart of the **`nexrisk_service`** to take effect. Token TTLs are read at service startup and held in memory — changing the values while the service is running has no effect until restart.

## Who can access it

Visible to users with one of:

- `root`
- `administrator`
- `sysadmin`
- `broker_dealer`

## Before you change anything

- **Changing token TTLs does not invalidate existing tokens.** If an access token was issued with a 60-minute TTL, it remains valid for 60 minutes even if you shorten the configured TTL to 5 minutes. The new TTL applies only to tokens issued *after* the next restart.
- **Password policy changes don't retroactively apply to stored passwords.** If you raise `password_min_length` from 8 to 12, existing 9-character passwords continue to work — the policy only enforces on new passwords (sign-up, password reset, password change).
- **Shortening the access token TTL mid-session is transparent to users** as long as refresh tokens still work. Users get a new access token automatically when their old one expires. They only notice anything if the refresh token has also expired.

## Field reference

### `totp_issuer`

The label that appears in users' TOTP authenticator apps (Google Authenticator, Authy, 1Password, etc.) when they scan the enrolment QR code. Example: `NexRisk` or `Taiga Production`.

Purely cosmetic, but worth getting right — users see this in their authenticator app alongside their account name. Keep it short, human-readable, and distinguishable from other TOTP-protected services they use.

### `access_token_ttl_seconds`

How long an **access token** remains valid, in seconds. Access tokens are what the browser sends on every API request; when one expires, the browser uses a refresh token to get a new access token without prompting the user to log in again.

- Short TTL (5-15 minutes, 300-900 seconds): better security if a token is stolen — shorter window of misuse. Costs: more refresh traffic.
- Long TTL (1 hour, 3600 seconds): fewer refreshes, but stolen tokens remain useful for longer.

Typical value: `900` (15 minutes).

### `refresh_token_ttl_seconds`

How long a **refresh token** remains valid, in seconds. Refresh tokens are the longer-lived credential the browser holds onto so the user doesn't have to log in every time an access token expires.

When a refresh token expires, the user is forced to log in again — typing their username, password, and TOTP code.

- Short TTL (1-4 hours): more frequent re-login. Sensible in high-security environments.
- Long TTL (8-24 hours): users log in once per shift. More convenient, slightly more exposure.

Typical value: `28800` (8 hours — one trading session).

The form displays the human equivalent next to the field as you type: `28800` becomes *"8 h"*.

### `invite_token_ttl_seconds`

How long a fresh user-invite token remains valid, in seconds. When you invite a new user, they receive an email with a one-time link; if they don't click it within this window, the invitation expires and you must re-invite them.

Typical value: `86400` (24 hours).

### `password_min_length`

Minimum number of characters a new password must have. Enforced on sign-up, password reset, and password change — but not retroactively against existing passwords.

Typical value: `10-12`.

Nothing on this page enforces complexity rules beyond length (no "must have a digit", no character class requirements). Length alone is the industry consensus for strong-enough policy when combined with TOTP.

### `password_reset_ttl_seconds`

How long a password-reset link remains valid, in seconds. When a user clicks "Forgot password" and requests a reset, they get an email with a one-time link; if they don't use it within this window, the link expires and they have to request another.

Typical value: `3600` (1 hour).

## Common tasks

### Force everyone to log in again at the start of each trading session

Set `refresh_token_ttl_seconds` to slightly less than the gap between sessions. If your desk opens at 07:00 and closes at 17:00, and you want everyone to re-auth in the morning:

1. Set `refresh_token_ttl_seconds` to `36000` (10 hours).
2. Save and restart `nexrisk_service`.

Anyone still logged in at the end of that period will be logged out when their refresh token expires and forced to re-authenticate.

### Make sessions less chatty on slow networks

If access-token refreshes are showing up as noticeable pauses in the UI, lengthen `access_token_ttl_seconds`. Going from `900` (15 min) to `3600` (1 hour) reduces refresh-request frequency by a factor of four.

### Tighten password policy without surprising existing users

1. Raise `password_min_length`.
2. Save and restart.
3. Existing users keep their current passwords. Next time each one changes their password (or is forced to reset it), the new policy applies.

If you need to force everyone onto the new policy, that's a separate administrative action — expire all passwords and require resets. That flow isn't owned by this page.

## What's not implemented yet

### Policy preview

The right-hand "Policy preview" panel shows a summary of what the current settings would mean in human terms (*"Access tokens expire after 15 min. Refresh tokens last 8 hours…"*). It is live — it updates as you edit. This is the panel that would otherwise show "Live status"; auth has no runtime probe to show, so the preview takes its place.

### Recent changes

Placeholder until the audit-log integration lands. Will eventually show the last five edits to the `auth` subsection with attribution.

### Service status

The **Service** panel shows `—` for Status / Uptime / Last start with "awaiting backend" notes — same pattern as every other sub-page. Process name, config file path, and log directory are known from configuration.

## After you save

- A yellow **restart banner** appears site-wide. It stays until `nexrisk_service` is restarted.
- The confirmation line below the form reads something like `Saved. Restart nexrisk_service to apply.`
- No user's current session is affected. TTLs are read at service startup.
- After the restart, new tokens use the new TTLs. Tokens already in circulation continue to use the old TTLs until they expire naturally.

## Troubleshooting

### "I shortened the TTL but sessions didn't end"

The service hasn't been restarted, or the in-flight tokens haven't expired yet. The new TTL applies only to tokens issued after the restart; already-issued tokens respect the TTL they were born with.

### "Users are getting logged out constantly"

Check `access_token_ttl_seconds` and `refresh_token_ttl_seconds`. If one or both are set to a very small number (seconds or low double-digit minutes), the client will refresh constantly and eventually hit the refresh-token expiry. Typical sane values: `900` access, `28800` refresh.

### "I set a TTL of zero by accident"

Don't do that. The service treats non-positive values as misconfigurations and may refuse to start, or may default silently to some internal value. Set a positive integer and restart.

### "Can I set an unlimited TTL?"

No, and you shouldn't. Tokens that never expire are tokens that are never rotated — which is a security liability, not a feature. Use a long TTL (many hours or a full day) if you want near-unlimited convenience.