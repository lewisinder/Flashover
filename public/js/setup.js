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
let pendingUploads = new Map(); // blobUrl -> { file, status, promise }

let activeBrigadeId = null;
let activeApplianceId = null;
let activeLockerId = null;
let editingLockerId = null;
let actionLockerId = null;
let actionLockerName = '';
let activeShelfId = null;
let activeItemId = null;
let activeContainerId = null;
let isNewItem = false;
let currentEditingContext = 'locker'; // 'locker' or 'container'
let draggedItemInfo = null; // { itemId, fromShelfId, fromContext }
let pendingNavigation = null; // For handling async navigation prompts
let dragState = null;
let dragJustEndedAt = 0;
let dragOverCard = null;
let dragOverPosition = null;
const dragThreshold = 6;
let pendingItemDelete = null;
let itemDragState = null;
let itemDragJustEndedAt = 0;
let itemDropTarget = null;
let itemDropShelf = null;
let itemDropPosition = null;
const itemDragThreshold = 6;
let isSaving = false;
let showSavedIndicator = false;
let saveIndicatorTimeout = null;
const compressThresholdBytes = 900 * 1024;
const itemDragLongPressMs = 300;
const itemDragCancelThreshold = 8;

// --- DOM Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const selectLockerScreen = document.getElementById('select-locker-screen');
const lockerEditorScreen = document.getElementById('locker-editor-screen');
const containerEditorScreen = document.getElementById('container-editor-screen');
const applianceNameTitle = document.getElementById('appliance-name-title');
const applianceNameSubtitle = document.getElementById('appliance-name-subtitle');
const lockerListContainer = document.getElementById('locker-list-container');
const lockerLoadingState = document.getElementById('locker-loading-state');
const createLockerBtn = document.getElementById('create-locker-btn');
const lockerEditorName = document.getElementById('locker-editor-name');
const lockerEditorShelves = document.getElementById('locker-editor-shelves');
const addShelfBtn = document.getElementById('add-shelf-btn');
const backBtn = document.getElementById('back-btn');
const headerSaveBtn = document.getElementById('header-save-btn');

// Modals
const nameLockerModal = document.getElementById('name-locker-modal');
const lockerNameModalTitle = document.getElementById('locker-name-modal-title');
const newLockerNameInput = document.getElementById('new-locker-name-input');
const saveNewLockerBtn = document.getElementById('save-new-locker-btn');
const cancelCreateLockerBtn = document.getElementById('cancel-create-locker-btn');
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const lockerActionsModal = document.getElementById('locker-actions-modal');
const lockerActionsTitle = document.getElementById('locker-actions-title');
const lockerActionsSubtitle = document.getElementById('locker-actions-subtitle');
const lockerActionsRenameBtn = document.getElementById('locker-actions-rename-btn');
const lockerActionsDeleteBtn = document.getElementById('locker-actions-delete-btn');
const lockerActionsCancelBtn = document.getElementById('locker-actions-cancel-btn');
const unsavedChangesModal = document.getElementById('unsaved-changes-modal');
const saveUnsavedBtn = document.getElementById('save-unsaved-btn');
const discardUnsavedBtn = document.getElementById('discard-unsaved-btn');
const cancelUnsavedBtn = document.getElementById('cancel-unsaved-btn');

const containerEditorTitle = document.getElementById('container-editor-title');
const containerEditorItems = document.getElementById('container-editor-items');
const editLockerNameIcon = document.getElementById('edit-locker-name-icon');

const itemEditorOverlay = document.getElementById('item-editor-overlay');
const itemEditorSection = document.getElementById('item-editor-section');
const sectionImagePreview = document.getElementById('section-image-preview');
const sectionFileUpload = document.getElementById('section-file-upload');
const sectionItemNameInput = document.getElementById('section-item-name-input');
const sectionItemDescInput = document.getElementById('section-item-desc-input');
const sectionItemTypeSelect = document.getElementById('section-item-type-select');
const sectionImageStatus = document.getElementById('section-image-status');
const sectionEnterContainerBtn = document.getElementById('section-enter-container-btn');
const sectionCancelEditBtn = document.getElementById('section-cancel-edit-btn');
const sectionSaveItemBtn = document.getElementById('section-save-item-btn');
const sectionDeleteItemBtn = document.getElementById('section-delete-item-btn');
const moveLockerSection = document.getElementById('move-locker-section');
const moveLockerSelect = document.getElementById('move-locker-select');
const moveLockerBtn = document.getElementById('move-locker-btn');

const cItemEditorOverlay = document.getElementById('c-item-editor-overlay');
const cItemEditorSection = document.getElementById('c-item-editor-section');
const cSectionImagePreview = document.getElementById('c-section-image-preview');
const cSectionFileUpload = document.getElementById('c-section-file-upload');
const cSectionItemNameInput = document.getElementById('c-section-item-name-input');
const cSectionItemDescInput = document.getElementById('c-section-item-desc-input');
const cSectionImageStatus = document.getElementById('c-section-image-status');
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
    updateSaveButtons();
}

function hasActiveUploads() {
    return Array.from(pendingUploads.values()).some((pending) => {
        if (!pending) return false;
        if (pending.promise) return true;
        return pending.status === 'uploading';
    });
}

