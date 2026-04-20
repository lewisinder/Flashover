# Flashover Clean-Slate Data Plan

Date: 20 April 2026  
Repository: `/Users/lewisinder/Documents/FLASHOVER - CODEX`  
Firebase project: `flashoverapplication`

## Purpose

This document captures the recommended next steps before wiping the current Flashover app data and rebuilding from a clean slate.

The main goal is to avoid rebuilding real brigade data into a structure that will become painful to change later.

## Executive Summary

The current app data model is secure enough for beta use because most writes go through the backend API and Firestore/Storage rules deny direct client writes.

The main structural weakness is that appliance setup is currently stored as one large nested object on the brigade document:

```text
brigades/{brigadeId}
  applianceData: {
    appliances: [...]
  }
```

That is simple, but it becomes risky as real data grows because Firestore documents have a hard size limit, every edit rewrites the whole setup, and check locks are stored inside the same large object.

Before wiping and rebuilding production data, move appliance setup into appliance documents:

```text
brigades/{brigadeId}/appliances/{applianceId}
```

Reports should stay as immutable historical snapshots.

## Final Locked Decisions

- The clean-slate wipe is all app data: Firestore, Storage uploads, and Firebase Auth users.
- Canonical roles are `admin`, `gearManager`, `member`, and `viewer`.
- Any operational member can resume an interrupted check. Operational members are `admin`, `gearManager`, and `member`.
- All roles can view and export reports, including `viewer`.
- Public signup stays open.

## Current Data Model

### Firebase Auth

Firebase Auth stores the actual sign-in accounts separately from Firestore.

Current signup is client-side email/password. A user can create an Auth account and then the backend creates or ensures their Firestore user document and identifier.

Important point: wiping Firestore does not delete Auth users. Wiping Auth users does not automatically delete Firestore documents.

### Firestore Collections

Current top-level collections:

```text
users
brigades
identifierRegistry
mail
reportExportDownloads
```

Current nested collections:

```text
users/{uid}/userBrigades
brigades/{brigadeId}/members
brigades/{brigadeId}/joinRequests
brigades/{brigadeId}/reports
brigades/{brigadeId}/reports/{reportId}/meta
```

### Users

Current shape:

```text
users/{uid}
  identifier
  termsAcceptance
  appliances

users/{uid}/userBrigades/{brigadeId}
  brigadeName
  brigadeIdentifier
  role
```

Notes:

- `identifier` is a short app-facing user identifier such as `U123456`.
- `termsAcceptance` records the terms/confidentiality version accepted by the user.
- `appliances` appears to be legacy user-level data and should be removed from the future model.
- `userBrigades` is a denormalized membership cache so the app can quickly load the signed-in user's brigades.

### Brigades

Current shape:

```text
brigades/{brigadeId}
  name
  stationNumber
  region
  creatorId
  identifier
  createdAt
  applianceData
```

Current appliance setup shape:

```text
applianceData: {
  appliances: [
    {
      id
      name
      checkStatus
      lockers: [
        {
          id
          name
          shelves: [
            {
              id
              name
              items: [
                {
                  id
                  name
                  desc
                  type
                  img
                  subItems
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Notes:

- This is the part that should change before real data is rebuilt.
- `checkStatus` is currently embedded in the appliance object inside the brigade's `applianceData`.
- Any appliance setup edit writes the whole `applianceData` object back to the brigade document.

### Members

Current shape:

```text
brigades/{brigadeId}/members/{uid}
  role
  joinedAt
  name
  userIdentifier
```

The same membership is also mirrored into:

```text
users/{uid}/userBrigades/{brigadeId}
```

This duplication is acceptable for performance, but there needs to be one clear source of truth. The brigade member document should be the authority. The user-side copy should be treated as a cache.

### Join Requests

Current shape:

```text
brigades/{brigadeId}/joinRequests/{uid}
  status
  requestedAt
  userName
  userIdentifier
```

This structure is fine.

### Reports

Current shape:

```text
brigades/{brigadeId}/reports/{reportId}
  brigadeId
  applianceId
  applianceName
  date
  lockers
  uid
  username
  signedName
  hasSignature

brigades/{brigadeId}/reports/{reportId}/meta/signoff
  signature
  signedName
  username
  uid
  createdAt
```

Notes:

- Reports are saved as snapshots, which is correct.
- Signatures are stored separately, which is also correct.
- The report document should gain more consistent server timestamps.
- The backend should validate report contents more strictly before real use.

### Identifier Registry

Current shape:

```text
identifierRegistry/{identifier}
  identifier
  ownerType
  ownerId
  createdAt
