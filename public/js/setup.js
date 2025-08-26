const auth = firebase.auth();

// --- Global State ---
let currentUser = null;
let truckData = { appliances: [] };
let activeBrigadeId = null;
let activeApplianceId = null;
let activeLockerId = null;
let activeShelfId = null;
let activeItemId = null;
let activeContainerId = null;
let isNewItem = false;
let currentEditingContext = 'locker'; // 'locker' or 'container'
let draggedItemInfo = null; // { itemId, fromShelfId, fromContext }

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
const nameLockerModal = document.getElementById('name-locker-modal');
const newLockerNameInput = document.getElementById('new-locker-name-input');
const saveNewLockerBtn = document.getElementById('save-new-locker-btn');
const cancelCreateLockerBtn = document.getElementById('cancel-create-locker-btn');
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
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

// --- Loader Functions ---
function showLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

// --- Data Handling & Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            activeBrigadeId = localStorage.getItem('activeBrigadeId');
            activeApplianceId = new URLSearchParams(window.location.search).get('applianceId');
            if (!activeBrigadeId || !activeApplianceId) {
                alert("Brigade or Appliance not selected. Redirecting.");
                window.location.href = '/menu.html';
                return;
            }
            loadBrigadeData();
        } else {
            window.location.href = '/signin.html';
        }
    });

    addEventListeners();
});

function addEventListeners() {
    editLockerNameIcon.addEventListener('click', () => lockerEditorName.focus());
    
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
    sectionEnterContainerBtn.addEventListener('click', () => {
        const name = sectionItemNameInput.value.trim();
        if (!name) {
            alert('Please enter an item name before editing the container.');
            return;
        }
        saveItem().then(() => {
            activeContainerId = activeItemId;
            openContainerEditor();
        });
    });

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
    backBtn.addEventListener('click', handleBackNavigation);

    // Locker Management
    saveNewLockerBtn.addEventListener('click', saveNewLocker);
    cancelCreateLockerBtn.addEventListener('click', () => nameLockerModal.classList.add('hidden'));
    lockerEditorName.addEventListener('change', updateLockerName);

    // Shelf Management
    addShelfBtn.addEventListener('click', addShelf);

    // Delete Confirmation
    cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.classList.add('hidden'));
}


async function loadBrigadeData() {
    if (!currentUser || !activeBrigadeId) return;
    showLoading();
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error('Failed to load brigade data');
        truckData = await response.json();
        if (!truckData.appliances) truckData.appliances = [];
        const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
        if (appliance) {
            applianceNameTitle.textContent = appliance.name;
            renderLockerList();
        } else {
            alert('Appliance not found in this brigade.');
            window.location.href = 'select-appliance.html';
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
    showLoading();
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(truckData)
        });
        if (!response.ok) throw new Error('Failed to save data');
        console.log(`Data saved after: ${operation}`);
    } catch (error) {
        console.error("Error saving data:", error);
        alert("Error saving data. Your changes may not be persisted.");
    } finally {
        hideLoading();
    }
}

// --- Navigation ---
function handleBackNavigation() {
    if (lockerEditorScreen.classList.contains('active')) {
        closeItemEditor();
        lockerEditorScreen.classList.remove('active');
        selectLockerScreen.classList.add('active');
        activeLockerId = null;
    } else if (containerEditorScreen.classList.contains('active')) {
        closeItemEditor(); // Close item editor if open
        if (!cItemEditorSection.style.visibility || cItemEditorSection.style.visibility === 'hidden') {
           containerEditorScreen.classList.remove('active');
           lockerEditorScreen.classList.add('active');
           activeContainerId = null;
        }
    } else {
        window.location.href = 'select-appliance.html';
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
    activeLockerId = lockerId;
    const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === lockerId);
    if (!locker) return;

    if (!locker.shelves) locker.shelves = [];
    let changed = false;
    while (locker.shelves.length < 2) {
        locker.shelves.push({ id: String(Date.now() + locker.shelves.length), name: `Shelf ${locker.shelves.length + 1}`, items: [] });
        changed = true;
    }
    
    const showEditor = () => {
        lockerEditorName.value = locker.name;
        renderLockerShelves();
        selectLockerScreen.classList.remove('active');
        lockerEditorScreen.classList.add('active');
    };

    if (changed) {
        saveBrigadeData('ensureTwoShelves').then(showEditor);
    } else {
        showEditor();
    }
}

function saveNewLocker() {
    const name = newLockerNameInput.value.trim();
    if (name) {
        const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
        if (!appliance.lockers) appliance.lockers = [];
        const newLocker = { id: String(Date.now()), name, shelves: [] };
        appliance.lockers.push(newLocker);
        saveBrigadeData('addLocker');
        renderLockerList();
        newLockerNameInput.value = '';
        nameLockerModal.classList.add('hidden');
    }
}