function updateSaveButtons() {
    const uploadsActive = hasActiveUploads();
    const shouldShow = hasUnsavedChanges || showSavedIndicator || isSaving || uploadsActive;
    if (headerSaveBtn) {
        headerSaveBtn.classList.toggle('hidden', !shouldShow);
        let label = 'Save';
        if (showSavedIndicator) label = 'Saved';
        else if (uploadsActive) label = 'Uploading...';
        else if (isSaving) label = 'Saving...';
        headerSaveBtn.textContent = label;
        headerSaveBtn.disabled = isSaving || uploadsActive;
        headerSaveBtn.classList.toggle('animate-pulse', hasUnsavedChanges && !showSavedIndicator && !isSaving && !uploadsActive);
        headerSaveBtn.classList.toggle('opacity-60', headerSaveBtn.disabled);
        headerSaveBtn.classList.toggle('cursor-not-allowed', headerSaveBtn.disabled);
    }
    if (saveUnsavedBtn) {
        if (uploadsActive) saveUnsavedBtn.textContent = 'Uploading...';
        else if (isSaving) saveUnsavedBtn.textContent = 'Saving...';
        else saveUnsavedBtn.textContent = 'Save & Continue';
        saveUnsavedBtn.disabled = isSaving || uploadsActive;
        saveUnsavedBtn.classList.toggle('opacity-60', saveUnsavedBtn.disabled);
        saveUnsavedBtn.classList.toggle('cursor-not-allowed', saveUnsavedBtn.disabled);
    }
}

function triggerSavedIndicator() {
    showSavedIndicator = true;
    if (saveIndicatorTimeout) clearTimeout(saveIndicatorTimeout);
    saveIndicatorTimeout = setTimeout(() => {
        showSavedIndicator = false;
        updateSaveButtons();
    }, 1500);
    updateSaveButtons();
}

const defaultLockerSubtitle =
    applianceNameSubtitle?.dataset?.default || 'Choose a locker to edit shelves and items.';

function setLockerLoading(isLoading) {
    if (lockerLoadingState) lockerLoadingState.classList.toggle('hidden', !isLoading);
    if (lockerListContainer) lockerListContainer.classList.toggle('hidden', isLoading);
    if (applianceNameTitle && isLoading) {
        applianceNameTitle.textContent = 'Loading appliance...';
    }
    if (applianceNameSubtitle) {
        applianceNameSubtitle.textContent = isLoading ? 'Fetching setup details...' : defaultLockerSubtitle;
    }
}

function hoistModal(el) {
    if (!el || el.parentElement === document.body) return;
    document.body.appendChild(el);
}

function hoistSetupModals() {
    hoistModal(nameLockerModal);
    hoistModal(lockerActionsModal);
    hoistModal(deleteConfirmModal);
    hoistModal(progressModal);
    hoistModal(unsavedChangesModal);
    hoistModal(itemEditorOverlay);
    hoistModal(cItemEditorOverlay);
}

// --- Data Handling & Initialization ---
let unsubscribeAuth = null;

