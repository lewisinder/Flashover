// --- Provider Logins ---
document.getElementById('login-with-microsoft-btn').addEventListener('click', () => {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    Promise.resolve(window.__authReady)
        .then(() => auth.signInWithPopup(provider))
        .then(result => handleSuccessfulLogin(result.user))
        .catch(handleAuthError);
});

document.getElementById('login-with-google-btn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    Promise.resolve(window.__authReady)
        .then(() => auth.signInWithPopup(provider))
        .then(result => handleSuccessfulLogin(result.user))
        .catch(handleAuthError);
});

// --- Email/Password Login ---
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const loginButton = document.getElementById('login-btn');

    loginButton.disabled = true;
    loginButton.textContent = 'Signing In...';
    message.textContent = '';

    Promise.resolve(window.__authReady)
        .then(() => auth.signInWithEmailAndPassword(email, password))
        .then((userCredential) => handleSuccessfulLogin(userCredential.user))
        .catch(handleAuthError)
        .finally(() => {
            loginButton.disabled = false;
            loginButton.textContent = 'Sign In';
        });
});

// --- Auto-Redirect if already logged in ---
Promise.resolve(window.__authReady).finally(() => {
    auth.onAuthStateChanged(user => {
        if (user) {
            console.log('User is already signed in. Redirecting...');
            handleSuccessfulLogin(user);
        }
    });
});
