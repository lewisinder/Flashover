const auth = firebase.auth();
const loadingOverlay = document.getElementById('loading-overlay');

function showLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'none';
}

auth.onAuthStateChanged(user => {
    if (user) {
        // User is signed in, no immediate data to load on this page
        hideLoading(); // Hide loading by default
    } else {
        window.location.href = '/signin.html';
    }
});

document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/menu.html';
});

document.getElementById('start-checks-btn').addEventListener('click', () => {
    showLoading();
    window.location.href = '/select-appliance-for-check.html';
});

document.getElementById('setup-truck-btn').addEventListener('click', () => {
    showLoading();
    window.location.href = '/select-appliance.html';
});

document.getElementById('view-reports-btn').addEventListener('click', () => {
    showLoading();
    window.location.href = '/reports.html';
});

document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = '/signin.html';
    });
});

// Hide loading on page load as a default state
document.addEventListener('DOMContentLoaded', () => {
    hideLoading();
});