function start() {
    hoistSetupModals();
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
    if (editLockerNameIcon) {
        editLockerNameIcon.addEventListener('click', () => lockerEditorName.focus());
    }
    headerSaveBtn.addEventListener('click', () => saveBrigadeData('manualSave'));

    // Main Item Editor Listeners
    sectionSaveItemBtn.addEventListener('click', saveItem);
    sectionCancelEditBtn.addEventListener('click', closeItemEditor);
    sectionDeleteItemBtn.addEventListener('click', () => openItemDeleteConfirm('locker'));
    moveLockerBtn?.addEventListener('click', moveItemToLocker);
    sectionFileUpload.addEventListener('change', (e) => handleImageUpload(e, 'locker'));
    sectionItemTypeSelect.addEventListener('change', (e) => {
       sectionEnterContainerBtn.classList.toggle('hidden', e.target.value !== 'container');
    });
    sectionEnterContainerBtn.addEventListener('click', () => handleNavigation(openContainerEditor));

   // Container Sub-Item Editor Listeners
   cSectionSaveItemBtn.addEventListener('click', saveItem);
   cSectionCancelEditBtn.addEventListener('click', closeItemEditor);
   cSectionDeleteItemBtn.addEventListener('click', () => openItemDeleteConfirm('container'));
   cSectionFileUpload.addEventListener('change', (e) => handleImageUpload(e, 'container'));

    // Navigation
    backBtn.addEventListener('click', () => handleNavigation(navigateBack));

    // Locker Management
    createLockerBtn?.addEventListener('click', () => openLockerNameModal());
    saveNewLockerBtn.addEventListener('click', saveNewLocker);
    cancelCreateLockerBtn.addEventListener('click', closeLockerNameModal);
    if (lockerEditorName && !lockerEditorName.readOnly) {
        lockerEditorName.addEventListener('change', updateLockerName);
    }

    itemEditorOverlay?.addEventListener('click', (e) => {
        if (e.target === itemEditorOverlay) closeItemEditor();
    });
    cItemEditorOverlay?.addEventListener('click', (e) => {
        if (e.target === cItemEditorOverlay) closeItemEditor();
    });

    // Shelf Management
    addShelfBtn.addEventListener('click', addShelf);

    // Delete Confirmation
    cancelDeleteBtn.addEventListener('click', () => {
        deleteConfirmModal.classList.add('hidden');
        if (pendingItemDelete) {
            const { context, shelfId, itemId } = pendingItemDelete;
            pendingItemDelete = null;
            openItemEditor(shelfId, itemId, context);
        }
    });

    lockerActionsModal?.addEventListener('click', (e) => {
        if (e.target === lockerActionsModal) closeLockerActions();
    });
    lockerActionsCancelBtn?.addEventListener('click', closeLockerActions);
    lockerActionsRenameBtn?.addEventListener('click', () => {
        if (!actionLockerId) return;
        const locker = findLockerById(actionLockerId);
        closeLockerActions();
        if (locker) openLockerNameModal(locker);
    });
    lockerActionsDeleteBtn?.addEventListener('click', () => {
        if (!actionLockerId) return;
        const lockerId = actionLockerId;
        const lockerName = actionLockerName;
        closeLockerActions();
        confirmDelete('locker', lockerId, lockerName);
    });
    
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

function findLockerById(lockerId) {
    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    return appliance?.lockers?.find(l => String(l.id) === String(lockerId)) || null;
}

function openLockerActions(locker) {
    actionLockerId = locker?.id ?? null;
    actionLockerName = locker?.name || '';
    if (lockerActionsSubtitle) lockerActionsSubtitle.textContent = actionLockerName || 'Locker';
    lockerActionsModal?.classList.remove('hidden');
}

function closeLockerActions() {
    lockerActionsModal?.classList.add('hidden');
    actionLockerId = null;
    actionLockerName = '';
}

function clearDragIndicator() {
    if (!dragOverCard) return;
    dragOverCard.classList.remove('locker-drop-before', 'locker-drop-after');
    dragOverCard = null;
    dragOverPosition = null;
}

function startLockerDrag(e, card) {
    if (!card || card.classList.contains('add-new')) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.locker-menu-btn')) return;
    dragState = {
        card,
        hasMoved: false,
        active: false,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId
    };
}

function handleLockerDragMove(e) {
    if (!dragState) return;
    if (!dragState.active) {
        const dx = Math.abs(e.clientX - dragState.startX);
        const dy = Math.abs(e.clientY - dragState.startY);
        if (dx < dragThreshold && dy < dragThreshold) return;
        dragState.active = true;
        dragState.card.classList.add('is-dragging');
        try {
            e.target.setPointerCapture?.(dragState.pointerId);
        } catch (err) {}
    }
    const card = dragState.card;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.locker-card');
    if (!target || target === card || target.classList.contains('add-new')) {
        clearDragIndicator();
        return;
    }
    const rect = target.getBoundingClientRect();
    const insertAfter = e.clientY > rect.top + rect.height / 2;
    const position = insertAfter ? 'after' : 'before';
    if (dragOverCard !== target || dragOverPosition !== position) {
        clearDragIndicator();
        dragOverCard = target;
        dragOverPosition = position;
        target.classList.add(insertAfter ? 'locker-drop-after' : 'locker-drop-before');
    }
    if (insertAfter) {
        if (target.nextSibling !== card) target.after(card);
    } else {
        if (target.previousSibling !== card) target.before(card);
    }
    dragState.hasMoved = true;
}

async function endLockerDrag(e) {
    if (!dragState) return;
    const { card, hasMoved } = dragState;
    if (dragState.active) {
        card.classList.remove('is-dragging');
        try {
            e.target.releasePointerCapture?.(dragState.pointerId);
        } catch (err) {}
    }
    dragState = null;
    clearDragIndicator();
    if (hasMoved) {
        dragJustEndedAt = Date.now();
        await persistLockerOrder();
    }
}

async function persistLockerOrder() {
    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    if (!appliance || !Array.isArray(appliance.lockers)) return;
    const orderedIds = Array.from(
        lockerListContainer.querySelectorAll('.locker-card[data-locker-id]')
    ).map((el) => el.dataset.lockerId);
    const existingIds = appliance.lockers.map((l) => String(l.id));
    const hasChanged = orderedIds.some((id, index) => id !== existingIds[index]);
    if (!hasChanged) return;
    const lockerMap = new Map(appliance.lockers.map((locker) => [String(locker.id), locker]));
    appliance.lockers = orderedIds.map((id) => lockerMap.get(String(id))).filter(Boolean);
    try {
        await saveBrigadeData('reorderLockers');
        renderLockerList();
    } catch (error) {
        console.error('Error saving locker order:', error);
    }
}

async function loadBrigadeData() {
    if (!currentUser || !activeBrigadeId) return;
    showLoading();
    setLockerLoading(true);
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
            if (applianceNameSubtitle) {
                applianceNameSubtitle.textContent = defaultLockerSubtitle;
            }
            setUnsavedChanges(false);
            renderLockerList();
            setLockerLoading(false);
        } else {
            alert('Appliance not found in this brigade.');
            navigateToSetupHome();
        }
    } catch (error) {
        console.error("Error loading data:", error);
        alert("Error loading data. Please try again.");
    } finally {
        setLockerLoading(false);
        hideLoading();
    }
}

