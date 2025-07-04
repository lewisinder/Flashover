
document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References specific to this page
    const mainButtons = {
        continueCheck: document.getElementById('continue-check-btn'),
        startChecks: document.getElementById('start-checks-btn'),
        
        setupTruck: document.getElementById('setup-truck-btn'),
        viewReports: document.getElementById('view-reports-btn'),
    };

    // State variables specific to this page
    let checkInProgress = false; // This state needs to be managed globally or passed around

    // Functions specific to this page
    function updateContinueButton() {
        mainButtons.continueCheck.classList.toggle('hidden', !checkInProgress);
    }

    function showHomeScreen() {
        updateContinueButton();
        showScreen('home-screen'); // Assuming showScreen is in common.js
    }

    // Event Listeners
    mainButtons.continueCheck.addEventListener('click', () => {
        // This will eventually navigate to checks.html and resume a check
        // For now, it will just redirect to checks.html
        window.location.href = '/checks.html';
    });

    mainButtons.startChecks.addEventListener('click', () => {
        window.location.href = '/checks.html';
    });

    mainButtons.setupTruck.addEventListener('click', () => {
        console.log('Setup Truck button clicked. Redirecting to setup.html');
        window.location.href = '/setup.html';
    });

    mainButtons.viewReports.addEventListener('click', () => {
        window.location.href = '/reports.html';
    });

    // Initial app setup
    showHomeScreen();
});
