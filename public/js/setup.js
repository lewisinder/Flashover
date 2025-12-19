window.initSetupPage = function initSetupPage(options = {}) {
const auth = firebase.auth();

const isShell = options.isShell === true;
const navigateToMenu =
    options.navigateToMenu ||
    (() => {
        window.location.href = '/menu.html';
    });
const navigateToSetupHome =
    options.navigateToSetupHome ||
    (() => {
        window.location.href = 'select-appliance.html';
    });

// --- Global State ---
let currentUser = null;
let truckData = { appliances: [] };
let lastSavedTruckData = null; // For discarding changes
let hasUnsavedChanges = false;
let pendingUploads = new Map(); // blobUrl -> File object

let activeBrigadeId = null;
let activeApplianceId = null;
let activeLockerId = null;
let activeShelfId = null;
let activeItemId = null;
let activeContainerId = null;
let isNewItem = false;
let currentEditingContext = 'locker'; // 'locker' or 'container'
let draggedItemInfo = null; // { itemId, fromShelfId, fromContext }
let pendingNavigation = null; // For handling async navigation prompts

// --- DOM Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const selectLockerScreen = document.getElementById('select-locker-screen');
const lockerEditorScreen = document.getElementById('locker-editor-screen');
const containerEditorScreen = document.getElementById('container-editor-screen');
const applianceNameTitle = document.getElementById('appliance-name-title');
const lockerListContainer = document.getElementById('locker-list-container');
const lockerEditorName = document.getElementById('locker-editor-name');
const lockerEditorShelves = document.getElementById('locker-editor-shelves');
const addShelfBtn = document.getElementById('add-shelf-btn');
const backBtn = document.getElementById('back-btn');
const headerSaveBtn = document.getElementById('header-save-btn');

// Modals
const nameLockerModal = document.getElementById('name-locker-modal');
const newLockerNameInput = document.getElementById('new-locker-name-input');
const saveNewLockerBtn = document.getElementById('save-new-locker-btn');
const cancelCreateLockerBtn = document.getElementById('cancel-create-locker-btn');
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const unsavedChangesModal = document.getElementById('unsaved-changes-modal');
const saveUnsavedBtn = document.getElementById('save-unsaved-btn');
const discardUnsavedBtn = document.getElementById('discard-unsaved-btn');
const cancelUnsavedBtn = document.getElementById('cancel-unsaved-btn');

const containerEditorTitle = document.getElementById('container-editor-title');
const containerEditorItems = document.getElementById('container-editor-items');
const editLockerNameIcon = document.getElementById('edit-locker-name-icon');

const itemEditorSection = document.getElementById('item-editor-section');
const sectionImagePreview = document.getElementById('section-image-preview');
const sectionFileUpload = document.getElementById('section-file-upload');
const sectionItemNameInput = document.getElementById('section-item-name-input');
const sectionItemDescInput = document.getElementById('section-item-desc-input');
const sectionItemTypeSelect = document.getElementById('section-item-type-select');
const sectionEnterContainerBtn = document.getElementById('section-enter-container-btn');
const sectionCancelEditBtn = document.getElementById('section-cancel-edit-btn');
const sectionSaveItemBtn = document.getElementById('section-save-item-btn');
const sectionDeleteItemBtn = document.getElementById('section-delete-item-btn');

const cItemEditorSection = document.getElementById('c-item-editor-section');
const cSectionImagePreview = document.getElementById('c-section-image-preview');
const cSectionFileUpload = document.getElementById('c-section-file-upload');
const cSectionItemNameInput = document.getElementById('c-section-item-name-input');
const cSectionItemDescInput = document.getElementById('c-section-item-desc-input');
const cSectionCancelEditBtn = document.getElementById('c-section-cancel-edit-btn');
const cSectionSaveItemBtn = document.getElementById('c-section-save-item-btn');
const cSectionDeleteItemBtn = document.getElementById('c-section-delete-item-btn');

const progressModal = document.getElementById('progress-modal');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const progressTitle = document.getElementById('progress-title');

// --- Loader & State Management ---
function showLoading() { if (loadingOverlay) loadingOverlay.style.display = 'flex'; }
function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = 'none'; }