function updateLockerName(e) {
    const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
    if (locker) {
        locker.name = e.target.value;
        saveBrigadeData('updateLockerName');
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
    saveBrigadeData('addShelf');
    renderLockerShelves();
}

// --- Item & Container Management ---
function createShelfElement(shelf, context) {
    const shelfDiv = document.createElement('div');
    shelfDiv.className = 'shelf-container';
    if (context === 'locker') {
       shelfDiv.classList.add('locker-context');
    }
    shelfDiv.innerHTML = `<button class="delete-shelf-btn" data-id="${shelf.id}">&times;</button><div class="shelf-items-grid"></div>`;
    const itemsGrid = shelfDiv.querySelector('.shelf-items-grid');
    
    itemsGrid.addEventListener('dragover', handleDragOver);
    itemsGrid.addEventListener('drop', (e) => handleDrop(e, shelf.id, context));

    (shelf.items || []).forEach(item => {
        const itemBox = createItemElement(item, shelf.id, context);
        itemsGrid.appendChild(itemBox);
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
    activeShelfId = shelfId; // This is the locker's shelfId or the containerId
    activeItemId = itemId;
    isNewItem = !itemId;

    let item;
    if (isNewItem) {
        item = { id: String(Date.now()), name: '', desc: '', type: 'item', img: '' };
        activeItemId = item.id;
        const shelf = findShelf(shelfId, context);
        if (!shelf.items) shelf.items = [];
        shelf.items.push(item);
        saveBrigadeData('create new item placeholder').then(() => {
            refreshCurrentView();
            const activeBox = document.querySelector(`.item-editor-box[data-item-id='${activeItemId}']`);
            if (activeBox) activeBox.classList.add('editing');
        });
    } else {
        item = findItem(shelfId, itemId, context);
        const activeBox = document.querySelector(`.item-editor-box[data-item-id='${activeItemId}']`);
        if (activeBox) activeBox.classList.add('editing');
    }

    document.querySelectorAll('.item-editor-box').forEach(b => {
        if (b.dataset.itemId !== activeItemId) b.classList.remove('editing');
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
            shelf.items = shelf.items.filter(i => i.id !== activeItemId);
        }
    }
    activeItemId = null;
    isNewItem = false;
    itemEditorSection.style.visibility = 'hidden';
    itemEditorSection.style.opacity = 0;
    cItemEditorSection.style.visibility = 'hidden';
    cItemEditorSection.style.opacity = 0;
    document.querySelectorAll('.item-editor-box').forEach(b => b.classList.remove('editing'));
    refreshCurrentView();
}

async function saveItem() {
    if (!activeItemId) return;
    
    let item, name, desc, type, img;

    if (currentEditingContext === 'locker') {
       name = sectionItemNameInput.value.trim();
       if (!name) { alert('Item name is required.'); return; }
       item = findItem(activeShelfId, activeItemId, 'locker');
       item.name = name;
       item.desc = sectionItemDescInput.value;
       item.type = sectionItemTypeSelect.value;
       item.img = sectionImagePreview.src;
       if (item.type === 'container' && !item.subItems) {
           item.subItems = [];
       }
    } else { // context === 'container'
       name = cSectionItemNameInput.value.trim();
       if (!name) { alert('Item name is required.'); return; }
       item = findItem(activeShelfId, activeItemId, 'container');
       item.name = name;
       item.desc = cSectionItemDescInput.value;
       item.img = cSectionImagePreview.src;
    }

    await saveBrigadeData('saveItem');
    isNewItem = false; // It's no longer a new item after saving.
    refreshCurrentView();
    
    // Keep the editor open and the item highlighted
    const activeBox = document.querySelector(`.item-editor-box[data-item-id='${activeItemId}']`);
    if (activeBox) activeBox.classList.add('editing');
}

function openContainerEditor() {
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
        const itemBox = createItemElement(item, activeContainerId, 'container');
        containerEditorItems.appendChild(itemBox);
    });

    // Add the circular "Add Item" button
    const addItemBtn = document.createElement('div');
    addItemBtn.className = 'add-item-btn-circle';
    addItemBtn.textContent = '+';
    addItemBtn.addEventListener('click', () => openItemEditor(activeContainerId, null, 'container'));
    containerEditorItems.appendChild(addItemBtn);
}

// --- Drag and Drop Handlers ---
function handleDragStart(e) {
   draggedItemInfo = {
       itemId: e.target.dataset.itemId,
       fromShelfId: e.target.dataset.shelfId,
       fromContext: e.target.dataset.context
   };
   e.target.classList.add('dragging');
   e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
   e.target.classList.remove('dragging');
   draggedItemInfo = null;
}

function handleDragOver(e) {
   e.preventDefault(); // Necessary to allow dropping
   e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e, toShelfId, toContext) {
   e.preventDefault();
   if (!draggedItemInfo) return;

   const { itemId, fromShelfId, fromContext } = draggedItemInfo;

   // Find the source and destination shelves
   const fromShelf = findShelf(fromShelfId, fromContext);
   const toShelf = findShelf(toShelfId, toContext);

   if (!fromShelf || !toShelf) return;

   // Find the index of the item to move
   const itemIndex = fromShelf.items.findIndex(i => i.id === itemId);
   if (itemIndex === -1) return;

   // Remove the item from the source shelf
   const [movedItem] = fromShelf.items.splice(itemIndex, 1);

   // Find the target element to determine insertion point
   const dropTarget = e.target.closest('.item-editor-box');
   if (dropTarget && toShelf.items.length > 0) {
       const targetIndex = toShelf.items.findIndex(i => i.id === dropTarget.dataset.itemId);
       toShelf.items.splice(targetIndex, 0, movedItem);
   } else {
       // Dropped on the grid or an empty area, add to the end
       toShelf.items.push(movedItem);
   }

   saveBrigadeData('moveItem');
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
        // In container context, the shelfId is the containerId.
        const container = findContainer(shelfId);
        if (!container) return null;
        if (!container.subItems) container.subItems = [];
        // A container's "shelf" is a virtual object representing its sub-items.
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

function confirmDelete(type, id, name, parentId = null) {
    document.getElementById('delete-confirm-text').textContent = `This will permanently delete the ${type} "${name}" and all its contents. This action cannot be undone.`;
    deleteConfirmModal.classList.remove('hidden');
    confirmDeleteBtn.onclick = () => {
        if (type === 'locker') {
            const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
            appliance.lockers = appliance.lockers.filter(l => l.id !== id);
        } else if (type === 'shelf') {
            const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
            locker.shelves = locker.shelves.filter(s => s.id !== id);
        } else if (type === 'item') {
            const context = parentId ? 'container' : 'locker';
            if (context === 'container') {
                const container = findContainer(parentId);
                if (container && container.subItems) {
                    container.subItems = container.subItems.filter(i => i.id !== id);
                }
            } else { // context === 'locker'
                const shelf = findShelf(activeShelfId, 'locker');
                if (shelf && shelf.items) {
                    shelf.items = shelf.items.filter(i => i.id !== id);
                }
            }
            closeItemEditor();
        }
        saveBrigadeData(`delete${type}`);
        refreshCurrentView();
        deleteConfirmModal.classList.add('hidden');
    };
}

function uploadWithProgress(url, token, formData, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentage = (event.loaded / event.total) * 100;
                onProgress(percentage);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.responseText);
            } else {
                reject(new Error(xhr.statusText));
            }
        };

        xhr.onerror = () => {
            reject(new Error("Network request failed"));
        };

        xhr.send(formData);
    });
}

