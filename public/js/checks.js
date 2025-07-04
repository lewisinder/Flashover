document.addEventListener('DOMContentLoaded', () => {

        // ===================================================================
        // JAVASCRIPT - THE BRAIN OF THE APP
        // ===================================================================

        // -------------------------------------------------------------------
        // SECTION A: DATA
        // -------------------------------------------------------------------
        let truckData = { lockers: [] };

        // This function will be replaced by the main app to load real data
        function loadTruckData() {
            const storedData = localStorage.getItem('currentTruckData');
            if (storedData) {
                truckData = JSON.parse(storedData);
                console.log('Truck data loaded from localStorage:', truckData);
            } else {
                console.warn("No truckData found in localStorage. This component expects data to be provided.");
                truckData = { lockers: [] }; // Set to empty if no data is found
            }
        }

        // -------------------------------------------------------------------
        // SECTION B: APP STATE
        // -------------------------------------------------------------------
        let checkResults = [];
        let currentCheckState = { lockerId: null, selectedItemId: null, isRechecking: false };
        let nextLockerToStartId = null;

        // -------------------------------------------------------------------
        // SECTION C: DOM ELEMENT REFERENCES
        // -------------------------------------------------------------------
        const screens = { lockerCheck: document.getElementById('locker-check-screen'), nextLockerChoice: document.getElementById('next-locker-choice-screen'), summary: document.getElementById('summary-screen') };
        const checkerUI = { lockerName: document.getElementById('locker-name'), itemImage: document.getElementById('item-image'), itemName: document.getElementById('item-name'), itemDesc: document.getElementById('item-desc'), lockerLayout: document.getElementById('locker-layout'), controls: document.getElementById('controls'), nextLockerBtn: document.getElementById('go-to-next-locker-btn'), backToSummaryBtn: document.getElementById('back-to-summary-btn') };
        const noteModal = { overlay: document.getElementById('note-modal'), title: document.getElementById('note-modal-title'), input: document.getElementById('note-input'), saveBtn: document.getElementById('btn-save-note') };
        const mainButtons = { finishChecksEarly: document.getElementById('finish-checks-early-btn'), backToLockerList: document.getElementById('back-to-locker-list-btn'), goToSelectedLocker: document.getElementById('go-to-selected-locker-btn'), resetApp: document.getElementById('reset-app-btn') };
        const checkButtons = { present: document.getElementById('btn-present'), missing: document.getElementById('btn-missing'), note: document.getElementById('btn-note') };
        
        // -------------------------------------------------------------------
        // SECTION D: CORE APP LOGIC
        // -------------------------------------------------------------------
        
        function showScreen(screenId) {
            Object.values(screens).forEach(s => s.classList.remove('active'));
            screens[screenId].classList.add('active');
        }
        
        // -------------------------------------------------------------------
        // SUB-SECTION: CHECK MODE LOGIC
        // -------------------------------------------------------------------
        function startChecks() {
            if (truckData.lockers.length === 0) {
                alert("No lockers configured for this truck.");
                return;
            }
            checkResults = [];
            startLockerCheck(truckData.lockers[0].id, false);
        }
        
        function startLockerCheck(lockerId, isRecheck = false) {
            currentCheckState.lockerId = lockerId;
            currentCheckState.selectedItemId = null;
            currentCheckState.isRechecking = isRecheck;
            loadLockerUI();
            showScreen('lockerCheck');
        }

        function loadLockerUI() {
            const locker = truckData.lockers.find(l => l.id === currentCheckState.lockerId);
            checkerUI.lockerName.textContent = locker.name;
            checkerUI.lockerLayout.innerHTML = '';
            
            locker.shelves.forEach(shelf => {
                 const shelfDiv = document.createElement('div');
                 shelfDiv.className = 'flex-1 flex gap-3 p-3 bg-gray-100 rounded-xl';
                 shelf.items.forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'item-box flex-1 h-full bg-gray-300 rounded-lg border-2 border-gray-400';
                    itemDiv.dataset.id = item.id;
                    
                    const result = checkResults.find(r => r.itemId === item.id);
                    if (result) {
                        itemDiv.classList.remove('bg-gray-300');
                        itemDiv.classList.add(`status-${result.status}`);
                    }
                    
                    itemDiv.addEventListener('click', () => selectItemForCheck(item.id));
                    shelfDiv.appendChild(itemDiv);
                 });
                 checkerUI.lockerLayout.appendChild(shelfDiv);
            });
            
            const firstUnchecked = locker.shelves.flatMap(s => s.items).find(i => !checkResults.some(r => r.itemId === i.id));
            const firstItem = locker.shelves[0]?.items[0];
            selectItemForCheck(firstUnchecked?.id || firstItem?.id);

            if (currentCheckState.isRechecking) {
                checkerUI.controls.classList.remove('hidden');
                checkerUI.nextLockerBtn.classList.add('hidden');
                checkerUI.backToSummaryBtn.classList.remove('hidden');
            } else {
                checkIfLockerIsComplete();
            }
        }

        function selectItemForCheck(itemId) {
            if (!itemId) {
                checkerUI.itemName.textContent = 'No item selected';
                checkerUI.itemDesc.textContent = 'Click an item below to check it.';
                checkerUI.itemImage.src = 'https://placehold.co/100x100/e5e7eb/4b5563?text=?';
                return;
            }
            currentCheckState.selectedItemId = itemId;
            
            const item = findItemById(itemId);
            if (item) {
                checkerUI.itemImage.src = item.img || 'https://placehold.co/100x100/e5e7eb/4b5563?text=No+Img';
                checkerUI.itemName.textContent = item.name;
                checkerUI.itemDesc.textContent = item.desc;
                document.querySelectorAll('.item-box').forEach(box => box.classList.remove('is-active'));
                const activeBox = document.querySelector(`.item-box[data-id='${item.id}']`);
                if (activeBox) activeBox.classList.add('is-active');
            }
        }

        function processCheck(status) {
            if (!currentCheckState.selectedItemId) return;

            if (status === 'note') {
                const item = findItemById(currentCheckState.selectedItemId);
                noteModal.title.textContent = `Add Note for ${item.name}`;
                const existingResult = checkResults.find(r => r.itemId === item.id);
                noteModal.input.value = existingResult ? existingResult.note : '';
                noteModal.overlay.classList.remove('hidden');
                return;
            }

            const locker = truckData.lockers.find(l => l.id === currentCheckState.lockerId);
            const item = findItemById(currentCheckState.selectedItemId);
            
            const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
            const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: status, note: '' };
            if (resultIndex > -1) { checkResults[resultIndex] = result; } else { checkResults.push(result); }

            const itemBox = document.querySelector(`.item-box[data-id='${item.id}']`);
            if (itemBox) {
                itemBox.classList.remove('bg-gray-300', 'status-present', 'status-missing', 'status-note');
                itemBox.classList.add(`status-${status}`);
            }

            if (currentCheckState.isRechecking) return;

            if (checkIfLockerIsComplete()) return;

            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            if (nextUncheckedItem) {
                selectItemForCheck(nextUncheckedItem.id);
            }
        }
        
        function saveNoteAndProceed() {
            const item = findItemById(currentCheckState.selectedItemId);
            const locker = truckData.lockers.find(l => l.id === currentCheckState.lockerId);
            const noteText = noteModal.input.value;

            const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
            const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: 'note', note: noteText };
            if (resultIndex > -1) { checkResults[resultIndex] = result; } else { checkResults.push(result); }

            const itemBox = document.querySelector(`.item-box[data-id='${item.id}']`);
            if (itemBox) {
                itemBox.classList.remove('bg-gray-300', 'status-present', 'status-missing', 'status-note');
                itemBox.classList.add('status-note');
            }
            
            noteModal.overlay.classList.add('hidden');
            
            if (currentCheckState.isRechecking) return;

            if (checkIfLockerIsComplete()) return;
            
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            const nextUncheckedItem = allItemsInLocker.find(i => !checkResults.some(r => r.itemId === i.id));
            if (nextUncheckedItem) {
                selectItemForCheck(nextUncheckedItem.id);
            }
        }
        
        function checkIfLockerIsComplete() {
            const locker = truckData.lockers.find(l => l.id === currentCheckState.lockerId);
            const allItemsInLocker = locker.shelves.flatMap(s => s.items);
            const allItemsChecked = allItemsInLocker.every(item => checkResults.some(r => r.itemId === item.id));

            if (allItemsChecked) {
                checkerUI.controls.classList.add('hidden');
                checkerUI.nextLockerBtn.classList.remove('hidden');
                checkerUI.backToSummaryBtn.classList.add('hidden');
            } else {
                checkerUI.controls.classList.remove('hidden');
                checkerUI.nextLockerBtn.classList.add('hidden');
                checkerUI.backToSummaryBtn.classList.add('hidden');
            }
            return allItemsChecked;
        }
        
        function handleLockerCompletion() {
            renderNextLockerChoices();
            showScreen('nextLockerChoice');
        }
        
        function getLockerCheckStatus(lockerId) {
            const locker = truckData.lockers.find(l => l.id === lockerId);
            const allItems = locker.shelves.flatMap(s => s.items);
            if (allItems.length === 0) return 'complete';

            const checkedItemsInLocker = checkResults.filter(r => r.lockerId === lockerId);
            
            if (checkedItemsInLocker.length === 0) return 'untouched';
            if (checkedItemsInLocker.length === allItems.length) return 'complete';
            return 'partial';
        }

        function renderNextLockerChoices() {
            const container = document.getElementById('next-locker-list-container');
            container.innerHTML = '';
            
            const currentLocker = truckData.lockers.find(l => l.id === currentCheckState.lockerId);
            const currentLockerDataIndex = truckData.lockers.indexOf(currentLocker);
            let suggestedNextLocker = null;
            let allLockersComplete = true;

            truckData.lockers.forEach(locker => {
                const status = getLockerCheckStatus(locker.id);
                if (status !== 'complete') {
                    allLockersComplete = false;
                }
                if (!suggestedNextLocker && status !== 'complete' && locker.id !== currentCheckState.lockerId) {
                     const lockerIndex = truckData.lockers.indexOf(locker);
                     if (lockerIndex > currentLockerDataIndex) {
                        if (!suggestedNextLocker || lockerIndex < truckData.lockers.indexOf(suggestedNextLocker)) {
                            suggestedNextLocker = locker;
                        }
                     }
                }
            });

            if (!suggestedNextLocker) {
                 suggestedNextLocker = truckData.lockers.find(l => getLockerCheckStatus(l.id) !== 'complete');
            }

            nextLockerToStartId = suggestedNextLocker ? suggestedNextLocker.id : null;

            truckData.lockers.forEach(locker => {
                const status = getLockerCheckStatus(locker.id);
                const lockerBtn = document.createElement('button');
                lockerBtn.className = 'w-full bg-gray-100 p-4 rounded-lg flex items-center justify-between text-gray-800 border-2';
                lockerBtn.dataset.lockerId = locker.id;
                
                if (locker.id === nextLockerToStartId) {
                    lockerBtn.classList.add('border-blue-500');
                } else {
                    lockerBtn.classList.add('border-transparent');
                }

                let icon = '';
                if (status === 'complete') icon = '<span class="text-green-500 text-2xl">&#10003;</span>';
                if (status === 'partial') icon = '<span class="text-yellow-500 text-2xl font-bold">!</span>';
                if (status === 'untouched') icon = '<span class="text-gray-400 text-2xl">&#9675;</span>';
                
                lockerBtn.innerHTML = `<span>${locker.name}</span> ${icon}`;
                lockerBtn.addEventListener('click', () => {
                    nextLockerToStartId = locker.id;
                    document.querySelectorAll('#next-locker-list-container button').forEach(btn => {
                        btn.classList.remove('border-blue-500');
                        btn.classList.add('border-transparent');
                    });
                    lockerBtn.classList.remove('border-transparent');
                    lockerBtn.classList.add('border-blue-500');
                });
                container.appendChild(lockerBtn);
            });

            if (allLockersComplete) {
                mainButtons.finishChecksEarly.classList.remove('hidden');
            } else {
                mainButtons.finishChecksEarly.classList.add('hidden');
            }
        }
        
        function renderSummaryScreen() {
            const container = document.getElementById('summary-list-container');
            container.innerHTML = '';
            const issues = checkResults.filter(r => r.status === 'missing' || (r.status === 'note' && r.note));
            if (issues.length === 0) {
                container.innerHTML = `<div class="text-center p-8 bg-green-100 text-green-800 rounded-lg"><h3 class="text-2xl font-bold">All Clear!</h3><p>No issues found during the check.</p></div>`;
            } else {
                issues.forEach(issue => {
                    const issueCard = document.createElement('div');
                    issueCard.className = `p-4 rounded-lg flex items-start gap-4 ${issue.status === 'missing' ? 'bg-red-100' : 'bg-amber-100'}`;
                    issueCard.innerHTML = `<img src="${issue.itemImg || 'https://placehold.co/80x80/e5e7eb/4b5563?text=No+Img'}" class="w-20 h-20 rounded-lg object-cover flex-shrink-0"><div class="flex-grow"><p class="font-bold text-lg">${issue.itemName}</p><p class="text-sm text-gray-600">Locker: ${issue.lockerName}</p>${issue.status === 'note' ? `<p class="mt-2 p-2 bg-white rounded text-sm"><strong>Note:</strong> ${issue.note}</p>` : ''}${issue.status === 'missing' ? `<p class="mt-2 font-bold text-red-700">STATUS: MISSING</p>` : ''}</div><button data-locker-id="${issue.lockerId}" class="recheck-locker-btn bg-blue-500 text-white text-sm font-bold py-1 px-3 rounded-full self-center">Re-check</button>`;
                    container.appendChild(issueCard);
                });
            }
            showScreen('summary');
        }

        function findItemById(itemId) {
            for (const locker of truckData.lockers) {
                for (const shelf of locker.shelves) {
                    const item = shelf.items.find(i => i.id === itemId);
                    if (item) return item;
                }
            }
            return null;
        }

        // --- EVENT LISTENERS ---
        mainButtons.resetApp.addEventListener('click', startChecks);
        mainButtons.finishChecksEarly.addEventListener('click', renderSummaryScreen);
        mainButtons.backToLockerList.addEventListener('click', handleLockerCompletion);
        checkerUI.nextLockerBtn.addEventListener('click', handleLockerCompletion);
        checkerUI.backToSummaryBtn.addEventListener('click', renderSummaryScreen);
        mainButtons.goToSelectedLocker.addEventListener('click', () => {
            if(nextLockerToStartId) {
                startLockerCheck(nextLockerToStartId);
            }
        });

        checkButtons.present.addEventListener('click', () => processCheck('present'));
        checkButtons.missing.addEventListener('click', () => processCheck('missing'));
        checkButtons.note.addEventListener('click', () => processCheck('note'));
        noteModal.saveBtn.addEventListener('click', saveNoteAndProceed);
        
        document.getElementById('summary-list-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('recheck-locker-btn')) {
                const lockerId = parseInt(e.target.dataset.lockerId);
                startLockerCheck(lockerId, true);
            }
        });

        // --- INITIALIZATION ---
        loadTruckData();
        startChecks();
    });