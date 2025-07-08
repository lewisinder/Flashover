document.addEventListener('DOMContentLoaded', () => {

    // ===================================================================
    // JAVASCRIPT - THE BRAIN OF THE APP
    // ===================================================================
    const username = localStorage.getItem('username');
    // If not logged in and not on a public page, redirect to login.
    if (!username && !['/login.html', '/signup.html', '/welcome.html', '/'].includes(window.location.pathname)) {
        window.location.href = '/login.html';
        return; 
    }

    // -------------------------------------------------------------------
    // SECTION A: DATA MANAGEMENT
    // -------------------------------------------------------------------
    const loadingOverlay = document.getElementById('loading-overlay');

    function showLoader() {
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    }

    function hideLoader() {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    let userAppData = { appliances: [] };

    async function loadData() {
        if (!username) return;
        showLoader();
        try {
            const response = await fetch(`/api/data/${username}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            // Migration: If old data structure is found, convert it.
            if (data.lockers) {
                userAppData = {
                    appliances: [{
                        id: 'default-appliance',
                        name: 'My Appliance',
                        lockers: data.lockers
                    }]
                };
                await saveData(); // Save the new structure
            } else {
                userAppData = data;
            }
        } catch (error) {
            console.error("Could not load user data:", error);
        } finally {
            hideLoader();
        }
    }

    async function saveData() {
        if (!username) return;
        showLoader();
        try {
            const response = await fetch(`/api/data/${username}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userAppData),
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            console.log('Data saved successfully');
        } catch (error) {
            console.error('Failed to save data:', error);
            alert('Failed to save data to the server.');
        } finally {
            hideLoader();
        }
    }
    
    function getActiveAppliance() {
        const applianceId = localStorage.getItem('selectedApplianceId');
        if (!applianceId || !userAppData.appliances) return null;
        return userAppData.appliances.find(a => a.id === applianceId);
    }

    function generateFullReportData() {
        const appliance = getActiveAppliance();
        if (!appliance) return { lockers: [] };
        const reportApplianceData = JSON.parse(JSON.stringify(appliance)); // Deep copy
        reportApplianceData.lockers.forEach(locker => {
            locker.shelves.forEach(shelf => {
                shelf.items.forEach(item => {
                    const result = checkResults.find(r => r.itemId === item.id);
                    item.status = result ? result.status : 'untouched';
                    item.note = result ? result.note : '';
                    if (item.type === 'container' && item.subItems) {
                        item.subItems.forEach(subItem => {
                            const subResult = checkResults.find(r => r.itemId === subItem.id);
                            subItem.status = subResult ? subResult.status : 'untouched';
                            subItem.note = subResult ? subResult.note : '';
                        });
                    }
                });
            });
        });
        return reportApplianceData;
    }

    async function deleteImage(imageUrl) {
        if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
        const fileName = imageUrl.split('/').pop();
        try {
            await fetch(`/api/image/${fileName}`, { method: 'DELETE' });
        } catch (error) {
            console.error('Failed to delete image:', error);
        }
    }

    // -------------------------------------------------------------------
    // SECTION B: APP STATE
    // -------------------------------------------------------------------
    let checkResults = JSON.parse(sessionStorage.getItem('checkResults')) || [];
    let currentlyEditing = { lockerId: null, shelfId: null, itemId: null, isSubItem: false, parentItemId: null, isNewItem: false };
    let itemToDelete = { type: null, id: null, parentId: null };
    let currentCheckState = JSON.parse(sessionStorage.getItem('currentCheckState')) || { lockerId: null, selectedItemId: null, isRechecking: false, isInsideContainer: false, parentItemId: null };
    let nextLockerToStartId = null;
    let tempImageSrc = null;
    let checkInProgress = sessionStorage.getItem('checkInProgress') === 'true';
    let isReportSaved = false;

    // -------------------------------------------------------------------
    // SECTION C: DOM ELEMENT REFERENCES
    // -------------------------------------------------------------------
    const getElement = (id) => document.getElementById(id);

    const screens = { 
        home: getElement('home-screen'), 
        lockerCheck: getElement('locker-check-screen'), 
        selectLocker: getElement('select-locker-screen'), 
        lockerEditor: getElement('locker-editor-screen'), 
        containerEditor: getElement('container-editor-screen'), 
        nextLockerChoice: getElement('next-locker-choice-screen'), 
        summary: getElement('summary-screen'), 
        reports: getElement('reports-screen') 
    };

    const checkerUI = { 
        lockerName: getElement('locker-name'), 
        itemImage: getElement('item-image'), 
        itemName: getElement('item-name'), 
        itemDesc: getElement('item-desc'), 
        lockerLayout: getElement('locker-layout'), 
        controls: getElement('controls'), 
        containerControls: getElement('container-controls'), 
        nextLockerBtn: getElement('go-to-next-locker-btn'), 
        backToSummaryBtn: getElement('back-to-summary-btn') 
    };

    const editorUI = { 
        lockerName: getElement('locker-editor-name'), 
        shelvesContainer: getElement('locker-editor-shelves'), 
        addShelfBtn: getElement('add-shelf-btn'), 
        doneBtn: getElement('done-editing-locker-btn') 
    };
    
    const containerEditorUI = { 
        title: getElement('container-editor-title'), 
        shelvesContainer: getElement('container-editor-shelves'), 
        addSubItemBtn: getElement('add-sub-item-btn'), 
        backBtn: getElement('back-to-locker-editor-btn') 
    };

    const editorSectionUI = {
        section: getElement('item-editor-section'),
        imagePreview: getElement('section-image-preview'),
        fileInput: getElement('section-file-upload'),
        nameInput: getElement('section-item-name-input'),
        descInput: getElement('section-item-desc-input'),
        saveBtn: getElement('section-save-item-btn'),
        cancelBtn: getElement('section-cancel-edit-btn'),
        deleteBtn: getElement('section-delete-item-btn')
    };

    const editorModal = { 
        overlay: getElement('item-editor-modal'), 
        title: getElement('item-editor-title'), 
        imagePreview: getElement('image-preview'), 
        fileInput: getElement('file-upload'), 
        nameInput: getElement('item-name-input'), 
        descInput: getElement('item-desc-input'), 
        typeSelectorContainer: getElement('item-type-selector-container'), 
        typeSelect: getElement('item-type-select'), 
        enterContainerBtn: getElement('enter-container-btn'), 
        saveBtn: getElement('save-item-btn'), 
        cancelBtn: getElement('cancel-edit-btn'), 
        deleteBtn: getElement('delete-item-btn') 
    };

    const noteModal = { 
        overlay: getElement('note-modal'), 
        title: getElement('note-modal-title'), 
        input: getElement('note-input'), 
        saveBtn: getElement('btn-save-note') 
    };

    const nameLockerModal = { 
        overlay: getElement('name-locker-modal'), 
        input: getElement('new-locker-name-input'), 
        saveBtn: getElement('save-new-locker-btn'), 
        cancelBtn: getElement('cancel-create-locker-btn') 
    };

    const deleteConfirmModal = { 
        overlay: getElement('delete-confirm-modal'), 
        title: getElement('delete-confirm-title'), 
        text: getElement('delete-confirm-text'), 
        confirmBtn: getElement('confirm-delete-btn'), 
        cancelBtn: getElement('cancel-delete-btn') 
    };

    const checkButtons = {
        present: getElement('btn-present'),
        missing: getElement('btn-missing'),
        note: getElement('btn-note'),
        checkContents: getElement('btn-check-contents'),
        containerMissing: getElement('btn-container-missing')
    };

    // -------------------------------------------------------------------
    // SECTION D: CORE APP LOGIC
    // -------------------------------------------------------------------
    
    function showScreen(screenId) {
        Object.keys(screens).forEach(key => {
            if (screens[key]) {
                screens[key].classList.toggle('active', key === screenId);
            }
        });
    }

    function updateContinueButton() {
        const continueBtn = getElement('continue-check-btn');
        if (continueBtn) {
            continueBtn.classList.toggle('hidden', !checkInProgress);
        }
    }

    // -------------------------------------------------------------------
    // SUB-SECTION: APPLIANCE SELECTION
    // -------------------------------------------------------------------
    function renderApplianceSelection() {
        const container = getElement('appliance-list');
        if (!container) return;
        container.innerHTML = '';

        if (!userAppData.appliances || userAppData.appliances.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 mt-8">No appliances found. Create one to get started!</p>`;
        } else {
            userAppData.appliances.forEach(appliance => {
                const applianceItemDiv = document.createElement('div');
                applianceItemDiv.className = 'appliance-list-item mx-auto max-w-md';
                applianceItemDiv.dataset.applianceId = appliance.id;
                applianceItemDiv.innerHTML = `
                    <img src="/design_assets/Truck Icon.png" alt="Truck" class="h-12 w-12 mr-4">
                    <span class="font-bold text-lg flex-grow">${appliance.name}</span>
                    <button class="delete-appliance-btn">
                        <img src="/design_assets/No Icon.png" alt="Delete" class="h-6 w-6">
                    </button>
                `;
                container.appendChild(applianceItemDiv);
            });
        }
    }

    function openNewApplianceModal() {
        const modal = getElement('new-appliance-modal');
        if (modal) {
            getElement('new-appliance-name-input').value = '';
            modal.classList.remove('hidden');
        }
    }

    function closeNewApplianceModal() {
        const modal = getElement('new-appliance-modal');
        if (modal) modal.classList.add('hidden');
    }

    function createNewAppliance() {
        const nameInput = getElement('new-appliance-name-input');
        const name = nameInput.value.trim();
        if (name) {
            const newAppliance = {
                id: `appliance-${Date.now()}`,
                name: name,
                lockers: []
            };
            if (!userAppData.appliances) userAppData.appliances = [];
            userAppData.appliances.push(newAppliance);
            saveData().then(() => {
                renderApplianceSelection();
                closeNewApplianceModal();
            });
        } else {
            nameInput.classList.add('border-red-500', 'shake');
            setTimeout(() => nameInput.classList.remove('shake'), 820);
        }
    }

    function confirmDeleteAppliance(applianceId) {
        itemToDelete = { type: 'appliance', id: applianceId };
        const appliance = userAppData.appliances.find(a => a.id === applianceId);
        if (deleteConfirmModal.overlay && appliance) {
            deleteConfirmModal.title.textContent = `Delete ${appliance.name}?`;
            deleteConfirmModal.text.innerHTML = "<strong>This will delete the appliance and all its contents.</strong> This action cannot be undone.";
            deleteConfirmModal.overlay.classList.remove('hidden');
        }
    }

    // -------------------------------------------------------------------
    // SUB-SECTION: SETUP & EDITOR MODE LOGIC
    // -------------------------------------------------------------------
    function renderLockerSelection() {
        const container = getElement('locker-list-container');
        const applianceNameTitle = getElement('appliance-name-title');
        if (!container || !applianceNameTitle) return;

        const appliance = getActiveAppliance();
        if (!appliance) {
            window.location.href = '/select-appliance.html'; // Should not happen, but good practice
            return;
        }

        applianceNameTitle.textContent = `${appliance.name} Lockers`;
        container.innerHTML = ''; // Clear existing content

        // Render existing lockers
        appliance.lockers.forEach(locker => {
            const lockerCard = document.createElement('div');
            lockerCard.className = 'locker-card';
            lockerCard.dataset.lockerId = locker.id;
            lockerCard.innerHTML = `
                <span class="locker-name">${locker.name}</span>
                <button class="delete-locker-btn"><img src="/design_assets/No Icon.png" alt="Delete" class="h-6 w-6"></button>
            `;
            container.appendChild(lockerCard);
        });

        // Render the "Add New" card
        const addLockerCard = document.createElement('div');
        addLockerCard.id = 'create-new-locker-btn';
        addLockerCard.className = 'locker-card add-new';
        addLockerCard.innerHTML = `
            <span class="text-5xl font-thin">+</span>
        `;
        container.appendChild(addLockerCard);
    }

    function openLockerEditor(lockerId) {
        const locker = findLockerById(lockerId);
        if (!locker) return;

        // Ensure at least two shelves exist when opening the editor
        while (locker.shelves.length < 2) {
            locker.shelves.push({ id: Date.now() + locker.shelves.length, name: `Shelf ${locker.shelves.length + 1}`, items: [] });
        }
        saveData().then(() => {
            currentlyEditing.lockerId = lockerId;
            renderLockerEditor();
            showScreen('lockerEditor');
        });
    }

    function renderLockerEditor() {
        if (!editorUI.shelvesContainer) return;
        const locker = findLockerById(currentlyEditing.lockerId);
        if (!locker) return;

        editorUI.lockerName.value = locker.name;
        editorUI.shelvesContainer.innerHTML = '';
        locker.shelves.forEach(shelf => {
            const shelfDiv = document.createElement('div');
            shelfDiv.className = 'shelf-editor-container';
            shelfDiv.innerHTML = `
                <div class="flex justify-end mb-2">
                    <button data-shelf-id="${shelf.id}" class="delete-shelf-btn text-red-500 hover:text-red-400 font-bold text-2xl leading-none px-2">&times;</button>
                </div>
                <div class="shelf-content">
                    ${shelf.items.map(item => `
                        <div class="item-editor-box" data-shelf-id="${shelf.id}" data-item-id="${item.id}">
                            ${item.img ? `<img src="${item.img}" alt="${item.name}" class="w-full h-full object-cover">` : ''}
                            <div class="item-name-overlay">${item.name || 'New Item'}</div>
                        </div>
                    `).join('')}
                    <div class="add-item-btn-circle" data-shelf-id="${shelf.id}">+</div>
                </div>
            `;
            editorUI.shelvesContainer.appendChild(shelfDiv);
        });
    }

    function openItemEditor(shelfId, itemId, isSubItem = false, parentItemId = null) {
        currentlyEditing = { ...currentlyEditing, shelfId, itemId, isSubItem, parentItemId };
        const item = findItemById(itemId, parentItemId);
        
        if (!editorSectionUI.section || !item) return;

        // Show the editor and hide the done button
        editorSectionUI.section.style.visibility = 'visible';
        editorSectionUI.section.style.opacity = 1;
        if(editorUI.doneBtn) editorUI.doneBtn.classList.add('hidden');

        // Highlight the selected item
        document.querySelectorAll('.item-editor-box.editing').forEach(b => b.classList.remove('editing'));
        const activeBox = document.querySelector(`.item-editor-box[data-item-id='${item.id}']`);
        if (activeBox) activeBox.classList.add('editing');

        editorSectionUI.nameInput.value = item.name || '';
        editorSectionUI.descInput.value = item.desc || '';
        tempImageSrc = item.img || 'https://placehold.co/100x100/e5e7eb/4b5563?text=Upload';
        editorSectionUI.imagePreview.src = tempImageSrc;
    }

    function closeItemEditor() {
        if (!editorSectionUI.section) return;

        editorSectionUI.section.style.visibility = 'hidden';
        editorSectionUI.section.style.opacity = 0;
        if(editorUI.doneBtn) editorUI.doneBtn.classList.remove('hidden');

        document.querySelectorAll('.item-editor-box.editing').forEach(b => b.classList.remove('editing'));

        currentlyEditing.itemId = null;
        currentlyEditing.isSubItem = false;
        currentlyEditing.isNewItem = false;
        if (editorSectionUI.fileInput) editorSectionUI.fileInput.value = '';
        tempImageSrc = null;
    }

    function saveItem() {
        if (!currentlyEditing.itemId) return;
        const item = findItemById(currentlyEditing.itemId, currentlyEditing.parentItemId);
        
        item.name = editorSectionUI.nameInput.value;
        item.desc = editorSectionUI.descInput.value;
        item.img = tempImageSrc;
        
        // For now, type is always 'item' as the new UI doesn't have a type selector
        item.type = 'item';

        saveData().then(() => {
            if (currentlyEditing.isSubItem) renderContainerEditor();
            else renderLockerEditor();
            closeItemEditor();
        });
    }

    function confirmDelete(type, id, parentId = null) {
        itemToDelete = { type, id, parentId };
        let title = `Delete ${type}?`;
        let text = "This action cannot be undone.";

        if (type === 'locker') {
            const appliance = getActiveAppliance();
            // Ensure ID is treated as a number for comparison
            const locker = appliance.lockers.find(l => l.id == id);
            if (locker) title = `Delete ${locker.name}?`;
            text = "<strong>This will delete the locker and all items inside.</strong> This action cannot be undone.";
        } else if (type === 'containerContents') {
            title = "Change to Standard Item?";
            text = "<strong>This will delete all sub-items inside.</strong> Are you sure?";
        }
        
        if (deleteConfirmModal.overlay) {
            deleteConfirmModal.title.textContent = title;
            deleteConfirmModal.text.innerHTML = text;
            deleteConfirmModal.overlay.classList.remove('hidden');
        }
    }

    function executeDelete() {
        const { type, id, parentId } = itemToDelete;
        let promise = Promise.resolve();
        const appliance = getActiveAppliance();

        if (type === 'appliance') {
            userAppData.appliances = userAppData.appliances.filter(a => a.id !== id);
            promise = saveData().then(renderApplianceSelection);
        } else if (type === 'locker') {
            appliance.lockers = appliance.lockers.filter(l => l.id != id);
            promise = saveData().then(renderLockerSelection);
        } else if (type === 'shelf') {
            const locker = findLockerById(currentlyEditing.lockerId);
            locker.shelves = locker.shelves.filter(s => s.id !== id);
            promise = saveData().then(renderLockerEditor);
        } else if (type === 'item') {
            const item = findItemById(id, parentId);
            if (item.img) deleteImage(item.img);

            if (parentId) {
                const parentItem = findItemById(parentId);
                parentItem.subItems = parentItem.subItems.filter(i => i.id !== id);
                promise = saveData().then(renderContainerEditor);
            } else {
                const shelf = findShelfById(currentlyEditing.shelfId);
                shelf.items = shelf.items.filter(i => i.id !== id);
                promise = saveData().then(renderLockerEditor);
            }
            closeItemEditor();
        } else if (type === 'containerContents') {
            const item = findItemById(id);
            item.type = 'item';
            if(item.subItems) {
                item.subItems.forEach(sub => { if(sub.img) deleteImage(sub.img); });
            }
            delete item.subItems;
            promise = saveData().then(renderLockerEditor);
        }
        
        promise.then(() => {
            if (deleteConfirmModal.overlay) deleteConfirmModal.overlay.classList.add('hidden');
        });
    }
    
    function findItemById(itemId, parentItemId = null) {
        const appliance = getActiveAppliance();
        if (!appliance) return null;

         if (parentItemId) {
            const parent = findItemById(parentItemId);
            return parent ? parent.subItems.find(i => i.id === itemId) : null;
        }
        for (const locker of appliance.lockers) {
            for (const shelf of locker.shelves) {
                const item = shelf.items.find(i => i.id === itemId);
                if (item) return item;
            }
        }
        return null;
    }
    
    function findShelfById(shelfId) {
        const appliance = getActiveAppliance();
        if (!appliance) return null;
        for (const locker of appliance.lockers) {
            const shelf = locker.shelves.find(s => s.id === shelfId);
            if (shelf) return shelf;
        }
        return null;
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const targetPreview = e.target.id === 'section-file-upload' ? editorSectionUI.imagePreview : editorModal.imagePreview;
        targetPreview.src = URL.createObjectURL(file);

        const formData = new FormData();
        formData.append('itemImage', file);
        const item = findItemById(currentlyEditing.itemId, currentlyEditing.parentItemId);
        if (item && item.img && item.img.startsWith('/uploads/')) {
            formData.append('oldImagePath', item.img);
        }

        showLoader();
        fetch('/api/upload', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if(data.filePath) {
                    tempImageSrc = data.filePath;
                    targetPreview.src = tempImageSrc;
                } else {
                    alert('Image upload failed.');
                }
            })
            .catch(error => alert('An error occurred during image upload.'))
            .finally(hideLoader);
    }

    function addItemToShelf(shelfId) {
        const shelf = findShelfById(shelfId);
        const newItem = { id: Date.now(), name: '', desc: '', img: '', type: 'item' };
        shelf.items.push(newItem);
        saveData().then(() => {
            renderLockerEditor();
            currentlyEditing.isNewItem = true;
            openItemEditor(shelfId, newItem.id);
        });
    }

    function addShelf() {
        const appliance = getActiveAppliance();
        const locker = appliance.lockers.find(l => l.id === currentlyEditing.lockerId);
        locker.shelves.push({ id: Date.now(), items: [] });
        saveData().then(renderLockerEditor);
    }

    function openContainerEditor(itemId) {
        currentlyEditing.parentItemId = itemId;
        renderContainerEditor();
        showScreen('containerEditor');
    }

    function renderContainerEditor() {
        if (!containerEditorUI.shelvesContainer) return;
        const parentItem = findItemById(currentlyEditing.parentItemId);
        if (!parentItem) return;

        containerEditorUI.title.textContent = `Editing: ${parentItem.name}`;
        containerEditorUI.shelvesContainer.innerHTML = `
            <div class="shelf-editor-container">
                <div class="grid grid-cols-4 gap-4">
                    ${parentItem.subItems.map(subItem => `
                        <div class="item-editor-box aspect-square" data-item-id="${subItem.id}" data-parent-id="${parentItem.id}">
                            <img src="${subItem.img || 'https://placehold.co/60x60/d1d5db/4b5563?text=Item'}" alt="${subItem.name}">
                            <span class="item-name">${subItem.name || 'New Item'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function addSubItem() {
        const parentItem = findItemById(currentlyEditing.parentItemId);
        const newItem = { id: Date.now(), name: '', desc: '', img: '', type: 'item' };
        parentItem.subItems.push(newItem);
        saveData().then(() => {
            renderContainerEditor();
            currentlyEditing.isNewItem = true;
            openItemEditor(null, newItem.id, true, parentItem.id);
        });
    }
    
    // -------------------------------------------------------------------
    // SUB-SECTION: CHECK MODE LOGIC
    // -------------------------------------------------------------------
    function startChecks() {
        const appliance = getActiveAppliance();
        if (!appliance || appliance.lockers.length === 0 || appliance.lockers.every(l => l.shelves.every(s => s.items.length === 0))) {
            alert("No items to check. Please set up the appliance first.");
            return;
        }
        checkResults = [];
        checkInProgress = true;
        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
        sessionStorage.setItem('checkInProgress', 'true');
        
        const firstLockerId = appliance.lockers[0].id;
        currentCheckState = { lockerId: firstLockerId, selectedItemId: null, isRechecking: false, isInsideContainer: false, parentItemId: null };
        sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
        window.location.href = '/checks.html';
    }
    
    function loadLockerUI() {
        if (!checkerUI.lockerLayout) return;
        const locker = findLockerById(currentCheckState.lockerId);
        if (!locker) {
            window.location.href = '/menu.html';
            return;
        }
        checkerUI.lockerName.textContent = locker.name;
        checkerUI.lockerLayout.innerHTML = locker.shelves.map(shelf => `
            <div class="flex-1 flex gap-3 p-3 bg-gray-100 rounded-xl">
                ${shelf.items.map(item => {
                    const result = checkResults.find(r => r.itemId === item.id);
                    const statusClass = result ? `status-${result.status}` : 'bg-gray-300';
                    return `<div class="item-box flex-1 h-full rounded-lg border-2 border-gray-400 ${statusClass}" data-id="${item.id}"></div>`;
                }).join('')}
            </div>
        `).join('');
        
        const firstUnchecked = locker.shelves.flatMap(s => s.items).find(i => !checkResults.some(r => r.itemId === i.id));
        selectItemForCheck(firstUnchecked?.id || locker.shelves[0]?.items[0]?.id);

        checkerUI.backToSummaryBtn.classList.toggle('hidden', !currentCheckState.isRechecking);
        if(!currentCheckState.isRechecking) checkIfLockerIsComplete();
    }

    function selectItemForCheck(itemId, parentId = null) {
        if (!itemId || !checkerUI.itemName) return;
        
        currentCheckState.selectedItemId = itemId;
        currentCheckState.parentItemId = parentId;
        const item = findItemById(itemId, parentId);

        if (item) {
            checkerUI.itemImage.src = item.img || 'https://placehold.co/100x100/e5e7eb/4b5563?text=No+Img';
            checkerUI.itemName.textContent = item.name;
            checkerUI.itemDesc.textContent = item.desc;
            document.querySelectorAll('.item-box.is-active').forEach(b => b.classList.remove('is-active'));
            const activeBox = document.querySelector(`.item-box[data-id='${item.id}']`);
            if (activeBox) activeBox.classList.add('is-active');

            const isContainer = item.type === 'container' && !currentCheckState.isInsideContainer;
            checkerUI.controls.classList.toggle('hidden', isContainer);
            checkerUI.containerControls.classList.toggle('hidden', !isContainer);
        }
        sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
    }

    function startContainerCheck() {
        const containerId = currentCheckState.selectedItemId;
        currentCheckState.isInsideContainer = true;
        currentCheckState.parentItemId = containerId;
        sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
        loadContainerUI(findItemById(containerId));
    }

    function loadContainerUI(container) {
        if (!checkerUI.lockerLayout) return;
        checkerUI.lockerName.textContent = `Container: ${container.name}`;
        checkerUI.lockerLayout.innerHTML = `
            <div class="flex-1 flex gap-3 p-3 bg-gray-100 rounded-xl">
                ${container.subItems.map(item => {
                    const result = checkResults.find(r => r.itemId === item.id);
                    const statusClass = result ? `status-${result.status}` : 'bg-gray-300';
                    return `<div class="item-box flex-1 h-full rounded-lg border-2 border-gray-400 ${statusClass}" data-id="${item.id}" data-parent-id="${container.id}"></div>`;
                }).join('')}
            </div>`;

        const firstUnchecked = container.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
        selectItemForCheck(firstUnchecked?.id || container.subItems[0]?.id, container.id);
        checkIfContainerIsComplete();
    }

    function finishContainerCheck() {
        const parentItemId = currentCheckState.parentItemId;
        const parentItem = findItemById(parentItemId);
        const subItemResults = checkResults.filter(r => r.parentItemId === parentItemId);
        
        let newStatus = 'present';
        if (subItemResults.some(r => r.status === 'missing')) newStatus = 'partial';
        else if (subItemResults.some(r => r.status === 'note')) newStatus = 'note';

        const resultIndex = checkResults.findIndex(r => r.itemId === parentItemId);
        const result = { lockerId: currentCheckState.lockerId, lockerName: findLockerById(currentCheckState.lockerId).name, itemId: parentItemId, itemName: parentItem.name, itemImg: parentItem.img, status: newStatus, note: '' };
        if (resultIndex > -1) checkResults[resultIndex] = result;
        else checkResults.push(result);
        
        currentCheckState.isInsideContainer = false;
        currentCheckState.parentItemId = null;
        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
        sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
        loadLockerUI();
    }

    function checkIfContainerIsComplete() {
        if (!currentCheckState.parentItemId) return false;
        const parentItem = findItemById(currentCheckState.parentItemId);
        const allItemsChecked = parentItem.subItems.every(item => checkResults.some(r => r.itemId === item.id));

        const existingFinishBtn = getElement('finish-container-check-btn');
        if (existingFinishBtn) existingFinishBtn.remove();

        if (allItemsChecked) {
            checkerUI.controls.classList.add('hidden');
            checkerUI.containerControls.classList.add('hidden');
            const finishBtn = document.createElement('button');
            finishBtn.id = 'finish-container-check-btn';
            finishBtn.textContent = 'Finish Container';
            finishBtn.className = 'w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-4 rounded-lg text-xl';
            finishBtn.onclick = finishContainerCheck;
            checkerUI.nextLockerBtn.parentElement.insertBefore(finishBtn, checkerUI.nextLockerBtn);
            checkerUI.nextLockerBtn.classList.add('hidden');
        }
        return allItemsChecked;
    }

    function processCheck(status) {
        if (!currentCheckState.selectedItemId) return;
        const item = findItemById(currentCheckState.selectedItemId, currentCheckState.parentItemId);
        const locker = findLockerById(currentCheckState.lockerId);

        if (!currentCheckState.isInsideContainer && item.type === 'container' && status === 'missing') {
             const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: 'missing', note: '' };
             const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
             if (resultIndex > -1) checkResults[resultIndex] = result;
             else checkResults.push(result);
             
             const itemBox = document.querySelector(`.item-box[data-id='${item.id}']`);
             if (itemBox) itemBox.className = 'item-box flex-1 h-full rounded-lg border-2 border-gray-400 status-missing';
             
             if (!checkIfLockerIsComplete()) {
                const allItemsInLocker = locker.shelves.flatMap(s => s.items);
                const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
                if (nextUncheckedItem) selectItemForCheck(nextUncheckedItem.id);
             }
             sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
             return;
        }

        if (status === 'note') {
            noteModal.title.textContent = `Add Note for ${item.name}`;
            const existingResult = checkResults.find(r => r.itemId === item.id);
            noteModal.input.value = existingResult?.note || '';
            noteModal.overlay.classList.remove('hidden');
            return;
        }
        
        const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: status, note: '', parentItemId: currentCheckState.parentItemId };
        const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
        if (resultIndex > -1) checkResults[resultIndex] = result;
        else checkResults.push(result);
        
        const itemBox = document.querySelector(`.item-box[data-id='${item.id}']`);
        if (itemBox) itemBox.className = `item-box flex-1 h-full rounded-lg border-2 border-gray-400 is-active status-${status}`;

        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
        if (currentCheckState.isRechecking) return;

        if (currentCheckState.isInsideContainer) {
            if (!checkIfContainerIsComplete()) {
                const parentItem = findItemById(currentCheckState.parentItemId);
                const nextUncheckedItem = parentItem.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
                if (nextUncheckedItem) selectItemForCheck(nextUncheckedItem.id, parentItem.id);
            }
        } else {
            if (!checkIfLockerIsComplete()) {
                const allItemsInLocker = locker.shelves.flatMap(s => s.items);
                const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
                if (nextUncheckedItem) selectItemForCheck(nextUncheckedItem.id);
            }
        }
    }
    
    function saveNoteAndProceed() {
        const item = findItemById(currentCheckState.selectedItemId, currentCheckState.parentItemId);
        const locker = findLockerById(currentCheckState.lockerId);
        const noteText = noteModal.input.value;

        const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: 'note', note: noteText, parentItemId: currentCheckState.parentItemId };
        const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
        if (resultIndex > -1) checkResults[resultIndex] = result;
        else checkResults.push(result);
        
        const itemBox = document.querySelector(`.item-box[data-id='${item.id}']`);
        if (itemBox) itemBox.className = 'item-box flex-1 h-full rounded-lg border-2 border-gray-400 is-active status-note';
        
        noteModal.overlay.classList.add('hidden');
        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
        if (currentCheckState.isRechecking) return;

        if (currentCheckState.isInsideContainer) {
            if (!checkIfContainerIsComplete()) {
                const parentItem = findItemById(currentCheckState.parentItemId);
                const nextUncheckedItem = parentItem.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
                if (nextUncheckedItem) selectItemForCheck(nextUncheckedItem.id, parentItem.id);
            }
        } else {
            if (!checkIfLockerIsComplete()) {
                const allItemsInLocker = locker.shelves.flatMap(s => s.items);
                const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
                if (nextUncheckedItem) selectItemForCheck(nextUncheckedItem.id);
            }
        }
    }
    
    function checkIfLockerIsComplete() {
        if (!currentCheckState.lockerId || !checkerUI.lockerLayout) return false;
        const locker = findLockerById(currentCheckState.lockerId);
        const allItemsInLocker = locker.shelves.flatMap(s => s.items);
        const allItemsChecked = allItemsInLocker.every(item => checkResults.some(r => r.itemId === item.id));

        const existingFinishBtn = getElement('finish-container-check-btn');
        if(existingFinishBtn) existingFinishBtn.remove();

        if (allItemsChecked) {
            checkerUI.controls.classList.add('hidden');
            checkerUI.containerControls.classList.add('hidden');
            checkerUI.nextLockerBtn.classList.remove('hidden');
        } else if (checkerUI.nextLockerBtn) {
            checkerUI.nextLockerBtn.classList.add('hidden');
        }
        return allItemsChecked;
    }
    
    function handleLockerCompletion() {
        renderNextLockerChoices();
        showScreen('nextLockerChoice');
    }
    
    function getLockerCheckStatus(lockerId) {
        const locker = findLockerById(lockerId);
        const allItems = locker.shelves.flatMap(s => s.items);
        if (allItems.length === 0) return 'complete';
        const checkedItemsInLocker = checkResults.filter(r => r.lockerId === lockerId && !r.parentItemId);
        if (checkedItemsInLocker.length === 0) return 'untouched';
        if (checkedItemsInLocker.length === allItems.length) return 'complete';
        return 'partial';
    }

    function renderNextLockerChoices() {
        const container = getElement('next-locker-list-container');
        if (!container) return;
        container.innerHTML = '';
        const appliance = getActiveAppliance();
        
        let allLockersComplete = true;
        appliance.lockers.forEach(locker => {
            if (getLockerCheckStatus(locker.id) !== 'complete') allLockersComplete = false;
        });

        const suggestedNextLocker = appliance.lockers.find(l => getLockerCheckStatus(l.id) !== 'complete');
        nextLockerToStartId = suggestedNextLocker?.id;

        appliance.lockers.forEach(locker => {
            const status = getLockerCheckStatus(locker.id);
            const lockerBtn = document.createElement('button');
            lockerBtn.className = `w-full bg-gray-100 p-4 rounded-lg flex items-center justify-between text-gray-800 border-2 ${locker.id === nextLockerToStartId ? 'border-blue-500' : 'border-transparent'}`;
            lockerBtn.dataset.lockerId = locker.id;
            const icons = { complete: '&#10003;', partial: '!', untouched: '&#9675;' };
            const colors = { complete: 'text-green-500', partial: 'text-yellow-500', untouched: 'text-gray-400' };
            lockerBtn.innerHTML = `<span>${locker.name}</span> <span class="${colors[status]} text-2xl font-bold">${icons[status]}</span>`;
            lockerBtn.addEventListener('click', () => {
                nextLockerToStartId = locker.id;
                document.querySelectorAll('#next-locker-list-container button').forEach(btn => btn.classList.replace('border-blue-500', 'border-transparent'));
                lockerBtn.classList.replace('border-transparent', 'border-blue-500');
            });
            container.appendChild(lockerBtn);
        });

        getElement('finish-checks-early-btn')?.classList.toggle('hidden', !allLockersComplete);
    }
    
    function renderSummaryScreen() {
        const container = getElement('summary-list-container');
        if (!container) return;

        checkInProgress = false;
        isReportSaved = false; 
        sessionStorage.setItem('checkInProgress', 'false');
        updateContinueButton();
        
        container.innerHTML = '';
        const issues = checkResults.filter(r => r.status === 'missing' || (r.status === 'note' && r.note));
        
        if (issues.length === 0) {
            container.innerHTML = `<div class="text-center p-8 bg-green-100 text-green-800 rounded-lg"><h3 class="text-2xl font-bold">All Clear!</h3><p>No issues found.</p></div>`;
        } else {
            container.innerHTML = issues.map(issue => {
                const locationText = issue.parentItemId 
                    ? `<p class="text-sm text-gray-600">In Container: <strong>${findItemById(issue.parentItemId).name}</strong></p><p class="text-sm text-gray-500">Locker: ${issue.lockerName}</p>`
                    : `<p class="text-sm text-gray-600">Locker: ${issue.lockerName}</p>`;
                
                const statusText = issue.status === 'missing'
                    ? `<p class="mt-2 font-bold" style="color: #b91c1c;">STATUS: MISSING</p>`
                    : `<p class="mt-2 p-2 bg-white rounded text-sm"><strong>Note:</strong> ${issue.note}</p>`;

                return `
                    <div class="p-4 rounded-lg flex items-start gap-4 ${issue.status === 'missing' ? 'bg-red-100' : 'bg-amber-100'}">
                        <img src="${issue.itemImg || 'https://placehold.co/80x80/e5e7eb/4b5563?text=No+Img'}" class="w-20 h-20 rounded-lg object-cover flex-shrink-0">
                        <div class="flex-grow">
                            <p class="font-bold text-lg">${issue.itemName}</p>
                            ${locationText}
                            ${statusText}
                        </div>
                        <button data-locker-id="${issue.lockerId}" data-item-id="${issue.itemId}" data-parent-item-id="${issue.parentItemId || ''}" class="recheck-btn bg-blue-500 text-white text-sm font-bold py-1 px-3 rounded-full self-center">Re-check</button>
                    </div>`;
            }).join('');
        }
    }

    function findLockerById(lockerId) {
        const appliance = getActiveAppliance();
        if (!appliance) return null;
        // Use == to handle potential type mismatch (string vs number)
        return appliance.lockers.find(l => l.id == lockerId);
    }

    async function saveReport() {
        showLoader();
        try {
            const response = await fetch(`/api/reports/${username}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: new Date().toISOString(), lockers: generateFullReportData().lockers })
            });
            if (response.ok) {
                isReportSaved = true;
                alert('Report saved successfully!');
                // Clear check progress after successful save
                checkResults = [];
                checkInProgress = false;
                sessionStorage.removeItem('checkResults');
                sessionStorage.removeItem('checkInProgress');
                sessionStorage.removeItem('currentCheckState');
                window.location.href = '/appliance-checks.html';
            } else {
                alert(`Failed to save report: ${(await response.json()).message}`);
            }
        } catch (error) {
            alert('An error occurred while saving the report.');
        } finally {
            hideLoader();
        }
    }

    async function showReportsScreen() {
        const container = getElement('reports-list-container');
        if (!container) return;
        showLoader();
        try {
            const response = await fetch(`/api/reports/${username}`);
            const reports = await response.json();
            container.innerHTML = reports.length === 0 
                ? '<p class="text-center text-gray-500">No past reports found.</p>'
                : reports.map(report => `
                    <div class="bg-gray-100 p-4 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors" data-file-name="${report.fileName}" data-date="${report.date}">
                        <p class="font-bold">${report.date}</p>
                    </div>`).join('');
        } catch (error) {
            alert('Could not load past reports.');
        } finally {
            hideLoader();
        }
    }

    async function showReportDetails(fileName, date) {
        showLoader();
        try {
            const response = await fetch(`/api/report/${username}/${fileName}`);
            const reportData = await response.json();
            const modal = getElement('report-detail-modal');
            if (!modal) return;

            getElement('report-detail-title').textContent = `Report from ${date}`;
            const content = getElement('report-detail-content');
            
            const statusIcons = { present: '●', missing: '●', note: '●', partial: '●', untouched: '●' };
            const statusColors = { present: 'text-green-500', missing: 'text-red-500', note: 'text-amber-500', partial: 'text-purple-500', untouched: 'text-gray-400' };

            content.innerHTML = reportData.lockers?.map(locker => {
                const itemsHtml = locker.shelves.flatMap(s => s.items).map(item => {
                    let html = '';
                    const issue = item.status && item.status !== 'present' && item.status !== 'untouched';
                    if (issue) {
                        html += `<div class="flex items-center py-1"><span class="${statusColors[item.status]}">${statusIcons[item.status]}</span><span class="ml-2">${item.name}</span>${item.note ? `<em class="ml-2 text-gray-500 text-sm"> - "${item.note}"</em>` : ''}</div>`;
                    }
                    if (item.type === 'container' && item.subItems?.some(si => si.status && si.status !== 'present' && si.status !== 'untouched')) {
                        html += '<div class="pl-6 border-l-2 border-gray-300 ml-1">' + item.subItems.filter(si => si.status && si.status !== 'present' && si.status !== 'untouched').map(subItem => 
                            `<div class="flex items-center py-1"><span class="${statusColors[subItem.status]}">${statusIcons[subItem.status]}</span><span class="ml-2">${subItem.name}</span>${subItem.note ? `<em class="ml-2 text-gray-500 text-sm"> - "${subItem.note}"</em>` : ''}</div>`
                        ).join('') + '</div>';
                    }
                    return html;
                }).join('');

                return itemsHtml ? `<div class="border-b pb-2 mb-2">
                    <div class="flex items-center justify-between cursor-pointer p-2 bg-gray-100 rounded-lg" onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <h4 class="text-lg font-semibold">${locker.name}</h4><span class="text-xl">&#9662;</span>
                    </div>
                    <div class="pl-4 pt-2 hidden">${itemsHtml}</div>
                </div>` : '';
            }).join('') || '<p class="text-center text-gray-500">No issues found in this report.</p>';

            modal.classList.remove('hidden');
        } catch (error) {
            alert('Could not load the report details.');
        } finally {
            hideLoader();
        }
    }

    // --- EVENT LISTENERS ---
    function addSafeEventListener(selector, event, handler) {
        const element = typeof selector === 'string' ? getElement(selector) : selector;
        if (element) element.addEventListener(event, handler);
    }

    // Delegate events for dynamically created elements
    function delegateEvent(containerSelector, event, childSelector, handler) {
        const container = getElement(containerSelector);
        if (container) {
            container.addEventListener(event, e => {
                if (e.target.closest(childSelector)) {
                    handler(e, e.target.closest(childSelector));
                }
            });
        }
    }

    // Page Navigation
    addSafeEventListener('start-checks-btn', 'click', startChecks);
    addSafeEventListener('continue-check-btn', 'click', () => window.location.href = '/checks.html');
    addSafeEventListener('view-reports-btn', 'click', () => window.location.href = '/reports.html');
    addSafeEventListener('logout-btn', 'click', () => {
        localStorage.removeItem('username');
        sessionStorage.clear();
        window.location.href = '/login.html';
    });
    addSafeEventListener('back-btn', 'click', () => history.back());
    
    // Appliance Selection Page
    addSafeEventListener('create-new-appliance-btn', 'click', openNewApplianceModal);
    addSafeEventListener('save-new-appliance-btn', 'click', createNewAppliance);
    addSafeEventListener('cancel-create-appliance-btn', 'click', closeNewApplianceModal);
    delegateEvent('appliance-list', 'click', '.appliance-list-item', (e, item) => {
        // Clicks on the delete button should not trigger navigation
        if (e.target.closest('.delete-appliance-btn')) {
            return;
        }
        localStorage.setItem('selectedApplianceId', item.dataset.applianceId);
        window.location.href = '/setup.html';
    });
    delegateEvent('appliance-list', 'click', '.delete-appliance-btn', (e, btn) => {
        const applianceId = btn.closest('.appliance-list-item').dataset.applianceId;
        confirmDeleteAppliance(applianceId);
    });


    delegateEvent('locker-list-container', 'click', '.locker-card', (e, card) => {
        if (e.target.closest('.delete-locker-btn')) {
            confirmDelete('locker', card.dataset.lockerId);
            return;
        }
        if (card.id === 'create-new-locker-btn') {
            nameLockerModal.overlay?.classList.remove('hidden');
        } else {
            openLockerEditor(card.dataset.lockerId);
        }
    });

    // Setup Page
    addSafeEventListener(nameLockerModal.saveBtn, 'click', () => {
        const lockerName = nameLockerModal.input.value.trim();
        if (lockerName) {
            const appliance = getActiveAppliance();
            const newLocker = { id: Date.now(), name: lockerName, shelves: [{ id: Date.now()+1, items:[] }] };
            appliance.lockers.push(newLocker);
            saveData().then(() => {
                nameLockerModal.overlay.classList.add('hidden');
                openLockerEditor(newLocker.id);
            });
        } else {
            nameLockerModal.input.classList.add('border-red-500', 'shake');
            setTimeout(() => nameLockerModal.input.classList.remove('shake'), 820);
        }
    });
    addSafeEventListener(nameLockerModal.cancelBtn, 'click', () => nameLockerModal.overlay.classList.add('hidden'));
    addSafeEventListener(editorUI.addShelfBtn, 'click', addShelf);
    addSafeEventListener(editorUI.lockerName, 'change', e => {
        const locker = findLockerById(currentlyEditing.lockerId);
        if(locker) locker.name = e.target.value;
        saveData();
    });
    delegateEvent('locker-editor-shelves', 'click', '.delete-shelf-btn', (e, btn) => confirmDelete('shelf', parseInt(btn.dataset.shelfId)));
    delegateEvent('locker-editor-shelves', 'click', '.item-editor-box', (e, box) => openItemEditor(parseInt(box.dataset.shelfId), parseInt(box.dataset.itemId)));
    delegateEvent('locker-editor-shelves', 'click', '.add-item-btn-circle', (e, btn) => addItemToShelf(parseInt(btn.dataset.shelfId)));

    // Item Editor Section
    addSafeEventListener(editorSectionUI.saveBtn, 'click', saveItem);
    addSafeEventListener(editorSectionUI.cancelBtn, 'click', closeItemEditor);
    addSafeEventListener(editorSectionUI.deleteBtn, 'click', () => confirmDelete('item', currentlyEditing.itemId, currentlyEditing.parentItemId));
    addSafeEventListener(editorSectionUI.fileInput, 'change', handleImageUpload);

    // Item Editor Modal
    addSafeEventListener(editorModal.saveBtn, 'click', saveItem);
    addSafeEventListener(editorModal.cancelBtn, 'click', closeItemEditor);
    addSafeEventListener(editorModal.deleteBtn, 'click', () => confirmDelete('item', currentlyEditing.itemId, currentlyEditing.parentItemId));
    addSafeEventListener(editorModal.enterContainerBtn, 'click', () => openContainerEditor(currentlyEditing.itemId));
    addSafeEventListener(editorModal.fileInput, 'change', handleImageUpload);

    // Container Editor
    addSafeEventListener(containerEditorUI.backBtn, 'click', () => {
        renderLockerEditor();
        showScreen('lockerEditor');
    });
    addSafeEventListener(containerEditorUI.addSubItemBtn, 'click', addSubItem);
    delegateEvent('container-editor-shelves', 'click', '.item-editor-box', (e, box) => openItemEditor(null, parseInt(box.dataset.itemId), true, parseInt(box.dataset.parentId)));

    // Delete Confirmation
    addSafeEventListener(deleteConfirmModal.cancelBtn, 'click', () => deleteConfirmModal.overlay.classList.add('hidden'));
    addSafeEventListener(deleteConfirmModal.confirmBtn, 'click', executeDelete);

    // Checks Page
    delegateEvent('locker-layout', 'click', '.item-box', (e, box) => selectItemForCheck(parseInt(box.dataset.id), box.dataset.parentId ? parseInt(box.dataset.parentId) : null));
    addSafeEventListener(checkerUI.nextLockerBtn, 'click', handleLockerCompletion);
    addSafeEventListener(checkerUI.backToSummaryBtn, 'click', () => showScreen('summary'));
    addSafeEventListener(checkButtons.present, 'click', () => processCheck('present'));
    addSafeEventListener(checkButtons.missing, 'click', () => processCheck('missing'));
    addSafeEventListener(checkButtons.note, 'click', () => processCheck('note'));
    addSafeEventListener(checkButtons.checkContents, 'click', startContainerCheck);
    addSafeEventListener(checkButtons.containerMissing, 'click', () => processCheck('missing'));
    addSafeEventListener(noteModal.saveBtn, 'click', saveNoteAndProceed);
    
    // Next Locker Page
    addSafeEventListener('go-to-selected-locker-btn', 'click', () => {
        if(nextLockerToStartId) {
            currentCheckState.lockerId = nextLockerToStartId;
            sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
            startLockerCheck(nextLockerToStartId);
        }
    });
    addSafeEventListener('finish-checks-early-btn', 'click', () => showScreen('summary'));

    // Summary Page
    delegateEvent('summary-list-container', 'click', '.recheck-btn', (e, btn) => {
        currentCheckState = { 
            lockerId: parseInt(btn.dataset.lockerId), 
            selectedItemId: parseInt(btn.dataset.itemId), 
            isRechecking: true, 
            isInsideContainer: !!btn.dataset.parentItemId, 
            parentItemId: btn.dataset.parentItemId ? parseInt(btn.dataset.parentItemId) : null
        };
        sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
        showScreen('lockerCheck');
    });
    addSafeEventListener('edit-report-btn', 'click', () => showScreen('nextLockerChoice'));
    addSafeEventListener('save-report-btn', 'click', saveReport);
    addSafeEventListener('exit-summary-btn', 'click', () => {
        if (isReportSaved) {
            window.location.href = '/menu.html';
        } else {
            getElement('exit-confirm-modal')?.classList.remove('hidden');
        }
    });
    addSafeEventListener('cancel-exit-btn', 'click', () => getElement('exit-confirm-modal')?.classList.add('hidden'));
    addSafeEventListener('confirm-exit-anyway-btn', 'click', () => {
        sessionStorage.removeItem('checkInProgress');
        sessionStorage.removeItem('checkResults');
        sessionStorage.removeItem('currentCheckState');
        window.location.href = '/menu.html';
    });
    addSafeEventListener('confirm-save-and-exit-btn', 'click', async () => {
        await saveReport();
        getElement('exit-confirm-modal')?.classList.add('hidden');
        window.location.href = '/appliance-checks.html';
    });

    // Reports Page
    delegateEvent('reports-list-container', 'click', '[data-file-name]', (e, el) => showReportDetails(el.dataset.fileName, el.dataset.date));
    addSafeEventListener('close-report-detail-btn', 'click', () => getElement('report-detail-modal')?.classList.add('hidden'));

    // --- INITIALIZATION ---
    async function initializeApp() {
        const path = window.location.pathname;

        // Disable buttons on menu/appliance-checks page while loading
        if (path.includes('/menu.html') || path.includes('/appliance-checks.html')) {
            const buttons = document.querySelectorAll('button');
            buttons.forEach(b => b.disabled = true);
            await loadData();
            buttons.forEach(b => b.disabled = false);
        } else {
            await loadData();
        }
        
        if (path.includes('/select-appliance.html')) {
            renderApplianceSelection();
        } else if (path.includes('/setup.html')) {
            renderLockerSelection();
            showScreen('selectLocker');
        } else if (path.includes('/checks.html')) {
            if (!checkInProgress) { // If somehow got here without starting a check
                window.location.href = '/menu.html';
                return;
            }
            loadLockerUI();
            showScreen('lockerCheck');
        } else if (path.includes('/reports.html')) {
            showReportsScreen();
        } else if (path.includes('/menu.html') || path.includes('/appliance-checks.html')) {
            updateContinueButton();
        }
    }

    initializeApp();
});