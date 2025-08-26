const auth = firebase.auth();
const loadingOverlay = document.getElementById('loading-overlay');
const applianceList = document.getElementById('appliance-list');
const createNewApplianceBtn = document.getElementById('create-new-appliance-btn');
const applianceModal = document.getElementById('appliance-modal');
const applianceModalTitle = document.getElementById('appliance-modal-title');
const applianceNameInput = document.getElementById('appliance-name-input');
const cancelApplianceBtn = document.getElementById('cancel-appliance-btn');
const saveApplianceBtn = document.getElementById('save-appliance-btn');
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const backBtn = document.getElementById('back-btn');

let currentUser = null;
let truckData = { appliances: [] };
let activeBrigadeId = null;
let editingApplianceId = null;

// --- Utility Functions ---
function showLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'none';
}

// --- Page Initialization ---
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
    createNewApplianceBtn.addEventListener('click', () => openApplianceModal());
    cancelApplianceBtn.addEventListener('click', closeApplianceModal);
    saveApplianceBtn.addEventListener('click', saveAppliance);
    cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.classList.add('hidden'));
});

// --- Data Handling ---
async function loadBrigadeData() {
    if (!currentUser || !activeBrigadeId) return;
    showLoading();
    applianceList.innerHTML = ''; // Clear current list
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 403) {
            applianceList.innerHTML = `
                <div class="text-center text-red-500 p-4 bg-red-100 rounded-lg">
                    <p class="font-bold">Access Denied</p>
                    <p>You are not a member of the selected brigade. It may have been deleted.</p>
                    <button onclick="window.location.href='/manage-brigades.html'" class="mt-4 bg-blue text-white font-bold py-2 px-4 rounded-lg">Go to Brigade Management</button>
                </div>`;
            return;
        }
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

async function saveBrigadeData() {
    if (!currentUser || !activeBrigadeId) return;
    showLoading();
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(truckData)
        });
        if (!response.ok) throw new Error('Failed to save data');
    } catch (error) {
        console.error("Error saving brigade data:", error);
        alert("There was an error saving the data. Please check your connection and try again.");
    } finally {
        hideLoading();
    }
}

// --- UI Rendering ---
function renderApplianceList() {
    applianceList.innerHTML = '';
    if (truckData.appliances && truckData.appliances.length > 0) {
        truckData.appliances.forEach(appliance => {
            const div = document.createElement('div');
            div.className = 'appliance-list-item';
            
            // The entire div is now the main clickable element
            div.addEventListener('click', () => {
                window.location.href = `setup.html?applianceId=${appliance.id}`;
            });

            div.innerHTML = `
                <img src="/design_assets/Truck Icon.png" alt="Truck" class="h-12 w-12 mr-4 flex-shrink-0">
                <div class="flex-grow">
                    <h2 class="text-xl font-bold">${appliance.name}</h2>
                </div>
                <div class="flex items-center flex-shrink-0">
                    <button class="edit-appliance-btn p-2" data-id="${appliance.id}">
                        <img src="/design_assets/black pencil icon.png" class="h-6 w-6">
                    </button>
                    <button class="delete-appliance-btn p-2" data-id="${appliance.id}" data-name="${appliance.name}">
                        <img src="/design_assets/No Icon.png" class="h-8 w-8">
                    </button>
                </div>
            `;

            // Add event listeners to buttons, making sure to stop propagation
            div.querySelector('.edit-appliance-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the main div's click event
                openApplianceModal(e.currentTarget.dataset.id);
            });
            div.querySelector('.delete-appliance-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the main div's click event
                const button = e.currentTarget;
                confirmDelete(button.dataset.id, button.dataset.name);
            });

            applianceList.appendChild(div);
        });
    } else {
        applianceList.innerHTML = `<p class="text-center text-gray-500">No appliances configured for this brigade.</p>`;
    }
}


// --- Modal & Action Logic ---
function openApplianceModal(id = null) {
    editingApplianceId = id;
    if (id) {
        const appliance = truckData.appliances.find(a => a.id === id);
        applianceModalTitle.textContent = 'Edit Appliance';
        applianceNameInput.value = appliance.name;
        saveApplianceBtn.textContent = 'Save';
    } else {
        applianceModalTitle.textContent = 'Create New Appliance';
        applianceNameInput.value = '';
        saveApplianceBtn.textContent = 'Create';
    }
    applianceModal.classList.remove('hidden');
}

function closeApplianceModal() {
    applianceModal.classList.add('hidden');
}

async function saveAppliance() {
    const name = applianceNameInput.value.trim();
    if (!name) {
        alert('Appliance name cannot be empty.');
        return;
    }
    if (editingApplianceId) {
        const appliance = truckData.appliances.find(a => a.id === editingApplianceId);
        appliance.name = name;
    } else {
        const newAppliance = {
            id: String(Date.now()),
            name: name,
            lockers: []
        };
        truckData.appliances.push(newAppliance);
    }
    await saveBrigadeData();
    renderApplianceList();
    closeApplianceModal();
}

function confirmDelete(id, name) {
    const textElement = document.getElementById('delete-confirm-text');
    textElement.textContent = `This will permanently delete the appliance "${name}" and all its contents. This action cannot be undone.`;
    deleteConfirmModal.classList.remove('hidden');
    confirmDeleteBtn.onclick = async () => {
        deleteConfirmModal.classList.add('hidden');
        await deleteAppliance(id);
    };
}

async function deleteAppliance(id) {
    truckData.appliances = truckData.appliances.filter(a => a.id !== id);
    await saveBrigadeData();
    renderApplianceList();
}
