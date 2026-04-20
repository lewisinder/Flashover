// --- Email/Password Sign Up ---
document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const messageEl = document.getElementById('message');
    const fullName = document.getElementById('name-input').value.trim();
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('password-input').value;
    const signupButton = document.getElementById('signup-btn');

    if (!fullName) {
        messageEl.textContent = "Full name is required.";
        return;
    }

    if (password.length < 6) {
        messageEl.textContent = "Password must be at least 6 characters long.";
        return;
    }

    signupButton.disabled = true;
    signupButton.textContent = 'Creating Account...';
    messageEl.textContent = '';

    Promise.resolve(window.__authReady)
        .then(() => auth.createUserWithEmailAndPassword(email, password))
        .then(async (userCredential) => {
            const user = userCredential.user;
            await user.updateProfile({ displayName: fullName });
            const idToken = await user.getIdToken();
            const response = await fetch(`/api/data/${encodeURIComponent(user.uid)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fullName, email })
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || `Failed to save profile (${response.status})`);
            }
            handleSuccessfulLogin(user);
        })
        .catch(handleAuthError)
        .finally(() => {
            signupButton.disabled = false;
            signupButton.textContent = 'Sign Up';
        });
});
