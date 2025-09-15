document.addEventListener('DOMContentLoaded', () => {
    const firebaseConfig = {
          apiKey: "AIzaSyC-fTzW4YzTTSyCtXSIgxZCZAb7a14t3N4",
          authDomain: "flashoverapplication.firebaseapp.com",
          projectId: "flashoverapplication",
          storageBucket: "flashoverapplication.firebasestorage.app",
          messagingSenderId: "74889025348",
          appId: "1:74889025348:web:baaec1803ade7ffbd06911"
        };

    // Check if Firebase is already initialized
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    const auth = firebase.auth();
    let currentUser = null;

    // ===================================================================
    // JAVASCRIPT - THE BRAIN OF THE APP
    // ===================================================================
    
    // -------------------------------------------------------------------
    // SECTION A: DATA MANAGEMENT
    // -------------------------------------------------------------------
    const loadingOverlay = document.getElementById('loading-overlay');

    function showLoading() {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }

    let userAppData = { appliances: [] };

    async function loadData() {
        if (!currentUser) return;
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!brigadeId) {
            alert("No active brigade selected. Redirecting to menu.");
            window.location.href = '/menu.html';
            return;
        }
        showLoading();
        try {
            const token = await currentUser.getIdToken();
            const response = await fetch(`/api/brigades/${brigadeId}/data`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            userAppData = data;
            if (!userAppData.appliances) userAppData.appliances = [];
        } catch (error) {
            console.error("Could not load brigade data:", error);
            alert("Could not load brigade data. Please try again.");
            window.location.href = '/menu.html';
        } finally {
            hideLoading();
        }
    }

    function getActiveAppliance() {
        const applianceId = localStorage.getItem('selectedApplianceId');
        if (!applianceId || !userAppData.appliances) return null;
        return userAppData.appliances.find(a => a.id == applianceId);
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

    // -------------------------------------------------------------------
    // SECTION B: APP STATE
    // -------------------------------------------------------------------
    let checkResults = [];
    let currentCheckState = {};
    let checkInProgress = false;
    let isReportSaved = false;
    let nextLockerToStartId = null;
    let signaturePad = null;

    function loadStateFromSession() {
        checkResults = JSON.parse(sessionStorage.getItem('checkResults')) || [];
        currentCheckState = JSON.parse(sessionStorage.getItem('currentCheckState')) || { lockerId: null, selectedItemId: null, isRechecking: false, isInsideContainer: false, parentItemId: null };
        checkInProgress = sessionStorage.getItem('checkInProgress') === 'true';
    }

    function saveStateToSession() {
        sessionStorage.setItem('checkResults', JSON.stringify(checkResults));
        sessionStorage.setItem('currentCheckState', JSON.stringify(currentCheckState));
        sessionStorage.setItem('checkInProgress', checkInProgress.toString());
    }

    // -------------------------------------------------------------------
    // SECTION C: DOM ELEMENT REFERENCES
    // -------------------------------------------------------------------
    const getElement = (id) => document.getElementById(id);

    const screens = { 
        lockerCheck: getElement('locker-check-screen'), 
        nextLockerChoice: getElement('next-locker-choice-screen'), 
        summary: getElement('summary-screen'), 
    };

    const checkerUI = { 
        headerTitle: getElement('header-title'),
        lockerName: getElement('locker-editor-name'), 
        itemImage: getElement('item-image'), 
        itemName: getElement('item-name'), 
        itemDesc: getElement('item-desc'), 
        lockerLayout: getElement('locker-layout'), 
        controls: getElement('controls'), 
        containerControls: getElement('container-controls'), 
        nextLockerBtn: getElement('go-to-next-locker-btn'), 
        backToSummaryBtn: getElement('back-to-summary-btn') 
    };

    const noteModal = { 
        overlay: getElement('note-modal'), 
        title: getElement('note-modal-title'), 
        input: getElement('note-input'), 
        saveBtn: getElement('btn-save-note'),
        cancelBtn: getElement('cancel-note-btn')
    };
    
    const exitConfirmModal = {
        overlay: getElement('exit-confirm-modal'),
        exitAnywayBtn: getElement('confirm-exit-anyway-btn'),
        cancelBtn: getElement('cancel-exit-btn')
    };

    const signatureModal = {
        overlay: getElement('signature-modal'),
        canvas: getElement('signature-canvas'),
        nameInput: getElement('signer-name-input'),
        clearBtn: getElement('clear-signature-btn'),
        cancelBtn: getElement('cancel-signature-btn'),
        confirmBtn: getElement('confirm-signature-btn')
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
    
    function startOrResumeChecks() {
        const appliance = getActiveAppliance();
        if (!appliance || !appliance.lockers || appliance.lockers.length === 0) {
            alert("This appliance has no lockers or items to check. Please complete setup first.");
            window.location.href = '/select-appliance.html';
            return;
        }

        if (!checkInProgress) {
            checkResults = [];
            checkInProgress = true;
            const firstLockerId = appliance.lockers[0].id;
            currentCheckState = { lockerId: firstLockerId, selectedItemId: null, isRechecking: false, isInsideContainer: false, parentItemId: null };
        }
        
        saveStateToSession();
        if (currentCheckState.isInsideContainer) {
            const parentItem = findItemById(currentCheckState.parentItemId);
            loadContainerUI(parentItem);
        } else {
            loadLockerUI();
        }
        showScreen('lockerCheck');
    }
    
    function loadLockerUI() {
        const locker = findLockerById(currentCheckState.lockerId);
        if (!locker) {
            console.error("Critical Error: Could not find locker with ID:", currentCheckState.lockerId);
            alert("An error occurred. Could not find the current locker. Returning to menu.");
            window.location.href = '/menu.html';
            return;
        }

        const existingFinishContainerBtn = getElement('finish-container-check-btn');
        if (existingFinishContainerBtn) existingFinishContainerBtn.remove();
        checkerUI.nextLockerBtn.classList.add('hidden');

        checkerUI.headerTitle.textContent = locker.name;
        checkerUI.lockerName.textContent = locker.name;
        checkerUI.lockerLayout.innerHTML = '';
        
        const shelves = locker.shelves || [];
        shelves.forEach((shelf, index) => {
            const shelfWrapper = document.createElement('div');
            const items = shelf.items || [];

            shelfWrapper.innerHTML = `
                <div class="shelf-container">
                    <div class="shelf-items-grid">
                        ${items.map(item => {
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
        
        let itemToSelect = null;
        if (currentCheckState.selectedItemId) {
            itemToSelect = findItemById(currentCheckState.selectedItemId);
        } else {
            itemToSelect = shelves.flatMap(s => s.items || []).find(i => !checkResults.some(r => r.itemId === i.id));
        }
        
        if (itemToSelect) {
            selectItemForCheck(itemToSelect.id);
        } else {
            checkIfLockerIsComplete();
        }

        checkerUI.backToSummaryBtn.classList.toggle('hidden', !currentCheckState.isRechecking);
    }

    function selectItemForCheck(itemId, parentId = null) {
        if (!itemId) {
            updateItemDetails(null);
            checkIfLockerIsComplete();
            return;
        }
        
        currentCheckState.selectedItemId = itemId;
        currentCheckState.parentItemId = parentId;
        const item = findItemById(itemId, parentId);

        updateItemDetails(item);
        
        document.querySelectorAll('.item-box').forEach(b => b.classList.remove('is-active'));
        const activeBox = document.querySelector(`.item-box[data-id='${itemId}']`);
        if (activeBox) {
            activeBox.classList.add('is-active');
            const rect = activeBox.getBoundingClientRect();
            const isVisible = (rect.top >= 0) && (rect.bottom <= window.innerHeight);
            if (!isVisible) {
                activeBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        
        saveStateToSession();
    }

    function updateItemDetails(item) {
        if (item) {
            checkerUI.itemImage.src = item.img || '/design_assets/Flashover Logo.png';
            checkerUI.itemName.textContent = item.name;
            checkerUI.itemDesc.textContent = item.desc;
            
            const isContainer = item.type === 'container' && !currentCheckState.isInsideContainer;
            checkerUI.controls.classList.toggle('hidden', isContainer);
            checkerUI.containerControls.classList.toggle('hidden', !isContainer);
        } else {
            checkerUI.itemImage.src = '/design_assets/Flashover Logo.png';
            checkerUI.itemName.textContent = 'Select an Item';
            checkerUI.itemDesc.textContent = 'All items in this locker have been checked.';
            checkerUI.controls.classList.add('hidden');
            checkerUI.containerControls.classList.add('hidden');
        }
    }

    function startContainerCheck() {
        const containerId = currentCheckState.selectedItemId;
        const container = findItemById(containerId);
        if (!container || !container.subItems || !container.subItems.length) {
            alert("This container has no items to check.");
            processCheck('present');
            return;
        }
        currentCheckState.isInsideContainer = true;
        currentCheckState.parentItemId = containerId;
        currentCheckState.selectedItemId = null; 
        
        loadContainerUI(container);
        saveStateToSession();
    }

    function loadContainerUI(container) {
        checkerUI.headerTitle.textContent = `Container: ${container.name}`;
        const subItems = container.subItems || [];

        checkerUI.lockerLayout.innerHTML = `
            <div class="shelf-container">
                <h3 class="text-blue text-center font-bold text-sm">Container Contents</h3>
                <div class="container-items-grid">
                    ${subItems.map(item => {
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
        `;

        let itemToSelect = null;
        if (currentCheckState.selectedItemId && currentCheckState.parentItemId === container.id) {
             itemToSelect = findItemById(currentCheckState.selectedItemId, container.id);
        } else {
            itemToSelect = subItems.find(i => !checkResults.some(r => r.itemId === i.id));
        }

        if (itemToSelect) {
            selectItemForCheck(itemToSelect.id, container.id);
        } else {
            checkIfContainerIsComplete();
        }
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
        currentCheckState.selectedItemId = null; 
        
        saveStateToSession();
        loadLockerUI();
    }

    function checkIfContainerIsComplete() {
        if (!currentCheckState.parentItemId) return false;
        const parentItem = findItemById(currentCheckState.parentItemId);
        if (!parentItem || !parentItem.subItems) return false;

        const allItemsChecked = parentItem.subItems.every(item => checkResults.some(r => r.itemId === item.id));

        const existingFinishBtn = getElement('finish-container-check-btn');
        if (existingFinishBtn) existingFinishBtn.remove();

        if (allItemsChecked) {
            updateItemDetails(null);
            const finishBtn = document.createElement('button');
            finishBtn.id = 'finish-container-check-btn';
            finishBtn.textContent = 'Finish Container Check';
            finishBtn.className = 'w-full bg-green-action-1 text-white font-bold py-3 px-4 rounded-lg text-xl mt-2';
            finishBtn.onclick = finishContainerCheck;
            const footer = checkerUI.controls.parentElement;
            footer.appendChild(finishBtn);
        }
        return allItemsChecked;
    }

    function updateItemBoxStatus(itemId, status) {
        const itemBox = document.querySelector(`.item-box[data-id='${itemId}']`);
        if (!itemBox) return;
        itemBox.classList.remove('status-present', 'status-missing', 'status-note', 'status-partial');
        if (status) {
            itemBox.classList.add(`status-${status}`);
        }
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
             
             updateItemBoxStatus(item.id, 'missing');
             saveStateToSession();
             
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            selectItemForCheck(nextUncheckedItem?.id);
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
        
        updateItemBoxStatus(item.id, status);
        saveStateToSession();

        if (currentCheckState.isRechecking) return;

        let nextItemToSelect = null;
        if (currentCheckState.isInsideContainer) {
            const parentItem = findItemById(currentCheckState.parentItemId);
            nextItemToSelect = parentItem.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
             if (!nextItemToSelect) {
                checkIfContainerIsComplete();
            } else {
                selectItemForCheck(nextItemToSelect.id, currentCheckState.parentItemId);
            }
        } else {
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            nextItemToSelect = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            selectItemForCheck(nextItemToSelect?.id);
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
        saveStateToSession();

        if (currentCheckState.isRechecking) return;

        let nextItemToSelect = null;
        if (currentCheckState.isInsideContainer) {
            const parentItem = findItemById(currentCheckState.parentItemId);
            nextItemToSelect = parentItem.subItems.find(i => !checkResults.some(r => r.itemId === i.id));
             if (!nextItemToSelect) {
                checkIfContainerIsComplete();
            } else {
                selectItemForCheck(nextItemToSelect.id, currentCheckState.parentItemId);
            }
        } else {
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            nextItemToSelect = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            selectItemForCheck(nextItemToSelect?.id);
        }
    }
    
    function checkIfLockerIsComplete() {
        if (!currentCheckState.lockerId) return false;
        const locker = findLockerById(currentCheckState.lockerId);
        if (!locker) return false;

        const allItemsInLocker = locker.shelves.flatMap(s => s.items);
        const allItemsChecked = allItemsInLocker.every(item => checkResults.some(r => r.itemId === item.id));

        checkerUI.nextLockerBtn.classList.toggle('hidden', !allItemsChecked);
        
        if (allItemsChecked) {
            updateItemDetails(null);
        }

        return allItemsChecked;
    }
    
    function handleLockerCompletion() {
        renderNextLockerChoices();
        showScreen('nextLockerChoice');
    }
    
    function getLockerCheckStatus(lockerId) {
        const locker = findLockerById(lockerId);
        if (!locker) return 'unknown';
        const allItems = locker.shelves.flatMap(s => s.items);
        if (allItems.length === 0) return 'complete';

        const allItemsChecked = allItems.every(item => checkResults.some(r => r.itemId === item.id));
        if (allItemsChecked) return 'complete';

        const anyItemsChecked = allItems.some(item => checkResults.some(r => r.itemId === item.id));
        if (anyItemsChecked) return 'partial';
        
        return 'untouched';
    }

    function renderNextLockerChoices() {
        const container = getElement('next-locker-list-container');
        if (!container) return;
        container.innerHTML = '';
        const appliance = getActiveAppliance();
        
        const allLockersComplete = appliance.lockers.every(l => getLockerCheckStatus(l.id) === 'complete');

        const suggestedNextLocker = appliance.lockers.find(l => getLockerCheckStatus(l.id) === 'untouched');
        nextLockerToStartId = suggestedNextLocker?.id || appliance.lockers.find(l => getLockerCheckStatus(l.id) === 'partial')?.id;

        appliance.lockers.forEach(locker => {
            const lockerBtn = document.createElement('button');
            lockerBtn.className = `w-full bg-gray-100 p-4 rounded-lg flex items-center justify-between text-gray-800 border-2 ${locker.id == nextLockerToStartId ? 'border-blue-500' : 'border-transparent'}`;
            lockerBtn.dataset.lockerId = locker.id;
            const icons = { complete: '✔', partial: '…', untouched: '○' };
            const colors = { complete: 'text-green-500', partial: 'text-yellow-500', untouched: 'text-gray-400' };
            lockerBtn.innerHTML = `<span>${locker.name}</span> <span class="${colors[getLockerCheckStatus(locker.id)]} text-2xl font-bold">${icons[getLockerCheckStatus(locker.id)]}</span>`;
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
        saveStateToSession();

        container.innerHTML = '';
        const allCheckedItems = checkResults;

        if (allCheckedItems.length === 0) {
            container.innerHTML = `<div class="text-center p-8 bg-blue-100 text-blue-800 rounded-lg"><h3 class="text-2xl font-bold">No Items Checked</h3><p>Start a check to see a summary here.</p></div>`;
            return;
        }

        const resultsByLocker = allCheckedItems.reduce((acc, item) => {
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

        let finalHtml = '';
        for (const lockerId in resultsByLocker) {
            const locker = resultsByLocker[lockerId];
            
            finalHtml += `
                <div class="bg-blue rounded-lg p-4 mb-4">
                    <h3 class="text-white text-xl font-bold uppercase text-center mb-3">${locker.name}</h3>
                    <div class="space-y-2">
            `;

            locker.items.sort((a,b) => a.itemName.localeCompare(b.itemName)).forEach(item => {
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

                if (item.status === 'partial' || (findItemById(item.itemId)?.type === 'container')) {
                    const subItems = allCheckedItems.filter(r => r.parentItemId === item.itemId);
                    if (subItems.length > 0) {
                        finalHtml += `<div class="ml-6 mt-2 space-y-1">`;
                        subItems.sort((a,b) => a.itemName.localeCompare(b.itemName)).forEach(subItem => {
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
                
                if (item.note) {
                    finalHtml += `<div class="ml-9 mt-1 text-sm text-gray-600"><em>Note: ${item.note}</em></div>`;
                }

                finalHtml += `</div>`;
            });

            finalHtml += `</div></div>`;
        }

        container.innerHTML = finalHtml;
        showScreen('summary');
    }

    function findLockerById(lockerId) {
        const appliance = getActiveAppliance();
        if (!appliance) return null;
        return appliance.lockers.find(l => l.id == lockerId);
    }
    
    function findItemById(itemId, parentItemId = null) {
        const appliance = getActiveAppliance();
        if (!appliance) return null;

         if (parentItemId) {
            const parent = findItemById(parentItemId);
            return parent && parent.subItems ? parent.subItems.find(i => i.id == itemId) : null;
        }
        for (const locker of appliance.lockers) {
            for (const shelf of locker.shelves) {
                const item = shelf.items.find(i => i.id == itemId);
                if (item) return item;
            }
        }
        return null;
    }

    async function saveReport() {
        showLoading();
        const appliance = getActiveAppliance();
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!appliance || !brigadeId) {
            alert("Could not find active appliance or brigade.");
            hideLoading();
            return;
        }
        try {
            const reportPayload = {
                date: new Date().toISOString(),
                applianceId: appliance.id,
                applianceName: appliance.name,
                brigadeId: brigadeId,
                lockers: generateFullReportData().lockers,
                username: currentUser.displayName || currentUser.email,
                uid: currentUser.uid
            };
            
            const token = await currentUser.getIdToken();
            const response = await fetch(`/api/reports`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(reportPayload)
            });

            if (response.ok) {
                isReportSaved = true;
                alert('Report saved successfully!');
                sessionStorage.removeItem('checkResults');
                sessionStorage.removeItem('checkInProgress');
                sessionStorage.removeItem('currentCheckState');
                window.location.href = '/appliance-checks.html';
            } else {
                alert(`Failed to save report: ${(await response.json()).message}`);
            }
        } catch (error) {
            console.error("Error saving report:", error);
            alert('An error occurred while saving the report.');
        } finally {
            hideLoading();
        }
    }

    function openSignatureModal() {
        signatureModal.overlay.classList.remove('hidden');
        if (!signaturePad) {
            signaturePad = new SignaturePad(signatureModal.canvas, {
                backgroundColor: 'rgb(229, 231, 235)', // gray-200
                penColor: 'rgb(0, 0, 0)'
            });
        }
        resizeCanvas();
    }

    function resizeCanvas() {
        if (!signaturePad) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        signatureModal.canvas.width = signatureModal.canvas.offsetWidth * ratio;
        signatureModal.canvas.height = signatureModal.canvas.offsetHeight * ratio;
        signatureModal.canvas.getContext("2d").scale(ratio, ratio);
        signaturePad.clear(); // otherwise isEmpty() might return incorrect value
    }

    async function saveReportWithSignature() {
        if (signaturePad.isEmpty()) {
            return alert("Please provide a signature first.");
        }
        const signerName = signatureModal.nameInput.value.trim();
        if (!signerName) {
            return alert("Please enter your full name.");
        }

        showLoading();
        const appliance = getActiveAppliance();
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!appliance || !brigadeId) {
            alert("Could not find active appliance or brigade.");
            hideLoading();
            return;
        }

        try {
            const signatureDataUrl = signaturePad.toDataURL('image/png');
            const reportPayload = {
                date: new Date().toISOString(),
                applianceId: appliance.id,
                applianceName: appliance.name,
                brigadeId: brigadeId,
                lockers: generateFullReportData().lockers,
                username: currentUser.displayName || currentUser.email,
                uid: currentUser.uid,
                signedBy: signerName,
                signatureDataUrl: signatureDataUrl
            };
            
            const token = await currentUser.getIdToken();
            const response = await fetch(`/api/reports`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(reportPayload)
            });

            if (response.ok) {
                isReportSaved = true;
                alert('Report saved successfully!');
                sessionStorage.removeItem('checkResults');
                sessionStorage.removeItem('checkInProgress');
                sessionStorage.removeItem('currentCheckState');
                window.location.href = '/appliance-checks.html';
            } else {
                alert(`Failed to save report: ${(await response.json()).message}`);
            }
        } catch (error) {
            console.error("Error saving report:", error);
            alert('An error occurred while saving the report.');
        } finally {
            hideLoading();
            signatureModal.overlay.classList.add('hidden');
        }
    }

    function addSafeEventListener(selector, event, handler) {
        const element = typeof selector === 'string' ? getElement(selector) : selector;
        if (element) element.addEventListener(event, handler);
    }

    function delegateEvent(containerSelector, event, childSelector, handler) {
        const container = getElement(containerSelector);
        if (container) {
            container.addEventListener(event, e => {
                const target = e.target.closest(childSelector);
                if (target) {
                    handler(e, target);
                }
            });
        }
    }

    function setupEventListeners() {
        addSafeEventListener('back-btn', 'click', () => {
            if (screens.summary.classList.contains('active')) {
                renderNextLockerChoices();
                showScreen('nextLockerChoice');
            } else if (screens.nextLockerChoice.classList.contains('active')) {
                loadLockerUI();
                showScreen('lockerCheck');
            } else {
                exitConfirmModal.overlay.classList.remove('hidden');
            }
        });
        
        addSafeEventListener('go-to-locker-status-btn', 'click', handleLockerCompletion);
        delegateEvent('locker-layout', 'click', '.item-box', (e, box) => {
            selectItemForCheck(box.dataset.id, box.dataset.parentId ? box.dataset.parentId : null)
        });
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
        addSafeEventListener(noteModal.cancelBtn, 'click', () => noteModal.overlay.classList.add('hidden'));
        
        addSafeEventListener('go-to-selected-locker-btn', 'click', () => {
            if(nextLockerToStartId) {
                currentCheckState.lockerId = nextLockerToStartId;
                currentCheckState.selectedItemId = null;
                saveStateToSession();
                loadLockerUI();
                showScreen('lockerCheck');
            }
        });
        addSafeEventListener('finish-checks-early-btn', 'click', renderSummaryScreen);

        delegateEvent('summary-list-container', 'click', '.recheck-btn', (e, btn) => {
            currentCheckState = { 
                lockerId: btn.dataset.lockerId, 
                selectedItemId: btn.dataset.itemId, 
                isRechecking: true, 
                isInsideContainer: !!btn.dataset.parentItemId, 
                parentItemId: btn.dataset.parentItemId ? btn.dataset.parentItemId : null
            };
            saveStateToSession();
            if (currentCheckState.isInsideContainer) {
                loadContainerUI(findItemById(currentCheckState.parentItemId));
            } else {
                loadLockerUI();
            }
            showScreen('lockerCheck');
        });
        addSafeEventListener('edit-report-btn', 'click', () => {
            renderNextLockerChoices();
            showScreen('nextLockerChoice');
        });
        addSafeEventListener('save-report-btn', 'click', openSignatureModal);
        addSafeEventListener('exit-summary-btn', 'click', () => {
            if (isReportSaved) {
                window.location.href = '/menu.html';
            } else {
                exitConfirmModal.overlay.classList.remove('hidden');
            }
        });
        addSafeEventListener(exitConfirmModal.cancelBtn, 'click', () => exitConfirmModal.overlay.classList.add('hidden'));
        addSafeEventListener(exitConfirmModal.exitAnywayBtn, 'click', () => exitCheck(false));

        // Add listeners for the new signature modal
        addSafeEventListener(signatureModal.clearBtn, 'click', () => signaturePad.clear());
        addSafeEventListener(signatureModal.cancelBtn, 'click', () => signatureModal.overlay.classList.add('hidden'));
        addSafeEventListener(signatureModal.confirmBtn, 'click', saveReportWithSignature);
        window.addEventListener('resize', resizeCanvas);
    }

    async function exitCheck(shouldSave) {
        showLoading();
        if (shouldSave) {
            await saveReport();
        } else {
            const appliance = getActiveAppliance();
            const brigadeId = localStorage.getItem('activeBrigadeId');
            if (appliance && brigadeId) {
                try {
                    const token = await currentUser.getIdToken();
                    await fetch(`/api/brigades/${brigadeId}/appliances/${appliance.id}/complete-check`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                } catch (error) {
                    console.error("Could not clear check status on exit:", error);
                }
            }
            sessionStorage.removeItem('checkInProgress');
            sessionStorage.removeItem('checkResults');
            sessionStorage.removeItem('currentCheckState');
            window.location.href = '/appliance-checks.html';
        }
        hideLoading();
    }

    async function initializeApp() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                setupEventListeners();
                loadStateFromSession();
                await loadData();
                startOrResumeChecks();
            } else {
                window.location.href = '/signin.html';
            }
        });
    }

    initializeApp();
});