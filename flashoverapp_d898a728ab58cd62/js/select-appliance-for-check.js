document.addEventListener('DOMContentLoaded', () => {
    const auth = firebase.auth();
    const loadingOverlay = document.getElementById('loading-overlay');
    const applianceListContainer = document.getElementById('appliance-list-for-check');
    const backBtn = document.getElementById('back-btn');

    let userAppData = { appliances: [] };
    let userId = null;

    function showLoader() {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
    }

    function hideLoader() {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    async function getAuthToken() {
        if (!auth.currentUser) {
            window.location.href = '/signin.html';
            return null;
        }
        try {
            return await auth.currentUser.getIdToken(true);
        } catch (error) {
            console.error("Error getting auth token:", error);
            window.location.href = '/signin.html';
            return null;
        }
    }

    async function loadData() {
        if (!userId) return;
        const idToken = await getAuthToken();
        if (!idToken) return;

        showLoader();
        try {
            const cacheBust = `?t=${new Date().getTime()}`;
            const response = await fetch(`/api/data/${userId}${cacheBust}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            userAppData = await response.json();
            if (!userAppData.appliances) userAppData.appliances = [];
            renderApplianceSelectionForCheck();
        } catch (error) {
            console.error("Could not load user data:", error);
            if (applianceListContainer) {
                applianceListContainer.innerHTML = `<p class="text-center text-red-500">Could not load your appliances. Please try again.</p>`;
            }
        } finally {
            hideLoader();
        }
    }

    function renderApplianceSelectionForCheck() {
        if (!applianceListContainer) return;
        applianceListContainer.innerHTML = '';

        if (!userAppData.appliances || userAppData.appliances.length === 0) {
            applianceListContainer.innerHTML = `<p class="text-center text-gray-500 mt-8">No appliances found. Go to Setup to create one.</p>`;
        } else {
            userAppData.appliances.forEach(appliance => {
                const applianceItemDiv = document.createElement('div');
                applianceItemDiv.className = 'appliance-list-item mx-auto max-w-md';
                applianceItemDiv.dataset.applianceId = appliance.id;
                applianceItemDiv.innerHTML = `
                    <img src="/design_assets/Truck Icon.png" alt="Truck" class="h-12 w-12 mr-4">
                    <span class="font-bold text-lg flex-grow">${appliance.name}</span>
                    <button class="start-check-btn bg-blue text-white font-bold py-2 px-4 rounded-lg">Start Check</button>
                `;
                applianceListContainer.appendChild(applianceItemDiv);
            });
        }
    }

    function startChecks(applianceId) {
        const appliance = userAppData.appliances.find(a => a.id === applianceId);
        if (!appliance || appliance.lockers.length === 0 || appliance.lockers.every(l => l.shelves.every(s => s.items.length === 0))) {
            alert("No items to check. Please set up the appliance first.");
            return;
        }
        
        // Clear previous check data from session storage
        sessionStorage.removeItem('checkResults');
        sessionStorage.removeItem('currentCheckState');

        // Set new check state
        sessionStorage.setItem('checkInProgress', 'true');
        localStorage.setItem('selectedApplianceId', applianceId);
        
        window.location.href = '/checks.html';
    }

    // Event Delegation for Start Check buttons
    if (applianceListContainer) {
        applianceListContainer.addEventListener('click', (e) => {
            const startButton = e.target.closest('.start-check-btn');
            if (startButton) {
                const applianceItem = startButton.closest('.appliance-list-item');
                if (applianceItem) {
                    startChecks(applianceItem.dataset.applianceId);
                }
            }
        });
    }
    
    if (backBtn) {
        backBtn.addEventListener('click', () => window.location.href = '/appliance-checks.html');
    }

    // Initialize
    auth.onAuthStateChanged(user => {
        if (user) {
            userId = user.uid;
            loadData();
        } else {
            window.location.href = '/signin.html';
        }
    });
});