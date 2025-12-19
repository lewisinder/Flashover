# Changelog

All notable changes to Flashover will be documented in this file.

## Unreleased

### Added
- App shell route `#/brigades` with full Brigade Management (create brigade, list brigades, leave brigade, request to join).
- App shell route `#/brigade/:id` to manage a single brigade (members list, admin tools, join requests).

### Fixed
- Local emulator auth reliability across pages (prevents redirect loops caused by auth init timing and cached old HTML).
- Local emulators: Functions API brigade endpoints no longer crash when using `serverTimestamp()` with `firebase-admin` v12.
- Local emulators: Admin SDK in Functions points to Auth/Firestore emulators when running the emulator suite.