function setUnsavedChanges(isDirty) {
    hasUnsavedChanges = isDirty;
    updateSaveButtonVisibility();
}

function updateSaveButtonVisibility() {
    if (headerSaveBtn) {
        headerSaveBtn.classList.toggle('hidden', !hasUnsavedChanges);
    }
}

// --- Data Handling & Initialization ---
let unsubscribeAuth = null;

function start() {
    Promise.resolve(window.__authReady).finally(() => {
        unsubscribeAuth = auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                activeBrigadeId = options.brigadeId || localStorage.getItem('activeBrigadeId');
                activeApplianceId = options.applianceId || new URLSearchParams(window.location.search).get('applianceId');
                if (!activeBrigadeId || !activeApplianceId) {
                    alert("Brigade or Appliance not selected. Redirecting.");
                    navigateToMenu();
                    return;
                }
                loadBrigadeData();
            } else {
                const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                window.location.href = isShell
                    ? `/signin.html?returnTo=${encodeURIComponent(returnTo)}`
                    : '/signin.html';
            }
        });
    });
    addEventListeners();
}

start();

function addEventListeners() {
    editLockerNameIcon.addEventListener('click', () => lockerEditorName.focus());
    headerSaveBtn.addEventListener('click', () => saveBrigadeData('manualSave'));

    // Main Item Editor Listeners
    sectionSaveItemBtn.addEventListener('click', saveItem);
    sectionCancelEditBtn.addEventListener('click', closeItemEditor);
    sectionDeleteItemBtn.addEventListener('click', () => {
        if(activeItemId) {
            const item = findItem(activeShelfId, activeItemId, currentEditingContext);
            confirmDelete('item', activeItemId, item.name);
        }
    });
    sectionFileUpload.addEventListener('change', (e) => handleImageUpload(e, 'locker'));
    sectionItemTypeSelect.addEventListener('change', (e) => {
       sectionEnterContainerBtn.classList.toggle('hidden', e.target.value !== 'container');
    });
    sectionEnterContainerBtn.addEventListener('click', () => handleNavigation(openContainerEditor));

   // Container Sub-Item Editor Listeners
   cSectionSaveItemBtn.addEventListener('click', saveItem);
   cSectionCancelEditBtn.addEventListener('click', closeItemEditor);
   cSectionDeleteItemBtn.addEventListener('click', () => {
       if(activeItemId) {
           const item = findItem(activeContainerId, activeItemId, 'container');
           confirmDelete('item', activeItemId, item.name, activeContainerId);
       }
   });
   cSectionFileUpload.addEventListener('change', (e) => handleImageUpload(e, 'container'));

    // Navigation
    backBtn.addEventListener('click', () => handleNavigation(navigateBack));

    // Locker Management
    saveNewLockerBtn.addEventListener('click', saveNewLocker);
    cancelCreateLockerBtn.addEventListener('click', () => nameLockerModal.classList.add('hidden'));
    lockerEditorName.addEventListener('change', updateLockerName);

    // Shelf Management
    addShelfBtn.addEventListener('click', addShelf);

    // Delete Confirmation
    cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.classList.add('hidden'));
    
    // Unsaved Changes Modal
    saveUnsavedBtn.addEventListener('click', async () => {
        unsavedChangesModal.classList.add('hidden');
        try {
            await saveBrigadeData('promptedSave');
            if (pendingNavigation) pendingNavigation();
        } finally {
            pendingNavigation = null;
        }
    });
    discardUnsavedBtn.addEventListener('click', () => {
        unsavedChangesModal.classList.add('hidden');
        truckData = JSON.parse(JSON.stringify(lastSavedTruckData)); // Revert changes
        cleanupPendingUploads();
        setUnsavedChanges(false);
        refreshCurrentView();
        if (pendingNavigation) pendingNavigation();
        pendingNavigation = null;
    });
    cancelUnsavedBtn.addEventListener('click', () => {
        unsavedChangesModal.classList.add('hidden');
        pendingNavigation = null;
    });

    // Browser-level navigation guard
    window.addEventListener('beforeunload', beforeUnloadHandler);
}

function beforeUnloadHandler(e) {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = ''; // Required for Chrome
        }
}

