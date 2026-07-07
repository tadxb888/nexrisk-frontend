---
id: ref-secret-rotation
title: "Secret Rotation — operating guide"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings/secret-rotation
order: 7
source:
  - "Settings_07_Secret_Rotation.docx — operating guide (ingested verbatim)"
related: []
tags: [settings,secret-rotation,credentials,operator-manual]
status: reviewed
version: settings-v3
---

## 1. At a Glance

This is where you rotate Taiga’s cryptographic secrets — the keys and
shared values that keep the platform’s parts authenticated to each
other, keep user sessions signed, and keep sensitive data encrypted at
rest. There are three secrets, each with its own process and its own set
of consequences.

You reach it at **Settings › Secret rotation**. This is the platform’s
most consequential page: rotating any of these secrets has wide,
immediate effects — it can end every user session, break the internal
handshake between components, or re-encrypt stored data. Treat it with
corresponding care.

|                                                                                                                                                                                                                                                                                                                                                             |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Every rotation is a one-way step, and the new secret is shown exactly once.** The page generates fresh cryptographic material and displays it a single time. Nothing is stored anywhere you can retrieve it again — once you close the reveal, the plaintext is gone for good. If you do not save it in that moment, your only option is to rotate again. |

## 2. The Three Secrets

Each secret has its own card on the page. In brief:

| **Secret**             | **What it protects**                                                                                                           | **What must restart**         |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------|-------------------------------|
| Internal secret        | The handshake between the web layer (BFF) and the core service — every internal request carries it, and both sides must match. | The BFF and the core service. |
| Session-signing secret | The signature on user login sessions (access and refresh tokens).                                                              | The core service.             |
| Encryption key         | At-rest encryption of stored LP credentials and users’ one-time-code secrets.                                                  | The core service.             |

Each has its own process and its own consequences. The internal and
session-signing secrets are quick rotations; the encryption key is the
heaviest, because it re-encrypts stored data as part of the rotation
(Section 5.3).

## 3. Before You Rotate — the Checklist

Work through this before pressing any Rotate button. The page shows the
same checklist alongside the cards.

- A password manager or secure vault is open and ready to receive the
  new value.

- You have access to the host and can update the service environment
  where the secret lives.

- The restart has been coordinated with anyone on the desk — some
  rotations end active sessions.

- The previous secret is archived, in case you need to roll back within
  the same service lifecycle (before the restart).

## 4. The Rotation Process

Pressing a Rotate button opens a guided window that moves through up to
four steps. The design is deliberately full of friction — this is one
place where being slowed down is the point.

### 4.1 Pre-check (encryption key only)

For the encryption key, the window first runs a safety pre-check that
reports how many records would be re-encrypted (stored LP credentials
and one-time-code enrolments) and a rough time estimate, plus whether it
is safe to proceed. If it reports it is not safe, the button stays
disabled and the blockers are listed. The other two secrets skip
straight to the next step.

### 4.2 Confirm

This step shows the consequences of the rotation in a warning box — read
it — and requires you to type an exact confirmation phrase before the
Rotate button will enable. The phrase is case-sensitive and spaces
matter; the input turns teal when it matches. You can still cancel or
close at this point.

### 4.3 Rotating

The rotation is now in progress. The window warns you not to close it,
and the escape key is disabled. Do not navigate away.

### 4.4 Reveal — the one and only sighting

The new secret is shown in a large, copy-friendly block. This is the
only time you will ever see it.

|                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Copy it now — before you press Done.** The reveal carries a large warning that the value will not be shown again, a copy button, and the platform’s own instructions for where to put it (including any ordering rules). The escape key is disabled here on purpose; the only way out is the Done button. Once you press Done, the plaintext is gone — not returned by anything, not written to any log, not cached anywhere. Paste it into your vault and the relevant service environment first, then press Done. |

## 5. Each Secret in Detail

### 5.1 Internal secret

