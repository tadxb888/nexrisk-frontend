---
id: ref-secret-rotation
title: "Secret rotation"
type: reference
domain: settings
module: settings
minLevel: VIEW
route: /settings
source: ["settings/SecretRotationPage.tsx"]
related: [ref-system-settings, ref-auth-session]
tags: [secrets, rotation, security, sessions, restart]
status: reviewed
version: settings-v1
---

## What it is {#what}

**Secret rotation** replaces the platform's security secrets (such as signing and
internal-service keys) with new values. It shows the **Last rotation** time and
an **Operator checklist** to follow before rotating.

## Rotating {#rotate}

Rotation runs a preflight check first; a failed preflight blocks it. Because new
secrets take effect on restart, the page notes the **Restart** requirement and
how many active **Sessions** will be affected (existing sessions may need to
re-authenticate).