async function loadBrigadeData() {
    if (!currentUser || !activeBrigadeId) return;
    showLoading();
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Failed to load brigade data');
        truckData = await response.json();
        lastSavedTruckData = JSON.parse(JSON.stringify(truckData)); // Deep copy
        if (!truckData.appliances) truckData.appliances = [];
        
        const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
        if (appliance) {
            applianceNameTitle.textContent = appliance.name;
            setUnsavedChanges(false);
            renderLockerList();
        } else {
            alert('Appliance not found in this brigade.');
            navigateToSetupHome();
        }
    } catch (error) {
        console.error("Error loading data:", error);
        alert("Error loading data. Please try again.");
    } finally {
        hideLoading();
    }
}

async function saveBrigadeData(operation) {
    if (!currentUser || !activeBrigadeId) return;

    progressModal.classList.remove('hidden');
    progressTitle.textContent = 'Saving...';
    progressText.textContent = 'Preparing to save...';
    progressBar.style.width = '0%';

    try {
        // --- Stage 1: Upload all pending images ---
        const itemsWithPendingUploads = [];
        const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
        appliance.lockers.forEach(l => l.shelves.forEach(s => s.items.forEach(i => {
            if (i.img && i.img.startsWith('blob:')) itemsWithPendingUploads.push(i);
            if (i.subItems) i.subItems.forEach(si => {
                if (si.img && si.img.startsWith('blob:')) itemsWithPendingUploads.push(si);
            });
        })));

        if (itemsWithPendingUploads.length > 0) {
            progressTitle.textContent = 'Uploading Images...';
            const uploadPromises = itemsWithPendingUploads.map((item, index) => {
                const file = pendingUploads.get(item.img);
                if (!file) return Promise.resolve();

                return (async () => {
                    progressText.textContent = `Compressing image ${index + 1} of ${itemsWithPendingUploads.length}`;
                    const compressedFile = await imageCompression(file, {
                        maxSizeMB: 1, maxWidthOrHeight: 800, useWebWorker: true
                    });

                    const formData = new FormData();
                    formData.append('image', compressedFile, compressedFile.name || 'compressed-image.webp');
                    const token = await currentUser.getIdToken();
                    
                    const responseText = await uploadWithProgress(`/api/upload`, token, formData, (event) => {
                        const percentage = (event.loaded / event.total) * 100;
                        const overallProgress = ((index + (event.loaded / event.total)) / itemsWithPendingUploads.length) * 100;
                        progressBar.style.width = `${overallProgress}%`;
                        progressText.textContent = 
                            `Uploading image ${index + 1} of ${itemsWithPendingUploads.length}: ` +
                            `${formatBytes(event.loaded)} / ${formatBytes(event.total)} (${Math.round(percentage)}%)`;
                    });

                    const result = JSON.parse(responseText);
                    URL.revokeObjectURL(item.img); // Clean up blob URL
                    pendingUploads.delete(item.img);
                    item.img = result.filePath; // Replace blob with permanent URL
                })();
            });
            await Promise.all(uploadPromises);
        }

        // --- Stage 2: Save the final data ---
        progressTitle.textContent = 'Saving Data...';
        progressText.textContent = 'Finalizing...';
        progressBar.style.width = '100%';

        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(truckData)
        });
        if (!response.ok) throw new Error('Failed to save data');
        
        console.log(`Data saved after: ${operation}`);
        lastSavedTruckData = JSON.parse(JSON.stringify(truckData));
        setUnsavedChanges(false);

    } catch (error) {
        console.error("Error saving data:", error);
        alert("Error saving data. Your changes may not be persisted.");
        throw error; // Re-throw to allow promise rejection
    } finally {
        progressModal.classList.add('hidden');
    }
}

// --- Navigation ---
function handleNavigation(navigationFn) {
    if (hasUnsavedChanges) {
        pendingNavigation = navigationFn;
        unsavedChangesModal.classList.remove('hidden');
    } else {
        navigationFn();
    }
}

