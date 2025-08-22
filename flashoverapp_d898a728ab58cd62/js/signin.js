// --- Provider Logins ---
document.getElementById('login-with-microsoft-btn').addEventListener('click', () => {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    auth.signInWithPopup(provider).then(result => handleSuccessfulLogin(result.user)).catch(handleAuthError);
});

document.getElementById('login-with-google-btn').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then(result => handleSuccessfulLogin(result.user)).catch(handleAuthError);
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

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            handleSuccessfulLogin(userCredential.user);
        })
        .catch(handleAuthError)
        .finally(() => {
            loginButton.disabled = false;
            loginButton.textContent = 'Sign In';
        });
});

// --- Auto-Redirect if already logged in ---
auth.onAuthStateChanged(user => {
    if (user) {
        console.log('User is already signed in. Redirecting...');
        handleSuccessfulLogin(user);
    }
});