```

This prevents duplicate short identifiers like `U123456` and `B123456`.

Important wipe note: if `identifierRegistry` is not wiped, old identifiers stay reserved.

### Mail Queue

Current shape:

```text
mail/{mailDocId}
  to
  message
  status
  error
```

The `processEmail` function sends queued mail and updates the document status.

This collection should not grow forever. Add a cleanup/retention plan.

### Report Export Download Tokens

Current shape:

```text
reportExportDownloads/{token}
  uid
  brigadeId
  applianceId
  from
  to
  exportedBy
  createdAt
  expiresAt
  lastDownloadedAt
```

These are short-lived PDF download tokens.

They should have a cleanup/TTL plan.

### Cloud Storage

Current uploaded image path:

```text
uploads/{brigadeId}/image-....webp
```

This currently mixes setup images and check note/report images in one folder.

That works for beta, but it is not ideal for cleanup or auditability.

## Current Security Position

Firestore rules currently allow the signed-in user to read their own user document and `userBrigades` cache. Most other Firestore access is blocked from the client and must go through the backend API.

Storage rules currently deny all direct client read/write access. Images are uploaded, read, and deleted through backend routes.

This is the correct security direction.

Recommendation: keep this pattern.

```text
Client:
  can read small own-user cache only

Backend API:
  controls brigade data
  controls setup writes
  controls reports
  controls images
  controls exports
```

## Main Problems To Fix Before Clean Slate

### Problem 1: Appliance Setup Is Packed Into One Brigade Document

Current:

```text
brigades/{brigadeId}.applianceData
```

Problems:

- Firestore document size limit risk.
- Whole setup is rewritten for small edits.
- Concurrent edits are harder.
- Check locks update the full setup object.
- Long-term migrations become harder.
- Reports and exports rely on the nested structure.

Recommended:

```text
brigades/{brigadeId}/appliances/{applianceId}
```

### Problem 2: Roles Are Not Fully Settled

Current backend roles:

```text
Admin
Member
```

The product language suggests there may also be a gear-management role.

Recommendation:

Use lowercase canonical values in the database:

```text
admin
gearManager
member
viewer
```

Suggested permissions:

```text
admin:
  manage brigade
  manage members
  manage roles
  edit appliance setup
  complete checks
  view/export reports
  delete brigade

gearManager:
  edit appliance setup
  complete checks
  view/export reports
  cannot delete brigade
  cannot manage admins

member:
  complete checks
  view/export reports
  cannot edit setup
  cannot manage members

viewer:
  view/export reports
  cannot complete checks
  cannot edit setup
  cannot manage members
```

### Problem 3: Report Payloads Need Stronger Backend Validation

Current report saving checks:

- user is a brigade member
- brigade exists
- appliance exists
- signature is sanitized
- report is written under the brigade

But the `lockers` snapshot is still mostly accepted from the client.

Recommended:

- Validate the report snapshot deeply, or
- Have the backend build the report from stored appliance setup plus submitted item statuses.

The second option is stronger.

### Problem 4: Image Storage Needs Clearer Ownership

Current:

```text
uploads/{brigadeId}/image-....webp
```

Recommended:

```text
uploads/{brigadeId}/setup/{imageId}.webp
uploads/{brigadeId}/reports/{reportId}/{imageId}.webp
uploads/{brigadeId}/pending/{uid}/{imageId}.webp
```

This makes cleanup much easier.

### Problem 5: Cleanup Is Incomplete

Deleting a brigade should remove:

- brigade document
- members
- join requests
- reports
- report signoff metadata
- user-side membership cache entries
- related uploaded images
- possibly export tokens
- possibly mail queue references

Current brigade deletion handles Firestore brigade subcollections and user-side membership cache entries, but storage cleanup and registry cleanup need a clearer strategy.

### Problem 6: User Names Fall Back To Email Too Often

Current name display is inconsistent. Some code uses `currentUser.displayName`, some backend code uses `req.user.name`, and several places fall back to email.

This means firefighters can appear as an email address even when they entered their full name during signup.

Recommended:

Store the user's full name as first-class app data:

```text
users/{uid}
  fullName
  email
  identifier
```

Then use `users/{uid}.fullName` as the authoritative app display name.

Firebase Auth `displayName` can still be updated, but it should not be the only source of truth because decoded ID tokens can be stale and older accounts may not have a display name.

Membership records and reports should copy the full name at the time of the action:

```text
brigades/{brigadeId}/members/{uid}
  fullName