function navigateBack() {
    if (lockerEditorScreen.classList.contains('active')) {
        closeItemEditor();
        lockerEditorScreen.classList.remove('active');
        selectLockerScreen.classList.add('active');
        activeLockerId = null;
    } else if (containerEditorScreen.classList.contains('active')) {
        closeItemEditor();
        if (!cItemEditorSection.style.visibility || cItemEditorSection.style.visibility === 'hidden') {
           containerEditorScreen.classList.remove('active');
           lockerEditorScreen.classList.add('active');
           activeContainerId = null;
        }
    } else {
        navigateToSetupHome();
    }
}

// --- Locker Management ---
function renderLockerList() {
    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    if (!appliance) return;
    lockerListContainer.innerHTML = '';
    (appliance.lockers || []).forEach(locker => {
        const card = document.createElement('div');
        card.className = 'locker-card';
        card.innerHTML = `<div class="locker-name">${locker.name}</div><button class="delete-locker-btn" data-id="${locker.id}"><img src="/design_assets/No Icon.png" alt="Delete" class="h-8 w-8"></button>`;
        card.addEventListener('click', () => openLockerEditor(locker.id));
        card.querySelector('.delete-locker-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDelete('locker', locker.id, locker.name);
        });
        lockerListContainer.appendChild(card);
    });
    const addCard = document.createElement('div');
    addCard.className = 'locker-card add-new';
    addCard.innerHTML = `<div class="locker-name text-5xl">+</div>`;
    addCard.addEventListener('click', () => nameLockerModal.classList.remove('hidden'));
    lockerListContainer.appendChild(addCard);
}

function openLockerEditor(lockerId) {
    closeItemEditor();
    activeLockerId = lockerId;
    const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === lockerId);
    if (!locker) return;

    if (!locker.shelves) locker.shelves = [];
    
    if (locker.shelves.length < 2) {
        locker.shelves.push({ id: String(Date.now() + locker.shelves.length), name: `Shelf ${locker.shelves.length + 1}`, items: [] });
        setUnsavedChanges(true);
    }
    
    lockerEditorName.value = locker.name;
    renderLockerShelves();
    selectLockerScreen.classList.remove('active');
    lockerEditorScreen.classList.add('active');
}

async function saveNewLocker() {
    const name = newLockerNameInput.value.trim();
    if (name) {
        const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
        if (!appliance.lockers) appliance.lockers = [];
        const newLocker = { id: String(Date.now()), name, shelves: [] };
        appliance.lockers.push(newLocker);
        await saveBrigadeData('addLocker'); // Immediate save as requested
        renderLockerList();
        newLockerNameInput.value = '';
        nameLockerModal.classList.add('hidden');
    }
}

function updateLockerName(e) {
    const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
    if (locker) {
        locker.name = e.target.value;
        setUnsavedChanges(true);
    }
}

// --- Shelf Management ---
function renderLockerShelves() {
    const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
    if (!locker) return;
    lockerEditorShelves.innerHTML = '';
    (locker.shelves || []).forEach((shelf, index) => {
        const shelfWrapper = document.createElement('div');
        shelfWrapper.className = 'flex-1 flex flex-col min-h-0';
        const shelfDiv = createShelfElement(shelf, 'locker');
        const label = document.createElement('h3');
        label.className = 'text-white text-center font-bold text-sm mt-1';
        label.textContent = `Shelf ${index + 1}`;
        shelfWrapper.appendChild(shelfDiv);
        shelfWrapper.appendChild(label);
        lockerEditorShelves.appendChild(shelfWrapper);
    });
}

function addShelf() {
    const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
    if (!locker) return;
    if (!locker.shelves) locker.shelves = [];
    const newShelf = { id: String(Date.now()), name: `Shelf ${locker.shelves.length + 1}`, items: [] };
    locker.shelves.push(newShelf);
    setUnsavedChanges(true);
    renderLockerShelves();
}

