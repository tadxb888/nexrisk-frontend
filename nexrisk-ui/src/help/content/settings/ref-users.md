---
id: ref-users
title: "Users & Roles"
type: reference
domain: settings
module: users
minLevel: VIEW
route: /users
source:
  - "RBAC — Role-Based Access Control Matrix"
  - "NexRisk Auth Frontend Developer Reference (enrolment, MFA)"
  - "UserManagementPage.tsx"
related: [ref-system-settings]
tags: [users, roles, rbac, mfa, enrolment, status]
status: reviewed
version: settings-v1
---

## User records {#records}

Each user has an **Email**, **First Name**, **Last Name**, and a role. Counters
show **Total**, **Active**, **Pending**, and **Inactive** users; the list filters
by **All Roles** / **All Statuses**.

## Status {#status}

**Active** — enrolled and able to sign in; **Pending** / **Pending Enrollment** —
invited but not yet completed setup (an invitation is emailed to a new user);
**Inactive** — disabled.

## Access {#access}

User management requires an Administrator or Root role; without it the page shows
**Access Denied**. Roles are defined by the RBAC matrix.
