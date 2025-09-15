// Trigger deployment
document.addEventListener('DOMContentLoaded', () => {
    const firebaseConfig = {
          apiKey: "AIzaSyC-fTzW4YzTTSyCtXSIgxZCZAb7a14t3N4",
          authDomain: "flashoverapplication.firebaseapp.com",
          projectId: "flashoverapplication",
          storageBucket: "flashoverapplication.firebasestorage.app",
          messagingSenderId: "74889025348",
          appId: "1:74889025348:web:baaec1803ade7ffbd06911"
        };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    const auth = firebase.auth();
    let currentUser = null;

    // --- Global State & Variables ---
    let userAppData = { appliances: [] };
    let checkResults = [];
    let currentCheckState = {};
    let checkInProgress = false;
    let isReportSaved = false;
    let nextLockerToStartId = null;
    let signaturePad = null;

    // --- DOM Element References ---
    const getElement = (id) => document.getElementById(id);
    const loadingOverlay = getElement('loading-overlay');

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

    // --- Core Functions ---
    function showLoading() { if (loadingOverlay) loadingOverlay.style.display = 'flex'; }
    function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = 'none'; }

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
            const response = await fetch(`/api/brigades/${brigadeId}/data`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            userAppData = await response.json();
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
        const reportApplianceData = JSON.parse(JSON.stringify(appliance));
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

    function showScreen(screenId) {
        Object.keys(screens).forEach(key => {
            if (screens[key]) screens[key].classList.toggle('active', key === screenId);
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
            loadContainerUI(findItemById(currentCheckState.parentItemId));
        } else {
            loadLockerUI();
        }
        showScreen('lockerCheck');
    }

    function loadLockerUI() { /* ... existing loadLockerUI logic ... */ }
    function selectItemForCheck(itemId, parentId = null) { /* ... existing selectItemForCheck logic ... */ }
    function updateItemDetails(item) { /* ... existing updateItemDetails logic ... */ }
    function startContainerCheck() { /* ... existing startContainerCheck logic ... */ }
    function loadContainerUI(container) { /* ... existing loadContainerUI logic ... */ }
    function finishContainerCheck() { /* ... existing finishContainerCheck logic ... */ }
    function checkIfContainerIsComplete() { /* ... existing checkIfContainerIsComplete logic ... */ }
    function updateItemBoxStatus(itemId, status) { /* ... existing updateItemBoxStatus logic ... */ }
    function processCheck(status) { /* ... existing processCheck logic ... */ }
    function saveNoteAndProceed() { /* ... existing saveNoteAndProceed logic ... */ }
    function checkIfLockerIsComplete() { /* ... existing checkIfLockerIsComplete logic ... */ }
    function handleLockerCompletion() { /* ... existing handleLockerCompletion logic ... */ }
    function getLockerCheckStatus(lockerId) { /* ... existing getLockerCheckStatus logic ... */ }
    function renderNextLockerChoices() { /* ... existing renderNextLockerChoices logic ... */ }
    function renderSummaryScreen() { /* ... existing renderSummaryScreen logic ... */ }
    function findLockerById(lockerId) { /* ... existing findLockerById logic ... */ }
    function findItemById(itemId, parentItemId = null) { /* ... existing findItemById logic ... */ }

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
                if (target) handler(e, target);
            });
        }
    }

    function setupEventListeners() {
        // ... (keep all existing event listeners)

        // Modify the save report button to open the signature modal
        addSafeEventListener('save-report-btn', 'click', openSignatureModal);

        // Add listeners for the new signature modal
        addSafeEventListener(signatureModal.clearBtn, 'click', () => signaturePad.clear());
        addSafeEventListener(signatureModal.cancelBtn, 'click', () => signatureModal.overlay.classList.add('hidden'));
        addSafeEventListener(signatureModal.confirmBtn, 'click', saveReportWithSignature);
        window.addEventListener('resize', resizeCanvas);
    }

    async function exitCheck(shouldSave) { /* ... existing exitCheck logic ... */ }

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