// --- Item & Container Management ---
function createShelfElement(shelf, context) {
    const shelfDiv = document.createElement('div');
    shelfDiv.className = 'shelf-container';
    if (context === 'locker') shelfDiv.classList.add('locker-context');
    shelfDiv.innerHTML = `<button class="delete-shelf-btn" data-id="${shelf.id}">&times;</button><div class="shelf-items-grid"></div>`;
    const itemsGrid = shelfDiv.querySelector('.shelf-items-grid');
    
    itemsGrid.addEventListener('dragover', handleDragOver);
    itemsGrid.addEventListener('drop', (e) => handleDrop(e, shelf.id, context));

    (shelf.items || []).forEach(item => {
        itemsGrid.appendChild(createItemElement(item, shelf.id, context));
    });

    const addItemBtn = document.createElement('div');
    addItemBtn.className = 'add-item-btn-circle';
    addItemBtn.textContent = '+';
    addItemBtn.addEventListener('click', () => openItemEditor(shelf.id, null, context));
    itemsGrid.appendChild(addItemBtn);

    const deleteBtn = shelfDiv.querySelector('.delete-shelf-btn');
    if (context === 'container') {
       deleteBtn.style.display = 'none';
    } else {
       deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDelete('shelf', shelf.id, shelf.name);
       });
    }
    return shelfDiv;
}

function createItemElement(item, shelfId, context) {
   const itemBox = document.createElement('div');
   itemBox.className = 'item-editor-box';
   itemBox.dataset.itemId = item.id;
   itemBox.dataset.shelfId = shelfId;
   itemBox.dataset.context = context;
   itemBox.draggable = true;
   itemBox.innerHTML = `<div class="item-name-overlay" draggable="false">${item.name || 'New Item'}</div>` + (item.img ? `<img src="${item.img}" alt="${item.name}" class="w-full h-full object-contain" draggable="false">` : '');
   itemBox.addEventListener('click', () => openItemEditor(shelfId, item.id, context));
   itemBox.addEventListener('dragstart', handleDragStart);
   itemBox.addEventListener('dragend', handleDragEnd);
   return itemBox;
}

function openItemEditor(shelfId, itemId, context) {
    currentEditingContext = context;
    activeShelfId = shelfId;
    isNewItem = !itemId;

    let item;
    if (isNewItem) {
        activeItemId = String(Date.now());
        item = { id: activeItemId, name: 'New Item', desc: '', type: 'item', img: '' };
        const shelf = findShelf(shelfId, context);
        if (shelf) {
            if (!shelf.items) shelf.items = [];
            shelf.items.push(item);
            setUnsavedChanges(true);
            refreshCurrentView();
        }
    } else {
        activeItemId = itemId;
        item = findItem(shelfId, itemId, context);
    }

    if (!item) {
        console.error("Item not found for editing");
        return;
    }

    document.querySelectorAll('.item-editor-box').forEach(b => b.classList.remove('editing'));
    requestAnimationFrame(() => {
        const activeBox = document.querySelector(`.item-editor-box[data-item-id='${activeItemId}']`);
        if (activeBox) activeBox.classList.add('editing');
    });

    if (context === 'locker') {
       sectionItemNameInput.value = item.name;
       sectionItemDescInput.value = item.desc;
       sectionItemTypeSelect.value = item.type;
       sectionImagePreview.src = item.img || '';
       sectionImagePreview.classList.toggle('hidden', !item.img);
       sectionEnterContainerBtn.classList.toggle('hidden', item.type !== 'container');
       itemEditorSection.style.visibility = 'visible';
       itemEditorSection.style.opacity = 1;
    } else { // context === 'container'
       cSectionItemNameInput.value = item.name;
       cSectionItemDescInput.value = item.desc;
       cSectionImagePreview.src = item.img || '';
       cSectionImagePreview.classList.toggle('hidden', !item.img);
       cItemEditorSection.style.visibility = 'visible';
       cItemEditorSection.style.opacity = 1;
    }
}

function closeItemEditor() {
    if (isNewItem) {
        const shelf = findShelf(activeShelfId, currentEditingContext);
        if (shelf) {
            const item = findItem(activeShelfId, activeItemId, currentEditingContext);
            if (item && item.name === 'New Item') {
                 shelf.items = shelf.items.filter(i => i.id !== activeItemId);
                 if (item.img && item.img.startsWith('blob:')) {
                    URL.revokeObjectURL(item.img);
                    pendingUploads.delete(item.img);
                 }
                 setUnsavedChanges(true);
                 refreshCurrentView();
            }
        }
    }
    activeItemId = null;
    isNewItem = false;
    itemEditorSection.style.visibility = 'hidden';
    itemEditorSection.style.opacity = 0;
    cItemEditorSection.style.visibility = 'hidden';
    cItemEditorSection.style.opacity = 0;
    document.querySelectorAll('.item-editor-box').forEach(b => b.classList.remove('editing'));
}