async function saveBrigadeData(operation) {
    if (!currentUser || !activeBrigadeId) return;
    const isUserSave = operation === 'manualSave' || operation === 'promptedSave';
    if (isSaving || (isUserSave && hasActiveUploads())) {
        updateSaveButtons();
        return;
    }

    isSaving = true;
    const hadUnsavedChanges = hasUnsavedChanges;
    triggerSavedIndicator();
    if (hadUnsavedChanges) setUnsavedChanges(false);

    progressModal.classList.add('hidden');
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

        const shouldShowProgress = itemsWithPendingUploads.length > 0;
        if (shouldShowProgress) {
            progressModal.classList.remove('hidden');
            progressTitle.textContent = 'Uploading Images...';
            const uploadPromises = itemsWithPendingUploads.map((item, index) => {
                const pending = pendingUploads.get(item.img);
                const file = pending && pending.file ? pending.file : pending;
                if (!file) return Promise.resolve();
                if (pending && pending.promise) {
                    return pending.promise.then(() => {
                        const overallProgress = ((index + 1) / itemsWithPendingUploads.length) * 100;
                        progressBar.style.width = `${overallProgress}%`;
                        progressText.textContent = `Finalizing image ${index + 1} of ${itemsWithPendingUploads.length}`;
                    });
                }

                return (async () => {
                    progressText.textContent = `Compressing image ${index + 1} of ${itemsWithPendingUploads.length}`;
                    const compressedFile = await compressIfNeeded(file);

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
                    }, { 'x-brigade-id': activeBrigadeId });

                    const result = JSON.parse(responseText);
                    URL.revokeObjectURL(item.img); // Clean up blob URL
                    pendingUploads.delete(item.img);
                    item.img = result.filePath; // Replace blob with permanent URL
                })();
            });
            await Promise.all(uploadPromises);
        }

        // --- Stage 2: Save the final data ---
        if (itemsWithPendingUploads.length > 0) progressTitle.textContent = 'Saving Data...';
        progressText.textContent = 'Finalizing...';
        progressBar.style.width = '100%';

        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${activeBrigadeId}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(truckData)
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.message || 'Failed to save data');
        }
        
        console.log(`Data saved after: ${operation}`);
        lastSavedTruckData = JSON.parse(JSON.stringify(truckData));
        setUnsavedChanges(false);

    } catch (error) {
        console.error("Error saving data:", error);
        alert("Error saving data. Your changes may not be persisted.");
        showSavedIndicator = false;
        if (hadUnsavedChanges) setUnsavedChanges(true);
        throw error; // Re-throw to allow promise rejection
    } finally {
        isSaving = false;
        progressModal.classList.add('hidden');
        updateSaveButtons();
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
        if (cItemEditorOverlay?.classList.contains('hidden')) {
           containerEditorScreen.classList.remove('active');
           lockerEditorScreen.classList.add('active');
           activeContainerId = null;
        }
    } else {
        navigateToSetupHome();
    }
}

// --- Locker Management ---
function openLockerNameModal(locker) {
    editingLockerId = locker?.id ?? null;
    if (lockerNameModalTitle) {
        lockerNameModalTitle.textContent = editingLockerId ? 'Rename locker' : 'Create new locker';
    }
    saveNewLockerBtn.textContent = editingLockerId ? 'Save' : 'Create';
    newLockerNameInput.value = locker?.name || '';
    nameLockerModal.classList.remove('hidden');
    newLockerNameInput.focus();
}

function closeLockerNameModal() {
    nameLockerModal.classList.add('hidden');
    newLockerNameInput.value = '';
    editingLockerId = null;
    if (lockerNameModalTitle) lockerNameModalTitle.textContent = 'Create new locker';
    saveNewLockerBtn.textContent = 'Create';
}

