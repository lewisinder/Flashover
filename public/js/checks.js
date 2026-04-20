function initChecksPage(options = {}) {
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
    let unsubscribeAuth = null;
    const privateImageUrlCache = new Map();

    const isShell = options && options.isShell === true;
    const navigateToChecksHome =
        typeof options.navigateToChecksHome === 'function' ? options.navigateToChecksHome : null;
    const navigateToMenu =
        typeof options.navigateToMenu === 'function' ? options.navigateToMenu : null;

    function goToSignIn() {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.href = `/signin.html?returnTo=${encodeURIComponent(returnTo)}`;
    }

    function goToChecksHome() {
        if (isShell) {
            if (navigateToChecksHome) return navigateToChecksHome();
            window.location.hash = '#/checks';
            return;
        }
        window.location.href = '/appliance-checks.html';
    }

    function goToMenu() {
        if (isShell) {
            if (navigateToMenu) return navigateToMenu();
            window.location.hash = '#/menu';
            return;
        }
        window.location.href = '/menu.html';
    }

    function isPrivateImageRef(value) {
        return typeof value === 'string' && /^uploads\/[^/]+\/image-[A-Za-z0-9._-]+\.webp$/.test(value);
    }

    function isDirectImageRef(value) {
        return typeof value === 'string' && (
            value.startsWith('blob:') ||
            value.startsWith('/design_assets/') ||
            value.startsWith('https://storage.googleapis.com/') ||
            value.startsWith('https://firebasestorage.googleapis.com/')
        );
    }

    async function resolveImageDisplayUrl(imageRef) {
        if (!imageRef) return '';
        if (isDirectImageRef(imageRef)) return imageRef;
        if (!isPrivateImageRef(imageRef) || !currentUser) return '';
        if (privateImageUrlCache.has(imageRef)) return privateImageUrlCache.get(imageRef);
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!brigadeId) return '';
        const fileName = imageRef.split('/').pop();
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${encodeURIComponent(brigadeId)}/images/${encodeURIComponent(fileName)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Image load failed (${response.status})`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        privateImageUrlCache.set(imageRef, url);
        return url;
    }

    function setImageElementSource(imgEl, imageRef, fallback = '/design_assets/Flashover Logo.png') {
        if (!imgEl) return;
        const ref = imageRef || '';
        imgEl.dataset.imageRef = ref;
        if (!ref) {
            imgEl.src = fallback;
            return;
        }
        if (isDirectImageRef(ref)) {
            imgEl.src = ref;
            return;
        }
        imgEl.src = fallback;
        void resolveImageDisplayUrl(ref)
            .then((url) => {
                if (url && imgEl.dataset.imageRef === ref) imgEl.src = url;
            })
            .catch((error) => {
                console.error('Could not load private image:', error);
            });
    }

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
            goToMenu();
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
            goToMenu();
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
                    item.noteImage = result ? result.noteImage || '' : '';
                    if (item.type === 'container' && item.subItems) {
                        item.subItems.forEach(subItem => {
                            const subResult = checkResults.find(r => r.itemId === subItem.id);
                            subItem.status = subResult ? subResult.status : 'untouched';
                            subItem.note = subResult ? subResult.note : '';
                            subItem.noteImage = subResult ? subResult.noteImage || '' : '';
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

    const SIGNOFF_NAME_KEY = 'reportSignedName';
    const SIGNOFF_SIGNATURE_KEY = 'reportSignature';
    let reportSignedName = '';
    let reportSignature = null;

    function loadStateFromSession() {
        checkResults = JSON.parse(sessionStorage.getItem('checkResults')) || [];
        currentCheckState = JSON.parse(sessionStorage.getItem('currentCheckState')) || { lockerId: null, selectedItemId: null, isRechecking: false, isInsideContainer: false, parentItemId: null };
        checkInProgress = sessionStorage.getItem('checkInProgress') === 'true';

        reportSignedName = String(sessionStorage.getItem(SIGNOFF_NAME_KEY) || '').trim();
        try {
            reportSignature = JSON.parse(sessionStorage.getItem(SIGNOFF_SIGNATURE_KEY) || 'null');
        } catch (e) {
            reportSignature = null;
        }

        const fallbackName = (currentUser && (currentUser.displayName || currentUser.email)) || '';
        if (signoffUI && signoffUI.appUsername) {
            signoffUI.appUsername.textContent = `App username: ${fallbackName || 'Unknown'}`;
        }
        if (signoffUI && signoffUI.nameInput) signoffUI.nameInput.value = reportSignedName || fallbackName || '';
        if (signaturePad) {
            if (reportSignature) signaturePad.setData(reportSignature);
            else signaturePad.clear();
        }
        updateSignoffConfirmState();
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
        signoff: getElement('signoff-screen'),
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
        imageInput: getElement('note-image-input'),
        imagePreviewWrap: getElement('note-image-preview-wrap'),
        imagePreview: getElement('note-image-preview'),
        imageStatus: getElement('note-image-status'),
        clearImageBtn: getElement('clear-note-image-btn'),
        saveBtn: getElement('btn-save-note'),
        cancelBtn: getElement('cancel-note-btn')
    };
    let noteModalImageRef = '';
    let noteModalSelectedFile = null;
    let noteModalPreviewObjectUrl = '';

    function setNoteImageStatus(message, state = '') {
        if (!noteModal.imageStatus) return;
        noteModal.imageStatus.classList.remove('hidden', 'text-red-action-2', 'text-green-action-1', 'text-gray-600');
        noteModal.imageStatus.classList.add(
            state === 'error' ? 'text-red-action-2' : state === 'success' ? 'text-green-action-1' : 'text-gray-600'
        );
        noteModal.imageStatus.textContent = message || '';
        if (!message) noteModal.imageStatus.classList.add('hidden');
    }

    function revokeNotePreviewObjectUrl() {
        if (noteModalPreviewObjectUrl) {
            URL.revokeObjectURL(noteModalPreviewObjectUrl);
            noteModalPreviewObjectUrl = '';
        }
    }

    function clearNoteImageSelection({ clearExisting = true } = {}) {
        revokeNotePreviewObjectUrl();
        noteModalSelectedFile = null;
        if (clearExisting) noteModalImageRef = '';
        if (noteModal.imageInput) noteModal.imageInput.value = '';
        if (noteModal.imagePreview) {
            noteModal.imagePreview.removeAttribute('src');
            noteModal.imagePreview.dataset.imageRef = '';
        }
        noteModal.imagePreviewWrap?.classList.add('hidden');
        setNoteImageStatus('');
    }

    function setNoteImagePreview(imageRef) {
        if (!noteModal.imagePreview || !noteModal.imagePreviewWrap) return;
        noteModal.imagePreviewWrap.classList.toggle('hidden', !imageRef);
        if (!imageRef) {
            noteModal.imagePreview.removeAttribute('src');
            noteModal.imagePreview.dataset.imageRef = '';
            return;
        }
        setImageElementSource(noteModal.imagePreview, imageRef, '/design_assets/Flashover Logo.png');
    }

    function resetNoteModalImage(existingImageRef = '') {
        clearNoteImageSelection({ clearExisting: false });
        noteModalImageRef = existingImageRef || '';
        setNoteImagePreview(noteModalImageRef);
        if (noteModalImageRef) setNoteImageStatus('Image attached.', 'success');
    }

    function handleNoteImageSelected(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        if (!file.type || !file.type.toLowerCase().startsWith('image/')) {
            clearNoteImageSelection();
            setNoteImageStatus('Please choose an image file.', 'error');
            return;
        }
        revokeNotePreviewObjectUrl();
        noteModalSelectedFile = file;
        noteModalImageRef = '';
        noteModalPreviewObjectUrl = URL.createObjectURL(file);
        if (noteModal.imagePreview) {
            noteModal.imagePreview.dataset.imageRef = noteModalPreviewObjectUrl;
            noteModal.imagePreview.src = noteModalPreviewObjectUrl;
        }
        noteModal.imagePreviewWrap?.classList.remove('hidden');
        setNoteImageStatus('Image ready to attach.');
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
                if (event.lengthComputable && typeof onProgress === 'function') onProgress(event);
            };
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
                else reject(new Error(xhr.responseText || xhr.statusText || `Upload failed (${xhr.status})`));
            };
            xhr.onerror = () => reject(new Error('Network request failed'));
            xhr.send(formData);
        });
    }

    async function uploadNoteImageIfNeeded() {
        if (!noteModalSelectedFile) return noteModalImageRef || '';
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!currentUser || !brigadeId) throw new Error('Could not attach image: missing brigade or user.');

        const formData = new FormData();
        formData.append('image', noteModalSelectedFile, noteModalSelectedFile.name || 'note-image.jpg');
        const token = await currentUser.getIdToken();
        const responseText = await uploadWithProgress('/api/check-note-image', token, formData, (event) => {
            const percent = Math.round((event.loaded / event.total) * 100);
            setNoteImageStatus(`Uploading image ${percent}%...`);
        }, { 'x-brigade-id': brigadeId });
        const result = JSON.parse(responseText || '{}');
        return result.storagePath || result.filePath || '';
    }
    
    const exitConfirmModal = {
        overlay: getElement('exit-confirm-modal'),
        exitAnywayBtn: getElement('confirm-exit-anyway-btn'),
        cancelBtn: getElement('cancel-exit-btn')
    };

    const checkButtons = {
        present: getElement('btn-present'),
        missing: getElement('btn-missing'),
        note: getElement('btn-note'),
        checkContents: getElement('btn-check-contents'),
        containerMissing: getElement('btn-container-missing')
    };

    const signoffUI = {
        appUsername: getElement('signoff-app-username'),
        nameInput: getElement('signoff-name'),
        canvas: getElement('signoff-signature-canvas'),
        clearBtn: getElement('signoff-clear-signature-btn'),
        backBtn: getElement('signoff-back-btn'),
        confirmBtn: getElement('signoff-confirm-btn'),
    };

    function persistSignoffState() {
        try {
            const name = String(reportSignedName || '').trim();
            if (name) sessionStorage.setItem(SIGNOFF_NAME_KEY, name);
            else sessionStorage.removeItem(SIGNOFF_NAME_KEY);
        } catch (e) {}

        try {
            if (reportSignature) sessionStorage.setItem(SIGNOFF_SIGNATURE_KEY, JSON.stringify(reportSignature));
            else sessionStorage.removeItem(SIGNOFF_SIGNATURE_KEY);
        } catch (e) {}
    }

    function clearSignoffState() {
        reportSignedName = '';
        reportSignature = null;
        try {
            sessionStorage.removeItem(SIGNOFF_NAME_KEY);
            sessionStorage.removeItem(SIGNOFF_SIGNATURE_KEY);
        } catch (e) {}
        if (signoffUI && signoffUI.nameInput) signoffUI.nameInput.value = '';
        if (signaturePad) signaturePad.clear();
        updateSignoffConfirmState();
    }

    function clamp01(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 0;
        if (n < 0) return 0;
        if (n > 1) return 1;
        return n;
    }

    function sanitizeSignatureData(data) {
        if (!data || typeof data !== 'object') return null;
        const rawStrokes = Array.isArray(data.strokes) ? data.strokes : null;
        if (!rawStrokes) return null;

        // Firestore does not allow arrays-of-arrays. Keep strokes as arrays of objects.
        // Keep the payload compact so report saving stays fast and reliable.
        const MAX_STROKES = 8;
        const MAX_POINTS_TOTAL = 250;
        let pointsTotal = 0;

        const cleanedStrokes = [];

        for (const rawStroke of rawStrokes.slice(0, MAX_STROKES)) {
            let points = [];

            // Accept either legacy array points ([x,y]) or object points ({x,y})
            if (rawStroke && typeof rawStroke === 'object' && Array.isArray(rawStroke.points)) {
                points = rawStroke.points;
            } else if (Array.isArray(rawStroke)) {
                points = rawStroke;
            } else {
                continue;
            }

            const cleanedPoints = [];
            for (const pt of points) {
                if (pointsTotal >= MAX_POINTS_TOTAL) break;
                let x = null;
                let y = null;
                if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
                    x = pt.x;
                    y = pt.y;
                } else if (Array.isArray(pt) && pt.length >= 2) {
                    x = pt[0];
                    y = pt[1];
                }
                if (x == null || y == null) continue;

                const cx = clamp01(x);
                const cy = clamp01(y);
                cleanedPoints.push({ x: Number(cx.toFixed(2)), y: Number(cy.toFixed(2)) });
                pointsTotal += 1;
            }

            if (cleanedPoints.length > 0) cleanedStrokes.push({ points: cleanedPoints });
            if (pointsTotal >= MAX_POINTS_TOTAL) break;
        }

        if (cleanedStrokes.length === 0) return null;
        return { version: 1, strokes: cleanedStrokes };
    }

    function createSignaturePad(canvas, { onChange, onActivity } = {}) {
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const state = {
            data: { version: 1, strokes: [] },
            drawing: false,
            currentStroke: null,
            lastPoint: null,
            cssWidth: 0,
            cssHeight: 0,
            dpr: 1,
        };

        function setCanvasStyle() {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#111827';
            ctx.fillStyle = '#111827';
            ctx.lineWidth = 2.5;
        }

        function ensureSize() {
            const rect = canvas.getBoundingClientRect();
            const cssWidth = Math.max(1, Math.round(rect.width || 0));
            const cssHeight = Math.max(1, Math.round(rect.height || 0));
            const dpr = window.devicePixelRatio || 1;
            if (cssWidth === state.cssWidth && cssHeight === state.cssHeight && dpr === state.dpr) return;
            state.cssWidth = cssWidth;
            state.cssHeight = cssHeight;
            state.dpr = dpr;
            canvas.width = Math.round(cssWidth * dpr);
            canvas.height = Math.round(cssHeight * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            setCanvasStyle();
            redraw();
        }

        function clearCanvas() {
            if (!state.cssWidth || !state.cssHeight) return;
            ctx.clearRect(0, 0, state.cssWidth, state.cssHeight);
        }

        function normToCss(pt) {
            return {
                x: pt.x * state.cssWidth,
                y: pt.y * state.cssHeight,
            };
        }

        function redraw() {
            if (!state.cssWidth || !state.cssHeight) return;
            clearCanvas();
            setCanvasStyle();
            ctx.beginPath();
            state.data.strokes.forEach((stroke) => {
                // Accept either:
                // - New format: { points: [{x,y}, ...] }
                // - Legacy format: [{x,y}, ...] (or even [[x,y], ...])
                const points =
                    stroke && typeof stroke === 'object' && Array.isArray(stroke.points) ? stroke.points : stroke;
                if (!Array.isArray(points) || points.length === 0) return;

                const first = points[0];
                if (first && typeof first === 'object' && !Array.isArray(first)) {
                    const p0 = normToCss(first);
                    ctx.moveTo(p0.x, p0.y);
                } else if (Array.isArray(first) && first.length >= 2) {
                    const p0 = normToCss({ x: first[0], y: first[1] });
                    ctx.moveTo(p0.x, p0.y);
                } else {
                    return;
                }

                for (let i = 1; i < points.length; i += 1) {
                    const pt = points[i];
                    if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
                        const p = normToCss(pt);
                        ctx.lineTo(p.x, p.y);
                    } else if (Array.isArray(pt) && pt.length >= 2) {
                        const p = normToCss({ x: pt[0], y: pt[1] });
                        ctx.lineTo(p.x, p.y);
                    }
                }
            });
            ctx.stroke();
        }

        function getPointFromEvent(e) {
            const rect = canvas.getBoundingClientRect();
            const width = rect.width || 1;
            const height = rect.height || 1;
            const x = (e.clientX - rect.left) / width;
            const y = (e.clientY - rect.top) / height;
            return { x: Number(clamp01(x).toFixed(4)), y: Number(clamp01(y).toFixed(4)) };
        }

        function distanceSq(a, b) {
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            return dx * dx + dy * dy;
        }

        function drawDot(point) {
            const p = normToCss(point);
            ctx.beginPath();
            ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        function drawSegment(a, b) {
            const p1 = normToCss(a);
            const p2 = normToCss(b);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        function getData() {
            const strokesSnapshot = Array.isArray(state.data.strokes) ? state.data.strokes.slice() : [];
            if (Array.isArray(state.currentStroke) && state.currentStroke.length > 0) {
                strokesSnapshot.push({ points: state.currentStroke });
            }

            const snapshot = { version: 1, strokes: strokesSnapshot };
            return sanitizeSignatureData(snapshot);
        }

        function setData(data) {
            const sanitized = sanitizeSignatureData(data);
            state.data = sanitized || { version: 1, strokes: [] };
            redraw();
            if (typeof onChange === 'function') onChange(getData());
        }

        function clear() {
            state.data = { version: 1, strokes: [] };
            state.drawing = false;
            state.currentStroke = null;
            state.lastPoint = null;
            clearCanvas();
            if (typeof onChange === 'function') onChange(null);
        }

        function handlePointerDown(e) {
            if (e.button != null && e.button !== 0) return;
            ensureSize();
            setCanvasStyle();
            state.drawing = true;
            state.currentStroke = [];
            state.lastPoint = null;
            const p = getPointFromEvent(e);
            state.currentStroke.push(p);
            state.lastPoint = p;
            drawDot(p);
            try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
            if (typeof onActivity === 'function') onActivity();
            e.preventDefault();
        }

        function handlePointerMove(e) {
            if (!state.drawing || !state.currentStroke) return;
            const p = getPointFromEvent(e);
            const prev = state.lastPoint;
            if (prev && distanceSq(prev, p) < 0.00005) return; // de-noise tiny moves
            state.currentStroke.push(p);
            if (prev) drawSegment(prev, p);
            state.lastPoint = p;
            if (typeof onActivity === 'function') onActivity();
            e.preventDefault();
        }

        function endStroke(e) {
            if (!state.drawing) return;
            state.drawing = false;
            try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}

            if (state.currentStroke && state.currentStroke.length > 0) {
                state.data.strokes.push({ points: state.currentStroke });
                state.data = sanitizeSignatureData(state.data) || { version: 1, strokes: [] };
                redraw();
                state.currentStroke = null;
                state.lastPoint = null;
                if (typeof onChange === 'function') onChange(getData());
            }
        }

        canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
        canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', endStroke);
        canvas.addEventListener('pointerleave', endStroke);

        return {
            resize: ensureSize,
            clear,
            getData,
            setData,
        };
    }

    const signaturePad = createSignaturePad(signoffUI && signoffUI.canvas, {
        onChange: (data) => {
            reportSignature = data;
            persistSignoffState();
            updateSignoffConfirmState();
        },
        onActivity: () => {
            // Some browsers may not deliver pointerup to the canvas; keep UI state in sync while drawing.
            updateSignoffConfirmState();
        },
    });

    function updateSignoffConfirmState() {
        const name = String(signoffUI?.nameInput?.value || '').trim();
        const hasSig = !!(signaturePad && signaturePad.getData());
        const enabled = !!name && hasSig;
        if (signoffUI && signoffUI.confirmBtn) {
            if (enabled) {
                signoffUI.confirmBtn.disabled = false;
                signoffUI.confirmBtn.removeAttribute('disabled');
            } else {
                signoffUI.confirmBtn.disabled = true;
                signoffUI.confirmBtn.setAttribute('disabled', '');
            }
            signoffUI.confirmBtn.classList.toggle('opacity-60', !enabled);
        }
    }

    if (signoffUI && signoffUI.nameInput) {
        signoffUI.nameInput.addEventListener('input', () => {
            reportSignedName = String(signoffUI.nameInput.value || '').slice(0, 120);
            persistSignoffState();
            updateSignoffConfirmState();
        });
    }
    if (signoffUI && signoffUI.clearBtn) {
        signoffUI.clearBtn.addEventListener('click', () => {
            signaturePad && signaturePad.clear();
        });
    }
    if (signoffUI && signoffUI.backBtn) {
        signoffUI.backBtn.addEventListener('click', () => {
            showScreen('summary');
        });
    }
    if (signoffUI && signoffUI.confirmBtn) {
        signoffUI.confirmBtn.addEventListener('click', async () => {
            if (signoffUI.confirmBtn.disabled) return;
            await saveReport();
        });
    }

    // -------------------------------------------------------------------
    // SECTION D: CORE APP LOGIC
    // -------------------------------------------------------------------
    
    function showScreen(screenId) {
        Object.keys(screens).forEach(key => {
            if (screens[key]) {
                screens[key].classList.toggle('active', key === screenId);
            }
        });

        if (screenId === 'signoff') {
            requestAnimationFrame(() => {
                try {
                    if (signaturePad) signaturePad.resize();
                } catch (e) {}
            });
        }
    }
    
    function startOrResumeChecks() {
        const appliance = getActiveAppliance();
        if (!appliance || !appliance.lockers || appliance.lockers.length === 0) {
            alert("This appliance has no lockers or items to check. Please complete setup first.");
            if (isShell) {
                goToChecksHome();
            } else {
                window.location.href = '/select-appliance.html';
            }
            return;
        }

        if (!checkInProgress) {
            checkResults = [];
            checkInProgress = true;
            clearSignoffState();
            persistSignoffState();
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
            goToMenu();
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
            const shelfContainer = document.createElement('div');
            shelfContainer.className = 'shelf-container';
            const itemsGrid = document.createElement('div');
            itemsGrid.className = 'shelf-items-grid';
            items.forEach((item) => {
                const result = checkResults.find(r => r.itemId === item.id);
                const itemBox = document.createElement('div');
                itemBox.className = 'item-box';
                if (result && ['present', 'missing', 'note', 'defect', 'partial', 'untouched'].includes(result.status)) {
                    itemBox.classList.add(`status-${result.status}`);
                }
                itemBox.dataset.id = item.id;
                const overlay = document.createElement('div');
                overlay.className = 'item-name-overlay';
                overlay.textContent = item.name || 'Item';
                itemBox.appendChild(overlay);
                itemsGrid.appendChild(itemBox);
            });
            shelfContainer.appendChild(itemsGrid);
            const label = document.createElement('h3');
            label.className = 'text-white text-center font-bold text-sm mt-1';
            label.textContent = `Shelf ${index + 1}`;
            shelfWrapper.appendChild(shelfContainer);
            shelfWrapper.appendChild(label);
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
            requestAnimationFrame(() => {
                requestAnimationFrame(() => scrollItemToTop(activeBox));
            });
        }
        
        saveStateToSession();
    }

    function updateItemDetails(item) {
        if (item) {
            setImageElementSource(checkerUI.itemImage, item.img, '/design_assets/Flashover Logo.png');
            checkerUI.itemName.textContent = item.name;
            checkerUI.itemDesc.textContent = item.desc;
            
            const isContainer = item.type === 'container' && !currentCheckState.isInsideContainer;
            checkerUI.controls.classList.toggle('hidden', isContainer);
            checkerUI.containerControls.classList.toggle('hidden', !isContainer);
        } else {
            checkerUI.itemImage.dataset.imageRef = '';
            checkerUI.itemImage.src = '/design_assets/Flashover Logo.png';
            checkerUI.itemName.textContent = 'Select an Item';
            checkerUI.itemDesc.textContent = 'All items in this locker have been checked.';
            checkerUI.controls.classList.add('hidden');
            checkerUI.containerControls.classList.add('hidden');
        }
    }

    function scrollItemToTop(activeBox) {
        const container = checkerUI.lockerLayout;
        if (!container || !activeBox) return;
        const containerRect = container.getBoundingClientRect();
        const itemRect = activeBox.getBoundingClientRect();
        const offsetTop = itemRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({ top: Math.max(0, offsetTop - 8), behavior: 'smooth' });
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

        checkerUI.lockerLayout.innerHTML = '';
        const shelfContainer = document.createElement('div');
        shelfContainer.className = 'shelf-container';
        const title = document.createElement('h3');
        title.className = 'text-blue text-center font-bold text-sm';
        title.textContent = 'Container Contents';
        const grid = document.createElement('div');
        grid.className = 'container-items-grid';
        subItems.forEach((item) => {
            const result = checkResults.find(r => r.itemId === item.id);
            const itemBox = document.createElement('div');
            itemBox.className = 'item-box';
            if (result && ['present', 'missing', 'note', 'defect', 'partial', 'untouched'].includes(result.status)) {
                itemBox.classList.add(`status-${result.status}`);
            }
            itemBox.dataset.id = item.id;
            itemBox.dataset.parentId = container.id;
            const overlay = document.createElement('div');
            overlay.className = 'item-name-overlay';
            overlay.textContent = item.name || 'Item';
            itemBox.appendChild(overlay);
            grid.appendChild(itemBox);
        });
        shelfContainer.appendChild(title);
        shelfContainer.appendChild(grid);
        checkerUI.lockerLayout.appendChild(shelfContainer);

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
        const result = { lockerId: currentCheckState.lockerId, lockerName: findLockerById(currentCheckState.lockerId).name, itemId: parentItemId, itemName: parentItem.name, itemImg: parentItem.img, status: newStatus, note: '', noteImage: '' };
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
             const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: 'missing', note: '', noteImage: '' };
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
            resetNoteModalImage(existingResult?.noteImage || '');
            noteModal.overlay.classList.remove('hidden');
            return;
        }
        
        const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: status, note: '', noteImage: '', parentItemId: currentCheckState.parentItemId };
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
    
    async function saveNoteAndProceed() {
        const item = findItemById(currentCheckState.selectedItemId, currentCheckState.parentItemId);
        const locker = findLockerById(currentCheckState.lockerId);
        const noteText = noteModal.input.value;
        const originalSaveText = noteModal.saveBtn?.textContent || 'Save Note';
        if (noteModal.saveBtn) {
            noteModal.saveBtn.disabled = true;
            noteModal.saveBtn.textContent = noteModalSelectedFile ? 'Uploading...' : 'Saving...';
        }

        let noteImage = noteModalImageRef || '';
        try {
            noteImage = await uploadNoteImageIfNeeded();
        } catch (error) {
            console.error('Note image upload failed:', error);
            setNoteImageStatus(error?.message || 'Image upload failed. Try again or remove the image.', 'error');
            if (noteModal.saveBtn) {
                noteModal.saveBtn.disabled = false;
                noteModal.saveBtn.textContent = originalSaveText;
            }
            return;
        }

        const result = { lockerId: locker.id, lockerName: locker.name, itemId: item.id, itemName: item.name, itemImg: item.img, status: 'note', note: noteText, noteImage, parentItemId: currentCheckState.parentItemId };
        const resultIndex = checkResults.findIndex(r => r.itemId === item.id);
        if (resultIndex > -1) checkResults[resultIndex] = result;
        else checkResults.push(result);
        
        updateItemBoxStatus(item.id, 'note');
        noteModal.overlay.classList.add('hidden');
        resetNoteModalImage('');
        if (noteModal.saveBtn) {
            noteModal.saveBtn.disabled = false;
            noteModal.saveBtn.textContent = originalSaveText;
        }
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
            const status = getLockerCheckStatus(locker.id);
            const nameSpan = document.createElement('span');
            nameSpan.textContent = locker.name || 'Locker';
            const iconSpan = document.createElement('span');
            iconSpan.className = `${colors[status]} text-2xl font-bold`;
            iconSpan.textContent = icons[status];
            lockerBtn.appendChild(nameSpan);
            lockerBtn.appendChild(iconSpan);
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

        function appendNoteDetails(parent, item, className) {
            if (item.note) {
                const note = document.createElement('div');
                note.className = className;
                const noteText = document.createElement('em');
                noteText.textContent = `Note: ${item.note}`;
                note.appendChild(noteText);
                parent.appendChild(note);
            }
            if (item.noteImage) {
                const imageWrap = document.createElement('div');
                imageWrap.className = className;
                const image = document.createElement('img');
                image.alt = `Attached image for ${item.itemName || 'item note'}`;
                image.className = 'mt-2 h-32 w-full max-w-xs rounded-lg object-cover border border-gray-300 bg-gray-100';
                setImageElementSource(image, item.noteImage, '/design_assets/Flashover Logo.png');
                imageWrap.appendChild(image);
                parent.appendChild(imageWrap);
            }
        }

        for (const lockerId in resultsByLocker) {
            const locker = resultsByLocker[lockerId];
            const lockerSection = document.createElement('div');
            lockerSection.className = 'bg-blue rounded-lg p-4 mb-4';
            const lockerTitle = document.createElement('h3');
            lockerTitle.className = 'text-white text-xl font-bold uppercase text-center mb-3';
            lockerTitle.textContent = locker.name || 'Locker';
            const itemList = document.createElement('div');
            itemList.className = 'space-y-2';
            lockerSection.appendChild(lockerTitle);
            lockerSection.appendChild(itemList);

            locker.items.sort((a,b) => a.itemName.localeCompare(b.itemName)).forEach(item => {
                const style = statusStyles[item.status] || statusStyles.untouched;
                const itemRow = document.createElement('div');
                itemRow.style.backgroundColor = '#EDEAE5';
                itemRow.className = 'rounded p-3';
                const topRow = document.createElement('div');
                topRow.className = 'flex items-center justify-between';
                const left = document.createElement('div');
                left.className = 'flex items-center';
                const dot = document.createElement('span');
                dot.className = `${style.color} mr-3 text-2xl`;
                dot.textContent = style.icon;
                const name = document.createElement('span');
                name.className = 'font-semibold';
                name.textContent = item.itemName || 'Item';
                const recheck = document.createElement('button');
                recheck.dataset.lockerId = item.lockerId;
                recheck.dataset.itemId = item.itemId;
                recheck.className = 'recheck-btn bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded-full';
                recheck.textContent = 'Re-check';
                left.appendChild(dot);
                left.appendChild(name);
                topRow.appendChild(left);
                topRow.appendChild(recheck);
                itemRow.appendChild(topRow);

                if (item.status === 'partial' || (findItemById(item.itemId)?.type === 'container')) {
                    const subItems = allCheckedItems.filter(r => r.parentItemId === item.itemId);
                    if (subItems.length > 0) {
                        const subList = document.createElement('div');
                        subList.className = 'ml-6 mt-2 space-y-1';
                        subItems.sort((a,b) => a.itemName.localeCompare(b.itemName)).forEach(subItem => {
                            const subStyle = statusStyles[subItem.status] || statusStyles.untouched;
                            const subRow = document.createElement('div');
                            subRow.className = 'bg-white rounded p-2 shadow-md flex items-center justify-between';
                            const subLeft = document.createElement('div');
                            subLeft.className = 'flex items-center';
                            const subDot = document.createElement('span');
                            subDot.className = `${subStyle.color} mr-3 text-xl`;
                            subDot.textContent = subStyle.icon;
                            const subName = document.createElement('span');
                            subName.textContent = subItem.itemName || 'Item';
                            const subRecheck = document.createElement('button');
                            subRecheck.dataset.lockerId = subItem.lockerId;
                            subRecheck.dataset.itemId = subItem.itemId;
                            subRecheck.dataset.parentItemId = subItem.parentItemId;
                            subRecheck.className = 'recheck-btn bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold py-1 px-3 rounded-full';
                            subRecheck.textContent = 'Re-check';
                            subLeft.appendChild(subDot);
                            subLeft.appendChild(subName);
                            subRow.appendChild(subLeft);
                            subRow.appendChild(subRecheck);
                            subList.appendChild(subRow);
                            appendNoteDetails(subList, subItem, 'pl-8 text-sm text-gray-600');
                        });
                        itemRow.appendChild(subList);
                    }
                }
                
                appendNoteDetails(itemRow, item, 'ml-9 mt-1 text-sm text-gray-600');

                itemList.appendChild(itemRow);
            });

            container.appendChild(lockerSection);
        }

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
            const signedName = String(signoffUI?.nameInput?.value || '').trim();
            if (!signedName) {
                alert('Please enter your name to sign off this report.');
                hideLoading();
                return;
            }
            const signature = signaturePad ? signaturePad.getData() : null;
            if (!signature) {
                alert('Please draw your initials before saving the report.');
                hideLoading();
                return;
            }

            reportSignedName = signedName;
            reportSignature = signature;
            persistSignoffState();

            const reportPayload = {
                date: new Date().toISOString(),
                applianceId: appliance.id,
                applianceName: appliance.name,
                brigadeId: brigadeId,
                lockers: generateFullReportData().lockers,
                signedName,
                signature,
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
                clearSignoffState();
                goToChecksHome();
            } else {
                const bodyText = await response.text().catch(() => "");
                let message = "";
                try {
                    const parsed = JSON.parse(bodyText || "{}");
                    message = parsed && parsed.message ? String(parsed.message) : "";
                } catch (e) {}
                alert(`Failed to save report: ${message || bodyText || `HTTP ${response.status}`}`);
            }
        } catch (error) {
            console.error("Error saving report:", error);
            alert('An error occurred while saving the report.');
        } finally {
            hideLoading();
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
        addSafeEventListener(noteModal.imageInput, 'change', handleNoteImageSelected);
        addSafeEventListener(noteModal.clearImageBtn, 'click', () => clearNoteImageSelection());
        addSafeEventListener(noteModal.cancelBtn, 'click', () => {
            noteModal.overlay.classList.add('hidden');
            clearNoteImageSelection();
        });
        
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
        addSafeEventListener('save-report-btn', 'click', () => {
            // Summary screen only shows Edit / Sign-off / Exit.
            // Saving is done from the sign-off screen after initials + signature.
            const fallbackName = (currentUser && (currentUser.displayName || currentUser.email)) || '';
            if (signoffUI && signoffUI.appUsername) {
                signoffUI.appUsername.textContent = `App username: ${fallbackName || 'Unknown'}`;
            }
            if (signoffUI && signoffUI.nameInput && !signoffUI.nameInput.value) {
                signoffUI.nameInput.value = reportSignedName || fallbackName || '';
            }
            updateSignoffConfirmState();
            showScreen('signoff');
        });
        addSafeEventListener('exit-summary-btn', 'click', () => {
            if (isReportSaved) {
                goToMenu();
            } else {
                exitConfirmModal.overlay.classList.remove('hidden');
            }
        });
        addSafeEventListener(exitConfirmModal.cancelBtn, 'click', () => exitConfirmModal.overlay.classList.add('hidden'));
        addSafeEventListener(exitConfirmModal.exitAnywayBtn, 'click', () => exitCheck(false));
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
            clearSignoffState();
            goToChecksHome();
        }
        hideLoading();
    }

    async function initializeApp() {
        unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                setupEventListeners();
                loadStateFromSession();
                await loadData();
                startOrResumeChecks();
            } else {
                goToSignIn();
            }
        });
    }

    initializeApp();

    return () => {
        try {
            if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
        } catch (e) {}
    };
}

window.initChecksPage = initChecksPage;

function autoStartChecksPage() {
    // Only auto-start on the dedicated checks page, not inside the app shell.
    if (!window.location.pathname.endsWith('/checks.html')) return;
    if (typeof window.__checksCleanup === 'function') return;
    if (!document.getElementById('locker-check-screen')) return;
    window.__checksCleanup = initChecksPage();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStartChecksPage);
} else {
    autoStartChecksPage();
}
