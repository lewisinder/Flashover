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
    let draggedItem = { itemId: null, originalShelfId: null };

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
        backBtn: getElement('back-to-locker-editor-btn'),
        itemEditor: {
            section: getElement('c-item-editor-section'),
            imagePreview: getElement('c-section-image-preview'),
            fileInput: getElement('c-section-file-upload'),
            uploadText: getElement('c-section-image-upload-text'),
            nameInput: getElement('c-section-item-name-input'),
            descInput: getElement('c-section-item-desc-input'),
            saveBtn: getElement('c-section-save-item-btn'),
            cancelBtn: getElement('c-section-cancel-edit-btn'),
        }
    };

    const editorSectionUI = {
        section: getElement('item-editor-section'),
        imagePreview: getElement('section-image-preview'),
        fileInput: getElement('section-file-upload'),
        nameInput: getElement('section-item-name-input'),
        descInput: getElement('section-item-desc-input'),
        typeSelect: getElement('section-item-type-select'),
        enterContainerBtn: getElement('section-enter-container-btn'),
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

    // -------------------------------------------------------------------
    // SUB-SECTION: APPLIANCE SELECTION
    // -------------------------------------------------------------------
    let currentlyEditingApplianceId = null;

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
                    <button class="edit-appliance-btn p-2 mr-2">
                        <img src="/design_assets/black pencil icon.png" alt="Edit" class="h-6 w-6">
                    </button>
                    <button class="delete-appliance-btn p-2">
                        <img src="/design_assets/No Icon.png" alt="Delete" class="h-6 w-6">
                    </button>
                `;
                container.appendChild(applianceItemDiv);
            });
        }
    }

    function openApplianceModal(applianceId = null) {
        const modal = getElement('appliance-modal');
        const title = getElement('appliance-modal-title');
        const input = getElement('appliance-name-input');
        const saveBtn = getElement('save-appliance-btn');

        if (modal) {
            currentlyEditingApplianceId = applianceId;
            if (applianceId) {
                const appliance = userAppData.appliances.find(a => a.id === applianceId);
                title.textContent = 'Edit Appliance Name';
                input.value = appliance.name;
                saveBtn.textContent = 'Save';
            } else {
                title.textContent = 'Create New Appliance';
                input.value = '';
                saveBtn.textContent = 'Create';
            }
            modal.classList.remove('hidden');
        }
    }

    function closeApplianceModal() {
        const modal = getElement('appliance-modal');
        if (modal) modal.classList.add('hidden');
        currentlyEditingApplianceId = null;
    }

    function saveAppliance() {
        const nameInput = getElement('appliance-name-input');
        const name = nameInput.value.trim();
        if (!name) {
            nameInput.classList.add('border-red-500', 'shake');
            setTimeout(() => nameInput.classList.remove('shake'), 820);
            return;
        }

        if (currentlyEditingApplianceId) {
            // Editing existing appliance
            const appliance = userAppData.appliances.find(a => a.id === currentlyEditingApplianceId);
            if (appliance) {
                appliance.name = name;
            }
        } else {
            // Creating new appliance
            const newAppliance = {
                id: `appliance-${Date.now()}`,
                name: name,
                lockers: []
            };
            if (!userAppData.appliances) userAppData.appliances = [];
            userAppData.appliances.push(newAppliance);
        }
        
        saveData().then(() => {
            renderApplianceSelection();
            closeApplianceModal();
        });
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

    function renderApplianceSelectionForCheck() {
        const container = getElement('appliance-list-for-check');
        if (!container) return;
        container.innerHTML = '';

        if (!userAppData.appliances || userAppData.appliances.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 mt-8">No appliances found. Go to Setup to create one.</p>`;
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
                container.appendChild(applianceItemDiv);
            });
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
        locker.shelves.forEach((shelf, index) => {
            const shelfWrapper = document.createElement('div');
            shelfWrapper.className = 'flex-1 flex flex-col';

            shelfWrapper.innerHTML = `
                <div class="shelf-editor-container" data-shelf-id="${shelf.id}">
                    <button data-shelf-id="${shelf.id}" class="delete-shelf-btn absolute top-[-0.5rem] right-[-0.5rem] bg-red-action-2 text-white rounded-full h-6 w-6 flex items-center justify-center z-10">&times;</button>
                    <div class="shelf-content">
                        ${shelf.items.map(item => `
                            <div class="item-editor-box" draggable="true" data-shelf-id="${shelf.id}" data-item-id="${item.id}">
                                <button class="delete-item-btn absolute top-1 right-1 bg-red-action-2 text-white rounded-full h-6 w-6 flex items-center justify-center z-10">&times;</button>
                                ${item.img ? `<img src="${item.img}" alt="${item.name}" class="w-full h-full object-cover">` : ''}
                                <div class="item-name-overlay">${item.name || 'New Item'}</div>
                            </div>
                        `).join('')}
                        <div class="add-item-btn-circle" data-shelf-id="${shelf.id}">+</div>
                    </div>
                </div>
                <h3 class="text-white text-center font-bold text-sm mt-1">Shelf ${index + 1}</h3>
            `;
            editorUI.shelvesContainer.appendChild(shelfWrapper);
        });
    }

    function openItemEditor(shelfId, itemId, isSubItem = false, parentItemId = null) {
        currentlyEditing = { ...currentlyEditing, shelfId, itemId, isSubItem, parentItemId };
        const item = findItemById(itemId, parentItemId);
        
        const editor = isSubItem ? containerEditorUI.itemEditor : editorSectionUI;
        if (!editor.section || !item) return;

        editor.section.style.visibility = 'visible';
        editor.section.style.opacity = 1;

        document.querySelectorAll('.item-editor-box.editing').forEach(b => b.classList.remove('editing'));
        const activeBox = document.querySelector(`.item-editor-box[data-item-id='${item.id}']`);
        if (activeBox) activeBox.classList.add('editing');

        editor.nameInput.value = item.name || '';
        editor.descInput.value = item.desc || '';
        
        if (!isSubItem) {
            editor.typeSelect.value = item.type || 'item';
            editor.enterContainerBtn.classList.toggle('hidden', item.type !== 'container');
        }
        
        const imagePreview = editor.imagePreview;
        const imageContainer = imagePreview.parentElement;
        const textSpans = imageContainer.querySelectorAll('span');

        if (item.img) {
            tempImageSrc = item.img;
            imagePreview.src = tempImageSrc;
            imagePreview.classList.remove('hidden');
            textSpans.forEach(s => s.classList.add('hidden'));
        } else {
            tempImageSrc = '';
            imagePreview.src = '';
            imagePreview.classList.add('hidden');
            textSpans.forEach(s => s.classList.remove('hidden'));
        }
    }

    function closeItemEditor() {
        const editor = currentlyEditing.isSubItem ? containerEditorUI.itemEditor : editorSectionUI;
        if (!editor.section) return;

        editor.section.style.visibility = 'hidden';
        editor.section.style.opacity = 0;

        document.querySelectorAll('.item-editor-box.editing').forEach(b => b.classList.remove('editing'));

        // Reset image preview area
        const imagePreview = editor.imagePreview;
        const imageContainer = imagePreview.parentElement;
        const textSpans = imageContainer.querySelectorAll('span');
        imagePreview.src = '';
        imagePreview.classList.add('hidden');
        textSpans.forEach(s => s.classList.remove('hidden'));

        currentlyEditing.itemId = null;
        currentlyEditing.isSubItem = false;
        currentlyEditing.isNewItem = false;
        if (editor.fileInput) editor.fileInput.value = '';
        tempImageSrc = null;
    }

    function saveItem(andThen) {
        if (!currentlyEditing.itemId) return Promise.resolve();
        const item = findItemById(currentlyEditing.itemId, currentlyEditing.parentItemId);
        const editor = currentlyEditing.isSubItem ? containerEditorUI.itemEditor : editorSectionUI;
        
        item.name = editor.nameInput.value;
        item.desc = editor.descInput.value;
        item.img = tempImageSrc;
        
        if (!currentlyEditing.isSubItem) {
            item.type = editor.typeSelect.value;
            if (item.type === 'container' && !item.subItems) {
                item.subItems = [];
            }
        }

        return saveData().then(() => {
            if (andThen) {
                andThen();
            } else {
                if (currentlyEditing.isSubItem) {
                    renderContainerEditor();
                } else {
                    renderLockerEditor();
                }
                closeItemEditor();
            }
        });
    }

    function confirmDelete(type, id, parentId = null, shelfId = null, lockerId = null) {
        itemToDelete = { type, id, parentId, shelfId, lockerId };
        let title = `Delete ${type}?`;
        let text = "This action cannot be undone.";

        if (type === 'locker') {
            const appliance = getActiveAppliance();
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
        const { type, id, parentId, shelfId, lockerId } = itemToDelete;
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
                const locker = findLockerById(lockerId);
                const shelf = locker.shelves.find(s => s.id == shelfId);
                if (shelf) {
                    shelf.items = shelf.items.filter(i => i.id !== id);
                    promise = saveData().then(renderLockerEditor);
                }
            }
            if (currentlyEditing.itemId === id) {
                closeItemEditor();
            }
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
            // Use == to handle potential type mismatch (string vs number)
            const shelf = locker.shelves.find(s => s.id == shelfId);
            if (shelf) return shelf;
        }
        return null;
    }

    async function compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convert canvas to blob
                    canvas.toBlob(blob => {
                        resolve(blob);
                    }, 'image/webp', 0.8); // Use WebP format with 80% quality
                };
                img.onerror = reject;
                img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const editor = currentlyEditing.isSubItem ? containerEditorUI.itemEditor : editorSectionUI;
        const saveBtn = editor.saveBtn;
        const imagePreview = editor.imagePreview;
        const imageContainer = imagePreview.parentElement;
        const textSpans = imageContainer.querySelectorAll('span');

        // Disable save button and show loader
        saveBtn.disabled = true;
        saveBtn.textContent = 'Uploading...';
        showLoader();

        try {
            const compressedBlob = await compressImage(file);
            
            // Show local preview immediately
            const previewUrl = URL.createObjectURL(compressedBlob);
            imagePreview.src = previewUrl;
            imagePreview.classList.remove('hidden');
            textSpans.forEach(s => s.classList.add('hidden'));

            const formData = new FormData();
            formData.append('itemImage', compressedBlob, 'image.webp');
            const item = findItemById(currentlyEditing.itemId, currentlyEditing.parentItemId);
            if (item && item.img && item.img.startsWith('/uploads/')) {
                formData.append('oldImagePath', item.img);
            }

            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.filePath) {
                tempImageSrc = data.filePath;
                imagePreview.src = tempImageSrc; // Update with the final server path
            } else {
                throw new Error(data.message || 'Image upload failed.');
            }

        } catch (error) {
            console.error("Image upload error:", error);
            alert('An error occurred during image upload.');
            // Revert UI on failure
            imagePreview.src = tempImageSrc || '';
            if (!tempImageSrc) {
                imagePreview.classList.add('hidden');
                textSpans.forEach(s => s.classList.remove('hidden'));
            }
        } finally {
            // Re-enable save button
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            hideLoader();
        }
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
        const locker = appliance.lockers.find(l => l.id == currentlyEditing.lockerId);
        const newShelfName = `Shelf ${locker.shelves.length + 1}`;
        locker.shelves.push({ id: Date.now(), name: newShelfName, items: [] });
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
                <div class="grid grid-cols-3 gap-4">
                    ${parentItem.subItems.map(subItem => `
                        <div class="item-editor-box aspect-square" data-item-id="${subItem.id}" data-parent-id="${parentItem.id}">
                            <button class="delete-item-btn absolute top-1 right-1 bg-red-action-2 text-white rounded-full h-6 w-6 flex items-center justify-center z-10">&times;</button>
                            <img src="${subItem.img || 'https://placehold.co/60x60/d1d5db/4b5563?text=Item'}" alt="${subItem.name}" class="w-full h-full object-contain">
                            <div class="item-name-overlay">${subItem.name || 'New Item'}</div>
                        </div>
                    `).join('')}
                    <div class="add-item-btn-circle" id="add-sub-item-btn">+</div>
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

        // Update titles
        const headerTitle = getElement('header-title');
        if (headerTitle) headerTitle.textContent = locker.name;
        const lockerNameTitle = getElement('locker-editor-name');
        if (lockerNameTitle) lockerNameTitle.textContent = locker.name;

        checkerUI.lockerLayout.innerHTML = ''; // Clear previous content
        locker.shelves.forEach((shelf, index) => {
            const shelfWrapper = document.createElement('div');
            shelfWrapper.className = 'flex-1 flex flex-col min-h-0';

            shelfWrapper.innerHTML = `
                <div class="shelf-container" style="background-color: #FFFFFF; border-radius: 0.75rem; padding: 0.75rem; box-shadow: inset 0 4px 8px 3px rgba(0,0,0,0.25);">
                    <div class="shelf-items-grid">
                        ${shelf.items.map(item => {
                            const result = checkResults.find(r => r.itemId === item.id);
                            const statusClass = result ? `status-${result.status}` : '';
                            
                            return `
                                <div class="item-box ${statusClass}" data-id="${item.id}">
                                    <div class="item-name-overlay">${item.name}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                <h3 class="text-white text-center font-bold text-sm mt-1">Shelf ${index + 1}</h3>
            `;
            checkerUI.lockerLayout.appendChild(shelfWrapper);
        });
        
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
            
            document.querySelectorAll('.item-box').forEach(b => b.classList.remove('is-active'));
            const activeBox = document.querySelector(`.item-box[data-id='${item.id}']`);
            if (activeBox) {
                activeBox.classList.add('is-active');
            }

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
        
        const headerTitle = getElement('header-title');
        if (headerTitle) headerTitle.textContent = `Container: ${container.name}`;

        checkerUI.lockerLayout.innerHTML = `
            <div class="shelf-container" style="background-color: #FFFFFF; border-radius: 0.75rem; padding: 0.75rem; box-shadow: inset 0 4px 8px 3px rgba(0,0,0,0.25);">
                <div class="shelf-items-grid">
                    ${container.subItems.map(item => {
                        const result = checkResults.find(r => r.itemId === item.id);
                        const statusClass = result ? `status-${result.status}` : '';
                        return `
                            <div class="item-box ${statusClass}" data-id="${item.id}" data-parent-id="${container.id}">
                                <div class="item-name-overlay">${item.name}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <h3 class="text-white text-center font-bold text-sm mt-1">Container Contents</h3>
        `;

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

    function updateItemBoxStatus(itemId, status) {
        const itemBox = document.querySelector(`.item-box[data-id='${itemId}']`);
        if (!itemBox) return;

        // Remove all existing status classes from the box itself
        itemBox.classList.remove('status-present', 'status-missing', 'status-note', 'status-partial');

        // Add the new status class if a status is provided
        if (status) {
            itemBox.classList.add(`status-${status}`);
        }
    }

    function processCheck(status) {
        if (!currentCheckState.selectedItemId) return;
        const item = findItemById(currentCheckState.selectedItemId, currentCheckState.parentItemId);
        const locker = findLockerById(currentCheckState.lockerId);

        // Special handling for marking a container as missing without checking its contents
        if (!currentCheckState.isInsideContainer && item.type === 'container' && status === 'missing') {
             const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: 'missing', note: '' };
             const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
             if (resultIndex > -1) checkResults[resultIndex] = result;
             else checkResults.push(result);
             
             updateItemBoxStatus(item.id, 'missing');
             sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
             
             // After marking container missing, find the next item in the locker
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            if (nextUncheckedItem) {
                selectItemForCheck(nextUncheckedItem.id);
            } else {
                checkIfLockerIsComplete(); // If that was the last item, update UI
            }
             return;
        }

        // Handle note-taking
        if (status === 'note') {
            noteModal.title.textContent = `Add Note for ${item.name}`;
            const existingResult = checkResults.find(r => r.itemId === item.id);
            noteModal.input.value = existingResult?.note || '';
            noteModal.overlay.classList.remove('hidden');
            return;
        }
        
        // Save the result for the current item
        const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: status, note: '', parentItemId: currentCheckState.parentItemId };
        const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
        if (resultIndex > -1) checkResults[resultIndex] = result;
        else checkResults.push(result);
        
        updateItemBoxStatus(item.id, status);
        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));

        // If we are re-checking from the summary screen, don't auto-advance.
        if (currentCheckState.isRechecking) return;

        // --- Auto-advance logic ---
        let nextItemToSelect = null;

        if (currentCheckState.isInsideContainer) {
            const parentItem = findItemById(currentCheckState.parentItemId);
            nextItemToSelect = parentItem.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
            if (!nextItemToSelect) {
                checkIfContainerIsComplete(); // All sub-items are checked, show "Finish" button
            }
        } else {
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            nextItemToSelect = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            if (!nextItemToSelect) {
                checkIfLockerIsComplete(); // All locker items are checked, show "Next Locker" button
            }
        }

        if (nextItemToSelect) {
            selectItemForCheck(nextItemToSelect.id, currentCheckState.parentItemId);
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
        
        updateItemBoxStatus(item.id, 'note');
        noteModal.overlay.classList.add('hidden');
        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));

        // After saving a note, run the same auto-advance logic as processCheck
        if (currentCheckState.isRechecking) return;

        let nextItemToSelect = null;
        if (currentCheckState.isInsideContainer) {
            const parentItem = findItemById(currentCheckState.parentItemId);
            nextItemToSelect = parentItem.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
            if (!nextItemToSelect) checkIfContainerIsComplete();
        } else {
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            nextItemToSelect = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            if (!nextItemToSelect) checkIfLockerIsComplete();
        }

        if (nextItemToSelect) {
            selectItemForCheck(nextItemToSelect.id, currentCheckState.parentItemId);
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

        container.innerHTML = '';
        const allCheckedItems = checkResults;

        if (allCheckedItems.length === 0) {
            container.innerHTML = `<div class="text-center p-8 bg-blue-100 text-blue-800 rounded-lg"><h3 class="text-2xl font-bold">No Items Checked</h3><p>Start a check to see a summary here.</p></div>`;
            return;
        }

        // 1. Group results by locker
        const resultsByLocker = allCheckedItems.reduce((acc, item) => {
            // Only group top-level items. Sub-items will be handled within their parent.
            if (!item.parentItemId) {
                if (!acc[item.lockerId]) {
                    acc[item.lockerId] = { name: item.lockerName, items: [] };
                }
                acc[item.lockerId].items.push(item);
            }
            return acc;
        }, {});

        const statusStyles = {
            present: { icon: '●', color: 'text-green-action-1' },
            missing: { icon: '●', color: 'text-red-action-1' },
            note: { icon: '●', color: 'text-orange-action-1' },
            partial: { icon: '●', color: 'text-purple-500' },
            untouched: { icon: '○', color: 'text-gray-400' }
        };

        // 2. Build HTML for each locker
        let finalHtml = '';
        for (const lockerId in resultsByLocker) {
            const locker = resultsByLocker[lockerId];
            
            finalHtml += `
                <div class="bg-blue rounded-lg p-4 mb-4">
                    <h3 class="text-white text-xl font-bold uppercase text-center mb-3">${locker.name}</h3>
                    <div class="space-y-2">
            `;

            locker.items.forEach(item => {
                const style = statusStyles[item.status] || statusStyles.untouched;
                
                finalHtml += `
                    <div style="background-color: #EDEAE5;" class="rounded p-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center">
                                <span class="${style.color} mr-3 text-2xl">${style.icon}</span>
                                <span class="font-semibold">${item.itemName}</span>
                            </div>
                            <button data-locker-id="${item.lockerId}" data-item-id="${item.itemId}" class="recheck-btn bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded-full">Re-check</button>
                        </div>
                `;

                // If item is a container, render its sub-items
                const parentItem = findItemById(item.itemId);
                if (parentItem && parentItem.type === 'container') {
                    const subItems = allCheckedItems.filter(r => r.parentItemId === item.itemId);
                    if (subItems.length > 0) {
                        finalHtml += `<div class="ml-6 mt-2 space-y-1">`;
                        subItems.forEach(subItem => {
                            const subStyle = statusStyles[subItem.status] || statusStyles.untouched;
                            finalHtml += `
                                <div class="bg-white rounded p-2 shadow-md flex items-center justify-between">
                                    <div class="flex items-center">
                                        <span class="${subStyle.color} mr-3 text-xl">${subStyle.icon}</span>
                                        <span>${subItem.itemName}</span>
                                    </div>
                                    <button data-locker-id="${subItem.lockerId}" data-item-id="${subItem.itemId}" data-parent-item-id="${subItem.parentItemId}" class="recheck-btn bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded-full">Re-check</button>
                                </div>
                            `;
                             if (subItem.note) {
                                finalHtml += `<div class="pl-8 text-sm text-gray-600"><em>Note: ${subItem.note}</em></div>`;
                            }
                        });
                        finalHtml += `</div>`;
                    }
                }
                
                // Render note for the main item
                if (item.note) {
                    finalHtml += `<div class="ml-9 mt-1 text-sm text-gray-600"><em>Note: ${item.note}</em></div>`;
                }

                finalHtml += `</div>`; // Close item container
            });

            finalHtml += `</div></div>`; // Close locker container
        }

        container.innerHTML = finalHtml;
    }

    function findLockerById(lockerId) {
        const appliance = getActiveAppliance();
        if (!appliance) return null;
        // Use == to handle potential type mismatch (string vs number)
        return appliance.lockers.find(l => l.id == lockerId);
    }

    async function saveReport() {
        showLoader();
        const appliance = getActiveAppliance();
        if (!appliance) {
            alert("Could not find active appliance.");
            hideLoader();
            return;
        }
        try {
            const reportPayload = {
                date: new Date().toISOString(),
                applianceId: appliance.id,
                applianceName: appliance.name, // Storing appliance name in the report
                lockers: generateFullReportData().lockers
            };

            const response = await fetch(`/api/reports/${username}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reportPayload)
            });

            if (response.ok) {
                isReportSaved = true;
                alert('Report saved successfully!');
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
            if (reports.length === 0) {
                container.innerHTML = '<p class="text-center text-gray-500">No past reports found.</p>';
                return;
            }
            
            // Fetch full details for each report to get the appliance name
            const reportDetailsPromises = reports.map(r => fetch(`/api/report/${username}/${r.fileName}`).then(res => res.json()));
            const detailedReports = await Promise.all(reportDetailsPromises);

            container.innerHTML = detailedReports.map((report, index) => {
                const originalReport = reports[index];
                const applianceName = report.applianceName || 'Unknown Appliance';
                const reportDate = new Date(report.date).toLocaleString();
                return `
                    <div class="report-item-card" data-file-name="${originalReport.fileName}" data-date="${reportDate}">
                        <h3 class="text-xl font-bold text-blue">${applianceName}</h3>
                        <p class="text-gray-600">${reportDate}</p>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Could not load past reports:', error);
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

            getElement('report-detail-title').textContent = `Report for ${reportData.applianceName || ''} - ${date}`;
            const content = getElement('report-detail-content');
            
            const statusStyles = {
                present: { icon: '●', color: 'text-green-action-1' },
                missing: { icon: '●', color: 'text-red-action-1' },
                note: { icon: '●', color: 'text-orange-action-1' },
                partial: { icon: '●', color: 'text-purple-500' },
                untouched: { icon: '○', color: 'text-gray-400' }
            };

            let finalHtml = '';
            reportData.lockers.forEach(locker => {
                finalHtml += `
                    <div class="bg-blue rounded-lg p-4 mb-4">
                        <h3 class="text-white text-xl font-bold uppercase text-center mb-3">${locker.name}</h3>
                        <div class="space-y-2">
                `;

                locker.shelves.flatMap(s => s.items).forEach(item => {
                    const style = statusStyles[item.status] || statusStyles.untouched;
                    finalHtml += `
                        <div style="background-color: #EDEAE5;" class="rounded p-3">
                            <div class="flex items-center">
                                <span class="${style.color} mr-3 text-2xl">${style.icon}</span>
                                <span class="font-semibold">${item.name}</span>
                            </div>`;

                    if (item.note) {
                        finalHtml += `<div class="ml-9 mt-1 text-sm text-gray-600"><em>Note: ${item.note}</em></div>`;
                    }

                    if (item.type === 'container' && item.subItems) {
                        finalHtml += `<div class="ml-6 mt-2 space-y-1">`;
                        item.subItems.forEach(subItem => {
                            const subStyle = statusStyles[subItem.status] || statusStyles.untouched;
                            finalHtml += `
                                <div class="bg-white rounded p-2 shadow-md flex items-center">
                                    <span class="${subStyle.color} mr-3 text-xl">${subStyle.icon}</span>
                                    <span>${subItem.name}</span>
                                </div>`;
                            if (subItem.note) {
                                finalHtml += `<div class="pl-8 text-sm text-gray-600"><em>Note: ${subItem.note}</em></div>`;
                            }
                        });
                        finalHtml += `</div>`;
                    }
                    finalHtml += `</div>`;
                });
                finalHtml += `</div></div>`;
            });

            content.innerHTML = finalHtml || '<p class="text-center text-gray-500">No issues found in this report.</p>';
            modal.classList.remove('hidden');

        } catch (error) {
            console.error('Error loading report details:', error);
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
    addSafeEventListener('start-checks-btn', 'click', () => {
        window.location.href = '/select-appliance-for-check.html';
    });
    addSafeEventListener('view-reports-btn', 'click', () => window.location.href = '/reports.html');
    addSafeEventListener('logout-btn', 'click', () => {
        localStorage.removeItem('username');
        sessionStorage.clear();
        window.location.href = '/login.html';
    });
    addSafeEventListener('back-btn', 'click', () => {
        const path = window.location.pathname;

        // --- Main Navigation Hierarchy ---
        if (path.includes('/menu.html')) {
            window.location.href = '/welcome.html';
            return;
        }
        if (path.includes('/appliance-checks.html')) {
            window.location.href = '/menu.html';
            return;
        }
        if (path.includes('/select-appliance.html') || path.includes('/select-appliance-for-check.html') || path.includes('/reports.html')) {
            window.location.href = '/appliance-checks.html';
            return;
        }

        // --- Complex In-Page Navigation ---

        // Back button logic for checks.html
        if (path.includes('/checks.html')) {
            if (screens.summary && screens.summary.classList.contains('active')) {
                 showScreen('nextLockerChoice');
            } else if (screens.nextLockerChoice && screens.nextLockerChoice.classList.contains('active')) {
                loadLockerUI();
                showScreen('lockerCheck');
            } else {
                // If at the top level of a check, confirm before leaving
                const confirmExit = confirm("Are you sure you want to exit? Progress for the current check will be deleted.");
                if (confirmExit) {
                    window.location.href = '/appliance-checks.html';
                }
            }
            return;
        }

        // Back button logic for setup.html
        if (path.includes('/setup.html')) {
             if (screens.containerEditor && screens.containerEditor.classList.contains('active')) {
                closeItemEditor();
                renderLockerEditor();
                showScreen('lockerEditor');
            } else if (screens.lockerEditor && screens.lockerEditor.classList.contains('active')) {
                const locker = findLockerById(currentlyEditing.lockerId);
                const lockerNameInput = getElement('locker-editor-name');
                if (locker && lockerNameInput && locker.name !== lockerNameInput.value) {
                    locker.name = lockerNameInput.value;
                    saveData(); 
                }
                closeItemEditor();
                renderLockerSelection();
                showScreen('selectLocker');
            } else {
                 window.location.href = '/select-appliance.html';
            }
            return;
        }

        // Fallback for any other page
        history.back();
    });
    
    // Appliance Selection Page
    addSafeEventListener('create-new-appliance-btn', 'click', () => openApplianceModal());
    addSafeEventListener('save-appliance-btn', 'click', saveAppliance);
    addSafeEventListener('cancel-appliance-btn', 'click', closeApplianceModal);
    delegateEvent('appliance-list', 'click', '.appliance-list-item', (e, item) => {
        // Clicks on buttons should not trigger navigation
        if (e.target.closest('button')) {
            return;
        }
        localStorage.setItem('selectedApplianceId', item.dataset.applianceId);
        window.location.href = '/setup.html';
    });
    delegateEvent('appliance-list', 'click', '.edit-appliance-btn', (e, btn) => {
        const applianceId = btn.closest('.appliance-list-item').dataset.applianceId;
        openApplianceModal(applianceId);
    });
    delegateEvent('appliance-list', 'click', '.delete-appliance-btn', (e, btn) => {
        const applianceId = btn.closest('.appliance-list-item').dataset.applianceId;
        confirmDeleteAppliance(applianceId);
    });

    delegateEvent('appliance-list-for-check', 'click', '.start-check-btn', (e, btn) => {
        const applianceId = btn.closest('.appliance-list-item').dataset.applianceId;
        localStorage.setItem('selectedApplianceId', applianceId);
        startChecks();
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
    addSafeEventListener('edit-locker-name-icon', 'click', () => {
        editorUI.lockerName.focus();
    });
    delegateEvent('locker-editor-shelves', 'click', '.delete-shelf-btn', (e, btn) => confirmDelete('shelf', parseInt(btn.dataset.shelfId), null, null, currentlyEditing.lockerId));
    delegateEvent('locker-editor-shelves', 'click', '.item-editor-box', (e, box) => {
        if (e.target.closest('.delete-item-btn')) {
            // Pass the currently editing locker's ID to the confirmation
            confirmDelete('item', parseInt(box.dataset.itemId), null, parseInt(box.dataset.shelfId), currentlyEditing.lockerId);
            return;
        }
        openItemEditor(parseInt(box.dataset.shelfId), parseInt(box.dataset.itemId))
    });
    delegateEvent('locker-editor-shelves', 'click', '.add-item-btn-circle', (e, btn) => addItemToShelf(parseInt(btn.dataset.shelfId)));

    // Drag and Drop Event Listeners
    delegateEvent('locker-editor-shelves', 'dragstart', '.item-editor-box', (e, box) => {
        draggedItem = {
            itemId: parseInt(box.dataset.itemId),
            originalShelfId: parseInt(box.dataset.shelfId)
        };
        // Add a class to the dragged item for visual feedback
        setTimeout(() => box.classList.add('opacity-50'), 0);
    });

    delegateEvent('locker-editor-shelves', 'dragend', '.item-editor-box', (e, box) => {
        box.classList.remove('opacity-50');
    });

    delegateEvent('locker-editor-shelves', 'dragover', '.shelf-editor-container', (e, shelf) => {
        e.preventDefault(); // Necessary to allow dropping
        shelf.classList.add('bg-blue-200');
    });

    delegateEvent('locker-editor-shelves', 'dragleave', '.shelf-editor-container', (e, shelf) => {
        shelf.classList.remove('bg-blue-200');
    });

    delegateEvent('locker-editor-shelves', 'drop', '.shelf-editor-container', (e, shelf) => {
        e.preventDefault();
        shelf.classList.remove('bg-blue-200');
        const newShelfId = parseInt(shelf.dataset.shelfId);

        if (draggedItem.originalShelfId !== newShelfId) {
            const locker = findLockerById(currentlyEditing.lockerId);
            const originalShelf = locker.shelves.find(s => s.id === draggedItem.originalShelfId);
            const newShelf = locker.shelves.find(s => s.id === newShelfId);
            const itemIndex = originalShelf.items.findIndex(i => i.id === draggedItem.itemId);
            const [itemToMove] = originalShelf.items.splice(itemIndex, 1);

            newShelf.items.push(itemToMove);

            saveData().then(() => {
                renderLockerEditor();
            });
        }
    });

    // Touch Drag and Drop Event Listeners
    let touchDraggedItem = null;
    let touchDragGhost = null;

    delegateEvent('locker-editor-shelves', 'touchstart', '.item-editor-box', (e, box) => {
        // Don't drag if a button was clicked
        if (e.target.closest('button')) return;
        
        e.preventDefault(); // Prevent text selection/scrolling

        const rect = box.getBoundingClientRect();
        touchDraggedItem = {
            itemId: parseInt(box.dataset.itemId),
            originalShelfId: parseInt(box.dataset.shelfId),
            element: box
        };

        touchDragGhost = box.cloneNode(true);
        touchDragGhost.style.position = 'absolute';
        touchDragGhost.style.zIndex = '1000';
        touchDragGhost.style.width = `${rect.width}px`;
        touchDragGhost.style.height = `${rect.height}px`;
        touchDragGhost.style.left = `${rect.left}px`;
        touchDragGhost.style.top = `${rect.top}px`;
        touchDragGhost.style.opacity = '0.8';
        document.body.appendChild(touchDragGhost);

        box.classList.add('opacity-50');
    });

    document.addEventListener('touchmove', (e) => {
        if (!touchDraggedItem) return;
        e.preventDefault();

        const touch = e.touches[0];
        touchDragGhost.style.left = `${touch.clientX - touchDragGhost.offsetWidth / 2}px`;
        touchDragGhost.style.top = `${touch.clientY - touchDragGhost.offsetHeight / 2}px`;

        const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
        const shelfContainer = targetElement ? targetElement.closest('.shelf-editor-container') : null;

        document.querySelectorAll('.shelf-editor-container').forEach(s => s.classList.remove('bg-blue-200'));
        if (shelfContainer) {
            shelfContainer.classList.add('bg-blue-200');
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!touchDraggedItem) return;

        document.querySelectorAll('.shelf-editor-container').forEach(s => s.classList.remove('bg-blue-200'));
        
        const touch = e.changedTouches[0];
        const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
        const shelfContainer = targetElement ? targetElement.closest('.shelf-editor-container') : null;

        if (shelfContainer) {
            const newShelfId = parseInt(shelfContainer.dataset.shelfId);
            if (touchDraggedItem.originalShelfId !== newShelfId) {
                const locker = findLockerById(currentlyEditing.lockerId);
                const originalShelf = locker.shelves.find(s => s.id === touchDraggedItem.originalShelfId);
                const newShelf = locker.shelves.find(s => s.id === newShelfId);
                const itemIndex = originalShelf.items.findIndex(i => i.id === touchDraggedItem.itemId);
                
                if (itemIndex > -1) {
                    const [itemToMove] = originalShelf.items.splice(itemIndex, 1);
                    newShelf.items.push(itemToMove);
                    saveData().then(renderLockerEditor);
                }
            }
        }

        touchDraggedItem.element.classList.remove('opacity-50');
        document.body.removeChild(touchDragGhost);
        touchDraggedItem = null;
        touchDragGhost = null;
    });

    // Item Editor Section
    addSafeEventListener(editorSectionUI.saveBtn, 'click', () => saveItem());
    addSafeEventListener(editorSectionUI.cancelBtn, 'click', closeItemEditor);
    addSafeEventListener(editorSectionUI.fileInput, 'change', handleImageUpload);
    addSafeEventListener(editorSectionUI.typeSelect, 'change', e => {
        editorSectionUI.enterContainerBtn.classList.toggle('hidden', e.target.value !== 'container');
    });
    addSafeEventListener(editorSectionUI.enterContainerBtn, 'click', () => {
        saveItem(() => openContainerEditor(currentlyEditing.itemId));
    });

    // Item Editor Modal
    addSafeEventListener(editorModal.saveBtn, 'click', () => saveItem());
    addSafeEventListener(editorModal.cancelBtn, 'click', closeItemEditor);
    addSafeEventListener(editorModal.deleteBtn, 'click', () => confirmDelete('item', currentlyEditing.itemId, currentlyEditing.parentItemId));
    addSafeEventListener(editorModal.enterContainerBtn, 'click', () => {
        saveItem(() => openContainerEditor(currentlyEditing.itemId));
    });
    addSafeEventListener(editorModal.fileInput, 'change', handleImageUpload);

    // Container Editor
    addSafeEventListener(containerEditorUI.backBtn, 'click', () => {
        renderLockerEditor();
        showScreen('lockerEditor');
    });
    delegateEvent('container-editor-shelves', 'click', '#add-sub-item-btn', addSubItem);
    delegateEvent('container-editor-shelves', 'click', '.item-editor-box', (e, box) => {
        if (e.target.closest('.delete-item-btn')) {
            confirmDelete('item', parseInt(box.dataset.itemId), parseInt(box.dataset.parentId));
            return;
        }
        openItemEditor(null, parseInt(box.dataset.itemId), true, parseInt(box.dataset.parentId));
    });
    addSafeEventListener(containerEditorUI.itemEditor.saveBtn, 'click', () => saveItem());
    addSafeEventListener(containerEditorUI.itemEditor.cancelBtn, 'click', closeItemEditor);
    addSafeEventListener(containerEditorUI.itemEditor.fileInput, 'change', handleImageUpload);

    // Delete Confirmation
    addSafeEventListener(deleteConfirmModal.cancelBtn, 'click', () => deleteConfirmModal.overlay.classList.add('hidden'));
    addSafeEventListener(deleteConfirmModal.confirmBtn, 'click', executeDelete);

    // Checks Page
    addSafeEventListener('go-to-locker-status-btn', 'click', handleLockerCompletion);
    delegateEvent('locker-layout', 'click', '.item-box', (e, box) => selectItemForCheck(parseInt(box.dataset.id), box.dataset.parentId ? parseInt(box.dataset.parentId) : null));
    addSafeEventListener(checkerUI.nextLockerBtn, 'click', handleLockerCompletion);
    addSafeEventListener(checkerUI.backToSummaryBtn, 'click', () => {
        renderSummaryScreen();
        showScreen('summary');
    });
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
            loadLockerUI();
            showScreen('lockerCheck');
        }
    });
    addSafeEventListener('finish-checks-early-btn', 'click', () => {
        renderSummaryScreen();
        showScreen('summary');
    });

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
        loadLockerUI();
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
        const applianceId = localStorage.getItem('selectedApplianceId');
        // Re-initialize state from sessionStorage every time the app starts or the page is shown.
        checkResults = JSON.parse(sessionStorage.getItem('checkResults')) || [];
        currentCheckState = JSON.parse(sessionStorage.getItem('currentCheckState')) || { lockerId: null, selectedItemId: null, isRechecking: false, isInsideContainer: false, parentItemId: null };
        checkInProgress = sessionStorage.getItem('checkInProgress') === 'true';

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
        } else if (path.includes('/select-appliance-for-check.html')) {
            renderApplianceSelectionForCheck();
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
        }
    }

    initializeApp();

    // This event ensures the UI is correct even when navigating back from the browser's cache
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            initializeApp();
        }
    });
});