function renderLockerList() {
    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    if (!appliance) return;
    setLockerLoading(false);
    lockerListContainer.innerHTML = '';
    (appliance.lockers || []).forEach(locker => {
        const card = document.createElement('div');
        const shelfCount = (locker.shelves || []).length;
        const metaText = shelfCount ? `${shelfCount} shelf${shelfCount === 1 ? '' : 's'}` : 'No shelves yet';
        const initial = (locker.name || 'L').trim().charAt(0).toUpperCase();
        card.className = 'locker-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.dataset.lockerId = locker.id;
        card.innerHTML = `
            <div class="locker-card-main">
                <div class="locker-icon">${initial}</div>
                <div class="locker-card-text">
                    <div class="locker-name">${locker.name}</div>
                    <div class="locker-meta">${metaText}</div>
                </div>
            </div>
            <div class="locker-card-actions">
                <button class="locker-menu-btn" aria-label="Locker actions" type="button">⋯</button>
            </div>
        `;
        card.addEventListener('click', () => {
            if (Date.now() - dragJustEndedAt < 250) return;
            openLockerEditor(locker.id);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openLockerEditor(locker.id);
            }
        });
        card.querySelector('.locker-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openLockerActions(locker);
        });
        card.addEventListener('pointerdown', (e) => startLockerDrag(e, card));
        card.addEventListener('pointermove', handleLockerDragMove);
        card.addEventListener('pointerup', endLockerDrag);
        card.addEventListener('pointercancel', endLockerDrag);
        lockerListContainer.appendChild(card);
    });
    const addCard = document.createElement('div');
    addCard.className = 'locker-card add-new';
    addCard.setAttribute('role', 'button');
    addCard.setAttribute('tabindex', '0');
    addCard.innerHTML = `
        <div class="locker-card-main">
            <div class="locker-add-icon">+</div>
            <div class="locker-card-text">
                <div class="locker-name">Create a new locker</div>
                <div class="locker-meta">Name it, then add shelves and items.</div>
            </div>
        </div>
    `;
    addCard.addEventListener('click', () => openLockerNameModal());
    addCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLockerNameModal();
        }
    });
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
        if (editingLockerId !== null && editingLockerId !== undefined) {
            const locker = appliance.lockers.find(l => String(l.id) === String(editingLockerId));
            if (locker) locker.name = name;
            await saveBrigadeData('renameLocker');
        } else {
            const newLocker = { id: String(Date.now()), name, shelves: [] };
            appliance.lockers.push(newLocker);
            await saveBrigadeData('addLocker'); // Immediate save as requested
        }
        renderLockerList();
        closeLockerNameModal();
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
        shelfWrapper.className = 'locker-shelf-wrapper';
        const shelfDiv = createShelfElement(shelf, 'locker');
        const label = document.createElement('h3');
        label.className = 'locker-shelf-label';
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
    itemsGrid.dataset.shelfId = shelf.id;
    itemsGrid.dataset.context = context;
    
    itemsGrid.addEventListener('dragover', (e) => handleDragOver(e, shelf.id, context));
    itemsGrid.addEventListener('drop', (e) => handleDrop(e, shelf.id, context));
    itemsGrid.addEventListener('dragleave', handleDragLeave);

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
    itemBox.addEventListener('click', () => {
        if (Date.now() - itemDragJustEndedAt < 250) return;
        openItemEditor(shelfId, item.id, context);
    });
    itemBox.addEventListener('dragstart', handleDragStart);
    itemBox.addEventListener('dragend', handleDragEnd);
    itemBox.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        startItemPointerDrag(e, itemBox);
    });
    itemBox.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') return;
        moveItemPointerDrag(e);
    });
    itemBox.addEventListener('pointerup', (e) => {
        if (e.pointerType === 'mouse') return;
        endItemPointerDrag(e);
    });
    itemBox.addEventListener('pointercancel', (e) => {
        if (e.pointerType === 'mouse') return;
        endItemPointerDrag(e);
    });
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
       setImageStatusForItem('locker', item);
       sectionEnterContainerBtn.classList.toggle('hidden', item.type !== 'container');
       if (moveLockerSection) moveLockerSection.classList.remove('hidden');
       populateMoveLockerOptions();
       itemEditorOverlay?.classList.remove('hidden');
       itemEditorSection.style.visibility = 'visible';
       itemEditorSection.style.opacity = 1;
    } else { // context === 'container'
       cSectionItemNameInput.value = item.name;
       cSectionItemDescInput.value = item.desc;
       cSectionImagePreview.src = item.img || '';
       cSectionImagePreview.classList.toggle('hidden', !item.img);
       setImageStatusForItem('container', item);
       if (moveLockerSection) moveLockerSection.classList.add('hidden');
       cItemEditorOverlay?.classList.remove('hidden');
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
    itemEditorOverlay?.classList.add('hidden');
    cItemEditorOverlay?.classList.add('hidden');
    itemEditorSection.style.visibility = 'hidden';
    itemEditorSection.style.opacity = 0;
    cItemEditorSection.style.visibility = 'hidden';
    cItemEditorSection.style.opacity = 0;
    if (moveLockerSection) moveLockerSection.classList.remove('hidden');
    document.querySelectorAll('.item-editor-box').forEach(b => b.classList.remove('editing'));
}

function populateMoveLockerOptions() {
    if (!moveLockerSelect) return;
    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    if (!appliance) return;
    const lockers = appliance.lockers || [];
    moveLockerSelect.innerHTML = '';
    lockers.forEach((locker) => {
        if (locker.id === activeLockerId) return;
        const option = document.createElement('option');
        option.value = locker.id;
        option.textContent = locker.name || 'Locker';
        moveLockerSelect.appendChild(option);
    });
    if (moveLockerSelect.options.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No other lockers';
        moveLockerSelect.appendChild(option);
        moveLockerSelect.disabled = true;
        if (moveLockerBtn) moveLockerBtn.disabled = true;
    } else {
        moveLockerSelect.disabled = false;
        if (moveLockerBtn) moveLockerBtn.disabled = false;
    }
}

function moveItemToLocker() {
    if (!activeItemId) return;
    if (!moveLockerSelect || !moveLockerSelect.value) return;
    const targetLockerId = moveLockerSelect.value;
    if (targetLockerId === activeLockerId) return;

    const sourceShelf = findShelf(activeShelfId, 'locker');
    if (!sourceShelf || !sourceShelf.items) return;
    const itemIndex = sourceShelf.items.findIndex((i) => i.id === activeItemId);
    if (itemIndex < 0) return;
    const [item] = sourceShelf.items.splice(itemIndex, 1);
    if (!item) return;

    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    const targetLocker = appliance?.lockers?.find((l) => l.id === targetLockerId);
    if (!targetLocker) return;
    if (!targetLocker.shelves) targetLocker.shelves = [];
    if (targetLocker.shelves.length === 0) {
        targetLocker.shelves.push({ id: String(Date.now()), name: 'Shelf 1', items: [] });
    }
    const targetShelf = targetLocker.shelves[0];
    if (!targetShelf.items) targetShelf.items = [];
    targetShelf.items.unshift(item);

    setUnsavedChanges(true);
    closeItemEditor();
    refreshCurrentView();
}

function saveItem(options = {}) {
    const shouldClose = options.closeEditor !== false;
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
    if (shouldClose) closeItemEditor();
}