function saveItem() {
    if (!activeItemId) return;
    
    const context = currentEditingContext;
    const item = findItem(activeShelfId, activeItemId, context);
    if (!item) { console.error("Could not find item to save."); return; }

    let name;
    if (context === 'locker') {
       name = sectionItemNameInput.value.trim();
       if (!name) { alert('Item name is required.'); return; }
       item.name = name;
       item.desc = sectionItemDescInput.value;
       item.type = sectionItemTypeSelect.value;
       item.img = sectionImagePreview.src;
       if (item.type === 'container' && !item.subItems) item.subItems = [];
    } else { // context === 'container'
       name = cSectionItemNameInput.value.trim();
       if (!name) { alert('Item name is required.'); return; }
       item.name = name;
       item.desc = cSectionItemDescInput.value;
       item.img = cSectionImagePreview.src;
    }

    setUnsavedChanges(true);
    isNewItem = false; // It's no longer a new item
    refreshCurrentView();
    
    requestAnimationFrame(() => {
        const activeBox = document.querySelector(`.item-editor-box[data-item-id='${activeItemId}']`);
        if (activeBox) activeBox.classList.add('editing');
    });
}

function openContainerEditor() {
    const name = sectionItemNameInput.value.trim();
    if (!name || (isNewItem && name === 'New Item')) {
        alert('Please give the container a name before adding items to it.');
        return;
    }
    
    saveItem(); 
    activeContainerId = activeItemId;

    const container = findContainer(activeContainerId);
    if (!container) return;
    containerEditorTitle.textContent = `Editing: ${container.name}`;
    renderContainerItems();
    lockerEditorScreen.classList.remove('active');
    containerEditorScreen.classList.add('active');
}

function renderContainerItems() {
    const container = findContainer(activeContainerId);
    if (!container) return;
    containerEditorItems.innerHTML = '';
    if (!container.subItems) container.subItems = [];

    container.subItems.forEach(item => {
        containerEditorItems.appendChild(createItemElement(item, activeContainerId, 'container'));
    });

    const addItemBtn = document.createElement('div');
    addItemBtn.className = 'add-item-btn-circle';
    addItemBtn.textContent = '+';
    addItemBtn.addEventListener('click', () => openItemEditor(activeContainerId, null, 'container'));
    containerEditorItems.appendChild(addItemBtn);
}

// --- Drag and Drop Handlers ---
function handleDragStart(e) {
   draggedItemInfo = { itemId: e.target.dataset.itemId, fromShelfId: e.target.dataset.shelfId, fromContext: e.target.dataset.context };
   e.target.classList.add('dragging');
   e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
   e.target.classList.remove('dragging');
   draggedItemInfo = null;
}

function handleDragOver(e) {
   e.preventDefault();
   e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e, toShelfId, toContext) {
   e.preventDefault();
   if (!draggedItemInfo) return;
   const { itemId, fromShelfId, fromContext } = draggedItemInfo;
   const fromShelf = findShelf(fromShelfId, fromContext);
   const toShelf = findShelf(toShelfId, toContext);
   if (!fromShelf || !toShelf) return;
   const itemIndex = fromShelf.items.findIndex(i => i.id === itemId);
   if (itemIndex === -1) return;
   const [movedItem] = fromShelf.items.splice(itemIndex, 1);
   const dropTarget = e.target.closest('.item-editor-box');
   if (dropTarget && toShelf.items.length > 0) {
       const targetIndex = toShelf.items.findIndex(i => i.id === dropTarget.dataset.itemId);
       toShelf.items.splice(targetIndex, 0, movedItem);
   } else {
       toShelf.items.push(movedItem);
   }
   setUnsavedChanges(true);
   refreshCurrentView();
}

// --- Utility Functions ---
function findContainer(containerId) {
   if (!activeLockerId || !containerId) return null;
   const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
   if (!locker || !locker.shelves) return null;
   for (const shelf of locker.shelves) {
       if (shelf.items) {
           const item = shelf.items.find(i => i.id === containerId);
           if (item && item.type === 'container') return item;
       }
   }
   return null;
}

