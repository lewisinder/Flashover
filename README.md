# Flashover Application

Flashover is a web application for fire brigades to manage:

- Brigades (members, roles, join requests)
- Appliances (trucks) and their inventory structure (lockers → shelves → items, including container items with sub-items)
- Inventory checks and reporting
- Email notifications when new reports are submitted

The project is built on Firebase:

- Firebase Hosting serves the frontend (`public/`)
- Cloud Functions run the backend API and background jobs (`functions/`)
- Firestore stores application data
- Cloud Storage stores uploaded images
- Firebase Auth handles login (email/password + providers like Google/Microsoft)

## Current Architecture

The backend is composed of two Cloud Functions in `functions/index.js`.

### 1. The Main API (`api`)

This is an [Express.js](https://expressjs.com/) application that serves as the primary REST API for the frontend. It handles all core application logic, including:

-   User authentication and authorization.
-   Brigade management (creating, joining, managing members).
-   Appliance data management.
-   Creating and retrieving reports.
-   Image uploads for reports.

All API routes are prefixed with `/api` and require a valid Firebase authentication token:

- The frontend gets an ID token from Firebase Auth.
- Requests include `Authorization: Bearer <token>`.
- The backend verifies the token and uses the verified UID for access control.

### 2. The Email Sender (`processEmail`)

This is a background function triggered by Firestore events. It sends email using SMTP (via `nodemailer`). This decouples the API from email delivery: the API “queues” an email by writing a document, and `processEmail` delivers it asynchronously.

#### How the Email System Works

The `processEmail` function is designed to be simple and scalable. Here is the workflow:

1.  **Triggering an Email:** To send an email, any part of the application (for example, the main `api` function) must write a new document to the `mail` collection in Firestore.

2.  **Required Data Structure:** The document written to the `mail` collection **must** have the following structure:

    ```json
    {
      "to": "recipient@example.com",
      "message": {
        "subject": "This is the subject!",
        "html": "<p>This is the HTML content of the email.</p>"
      }
    }
    ```

3.  **Function Execution:** As soon as a new document is created in the `mail` collection, the `processEmail` function is automatically triggered.

4.  **Sending and Status Update:** The function reads the document, sends the email via SMTP, and then updates the original document with a `status` field (`sent` on success or `error` on failure) for easy tracking and debugging.

### SMTP Configuration (Gmail example)

`processEmail` reads SMTP settings from Firebase Functions runtime config under `smtp.*`:

- `smtp.host` (e.g. `smtp.gmail.com`)
- `smtp.port` (e.g. `465` for SSL)
- `smtp.user` (the sending mailbox email address)
- `smtp.pass` (an app password / SMTP password)
- `smtp.from` (display name + email, e.g. `Flashover <hello@theblueprintcollective.co.nz>`)

Set config with the Firebase CLI:

```bash
firebase functions:config:set \
  smtp.host="smtp.gmail.com" \
  smtp.port="465" \
  smtp.user="hello@theblueprintcollective.co.nz" \
  smtp.pass="YOUR_APP_PASSWORD" \
  smtp.from="Flashover <hello@theblueprintcollective.co.nz>"
```

Deploy:

```bash
firebase deploy --only functions:processEmail
```

Note: For Gmail you must use an App Password (requires 2‑Step Verification). Regular Gmail passwords will fail with “BadCredentials”.

## Data Model (Firestore)

This is the current shape used by the app (high level):

- `users/{uid}`
  - user profile data (legacy personal appliance data may exist for older accounts)
  - `users/{uid}/userBrigades/{brigadeId}`: brigades the user belongs to (brigadeName, role)
- `brigades/{brigadeId}`
  - `{ name, stationNumber, region, createdAt, creatorId, applianceData }`
  - `brigades/{brigadeId}/members/{uid}`: `{ role, joinedAt, name }`
  - `brigades/{brigadeId}/joinRequests/{uid}`: `{ status, requestedAt, userName }`
  - `brigades/{brigadeId}/reports/{reportId}`: report documents (includes checklist results)
- `mail/{documentId}`
  - queued emails for `processEmail` to send

Uploaded images are stored in Cloud Storage under `uploads/` and referenced from report/item data.

## Frontend

The frontend is static HTML/JS served from `public/` (no build step). It uses:

- Tailwind via CDN
- Firebase JS SDK (Auth + Firestore)
- Fetch calls to `/api/...` for protected operations

Key pages:

- `public/signin.html`, `public/signup.html`: authentication
- `public/menu.html`: choose active brigade
- `public/manage-brigades.html`, `public/brigade-management.html`: join/create/manage brigades and members
- `public/select-appliance.html`, `public/setup.html`: set up appliances and inventory structure
- `public/select-appliance-for-check.html`, `public/checks.html`: run checks and submit reports
- `public/reports.html`: view past reports

## Local Development

Prerequisites:

- Node.js (Functions currently target Node 18+ in `functions/package.json`; Firebase deploy uses Node 20 runtime per `firebase.json`)
- Firebase CLI (`npm i -g firebase-tools`)

Run emulators:

```bash
firebase emulators:start
```

Many pages contain optional “connect to emulator” logic when running on `localhost`.

## Notes

- This repo’s primary runtime is Firebase Hosting + Functions. The top-level `package.json` is not used for production hosting; backend code lives in `functions/`.
- Security rules (`firestore.rules` / `storage.rules`) are not currently tracked in this repo. You should add and enforce rules so only authorized brigade members can access brigade data and so clients cannot write to `mail` directly in production.
