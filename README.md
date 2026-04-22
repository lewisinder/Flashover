# Flashover Application

Flashover is a Firebase web application for fire brigades to manage:

- Brigades, members, roles, and join requests
- Appliances and inventory structure: lockers, items, container items, and sub-items
- Appliance checks and report sign-off
- Report history and email notifications when new reports are submitted

The project is built on Firebase:

- Firebase Hosting serves the frontend from `public/`
- Cloud Functions run the backend API and email worker from `functions/`
- Firestore stores users, brigades, appliance setup, reports, and queued email documents
- Cloud Storage stores uploaded inventory/report images
- Firebase Auth handles account sign-in; the current UI uses email/password auth

## Deployment

The default Firebase project is `flashoverapplication`.

Production deploys are handled by GitHub Actions:

- Pushing to `master` runs `.github/workflows/firebase-hosting-merge.yml`
- The workflow installs function dependencies, authenticates with the Firebase service account secret, writes the Firestore email extension env file, and runs:

```bash
firebase deploy --project flashoverapplication --non-interactive
```

The production app is served at:

- `https://flashoverapplication.web.app/`

Pull requests create Firebase Hosting preview channels:

- PRs run `.github/workflows/firebase-hosting-pull-request.yml`
- The workflow uses `FirebaseExtended/action-hosting-deploy@v0`
- Preview deploys only run for PR branches from this repository, not forks

## Current Architecture

Firebase Hosting serves static HTML, CSS, JavaScript, and assets from `public/`. Hosting rewrites:

- `/` to `/app.html`
- `/api/**` to the `api` Cloud Function

The backend is composed of two Cloud Functions in `functions/index.js`.

### 1. Main API (`api`)

`api` is an Express app exposed as a Firebase HTTPS function. It handles core application logic:

- User profile creation/loading
- Brigade creation, joining, leaving, deletion, role management, and member management
- Appliance setup data
- Appliance check start/completion status
- Report creation and retrieval
- Image upload/delete through Cloud Storage

All API routes are prefixed with `/api` and require a valid Firebase Auth ID token:

- The frontend gets an ID token from Firebase Auth
- Requests include `Authorization: Bearer <token>`
- The backend verifies the token with Firebase Admin and uses the verified UID for access control

### 2. Email Worker (`processEmail`)

`processEmail` is a Firestore-triggered function in region `australia-southeast1`. It watches the `mail/{documentId}` collection and sends queued emails using SMTP via `nodemailer`.

The API queues an email by writing a document like this:

```json
{
  "to": "recipient@example.com",
  "message": {
    "subject": "New Report Submitted",
    "html": "<p>Email content</p>"
  }
}
```

After sending, `processEmail` updates the original document with `status: "sent"` or `status: "error"`.

### SMTP Configuration

`processEmail` reads SMTP settings from Firebase Functions runtime config under `smtp.*`:

- `smtp.host`
- `smtp.port`
- `smtp.user`
- `smtp.pass`
- `smtp.from`

Example:

```bash
firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="465" \
  smtp.user="hello@theblueprintcollective.co.nz" \
  smtp.pass="YOUR_APP_PASSWORD" \
  smtp.from="Flashover <hello@theblueprintcollective.co.nz>"
```

For Gmail, use an App Password. Regular Gmail passwords will fail.

## Data Model

High-level Firestore shape:

- `users/{uid}`
  - User profile data
  - `users/{uid}/userBrigades/{brigadeId}`: brigade memberships visible to the signed-in user
- `brigades/{brigadeId}`
  - `{ name, stationNumber, region, createdAt, creatorId, applianceData }`
  - `brigades/{brigadeId}/members/{uid}`: `{ role, joinedAt, name }`
  - `brigades/{brigadeId}/joinRequests/{uid}`: `{ status, requestedAt, userName }`
  - `brigades/{brigadeId}/reports/{reportId}`: report summary and checklist data
  - `brigades/{brigadeId}/reports/{reportId}/meta/signoff`: stored signature/sign-off metadata
- `mail/{documentId}`
  - Server-created queued emails for `processEmail`

Uploaded images are stored in Cloud Storage under:

- `uploads/{brigadeId}/{fileName}`

## Security Rules

Firestore and Storage rules are tracked in this repo:

- `firestore.rules`
- `storage.rules`

Client access is intentionally narrow:

- Users can read their own `users/{uid}` document and `userBrigades` membership refs
- Brigade data, reports, join requests, member changes, email queue writes, and appliance setup writes go through the authenticated backend API
- Storage reads/writes are denied to clients; uploads and deletes go through Cloud Functions

## Frontend

The frontend is static HTML/JS with no build step. It uses:

- Tailwind via CDN
- Firebase JS SDK compat packages
- Fetch calls to `/api/...` for protected backend operations

The main UI is the app shell:

- `public/app.html`
- `public/js/app-shell/app-shell.js`
- `public/js/app-shell/router.js`
- `public/js/app-shell/screens/*`

App shell routes include:

- `#/menu`
- `#/checks`
- `#/reports`
- `#/brigades`
- `#/brigade/:id`
- `#/account`
- `#/setup`
- `#/setup/:applianceId`
- `#/check/:brigadeId/:applianceId`
- `#/report/:brigadeId/:reportId`

Some legacy pages still exist and are embedded by the app shell for full workflows:

- `public/checks.html` with `public/js/checks.js`
- `public/setup.html` with `public/js/setup.js`

Legacy standalone pages also remain for sign-in/sign-up and older navigation flows, including:

- `public/signin.html`
- `public/signup.html`
- `public/menu.html`
- `public/manage-brigades.html`
- `public/brigade-management.html`
- `public/select-appliance.html`
- `public/appliance-checks.html`

## Local Development

Prerequisites:

- Node.js 20
- Firebase CLI

Install function dependencies:

```bash
cd functions
npm ci
```

Run the Firebase emulator suite from the repo root:

```bash
firebase emulators:start
```

Configured emulator ports:

- Auth: `9099`
- Functions: `5001`
- Firestore: `8080`
- Hosting: `5002`
- Storage: `9199`
- Emulator UI: `4000`

Open the local app shell at:

- `http://localhost:5002/app.html#/menu`

When running on `localhost` or `127.0.0.1`, the frontend connects to the Auth and Firestore emulators. The Functions Admin SDK also points at the Auth and Firestore emulators when the Functions emulator is running.

## Notes

- Production runtime is Firebase Hosting plus Cloud Functions.
- The top-level `package.json` is not used for production hosting; backend runtime dependencies live in `functions/package.json`.
- Keep changes compatible with the app shell and the embedded legacy check/setup flows. `checks.js` and `setup.js` are still loaded inside the shell for those workflows.