function findShelf(shelfId, context) {
    if (context === 'locker') {
        return truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId)?.shelves.find(s => s.id === shelfId);
    } else { // context === 'container'
        const container = findContainer(shelfId);
        if (!container) return null;
        if (!container.subItems) container.subItems = [];
        return { id: 'container_shelf_' + container.id, items: container.subItems };
    }
}

function findItem(shelfId, itemId, context) {
    if (!itemId) return null;
    const shelf = findShelf(shelfId, context);
    return shelf?.items?.find(i => i.id === itemId);
}

function refreshCurrentView() {
    if (lockerEditorScreen.classList.contains('active')) {
        renderLockerShelves();
    } else if (containerEditorScreen.classList.contains('active')) {
        renderContainerItems();
    } else {
        renderLockerList();
    }
}

function cleanupPendingUploads() {
    for (const blobUrl of pendingUploads.keys()) {
        URL.revokeObjectURL(blobUrl);
    }
    pendingUploads.clear();
}

function confirmDelete(type, id, name, parentId = null) {
    document.getElementById('delete-confirm-text').textContent = `This will permanently delete the ${type} "${name}" and all its contents. This action cannot be undone.`;
    deleteConfirmModal.classList.remove('hidden');
    confirmDeleteBtn.onclick = async () => {
        let shouldSaveImmediately = false;
        if (type === 'locker') {
            const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
            appliance.lockers = appliance.lockers.filter(l => l.id !== id);
            shouldSaveImmediately = true;
        } else if (type === 'shelf') {
            const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
            locker.shelves = locker.shelves.filter(s => s.id !== id);
        } else if (type === 'item') {
            const context = parentId ? 'container' : 'locker';
            const shelf = findShelf(parentId || activeShelfId, context);
            if (shelf && shelf.items) {
                const itemToDelete = shelf.items.find(i => i.id === id);
                if (itemToDelete && itemToDelete.img && itemToDelete.img.startsWith('blob:')) {
                    URL.revokeObjectURL(itemToDelete.img);
                    pendingUploads.delete(itemToDelete.img);
                }
                shelf.items = shelf.items.filter(i => i.id !== id);
            }
            closeItemEditor();
        }
        
        if (shouldSaveImmediately) {
            await saveBrigadeData(`delete${type}`);
        } else {
            setUnsavedChanges(true);
        }

        refreshCurrentView();
        deleteConfirmModal.classList.add('hidden');
    };
}

function handleImageUpload(e, context) {
    const file = e.target.files[0];
    if (!file || !activeItemId) return;

    const item = findItem(activeShelfId, activeItemId, context);
    if (!item) return;

    // If there's an old image, clean it up.
    if (item.img) {
        if (item.img.startsWith('blob:')) {
            URL.revokeObjectURL(item.img);
            pendingUploads.delete(item.img);
        } 
    }

    const blobUrl = URL.createObjectURL(file);
    pendingUploads.set(blobUrl, file);

    item.img = blobUrl;
    setUnsavedChanges(true);

    const previewEl = context === 'locker' ? sectionImagePreview : cSectionImagePreview;
    previewEl.src = blobUrl;
    previewEl.classList.remove('hidden');
    
    refreshCurrentView();
    e.target.value = '';
}

function uploadWithProgress(url, token, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(event);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
            else reject(new Error(xhr.statusText));
        };
        xhr.onerror = () => reject(new Error("Network request failed"));
        xhr.send(formData);
    });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

return () => {
    try {
        if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
    } catch (e) {}
    try {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
    } catch (e) {}
    try {
        cleanupPendingUploads();
    } catch (e) {}
};
};

// Auto-init only when running as the legacy standalone page (setup.html),
// not when the setup UI is embedded inside the app shell.
try {
    const isStandaloneSetupPage = /\/setup\.html$/.test(window.location.pathname || '');
    if (isStandaloneSetupPage) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                window.__setupCleanup = window.initSetupPage({});
            });
        } else {
            window.__setupCleanup = window.initSetupPage({});
        }
    }
} catch (e) {}
