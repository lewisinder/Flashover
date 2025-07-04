
document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References specific to this page
    // The 'screens' object is no longer needed here as showScreen is global.
    // const screens = { selectLocker: document.getElementById('select-locker-screen'), lockerEditor: document.getElementById('locker-editor-screen'), containerEditor: document.getElementById('container-editor-screen') };
    const editorUI = { lockerName: document.getElementById('locker-editor-name'), shelvesContainer: document.getElementById('locker-editor-shelves'), addShelfBtn: document.getElementById('add-shelf-btn'), doneBtn: document.getElementById('done-editing-locker-btn') };
    const containerEditorUI = { title: document.getElementById('container-editor-title'), shelvesContainer: document.getElementById('container-editor-shelves'), addSubItemBtn: document.getElementById('add-sub-item-btn'), backBtn: document.getElementById('back-to-locker-editor-btn') };
    const editorModal = { overlay: document.getElementById('item-editor-modal'), title: document.getElementById('item-editor-title'), imagePreview: document.getElementById('image-preview'), uploadText: document.getElementById('image-upload-text'), fileInput: document.getElementById('file-upload'), nameInput: document.getElementById('item-name-input'), descInput: document.getElementById('item-desc-input'), typeSelectorContainer: document.getElementById('item-type-selector-container'), typeSelect: document.getElementById('item-type-select'), enterContainerBtn: document.getElementById('enter-container-btn'), saveBtn: document.getElementById('save-item-btn'), cancelBtn: document.getElementById('cancel-edit-btn'), deleteBtn: document.getElementById('delete-item-btn') };
    const nameLockerModal = { overlay: document.getElementById('name-locker-modal'), input: document.getElementById('new-locker-name-input'), saveBtn: document.getElementById('save-new-locker-btn'), cancelBtn: document.getElementById('cancel-create-locker-btn') };
    const deleteConfirmModal = { overlay: document.getElementById('delete-confirm-modal'), title: document.getElementById('delete-confirm-title'), text: document.getElementById('delete-confirm-text'), confirmBtn: document.getElementById('confirm-delete-btn'), cancelBtn: document.getElementById('cancel-delete-btn') };

    // State variables specific to this page
    let currentlyEditing = { lockerId: null, shelfId: null, itemId: null, isSubItem: false, parentItemId: null, isNewItem: false };
    let itemToDelete = { type: null, id: null, parentId: null };
    let tempImageSrc = null;

    // Functions specific to this page
    function renderLockerSelection() {
        const container = document.getElementById('locker-list-container');
        container.innerHTML = ''; // Clear existing content
        const createBtn = document.getElementById('create-new-locker-btn');

        if (truckData.lockers.length === 0) {
            createBtn.classList.add('hidden'); // Hide the default button
            const emptyStateDiv = document.createElement('div');
            emptyStateDiv.className = 'text-center p-8 flex flex-col items-center';
            emptyStateDiv.innerHTML = `
                <h2 class="text-xl font-semibold text-gray-700 mb-2">No lockers yet!</h2>
                <p class="text-gray-500 mb-6">Get started by creating your first locker.</p>
            `;
            
            const firstLockerBtn = document.createElement('button');
            firstLockerBtn.className = 'bg-green-action-1 text-white font-bold py-3 px-6 rounded-lg text-lg';
            firstLockerBtn.textContent = '+ Create First Locker';
            firstLockerBtn.addEventListener('click', () => {
                nameLockerModal.input.value = '';
                nameLockerModal.overlay.classList.remove('hidden');
                nameLockerModal.input.focus();
            });

            emptyStateDiv.appendChild(firstLockerBtn);
            container.appendChild(emptyStateDiv);
        } else {
            createBtn.classList.remove('hidden'); // Show the default button
            truckData.lockers.forEach(locker => {
                const lockerItemDiv = document.createElement('div');
                lockerItemDiv.className = 'w-full bg-gray-100 rounded-lg flex items-center';
                
                const lockerBtn = document.createElement('button');
                lockerBtn.className = 'flex-grow p-4 text-left text-gray-800 hover:bg-gray-200 rounded-l-lg';
                lockerBtn.textContent = locker.name;
                lockerBtn.addEventListener('click', () => openLockerEditor(locker.id));
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'p-4 text-red-action-2 hover:bg-red-100 rounded-r-lg flex-shrink-0';
                deleteBtn.innerHTML = '&#128465;';
                deleteBtn.addEventListener('click', () => confirmDelete('locker', locker.id));
                
                lockerItemDiv.appendChild(lockerBtn);
                lockerItemDiv.appendChild(deleteBtn);
                container.appendChild(lockerItemDiv);
            });
        }
    }

    function openLockerEditor(lockerId) {
        currentlyEditing.lockerId = lockerId;
        const locker = truckData.lockers.find(l => l.id === lockerId);
        editorUI.lockerName.value = locker.name;
        renderLockerEditor();
        showScreen('locker-editor-screen');
    }

    function renderLockerEditor() {
        const locker = truckData.lockers.find(l => l.id === currentlyEditing.lockerId);
        if (!locker) return;
        editorUI.shelvesContainer.innerHTML = '';
        locker.shelves.forEach(shelf => {
            const shelfDiv = document.createElement('div');
            shelfDiv.className = 'shelf-editor-container';
            const shelfHeader = document.createElement('div');
            shelfHeader.className = 'flex justify-end mb-2';
            const deleteShelfBtn = document.createElement('button');
            deleteShelfBtn.className = 'text-red-action-2 hover:text-red-400 font-bold text-2xl leading-none px-2';
            deleteShelfBtn.innerHTML = '&times;';
            deleteShelfBtn.onclick = () => confirmDelete('shelf', shelf.id);
            shelfHeader.appendChild(deleteShelfBtn);
            const shelfContent = document.createElement('div');
            shelfContent.className = 'shelf-content';
            shelf.items.forEach(item => {
                const itemBox = document.createElement('div');
                itemBox.className = 'item-editor-box';
                let itemIcon = item.type === 'container' ? '&#128451;' : '';
                itemBox.innerHTML = `<div class="relative w-full text-center">${itemIcon}</div><img src="${item.img || 'https://placehold.co/60x60/d1d5db/4b5563?text=Item'}" alt="${item.name}"><span class="item-name">${item.name || 'New Item'}</span>`;
                itemBox.onclick = () => openItemEditor(shelf.id, item.id);
                shelfContent.appendChild(itemBox);
            });
            const addItemBtn = document.createElement('button');
            addItemBtn.className = 'add-item-btn w-16 h-full flex items-center justify-center text-3xl bg-gray-200 hover:bg-gray-300 text-gray-500 rounded-md';
            addItemBtn.textContent = '+';
            addItemBtn.onclick = () => addItemToShelf(shelf.id);
            shelfContent.appendChild(addItemBtn);
            shelfDiv.appendChild(shelfHeader);
            shelfDiv.appendChild(shelfContent);
            editorUI.shelvesContainer.appendChild(shelfDiv);
        });
    }

    function openItemEditor(shelfId, itemId, isSubItem = false, parentItemId = null) {
        currentlyEditing = { ...currentlyEditing, shelfId, itemId, isSubItem, parentItemId };
        const item = findItemById(itemId, parentItemId);
        
        editorModal.title.textContent = isSubItem ? 'Edit Sub-Item' : 'Edit Item';
        editorModal.nameInput.value = item.name || '';
        editorModal.descInput.value = item.desc || '';
        tempImageSrc = item.img || 'https://placehold.co/100x100/e5e7eb/4b5563?text=Upload';
        editorModal.imagePreview.src = tempImageSrc;

        if (isSubItem) {
            editorModal.typeSelectorContainer.classList.add('hidden');
            editorModal.enterContainerBtn.classList.add('hidden');
        } else {
            editorModal.typeSelectorContainer.classList.remove('hidden');
            editorModal.typeSelect.value = item.type || 'item';
            if (item.type === 'container') {
                editorModal.enterContainerBtn.classList.remove('hidden');
            } else {
                editorModal.enterContainerBtn.classList.add('hidden');
            }
        }

        editorModal.overlay.classList.remove('hidden');
    }

    function closeItemEditor() {
        editorModal.overlay.classList.add('hidden');
        currentlyEditing.itemId = null;
        currentlyEditing.isSubItem = false;
        currentlyEditing.isNewItem = false;
        editorModal.fileInput.value = '';
        tempImageSrc = null;
    }

    function saveItem() {
        if (!currentlyEditing.itemId) return;
        const item = findItemById(currentlyEditing.itemId, currentlyEditing.parentItemId);
        
        item.name = editorModal.nameInput.value;
        item.desc = editorModal.descInput.value;
        item.img = tempImageSrc;
        
        const newType = currentlyEditing.isSubItem ? 'item' : editorModal.typeSelect.value;
        if (item.type === 'container' && newType === 'item' && item.subItems && item.subItems.length > 0) {
            confirmDelete('containerContents', item.id);
        } else {
            item.type = newType;
            if (item.type === 'container') {
                if (!item.subItems) {
                    item.subItems = [];
                }
                editorModal.enterContainerBtn.classList.remove('hidden');
            } else {
                editorModal.enterContainerBtn.classList.add('hidden');
            }
            saveData();
        }

        if (currentlyEditing.isSubItem) {
            renderContainerEditor();
        } else {
            renderLockerEditor();
        }
        closeItemEditor();
    }

    function confirmDelete(type, id, parentId = null) {
        itemToDelete = { type, id, parentId };
        let title = `Delete ${type}?`;
        let text = "This action cannot be undone.";
        if (type === 'containerContents') {
            title = "Change to Standard Item?";
            text = "This will delete all sub-items inside the container. Are you sure?";
        }
        deleteConfirmModal.title.textContent = title;
        deleteConfirmModal.text.textContent = text;
        deleteConfirmModal.overlay.classList.remove('hidden');
    }

    function executeDelete() {
        const { type, id, parentId } = itemToDelete;
        if (type === 'locker') {
            truckData.lockers = truckData.lockers.filter(l => l.id !== id);
            renderLockerSelection();
        } else if (type === 'shelf') {
            const locker = truckData.lockers.find(l => l.id === currentlyEditing.lockerId);
            locker.shelves = locker.shelves.filter(s => s.id !== id);
            renderLockerEditor();
        } else if (type === 'item') {
            if (parentId) {
                const parentItem = findItemById(parentId);
                parentItem.subItems = parentItem.subItems.filter(i => i.id !== id);
                renderContainerEditor();
            } else {
                const shelf = findShelfById(currentlyEditing.shelfId);
                shelf.items = shelf.items.filter(i => i.id !== id);
                renderLockerEditor();
            }
            closeItemEditor();
        } else if (type === 'containerContents') {
            const item = findItemById(id);
            item.type = 'item';
            delete item.subItems;
            saveData();
            renderLockerEditor();
        }
        saveData();
        deleteConfirmModal.overlay.classList.add('hidden');
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            editorModal.imagePreview.src = event.target.result;
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append('itemImage', file);

        // If there was a previous image (and it's not a placeholder), add it to the form data for deletion.
        const oldImage = findItemById(currentlyEditing.itemId, currentlyEditing.parentItemId)?.img;
        if (oldImage && oldImage.startsWith('/uploads/')) {
            formData.append('oldImagePath', oldImage);
        }

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if(data.filePath) {
                tempImageSrc = data.filePath;
                editorModal.imagePreview.src = tempImageSrc;
            } else {
                console.error('Upload failed:', data.message);
                alert('Image upload failed. Please try again.');
            }
        })
        .catch(error => {
            console.error('Error uploading image:', error);
            alert('An error occurred during image upload.');
        });
    }

    function addItemToShelf(shelfId) {
        const shelf = findShelfById(shelfId);
        const newItem = { id: Date.now(), name: '', desc: '', img: '', type: 'item' };
        shelf.items.push(newItem);
        saveData();
        renderLockerEditor();
        currentlyEditing.isNewItem = true;
        openItemEditor(shelfId, newItem.id);
    }

    function addShelf() {
        const locker = truckData.lockers.find(l => l.id === currentlyEditing.lockerId);
        locker.shelves.push({ id: Date.now(), items: [] });
        saveData();
        renderLockerEditor();
    }

    // --- CONTAINER EDITOR LOGIC ---
    function openContainerEditor(itemId) {
        closeItemEditor();
        currentlyEditing.parentItemId = itemId;
        const item = findItemById(itemId);
        containerEditorUI.title.textContent = `Editing: ${item.name}`;
        renderContainerEditor();
        showScreen('container-editor-screen');
    }

    function renderContainerEditor() {
        console.log('renderContainerEditor called.');
        const parentItem = findItemById(currentlyEditing.parentItemId);
        containerEditorUI.shelvesContainer.innerHTML = '';
        
        const shelfDiv = document.createElement('div');
        shelfDiv.className = 'shelf-editor-container';
        const shelfContent = document.createElement('div');
        shelfContent.className = 'grid grid-cols-4 gap-4';

        parentItem.subItems.forEach(subItem => {
            const itemBox = document.createElement('div');
            itemBox.className = 'item-editor-box aspect-square';
            itemBox.innerHTML = `<img src="${subItem.img || 'https://placehold.co/60x60/d1d5db/4b5563?text=Item'}" alt="${subItem.name}"><span class="item-name">${subItem.name || 'New Item'}</span>`;
            itemBox.onclick = () => openItemEditor(null, subItem.id, true, parentItem.id);
            shelfContent.appendChild(itemBox);
        });

        shelfDiv.appendChild(shelfContent);
        containerEditorUI.shelvesContainer.appendChild(shelfDiv);
    }

    function addSubItem() {
        const parentItem = findItemById(currentlyEditing.parentItemId);
        const newItem = { id: Date.now(), name: '', desc: '', img: '', type: 'item' };
        parentItem.subItems.push(newItem);
        saveData();
        renderContainerEditor();
        currentlyEditing.isNewItem = true;
        openItemEditor(null, newItem.id, true, parentItem.id);
    }

    // Event Listeners
    document.getElementById('back-btn').addEventListener('click', () => { window.location.href = '/menu.html'; });
    document.getElementById('back-home-from-select-btn').addEventListener('click', () => { window.location.href = '/menu.html'; });
    document.getElementById('create-new-locker-btn').addEventListener('click', () => { nameLockerModal.input.value = ''; nameLockerModal.overlay.classList.remove('hidden'); nameLockerModal.input.focus(); });
    nameLockerModal.cancelBtn.addEventListener('click', () => {
        nameLockerModal.overlay.classList.add('hidden');
    });
    nameLockerModal.saveBtn.addEventListener('click', () => {
        const lockerName = nameLockerModal.input.value;
        nameLockerModal.input.classList.remove('border-red-action-2', 'shake');
        if (lockerName && lockerName.trim() !== "") {
            const newLocker = { id: Date.now(), name: lockerName.trim(), shelves: [{ id: Date.now()+1, items:[] }] };
            truckData.lockers.push(newLocker);
            saveData();
            nameLockerModal.overlay.classList.add('hidden');
            openLockerEditor(newLocker.id);
        } else {
            nameLockerModal.input.classList.add('border-red-action-2', 'shake');
        }
    });
    
    editorUI.doneBtn.addEventListener('click', () => { renderLockerSelection(); showScreen('select-locker-screen'); });
    editorUI.addShelfBtn.addEventListener('click', addShelf);
    editorUI.lockerName.addEventListener('change', (e) => {
        const locker = truckData.lockers.find(l => l.id === currentlyEditing.lockerId);
        if(locker) locker.name = e.target.value;
        saveData();
    });
    
    editorModal.saveBtn.addEventListener('click', saveItem);
    editorModal.cancelBtn.addEventListener('click', closeItemEditor);
    editorModal.deleteBtn.addEventListener('click', () => confirmDelete('item', currentlyEditing.itemId, currentlyEditing.parentItemId));
    editorModal.enterContainerBtn.addEventListener('click', () => openContainerEditor(currentlyEditing.itemId));
    
    containerEditorUI.backBtn.addEventListener('click', () => {
        renderLockerEditor();
        showScreen('locker-editor-screen');
    });
    containerEditorUI.addSubItemBtn.addEventListener('click', addSubItem);

    deleteConfirmModal.cancelBtn.addEventListener('click', () => deleteConfirmModal.overlay.classList.add('hidden'));
    deleteConfirmModal.confirmBtn.addEventListener('click', executeDelete);
    
    editorModal.fileInput.addEventListener('change', handleImageUpload);

    // Initial load for setup page
    loadData().then(() => {
        renderLockerSelection();
        showScreen('select-locker-screen');
    });
});
