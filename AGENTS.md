# Agent Instructions

Use these instructions when working on the Flashover repository in Codex or another AI coding agent.

## Repository

- Local path: `/Users/lewisinder/Documents/FLASHOVER - CODEX`
- GitHub: `https://github.com/lewisinder/Flashover.git`
- Default branch: `master`
- Firebase project: `flashoverapplication`
- Production app: `https://flashoverapplication.web.app/`
- Main app shell route: `https://flashoverapplication.web.app/app.html#/menu`

Before making changes, check the local state:

```bash
git status --short --branch
git remote -v
```

The working tree may contain user changes. Do not revert, overwrite, or discard changes you did not make unless explicitly asked.

## Current Architecture

Flashover is a Firebase web app for fire brigades to manage brigades, appliances, inventory, checks, reports, and report sign-off.

- Firebase Hosting serves static frontend files from `public/`.
- Cloud Functions run the backend API and email worker from `functions/`.
- Firestore stores users, brigades, memberships, appliance setup, reports, sign-off metadata, and queued email docs.
- Cloud Storage stores uploaded inventory/report images.
- Firebase Auth uses email/password sign-in.

Important files:

- `firebase.json`: hosting, rewrites, emulator configuration
- `firestore.rules`: tracked Firestore security rules
- `storage.rules`: tracked Storage security rules
- `functions/index.js`: Express API and `processEmail` function
- `public/app.html`: main app shell entry point
- `public/js/app-shell/app-shell.js`: app shell orchestration
- `public/js/app-shell/router.js`: hash route handling
- `public/js/app-shell/screens/*`: app shell screens
- `public/checks.html` and `public/js/checks.js`: legacy check workflow embedded by the shell
- `public/setup.html` and `public/js/setup.js`: legacy setup workflow embedded by the shell

Keep changes compatible with both the app shell and the embedded legacy setup/check flows.

## Deployment And Local Development

Production deploys are handled by GitHub Actions when pushing to `master`.

Run local emulators from the repo root:

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

Local app shell:

```text
http://localhost:5002/app.html#/menu
```

When running on `localhost` or `127.0.0.1`, frontend code connects to Firebase emulators where supported.

Function dependencies live in `functions/package.json`. The top-level `package.json` is not the production backend dependency source.

## Coding Guidelines

- Follow existing plain HTML/CSS/JavaScript patterns. There is no frontend build step.
- Prefer small, targeted edits over broad refactors.
- Keep API behavior authenticated through Firebase Auth ID tokens.
- Backend routes are under `/api` and should preserve existing authorization checks.
- Do not move security-sensitive operations into client code. Brigade mutations, report writes, email queue writes, image upload/delete, and setup writes should go through backend/API paths unless there is an explicit architectural change.
- Avoid introducing new frameworks or build tooling unless explicitly requested.
- Keep user-facing copy concise and practical.

## Git Hygiene

- Always inspect the worktree before editing.
- Do not use destructive commands such as `git reset --hard` or `git checkout --` unless the user explicitly asks.
- If asked to create a branch, use the `codex/` prefix unless the user requests another name.
- If asked to commit, stage only the intended files and summarize the exact changes.

## MCP And Browser Testing

Expected MCP servers may be registered globally, not inside this repo:

- `chrome-devtools`
- `playwright`
- `gcloud`
- `observability`
- `storage`
- `firestore`

Check registration with:

```bash
codex mcp list
```

Generic MCP resource/template listing may return no resources even when tool calls work. Test the actual typed tools before concluding a server is unusable.

Current known behavior:

- `chrome-devtools` can control a headless Chrome instance when Google Chrome is installed at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- `playwright` may start but can fail if its runtime state path is misconfigured, for example trying to create `/.playwright-mcp`.
- `gcloud`, `observability`, and `storage` should use Google ADC and project `flashoverapplication`.
- Firestore remote MCP needs `FIRESTORE_MCP_TOKEN` in the Codex Desktop process environment.

Do not paste or request raw access tokens in chat. To set Firestore auth for Codex Desktop on macOS, the user should run this in Terminal, then fully quit and reopen Codex Desktop:

```zsh
launchctl setenv FIRESTORE_MCP_TOKEN "$(gcloud auth application-default print-access-token)"
```

The token expires, so refresh it the same way when Firestore auth stops working.

Useful Google auth setup commands, run by the user if needed:

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project flashoverapplication
gcloud auth application-default set-quota-project flashoverapplication
```

## Verification

For frontend changes:

- Prefer testing the app shell route.
- Use Chrome DevTools MCP screenshots when available.
- Check browser console errors.
- Verify protected routes redirect to sign-in when unauthenticated.
- For authenticated flows, use a test account or local Firebase emulators rather than personal credentials.

For backend/API changes:

- Review affected API routes in `functions/index.js`.
- Verify auth and brigade membership/role checks.
- Run focused local tests or emulator checks where practical.

For rules changes:

- Update tracked files in the repo: `firestore.rules` and/or `storage.rules`.
- Do not rely on console-only rule edits.

## Secrets

- Never commit secrets, tokens, app passwords, service account JSON, `.env` files, or generated access tokens.
- Do not print raw tokens in chat or logs.
- SMTP configuration belongs in Firebase Functions runtime config or the deployment workflow, not hardcoded source.

