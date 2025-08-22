const auth = firebase.auth();
const loadingOverlay = document.getElementById('loading-overlay');
const applianceList = document.getElementById('appliance-list-for-check');
const backBtn = document.getElementById('back-btn');
const modal = document.getElementById('check-in-progress-modal');
const modalText = document.getElementById('modal-text');
const resumeBtn = document.getElementById('resume-check-btn');
const startNewBtn = document.getElementById('start-new-check-btn');
const cancelBtn = document.getElementById('cancel-modal-btn');

let currentUser = null;
let truckData = { appliances: [] };
let activeBrigadeId = null;

function showLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            activeBrigadeId = localStorage.getItem('activeBrigadeId');
            if (!activeBrigadeId) {
                alert("No active brigade selected. Please select one from the menu.");
                window.location.href = '/menu.html';
                return;
            }
            loadBrigadeData();
        } else {
            window.location.href = '/signin.html';
        }
    });

    backBtn.addEventListener('click', () => window.location.href = '/appliance-checks.html');
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));
});

async function loadBrigadeData() {
    if (!currentUser || !activeBrigadeId) return;
    showLoading();
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to load appliance data.');
        truckData = await response.json();
        if (!truckData.appliances) truckData.appliances = [];
        renderApplianceList();
    } catch (error) {
        console.error("Error loading brigade data:", error);
        applianceList.innerHTML = `<p class="text-center text-red-500">Error loading data. Please try again.</p>`;
    } finally {
        hideLoading();
    }
}

function renderApplianceList() {
    applianceList.innerHTML = '';
    if (truckData.appliances && truckData.appliances.length > 0) {
        truckData.appliances.forEach(appliance => {
            const div = document.createElement('div');
            div.className = 'appliance-list-item';
            div.innerHTML = `<img src="/design_assets/Truck Icon.png" alt="Truck" class="h-12 w-12 mr-4"><h2 class="text-xl font-bold">${appliance.name}</h2>`;
            div.addEventListener('click', () => handleApplianceSelection(appliance));
            applianceList.appendChild(div);
        });
    } else {
        applianceList.innerHTML = `<p class="text-center text-gray-500">No appliances configured for this brigade. Please set one up first.</p>`;
    }
}

async function handleApplianceSelection(appliance) {
    showLoading();
    const token = await currentUser.getIdToken();
    
    try {
        // Check the server for the check status
        const statusResponse = await fetch(`/api/brigades/${activeBrigadeId}/appliances/${appliance.id}/check-status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const status = await statusResponse.json();

        if (status.inProgress) {
            hideLoading(); // Hide loading to show the modal
            modalText.textContent = `A check for this appliance was already started by ${status.user}. Would you like to resume or start a new check?`;
            modal.classList.remove('hidden');

            resumeBtn.onclick = () => {
                showLoading();
                localStorage.setItem('selectedApplianceId', appliance.id);
                localStorage.setItem('selectedBrigadeId', activeBrigadeId);
                window.location.href = 'checks.html';
            };

            startNewBtn.onclick = async () => {
                showLoading();
                // Force start a new check, overwriting the old one
                await fetch(`/api/brigades/${activeBrigadeId}/appliances/${appliance.id}/start-check`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                // Clear local session storage to ensure a fresh start
                sessionStorage.removeItem('checkInProgress');
                sessionStorage.removeItem('checkResults');
                sessionStorage.removeItem('currentCheckState');
                localStorage.setItem('selectedApplianceId', appliance.id);
                localStorage.setItem('selectedBrigadeId', activeBrigadeId);
                window.location.href = 'checks.html';
            };

        } else {
            // No check in progress, so start a new one
            await fetch(`/api/brigades/${activeBrigadeId}/appliances/${appliance.id}/start-check`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            localStorage.setItem('selectedApplianceId', appliance.id);
            localStorage.setItem('selectedBrigadeId', activeBrigadeId);
            window.location.href = 'checks.html';
        }
    } catch (error) {
        console.error("Error handling appliance selection:", error);
        hideLoading();
    }
}