function openContainerEditor() {
    const name = sectionItemNameInput.value.trim();
    if (!name || (isNewItem && name === 'New Item')) {
        alert('Please give the container a name before adding items to it.');
        return;
    }

    const containerId = activeItemId;
    saveItem({ closeEditor: false }); 
    activeContainerId = containerId;
    closeItemEditor();

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
    containerEditorItems.dataset.shelfId = activeContainerId;
    containerEditorItems.dataset.context = 'container';
    containerEditorItems.ondragover = (e) => handleDragOver(e, activeContainerId, 'container');
    containerEditorItems.ondrop = (e) => handleDrop(e, activeContainerId, 'container');
    containerEditorItems.ondragleave = (e) => handleDragLeave(e);

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
   e.dataTransfer.setData('text/plain', draggedItemInfo.itemId);
}

function handleDragEnd(e) {
   e.target.classList.remove('dragging');
   draggedItemInfo = null;
   clearItemDropIndicators();
   itemDragJustEndedAt = Date.now();
}

function handleDragLeave(e) {
   if (e.currentTarget.contains(e.relatedTarget)) return;
   clearItemDropIndicators();
}

function handleDragOver(e, toShelfId, toContext) {
   e.preventDefault();
   e.dataTransfer.dropEffect = 'move';
   const dropInfo = getItemDropInfoFromPoint(e.clientX, e.clientY, toShelfId, toContext);
   setItemDropIndicator(dropInfo);
}

function handleDrop(e, toShelfId, toContext) {
   e.preventDefault();
   if (!draggedItemInfo) return;
   const dropInfo = getItemDropInfoFromPoint(e.clientX, e.clientY, toShelfId, toContext);
   const moved = moveItemBetweenShelves({
       itemId: draggedItemInfo.itemId,
       fromShelfId: draggedItemInfo.fromShelfId,
       fromContext: draggedItemInfo.fromContext,
       toShelfId: dropInfo?.shelfId || toShelfId,
       toContext: dropInfo?.context || toContext,
       targetItemId: dropInfo?.targetItem?.dataset.itemId || null,
       position: dropInfo?.position || null
   });
   draggedItemInfo = null;
   clearItemDropIndicators();
   if (moved) {
       setUnsavedChanges(true);
       refreshCurrentView();
   }
}

function startItemPointerDrag(e, itemEl) {
   if (!itemEl || (e.button !== undefined && e.button !== 0)) return;
   if (itemDragState?.longPressTimer) {
       clearTimeout(itemDragState.longPressTimer);
   }
   itemDragState = {
       itemEl,
       itemId: itemEl.dataset.itemId,
       fromShelfId: itemEl.dataset.shelfId,
       fromContext: itemEl.dataset.context,
       startX: e.clientX,
       startY: e.clientY,
       pointerId: e.pointerId,
       active: false,
       hasMoved: false,
       cancelled: false,
       longPressTimer: null
   };
   itemDragState.longPressTimer = setTimeout(() => {
       if (!itemDragState || itemDragState.cancelled) return;
       itemDragState.active = true;
       itemDragState.itemEl.classList.add('dragging');
       try {
           itemDragState.itemEl.setPointerCapture?.(itemDragState.pointerId);
       } catch (err) {}
   }, itemDragLongPressMs);
}

function moveItemPointerDrag(e) {
   if (!itemDragState) return;
   if (!itemDragState.active) {
       const dx = Math.abs(e.clientX - itemDragState.startX);
       const dy = Math.abs(e.clientY - itemDragState.startY);
       if (dx > itemDragCancelThreshold || dy > itemDragCancelThreshold) {
           itemDragState.cancelled = true;
           if (itemDragState.longPressTimer) {
               clearTimeout(itemDragState.longPressTimer);
               itemDragState.longPressTimer = null;
           }
       }
       return;
   }
   const dropInfo = getItemDropInfoFromPoint(e.clientX, e.clientY);
   if (dropInfo) {
       setItemDropIndicator(dropInfo);
   } else {
       clearItemDropIndicators();
   }
   itemDragState.hasMoved = true;
   e.preventDefault();
}

function endItemPointerDrag(e) {
   if (!itemDragState) return;
   const { itemEl, hasMoved, fromShelfId, fromContext } = itemDragState;
   if (itemDragState.longPressTimer) {
       clearTimeout(itemDragState.longPressTimer);
       itemDragState.longPressTimer = null;
   }
   if (!itemDragState.active) {
       itemDragState = null;
       return;
   }
   if (itemDragState.active) {
       itemEl.classList.remove('dragging');
       try {
           itemEl.releasePointerCapture?.(itemDragState.pointerId);
       } catch (err) {}
   }
   const targetShelfId = itemDropShelf?.dataset.shelfId || null;
   const targetContext = itemDropShelf?.dataset.context || null;
   const moved = hasMoved && targetShelfId
       ? moveItemBetweenShelves({
           itemId: itemDragState.itemId,
           fromShelfId,
           fromContext,
           toShelfId: targetShelfId,
           toContext: targetContext,
           targetItemId: itemDropTarget?.dataset.itemId || null,
           position: itemDropPosition || null
       })
       : false;
   clearItemDropIndicators();
   itemDragState = null;
   itemDragJustEndedAt = Date.now();
   if (moved) {
       setUnsavedChanges(true);
       refreshCurrentView();
   }
}

