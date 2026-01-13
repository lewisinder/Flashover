export function initFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyC-fTzW4YzTTSyCtXSIgxZCZAb7a14t3N4",
    authDomain: "flashoverapplication.firebaseapp.com",
    projectId: "flashoverapplication",
    storageBucket: "flashoverapplication.firebasestorage.app",
    messagingSenderId: "74889025348",
    appId: "1:74889025348:web:baaec1803ade7ffbd06911",
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const auth = firebase.auth();
  const db = firebase.firestore();

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalhost) {
    const emulatorHost = window.location.hostname;
    try {
      auth.useEmulator(`http://${emulatorHost}:9099`);
    } catch (e) {}
    try {
      db.useEmulator(emulatorHost, 8080);
    } catch (e) {}
  }

  // Enable offline persistence for faster repeat navigations (best-effort).
  try {
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) {}

  try {
    window.__authReady = auth
      .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .catch((err) => {
        console.error("Auth persistence failed (app shell):", err);
      });
  } catch (e) {
    window.__authReady = Promise.resolve();
  }

  return { auth, db };
}