brigades/{brigadeId}/reports/{reportId}
  createdByName
  signedName
```

Display fallback order should be:

```text
fullName -> signedName where appropriate -> userIdentifier -> email
```

Email should be the last fallback, not the normal display name.

### Problem 7: Checks Do Not Resume Reliably Across People Or Devices

Current check progress is mostly stored in browser `sessionStorage`:

```text
checkResults
checkInProgress
currentCheckState
```

That only works on the same device/browser session. It does not reliably support a firefighter stopping mid-check because of a call, then another firefighter resuming the same report later.

Recommended:

Create server-side check sessions.

```text
brigades/{brigadeId}/checkSessions/{sessionId}
```

Each in-progress check should autosave to Firestore through backend API routes as the firefighter works.

The check session should be resumable by:

- the original firefighter
- another brigade member
- an admin or gear manager

The app should no longer rely on `sessionStorage` as the source of truth. It can still use local storage as a temporary cache, but Firestore should hold the real progress.

## Recommended Target Data Model

### Recommended Middle-Ground Model

This is the best balance between correctness and keeping the app simple.

```text
users/{uid}
  fullName
  email
  identifier
  termsAcceptance
  createdAt
  updatedAt

users/{uid}/userBrigades/{brigadeId}
  brigadeName
  brigadeIdentifier
  role
  memberName
  updatedAt

brigades/{brigadeId}
  name
  stationNumber
  region
  identifier
  creatorId
  createdAt
  updatedAt

brigades/{brigadeId}/members/{uid}
  role
  fullName
  email
  userIdentifier
  joinedAt
  updatedAt

brigades/{brigadeId}/joinRequests/{uid}
  status
  requestedAt
  userName
  userIdentifier

brigades/{brigadeId}/appliances/{applianceId}
  name
  order
  checkStatus
  lockers
  version
  createdAt
  updatedAt

brigades/{brigadeId}/checkSessions/{sessionId}
  brigadeId
  applianceId
  applianceName
  applianceVersion
  status
  startedByUid
  startedByName
  currentEditorUid
  currentEditorName
  editorLeaseExpiresAt
  startedAt
  lastSavedAt
  completedAt
  cancelledAt
  reportId
  progressSummary

brigades/{brigadeId}/checkSessions/{sessionId}/answers/{itemId}
  itemId
  parentItemId
  lockerId
  status
  note
  noteImage
  updatedByUid
  updatedByName
  updatedAt

brigades/{brigadeId}/reports/{reportId}
  brigadeId
  applianceId
  applianceName
  applianceVersion
  checkedAt
  createdAt
  createdByUid
  createdByName
  resumedFromSessionId
  signedName
  hasSignature
  lockersSnapshot

brigades/{brigadeId}/reports/{reportId}/meta/signoff
  signature
  signedName
  username
  uid
  createdAt

identifierRegistry/{identifier}
  identifier
  ownerType
  ownerId
  createdAt

mail/{mailDocId}
  to
  message
  status
  error
  createdAt
  sentAt

reportExportDownloads/{token}
  uid
  brigadeId
  applianceId
  from
  to
  exportedBy
  createdAt
  expiresAt
  lastDownloadedAt
