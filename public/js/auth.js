// The auth object will be initialized in app.js to ensure correct order
// const auth = firebase.auth();

const handleSuccessfulLogin = (user) => {
    const message = document.getElementById('message');
    if (!message) {
        console.error("Message element not found on this page.");
        // On pages without a message div, just proceed.
    }
    
    const uid = user.uid;
    localStorage.setItem('userId', uid);

    // If we were sent to login from somewhere else (like the app shell),
    // go back there after a successful sign-in.
    const returnToRaw = new URLSearchParams(window.location.search).get('returnTo');
    const returnTo =
        returnToRaw && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//')
            ? returnToRaw
            : null;

    // Get the Firebase ID token to send to the backend.
    user.getIdToken().then(idToken => {
        const cacheBust = `?t=${new Date().getTime()}`;
        // The backend route is now /api/data/:userId
        // Note: The user ID in the URL is for RESTful convention, 
        // but the backend should ALWAYS use the UID from the verified token for security.
        fetch(`/api/data/${uid}${cacheBust}`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        })
        .then(response => {
            if (!response.ok) {
                // A 403 is a real auth problem.
                if (response.status === 404 || response.status === 403) {
                    console.log("User profile not found or not authorized, backend will create one on first save.");
                    // Don't treat this as a fatal error on login.
                    // The backend will create a default doc when it's first needed.
                    return response.json().catch(() => ({})); // Return empty object if JSON parsing fails
                }
                throw new Error(`Server responded with ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Data fetched successfully on sign-in:', data);
            window.location.href = returnTo || '/app.html#/menu'; // Redirect after login
        })
        .catch(error => {
            console.error("Failed to fetch user data on sign-in:", error);
            if (message) {
                message.textContent = `Login successful, but could not load your profile: ${error.message}. Redirecting...`;
            }
            // Still redirect, the app can try loading again.
            setTimeout(() => { window.location.href = returnTo || '/app.html#/menu'; }, 2000);
        });
    });
};

const handleAuthError = (error) => {
    const message = document.getElementById('message');
    if (!message) {
        console.error("Message element not found on this page.");
        return;
    }
    console.error("Authentication Error:", error);
    message.textContent = `Error: ${error.message}`;
};