function getItemDropInfoFromPoint(x, y, fallbackShelfId = null, fallbackContext = null) {
   const draggedEl = itemDragState?.itemEl || null;
   const hit = getElementFromPointIgnoringDrag(x, y, draggedEl);
   let shelfEl = hit?.closest('.shelf-items-grid') || null;
   if (!shelfEl && fallbackShelfId) {
       shelfEl = document.querySelector(`.shelf-items-grid[data-shelf-id="${fallbackShelfId}"][data-context="${fallbackContext}"]`);
   }
   if (!shelfEl) return null;
   const context = shelfEl.dataset.context || fallbackContext;
   const shelfId = shelfEl.dataset.shelfId || fallbackShelfId;
   let targetItem = hit?.closest('.item-editor-box') || null;
   if (targetItem === draggedEl) targetItem = null;
   if (targetItem && targetItem.closest('.shelf-items-grid') !== shelfEl) targetItem = null;
   let position = null;
   if (targetItem) {
       const rect = targetItem.getBoundingClientRect();
       const insertAfter = context === 'locker'
           ? x > rect.left + rect.width / 2
           : y > rect.top + rect.height / 2;
       position = insertAfter ? 'after' : 'before';
   }
   return {
       shelfEl,
       shelfId,
       context,
       targetItem,
       position
   };
}

function getElementFromPointIgnoringDrag(x, y, ignoredEl) {
   if (!ignoredEl) return document.elementFromPoint(x, y);
   const previousValue = ignoredEl.style.pointerEvents;
   ignoredEl.style.pointerEvents = 'none';
   const hit = document.elementFromPoint(x, y);
   ignoredEl.style.pointerEvents = previousValue;
   return hit;
}

function setItemDropIndicator(dropInfo) {
   if (!dropInfo || !dropInfo.shelfEl) {
       clearItemDropIndicators();
       return;
   }
   const sameTarget = itemDropTarget === dropInfo.targetItem;
   const sameShelf = itemDropShelf === dropInfo.shelfEl;
   const samePosition = itemDropPosition === dropInfo.position;
   if (sameTarget && sameShelf && samePosition) return;
   clearItemDropIndicators();
   itemDropShelf = dropInfo.shelfEl;
   itemDropTarget = dropInfo.targetItem;
   itemDropPosition = dropInfo.position;
   if (itemDropTarget) {
       itemDropTarget.classList.add(itemDropPosition === 'after' ? 'item-drop-after' : 'item-drop-before');
   } else {
       itemDropShelf.classList.add('shelf-drop');
   }
}

function clearItemDropIndicators() {
   if (itemDropTarget) itemDropTarget.classList.remove('item-drop-before', 'item-drop-after');
   if (itemDropShelf) itemDropShelf.classList.remove('shelf-drop');
   itemDropTarget = null;
   itemDropShelf = null;
   itemDropPosition = null;
}

function moveItemBetweenShelves({ itemId, fromShelfId, fromContext, toShelfId, toContext, targetItemId, position }) {
   if (!itemId || !fromShelfId || !toShelfId || !fromContext || !toContext) return false;
   if (fromShelfId === toShelfId && fromContext === toContext && targetItemId === itemId) return false;
   const fromShelf = findShelf(fromShelfId, fromContext);
   const toShelf = findShelf(toShelfId, toContext);
   if (!fromShelf || !toShelf) return false;
   if (!fromShelf.items) fromShelf.items = [];
   if (!toShelf.items) toShelf.items = [];
   const itemIndex = fromShelf.items.findIndex(i => i.id === itemId);
   if (itemIndex === -1) return false;
   const [movedItem] = fromShelf.items.splice(itemIndex, 1);
   let insertIndex = toShelf.items.length;
   if (targetItemId) {
       const targetIndex = toShelf.items.findIndex(i => i.id === targetItemId);
       if (targetIndex !== -1) {
           insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
       }
   }
   if (fromShelf === toShelf && itemIndex < insertIndex) {
       insertIndex = Math.max(0, insertIndex - 1);
   }
   toShelf.items.splice(insertIndex, 0, movedItem);
   return true;
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

function openItemDeleteConfirm(context) {
    if (!activeItemId) return;
    const item = findItem(activeShelfId, activeItemId, context);
    if (!item) return;
    pendingItemDelete = {
        context,
        itemId: activeItemId,
        shelfId: activeShelfId,
        parentId: context === 'container' ? activeContainerId : null,
        name: item.name || 'item'
    };
    closeItemEditor();
    confirmDelete('item', pendingItemDelete.itemId, pendingItemDelete.name, pendingItemDelete.parentId);
}

function deleteItemFromShelf(itemId, parentId = null) {
    if (parentId) {
        const container = findContainer(parentId);
        if (!container) return;
        if (!container.subItems) container.subItems = [];
        const itemToDelete = container.subItems.find(i => i.id === itemId);
        if (itemToDelete && itemToDelete.img && itemToDelete.img.startsWith('blob:')) {
            URL.revokeObjectURL(itemToDelete.img);
            pendingUploads.delete(itemToDelete.img);
        }
        container.subItems = container.subItems.filter(i => i.id !== itemId);
        return;
    }

    const shelf = findShelf(activeShelfId, 'locker');
    if (shelf && shelf.items) {
        const itemToDelete = shelf.items.find(i => i.id === itemId);
        if (itemToDelete && itemToDelete.img && itemToDelete.img.startsWith('blob:')) {
            URL.revokeObjectURL(itemToDelete.img);
            pendingUploads.delete(itemToDelete.img);
        }
        shelf.items = shelf.items.filter(i => i.id !== itemId);
    }
}

function confirmDelete(type, id, name, parentId = null) {
    document.getElementById('delete-confirm-text').textContent = `This will permanently delete the ${type} "${name}" and all its contents. This action cannot be undone.`;
    deleteConfirmModal.classList.remove('hidden');
    confirmDeleteBtn.onclick = async () => {
        let shouldSaveImmediately = false;
        if (type === 'locker') {
            const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
            if (appliance && Array.isArray(appliance.lockers)) {
                const lockerIndex = appliance.lockers.findIndex((l) => String(l.id) === String(id));
                if (lockerIndex !== -1) {
                    appliance.lockers.splice(lockerIndex, 1);
                } else {
                    console.warn('Locker not found for deletion', { id });
                }
            }
            if (activeLockerId && String(activeLockerId) === String(id)) {
                activeLockerId = null;
            }
            shouldSaveImmediately = true;
        } else if (type === 'shelf') {
            const locker = truckData.appliances.find(a => a.id === activeApplianceId)?.lockers.find(l => l.id === activeLockerId);
            locker.shelves = locker.shelves.filter(s => s.id !== id);
        } else if (type === 'item') {
            deleteItemFromShelf(id, parentId);
            closeItemEditor();
            pendingItemDelete = null;
        }
        
        if (shouldSaveImmediately) {
            await saveBrigadeData(`delete${type}`);
            renderLockerList();
        } else {
            setUnsavedChanges(true);
        }

        refreshCurrentView();
        deleteConfirmModal.classList.add('hidden');
    };
}

function handleImageUpload(e, context) {
    const file = e.target.files[0];
    if (!file || !activeItemId) {
        updateImageStatus(context, 'Select an item first.', 'error');
        return;
    }

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
    pendingUploads.set(blobUrl, { file, status: 'pending', promise: null });

    item.img = blobUrl;
    setUnsavedChanges(true);
    updateSaveButtons();

    const previewEl = context === 'locker' ? sectionImagePreview : cSectionImagePreview;
    previewEl.src = blobUrl;
    previewEl.classList.remove('hidden');
    updateImageStatus(context, 'Uploading image...');
    queueImageUpload(blobUrl, context);
    
    refreshCurrentView();
    e.target.value = '';
}

function updateImageStatus(context, message, state = '') {
    const statusEl = context === 'locker' ? sectionImageStatus : cSectionImageStatus;
    if (!statusEl) return;
    statusEl.classList.remove('success', 'error');
    if (!message) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
        return;
    }
    if (state) statusEl.classList.add(state);
    statusEl.textContent = message;
    statusEl.classList.remove('hidden');
}