```

### Why Not Fully Split Lockers/Shelves/Items Yet?

A fully normalized model would look like this:

```text
brigades/{brigadeId}/appliances/{applianceId}/lockers/{lockerId}
brigades/{brigadeId}/appliances/{applianceId}/lockers/{lockerId}/shelves/{shelfId}
brigades/{brigadeId}/appliances/{applianceId}/lockers/{lockerId}/shelves/{shelfId}/items/{itemId}
```

That is more scalable, but it would add a lot of code complexity now.

The middle-ground model is enough for the current app:

```text
one appliance document contains its lockers/shelves/items
```

That removes the worst risk without forcing a large frontend rewrite.

### Check Session Model

In-progress checks should become their own server-side records.

Recommended check session statuses:

```text
inProgress
paused
completed
cancelled
expired
```

Recommended session behavior:

- Starting a check creates or resumes a `checkSessions` document.
- Each item status change writes one answer document.
- Notes and note images save immediately.
- The summary screen reads saved answers from the backend.
- Completing the check builds an immutable report snapshot.
- The completed session links to the created report.
- A session can be resumed by another brigade member if the first person gets busy.
- A short editor lease prevents two people from unknowingly editing the same active screen at the same time.
- Admins and gear managers can force-release stale editor leases.

Recommended answer storage:

```text
brigades/{brigadeId}/checkSessions/{sessionId}/answers/{itemId}
```

This avoids a giant active-check document and makes autosave safer.

The report is still stored as a full snapshot when completed:

```text
brigades/{brigadeId}/reports/{reportId}
```

The active session is operational data. The report is the audit record.

## Implementation Plan

### Phase 1: Confirm Schema Decisions

Decisions needed:

1. Use appliance subcollection: yes.
2. Keep lockers/shelves/items nested inside appliance documents: recommended yes.
3. Use lowercase role values: recommended yes.
4. Add `gearManager`: recommended yes.
5. Add `viewer`: yes.
6. Keep reports as snapshots: yes.
7. Separate setup images from report images: recommended yes.
8. Wipe Auth users too: yes.
9. Use `users/{uid}.fullName` as the authoritative display name: yes.
10. Add server-side check sessions with autosave/resume: yes.

Deliverable:

```text
docs/data-model.md
```

or this planning document can become the source document.

### Phase 2: Backend Refactor

Update Cloud Functions so appliance setup is stored under:

```text
brigades/{brigadeId}/appliances/{applianceId}
```

Backend routes to update:

```text
GET  /api/brigades/:brigadeId/data
POST /api/brigades/:brigadeId/data
GET  /api/brigades/:brigadeId/appliances/:applianceId/check-status
POST /api/brigades/:brigadeId/appliances/:applianceId/start-check
POST /api/brigades/:brigadeId/appliances/:applianceId/complete-check
POST /api/reports
GET  /api/reports/brigade/:brigadeId
POST /api/reports/brigade/:brigadeId/export/download-link
POST /api/reports/brigade/:brigadeId/export/email
POST /api/dev/seed-demo
```

Compatibility target:

The frontend should still receive:

```json
{
  "appliances": []
}
```

This keeps setup/check screens mostly unchanged while improving backend storage.

### Phase 3: User Profile And Display Name Cleanup

Goal:

Everywhere in the app should display the firefighter's entered full name instead of falling back to their email address.

Backend changes:

- Add `fullName` and `email` to `users/{uid}`.
- On signup/profile update, save full name to Firestore and Auth `displayName`.
- Add a backend helper that loads the app user profile before writing names into memberships, check sessions, reports, and export metadata.
- Stop using `req.user.name || req.user.email` as the normal display source.
- Keep email only as contact/login information.

Frontend changes:

- Signup should require full name.
- Account screen should edit full name.
- Brigade member lists should show full name.
- Join requests should show full name.
- Check locks should show full name.
- Reports should show full name as the app username.
- Email should only appear where it is genuinely useful, such as account settings or member invite/admin context.

Data repair during clean slate:

Since the app will be wiped, no migration is needed if Auth is wiped too. If Auth users are kept, create a small profile backfill flow that asks users to confirm their full name on first login.

### Phase 4: Role Model Cleanup

Update backend role handling:

```text
Admin -> admin
Member -> member
Gear Manager -> gearManager
Viewer -> viewer
```

Update frontend labels separately:

```text
admin -> Admin
gearManager -> Gear Manager
member -> Member
viewer -> Viewer
```

Update permission checks:

```text
canManageMembers(role)
canEditSetup(role)
canDeleteBrigade(role)
canRunChecks(role)
canViewReports(role)
canExportReports(role)
```

Avoid hardcoding role comparisons throughout the app.

Report viewing and export should be allowed for every canonical role.

### Phase 5: Server-Side Check Sessions And Autosave

Goal:

A firefighter can stop a check at any point, and either they or another allowed brigade member can resume later from the saved point.

New backend routes:

```text
POST /api/brigades/:brigadeId/appliances/:applianceId/check-sessions
GET  /api/brigades/:brigadeId/appliances/:applianceId/check-sessions/active
GET  /api/brigades/:brigadeId/check-sessions/:sessionId
POST /api/brigades/:brigadeId/check-sessions/:sessionId/claim
POST /api/brigades/:brigadeId/check-sessions/:sessionId/pause
POST /api/brigades/:brigadeId/check-sessions/:sessionId/answers/:itemId
DELETE /api/brigades/:brigadeId/check-sessions/:sessionId/answers/:itemId
POST /api/brigades/:brigadeId/check-sessions/:sessionId/complete
POST /api/brigades/:brigadeId/check-sessions/:sessionId/cancel
```

Autosave rules:

- Save after each present/missing/defect choice.
- Save after each note change.
- Save after each note image upload.
- Save current location in the check flow.
- Show a visible "Saved" / "Saving" / "Offline" state.
- Never rely on the final report button as the first time progress is persisted.

Resume rules:

- If a check session exists for an appliance, the appliance screen should show `Resume check`.
- The resume screen should show who started it and when it was last saved.
- If another user resumes, record that in session activity.
- A member can resume if no one currently holds an active editor lease.
- Admin/gear manager can force-release a stale lease.

Data model:

```text
brigades/{brigadeId}/checkSessions/{sessionId}
brigades/{brigadeId}/checkSessions/{sessionId}/answers/{itemId}
brigades/{brigadeId}/checkSessions/{sessionId}/activity/{activityId}
```

Optional activity log:

```text
started
paused
resumed
answerUpdated
noteAdded
imageAttached
completed
cancelled
forceReleased
```

Completion:

On completion, the backend should:

1. Load the appliance setup.
2. Load all saved answers.
3. Build the report snapshot.
4. Save the report.
5. Store signature metadata.
6. Mark the check session as `completed`.
7. Link the session to the report ID.

### Phase 6: Report Save Hardening

Improve report saving so the backend does not blindly trust the whole client report snapshot.

Minimum improvement:

- validate locker/shelf/item shape
- validate note length
- validate status values
- validate note image paths
- add `createdAt`
- add `checkedAt`
- add `createdByUid`
- add `createdByName`
- add `applianceVersion`

Better improvement:

- client sends item status results
- backend loads appliance setup
- backend builds the report snapshot

Recommended final direction:

```text
backend builds final report snapshot
```

With server-side check sessions, this becomes easier because report creation can use saved answers instead of trusting one large client-submitted report payload.

### Phase 7: Image Storage Cleanup

Move image storage toward:

```text
uploads/{brigadeId}/setup/{imageId}.webp
uploads/{brigadeId}/pending/{uid}/{imageId}.webp
uploads/{brigadeId}/reports/{reportId}/{imageId}.webp
```

Update upload routes:

```text
POST /api/upload
POST /api/check-note-image
GET  /api/brigades/:brigadeId/images/:fileName
DELETE /api/image/:fileName
```

The image-read route may need to accept a structured image path instead of only a filename.

For check note images:

- Upload first to `pending`.
- Attach pending image to a check session answer.
- On report completion, move or copy the image under the report path.
- If the session is cancelled or abandoned, cleanup removes pending images after the retention window.

### Phase 8: Firefighter-Focused Product Improvements

These are not all required for the clean slate, but the data model should allow them.

#### High-Value Ideas

1. **Resume interrupted checks**

   This is the highest-value operational feature. Firefighters can stop for a call and come back later without losing work.

2. **Handover between crew members**

   If one person starts a check and another finishes it, the report should record both:

   ```text
   startedByName
   completedByName
   contributors
   ```

3. **Critical equipment flags**

   Some items are more important than others. Mark items as:

   ```text
   critical
   standard
   optional
   ```

   Then missing/defective critical items can be highlighted at the top of the report.

4. **Defect severity**

   A defect could be:

   ```text
   minor
   major
   outOfService
   ```

   This is more useful than just `defect`.

5. **Immediate defect action**

   When a firefighter marks something missing or defective, offer:

   ```text
   add note
   attach photo
   mark appliance affected
   create follow-up task
   ```

6. **Open issues dashboard**

   Add a brigade-level view of unresolved missing/defective items across all appliances.

7. **Appliance readiness status**

   Show a clear status per appliance:

   ```text
   ready
   issues found
   out of service
   check overdue
   check in progress
   ```

8. **Check due schedule**

   Store expected check frequency per appliance and show overdue checks.

9. **Fast mode for routine checks**

   Let users quickly mark unchanged shelves or lockers as all present, while still forcing explicit attention for critical items.

10. **Voice-friendly notes**

   Add note input designed for quick dictation on mobile.

11. **Photo markup**

   Allow drawing/highlighting on an attached defect photo.

12. **Audit trail**

   Keep an activity history for important actions:

   ```text
   setup changed
   check started
   check resumed
   defect recorded
   report signed
   member role changed
   ```

13. **Setup version history**

   Every appliance setup change should increment a version. Reports should record the setup version used.

14. **QR code appliance launch**

   A QR code inside an appliance bay could open that appliance's check screen directly.

15. **Low-connectivity resilience**

   The app should show when data is saved to the server. If offline, it should clearly show unsynced changes and retry when online.

#### Data Model Support Needed

To support these ideas later, include:

```text
appliance.version
item.criticality
item.expectedQuantity
item.tags
item.lastUpdatedAt
checkSession.contributors
checkSession.activity
report.issueSummary
report.criticalIssueCount
report.followUpRequired
```

These fields do not all need UI immediately, but the rebuilt model should not block them.

### Phase 9: Cleanup Jobs Or Scripts

Add cleanup for:

- expired `reportExportDownloads`
- old `mail` docs
- orphaned pending uploads
- images for deleted brigades
- old setup images no longer referenced by any appliance
- abandoned check sessions past the retention window

This can start as an admin script.

It does not need to be a scheduled Cloud Function immediately.

### Phase 10: Wipe Script

Create a controlled wipe script with a dry-run mode.

Suggested script:

```text
scripts/wipe-app-data.js
```

Required features:

- dry run by default
- explicit production confirmation
- print counts before deleting
- delete in batches
- delete nested subcollections
- delete Storage uploads
- optionally delete Auth users
- never run accidentally

Target Firestore wipe:

```text
brigades
users
identifierRegistry
mail
reportExportDownloads
checkSessions, if implemented before wipe
```

Target Storage wipe:

```text
uploads/**
```

Target Auth wipe:

```text
all users
```

### Phase 11: Emulator Test

Run locally before production.

Test flow:

1. Start emulators.
2. Create test user.
3. Accept terms.
4. Seed or create brigade.
5. Add member.
6. Create appliance.
7. Add lockers, shelves, items.
8. Upload setup image.
9. Start check.
10. Save several item answers.
11. Close/reload the app.
12. Resume the same check as the same user.
13. Resume the same check as another member.
14. Add note.
15. Attach note image.
16. Pause check.
17. Resume check.
18. Complete and sign report.
19. View report.
20. Export PDF.
21. Email PDF if SMTP is configured.
22. Delete brigade.
23. Run cleanup.
24. Confirm Firestore and Storage are clean.

### Phase 12: Deploy Before Wiping Production

Correct order:

```text
1. Make schema/code changes locally.
2. Test in emulators.
3. Deploy app/functions/rules.
4. Run production wipe.
5. Create first real admin user.
6. Create first real brigade.
7. Rebuild live appliance data.
```

Do not wipe production before deploying schema changes. Otherwise the app may recreate data in the old shape.

### Phase 13: Rebuild Clean Data

Rebuild in this order:

```text
1. Owner/admin account
2. First brigade
3. Members
4. Appliances
5. Lockers/shelves/items
6. Setup images
7. First test check
8. First saved report
9. First PDF export
10. Confirm data health
```

## Data Health Checks

Add a script or admin check that verifies:

- every brigade has at least one admin
- every `users/{uid}/userBrigades/{brigadeId}` points to a real brigade
- every `brigades/{brigadeId}/members/{uid}` points to a real user
- every appliance belongs to a real brigade
- every active check session belongs to a real brigade and appliance
- every active check session has valid answer docs
- every completed check session links to a report
- every report belongs to a real brigade
- every report's appliance reference is valid or intentionally historical
- every setup image path exists in Storage
- every report note image path exists in Storage
- every pending note image is either linked to an active check session or old enough for cleanup
- there are no expired export tokens older than the retention window
- there are no old pending uploads

## Recommended Work Order

1. Confirm target data model.
2. Refactor backend appliance storage.
3. Keep frontend API responses compatible.
4. Clean up full-name profile handling.
5. Clean up roles.
6. Add server-side check sessions and autosave.
7. Improve report validation.
8. Separate image storage paths.
9. Add cleanup script.
10. Add wipe script with dry-run mode.
11. Test end-to-end in emulators.
12. Deploy.
13. Wipe production.
14. Rebuild clean data.

## Open Decisions

### Auth users

Locked decision: wipe Firestore, Storage, and Auth users for the production clean slate.

### Should public signup stay open?

Locked decision: public email/password signup stays open.

### Should members be able to view all reports?

Locked decision: all roles can view and export reports.

Canonical roles are:

```text
admin
gearManager
member
viewer
```

### How long should mail/export records be retained?

Suggested:

```text
reportExportDownloads: delete after 24 hours
mail sent/error docs: delete after 30 days
pending uploads: delete after 24 hours
```

## Final Recommendation

Do the appliance storage refactor before wiping and rebuilding real data.

That is the most important change. The current model is not broken, but it stores too much important data inside one brigade document. Once real brigade data exists, changing that structure becomes much harder.
