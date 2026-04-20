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
let activeBrigadeRole = null;

function showLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'none';
}

function normalizeRole(role) {
    const raw = String(role || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (raw === 'admin') return 'admin';
    if (raw === 'gearmanager') return 'gearManager';
    if (raw === 'member') return 'member';
    if (raw === 'viewer') return 'viewer';
    return '';
}

function canRunChecks(role) {
    const normalized = normalizeRole(role);
    return normalized === 'admin' || normalized === 'gearManager' || normalized === 'member';
}

function checkSessionIdFrom(data) {
    return (
        data?.sessionId ||
        data?.checkSessionId ||
        data?.lock?.sessionId ||
        data?.checkStatus?.sessionId ||
        data?.status?.sessionId ||
        ''
    );
}

function preserveCheckSessionId(data) {
    const sessionId = checkSessionIdFrom(data);
    if (sessionId) localStorage.setItem('checkSessionId', sessionId);
}

function lockOwnerText(lock) {
    return lock?.user || lock?.name || lock?.email || 'another member';
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = data.code;
        error.data = data;
        throw error;
    }
    return data;
}

async function loadActiveBrigadeRole(token) {
    const brigades = await fetchJson(`/api/data/${encodeURIComponent(currentUser.uid)}/brigades?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const active = Array.isArray(brigades) ? brigades.find((brigade) => brigade.id === activeBrigadeId) : null;
    activeBrigadeRole = normalizeRole(active?.role || truckData.role || truckData.currentUserRole);
}

function openCheck(appliance) {
    localStorage.setItem('selectedApplianceId', appliance.id);
    localStorage.setItem('selectedBrigadeId', activeBrigadeId);
    window.location.href = 'checks.html';
}

function clearCheckSession() {
    sessionStorage.removeItem('checkInProgress');
    sessionStorage.removeItem('checkResults');
    sessionStorage.removeItem('currentCheckState');
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
        truckData = await fetchJson(`/api/brigades/${encodeURIComponent(activeBrigadeId)}/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        activeBrigadeRole = normalizeRole(truckData.role || truckData.currentUserRole);
        try {
            await loadActiveBrigadeRole(token);
        } catch (error) {
            console.warn('Could not load active brigade role:', error);
        }
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
    const canStartChecks = canRunChecks(activeBrigadeRole);
    if (truckData.appliances && truckData.appliances.length > 0) {
        truckData.appliances.forEach(appliance => {
            const div = document.createElement('div');
            div.className = 'appliance-list-item';
            const icon = document.createElement('img');
            icon.src = '/design_assets/Truck Icon.png';
            icon.alt = 'Truck';
            icon.className = 'h-12 w-12 mr-4';
            const title = document.createElement('h2');
            title.className = 'text-xl font-bold';
            title.textContent = appliance.name || 'Appliance';
            div.appendChild(icon);
            div.appendChild(title);
            div.title = canStartChecks ? '' : 'Viewers cannot start or resume checks.';
            if (canStartChecks) {
                div.addEventListener('click', () => handleApplianceSelection(appliance));
            }
            applianceList.appendChild(div);
        });
    } else {
        applianceList.innerHTML = `<p class="text-center text-gray-500">No appliances configured for this brigade. Please set one up first.</p>`;
    }
}

async function handleApplianceSelection(appliance) {
    if (!canRunChecks(activeBrigadeRole)) {
        alert('Viewers cannot start or resume checks.');
        return;
    }
    showLoading();
    const token = await currentUser.getIdToken();
    
    try {
        // Check the server for the check status
        const status = await fetchJson(`/api/brigades/${encodeURIComponent(activeBrigadeId)}/appliances/${encodeURIComponent(appliance.id)}/check-status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        preserveCheckSessionId(status);

        if (status.inProgress) {
            hideLoading(); // Hide loading to show the modal
            modalText.textContent = `A check for this appliance was already started by ${lockOwnerText(status)}. Would you like to resume or start a new check?`;
            modal.classList.remove('hidden');

            resumeBtn.onclick = () => {
                showLoading();
                preserveCheckSessionId(status);
                openCheck(appliance);
            };

            startNewBtn.onclick = async () => {
                modal.classList.add('hidden');
                try {
                    showLoading();
                    // Force start a new check, overwriting the old one
                    const startResult = await fetchJson(`/api/brigades/${encodeURIComponent(activeBrigadeId)}/appliances/${encodeURIComponent(appliance.id)}/start-check`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ force: true })
                    });
                    preserveCheckSessionId(startResult);
                    clearCheckSession();
                    openCheck(appliance);
                } catch (error) {
                    console.error("Error starting new check:", error);
                    hideLoading();
                }
            };

        } else {
            // No check in progress, so start a new one
            const startResult = await fetchJson(`/api/brigades/${encodeURIComponent(activeBrigadeId)}/appliances/${encodeURIComponent(appliance.id)}/start-check`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            preserveCheckSessionId(startResult);
            openCheck(appliance);
        }
    } catch (error) {
        console.error("Error handling appliance selection:", error);
        hideLoading();
    }
}