Every internal request from the web layer (the BFF) to the core service
carries this shared value, and both sides compare it; if they do not
match, the request is rejected. Rotating it generates a fresh value that
you must place in **both** environments — the BFF’s and the core
service’s.

|                                                                                                                                                                                                                                                                                                                                   |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Order matters: update both environments, then restart the BFF first, then the core service.** If the BFF comes back on the new value while the core is still on the old one, every request between them is rejected until the core catches up. Update both first to minimise that window, and bring the BFF up before the core. |

### 5.2 Session-signing secret

This is the signing key for user login sessions. Rotating it and
restarting the core service invalidates every outstanding access token
immediately — so every logged-in user’s next request fails once. The
good news: refresh tokens are not signed with this key and remain valid,
so browsers automatically obtain fresh access tokens and most users
recover within seconds without noticing. Anyone mid-request at the exact
moment of restart sees a brief error and then recovers on retry. Rotate
this when you suspect a session compromise; place the new value in the
core service’s environment and restart the core service.

### 5.3 Encryption key

This key encrypts sensitive data at rest — stored LP credentials and
users’ one-time-code secrets. Rotating it is the **heaviest** of the
three: every affected record is re-encrypted in place during the
operation, which takes time proportional to how many there are, and
while it runs, settings changes and new one-time-code enrolments are
blocked. Because of that impact it uses a longer, stricter confirmation
phrase as a deliberate speed bump.

Run it in a low-activity window: start the rotation, let the safety
pre-check confirm it is safe to proceed, allow the re-encryption to
finish, then save the new key to the core service’s environment and
restart the core service.

## 6. Common Tasks

### 6.1 Rotate the internal secret (the most common)

1.  Work the checklist. On the Internal secret card, start the rotation
    and read the consequences.

2.  Type the confirmation phrase, and rotate.

3.  At the reveal: copy the value into your vault **and** into both
    environments (the BFF and the core service), then press Done.

4.  On the host, restart the **BFF first**, then the core service.

5.  Verify by opening Taiga in a browser; if it works, you are done. If
    not, the value differs somewhere — correct it and restart the
    affected service.

### 6.2 Rotate the session-signing secret

6.  Coordinate with the desk — everyone will see a brief blip. Work the
    checklist.

7.  Rotate, type the phrase, confirm; at the reveal copy the value into
    your vault and the core service environment, then Done.

8.  Restart the core service. Users recover automatically within seconds
    as their browsers refresh their sessions.

## 7. What This Page Deliberately Does Not Track

By design, the page keeps no queryable record of when each secret was
last rotated — such a log would itself be a sensitive, secret-adjacent
artefact. This is a security property of the page, not a limitation:
rotation values are shown once and stored nowhere retrievable.

## 8. Troubleshooting

### 8.1 I lost the secret before saving it

Rotate again. The value from the previous rotation is already the live
one, but since you did not capture it, a fresh rotation gives you a new
value you can save properly. The only cost is the extra step (and, for
session-signing, a second brief blip for users).

### 8.2 I pressed Done before copying

Same remedy — rotate again and capture it this time.

### 8.3 After the restart, everything is rejected

For the internal secret: the BFF environment and the core environment
hold different values — check both and make them identical. For the
session-signing secret: users should recover as their sessions refresh;
if every request stays rejected, the new value was not actually loaded —
confirm the environment was updated and the core service was restarted
cleanly.

### 8.4 The Rotate button will not enable

You have not typed the confirmation phrase exactly — it is
case-sensitive and spaces matter. For the encryption key, the phrase is
longer (three words with single spaces).

### 8.5 The pre-check says it is not safe to proceed

The blockers are listed beneath the pre-check counts — usually something
transient, such as a settings change already in progress. Clear it and
reopen the window.

### 8.6 The rotation errored partway

The window moves to an error step showing the message; nothing was
changed — the platform neither generated nor committed a new value. Go
back to retry, or close to abort.

*End of guide — Settings › Secret rotation. One of nine Settings
operator guides.*