async function handleImageUpload(e, context) {
    const file = e.target.files[0];
    if (!file) return;

    // --- Show and prepare the progress modal ---
    progressModal.classList.remove('hidden');
    progressTitle.textContent = 'Optimizing Image...';
    progressText.textContent = 'Starting...';
    progressBar.style.width = '0%';

    // --- Compression ---
    const compressionOptions = {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        onProgress: (percentage) => {
            const p = Math.round(percentage);
            progressBar.style.width = p + '%';
            progressText.textContent = `Compressing: ${p}%`;
        }
    };

    try {
        const compressedFile = await imageCompression(file, compressionOptions);

        // --- Switch modal to Uploading state ---
        progressTitle.textContent = 'Uploading...';
        progressBar.style.width = '0%'; // Reset for upload progress

        const formData = new FormData();
        formData.append('image', compressedFile, compressedFile.name || 'compressed-image.webp');
        const token = await currentUser.getIdToken();

        // --- Upload with XHR for progress tracking ---
        const responseText = await uploadWithProgress('/api/upload', token, formData, (percentage) => {
            const p = Math.round(percentage);
            progressBar.style.width = p + '%';
            progressText.textContent = `Uploading: ${p}%`;
        });

        // --- Process server response ---
        if (!responseText) {
            throw new Error("Received empty response from server.");
        }
        const result = JSON.parse(responseText);

        const previewEl = context === 'locker' ? sectionImagePreview : cSectionImagePreview;
        previewEl.src = result.filePath;
        previewEl.classList.remove('hidden');

        const item = findItem(activeShelfId, activeItemId, context);
        if (item) {
            item.img = result.filePath;
            await saveBrigadeData('uploadImage');
            refreshCurrentView();
        }

    } catch (error) {
        console.error('Error during image compression or upload:', error);
        alert(`Operation failed: ${error.message}`);
    } finally {
        progressModal.classList.add('hidden');
        e.target.value = ''; // Reset file input
    }
}
