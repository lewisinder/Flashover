// --- Email/Password Sign Up ---
document.getElementById('signup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('name-input').value;
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const signupButton = document.getElementById('signup-btn');

    if (password.length < 6) {
        message.textContent = "Password must be at least 6 characters long.";
        return;
    }

    signupButton.disabled = true;
    signupButton.textContent = 'Creating Account...';
    message.textContent = '';

    Promise.resolve(window.__authReady)
        .then(() => auth.createUserWithEmailAndPassword(email, password))
        .then((userCredential) => {
            // After creating the user, update their profile with the name
            return userCredential.user.updateProfile({
                displayName: name
            }).then(() => {
                // Now that the profile is updated, handle the success
                handleSuccessfulLogin(userCredential.user);
            });
        })
        .catch(handleAuthError)
        .finally(() => {
            signupButton.disabled = false;
            signupButton.textContent = 'Sign Up';
        });
});
