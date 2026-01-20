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