function setImageStatusForItem(context, item) {
    if (!item || !item.img || !item.img.startsWith('blob:')) {
        updateImageStatus(context, '');
        return;
    }
    const pending = pendingUploads.get(item.img);
    if (!pending) {
        updateImageStatus(context, 'Will upload on save.');
        return;
    }
    if (pending.status === 'uploading') {
        updateImageStatus(context, 'Uploading image...');
        return;
    }
    if (pending.status === 'error') {
        updateImageStatus(context, 'Upload failed - will retry on save.', 'error');
        return;
    }
    updateImageStatus(context, 'Ready to upload.');
}

function findItemByImageUrl(imgUrl) {
    const appliance = truckData.appliances.find(a => a.id === activeApplianceId);
    if (!appliance || !appliance.lockers) return null;
    for (const locker of appliance.lockers) {
        for (const shelf of locker.shelves || []) {
            for (const item of shelf.items || []) {
                if (item.img === imgUrl) return item;
                if (item.subItems) {
                    const subItem = item.subItems.find(si => si.img === imgUrl);
                    if (subItem) return subItem;
                }
            }
        }
    }
    return null;
}

function compressIfNeeded(file) {
    if (!file || file.size <= compressThresholdBytes) return file;
    return imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true
    });
}

function queueImageUpload(blobUrl, context) {
    const pending = pendingUploads.get(blobUrl);
    if (!pending || pending.promise) return pending?.promise;
    if (!currentUser || !activeBrigadeId) {
        pending.status = 'pending';
        updateImageStatus(context, 'Will upload on save.');
        return null;
    }

    pending.status = 'uploading';
    updateImageStatus(context, 'Uploading image...');
    updateSaveButtons();
    pending.promise = (async () => {
        try {
            const compressedFile = await compressIfNeeded(pending.file);

            const formData = new FormData();
            formData.append('image', compressedFile, compressedFile.name || 'compressed-image.webp');
            const token = await currentUser.getIdToken();

            const responseText = await uploadWithProgress(`/api/upload`, token, formData, (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    updateImageStatus(context, `Uploading ${percent}%`);
                }
            }, { 'x-brigade-id': activeBrigadeId });

            const result = JSON.parse(responseText);
            const item = findItemByImageUrl(blobUrl);
            if (item && item.img === blobUrl) {
                item.img = result.filePath;
            }
            URL.revokeObjectURL(blobUrl);
            pendingUploads.delete(blobUrl);
            updateImageStatus(context, 'Uploaded', 'success');
            refreshCurrentView();
        } catch (error) {
            console.error('Image upload failed:', error);
            pending.status = 'error';
            updateImageStatus(context, 'Upload failed - will retry on save.', 'error');
        } finally {
            const current = pendingUploads.get(blobUrl);
            if (current) current.promise = null;
            updateSaveButtons();
        }
    })();

    return pending.promise;
}

function uploadWithProgress(url, token, formData, onProgress, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        Object.entries(extraHeaders || {}).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            xhr.setRequestHeader(key, String(value));
        });
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
