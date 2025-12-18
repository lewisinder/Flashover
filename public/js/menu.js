const brigadeSelector = document.getElementById('brigade-selector');
const loadingOverlay = document.getElementById('loading-overlay');
let currentUser = null;
const debugNoRedirect = new URLSearchParams(window.location.search).has('debug');
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

// --- Utility Functions ---
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

// This function runs when the authentication state changes.
Promise.resolve(window.__authReady).finally(() => {
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in.
            currentUser = user;
            loadUserBrigades();
            return;
        }

        // Local emulators can briefly report null on initial load; avoid redirecting too quickly.
        setTimeout(() => {
            if (auth.currentUser) {
                currentUser = auth.currentUser;
                loadUserBrigades();
                return;
            }
            if (debugNoRedirect) {
                console.warn("menu.js: auth user is null; debug mode prevents redirect.", {
                    hostname: window.location.hostname,
                    isLocal,
                    currentUser: auth.currentUser,
                });
                return;
            }
            window.location.href = '/signin.html';
        }, isLocal ? 5000 : 0);
    });
});

// Function to load the brigades for the current user
async function loadUserBrigades() {
    if (!currentUser) return;
    
    showLoading();
    brigadeSelector.innerHTML = '<option value="">Loading brigades...</option>';

    try {
        const userBrigadesRef = db.collection('users').doc(currentUser.uid).collection('userBrigades');
        const snapshot = await userBrigadesRef.get();

        if (snapshot.empty) {
            brigadeSelector.innerHTML = '<option value="">No brigades found</option>';
        } else {
            brigadeSelector.innerHTML = ''; // Clear loading message
            snapshot.forEach(doc => {
                const brigade = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = brigade.brigadeName;
                brigadeSelector.appendChild(option);
            });

            // Set the active brigade from localStorage if it exists
            const activeBrigadeId = localStorage.getItem('activeBrigadeId');
            if (activeBrigadeId && brigadeSelector.querySelector(`option[value="${activeBrigadeId}"]`)) {
                brigadeSelector.value = activeBrigadeId;
            } else if (brigadeSelector.options.length > 0) {
                // Otherwise, set the first brigade as active
                localStorage.setItem('activeBrigadeId', brigadeSelector.options[0].value);
            }
        }
    } catch (error) {
        console.error("Error loading brigades:", error);
        brigadeSelector.innerHTML = '<option value="">Error loading brigades</option>';
    } finally {
        hideLoading();
    }
}

// Event Listeners
brigadeSelector.addEventListener('change', (e) => {
    localStorage.setItem('activeBrigadeId', e.target.value);
});

document.getElementById('appliance-checks-btn').addEventListener('click', () => {
    window.location.href = '/appliance-checks.html';
});

document.getElementById('brigade-management-btn').addEventListener('click', () => {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    // On the emulator, add a query param to avoid stale cached HTML during development.
    window.location.href = isLocal ? `/manage-brigades.html?local=${Date.now()}` : '/manage-brigades.html';
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut().catch((error) => {
        console.error('Sign out error', error);
    });
});
