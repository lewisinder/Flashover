const auth = firebase.auth();
const db = firebase.firestore();
const loadingOverlay = document.getElementById('loading-overlay');
const reportsListContainer = document.getElementById('reports-list-container');
const reportDetailModal = document.getElementById('report-detail-modal');
const reportDetailTitle = document.getElementById('report-detail-title');
const reportDetailContent = document.getElementById('report-detail-content');
const closeReportDetailBtn = document.getElementById('close-report-detail-btn');

// Signature display elements
const signatureDisplayArea = document.getElementById('signature-display-area');
const signerNameDisplay = document.getElementById('signer-name-display');
const signatureImageDisplay = document.getElementById('signature-image-display');

let currentUser = null;

function showLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'none';
}

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        loadReports();
    } else {
        window.location.href = '/signin.html';
    }
});

document.getElementById('back-btn').addEventListener('click', () => {
    window.location.href = '/appliance-checks.html';
});

closeReportDetailBtn.addEventListener('click', () => {
    reportDetailModal.classList.add('hidden');
});

async function loadReports() {
    showLoading();
    reportsListContainer.innerHTML = '<p>Loading reports...</p>';

    try {
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!brigadeId) {
            throw new Error("No active brigade selected.");
        }

        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/reports/brigade/${brigadeId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch reports.');
        }

        const reports = await response.json();
        reportsListContainer.innerHTML = '';

        if (reports.length === 0) {
            reportsListContainer.innerHTML = '<p>No reports found for this brigade.</p>';
            return;
        }

        reports.forEach(report => {
            const reportElement = document.createElement('div');
            reportElement.className = 'report-item-card';
            reportElement.innerHTML = `
                <h3 class="text-xl font-bold">${report.applianceName}</h3>
                <p class="text-gray-600">Checked by: ${report.creatorName}</p>
                <p class="text-gray-500 text-sm">${new Date(report.date).toLocaleString()}</p>
            `;
            reportElement.addEventListener('click', () => viewReportDetails(report.id));
            reportsListContainer.appendChild(reportElement);
        });

    } catch (error) {
        console.error("Error loading reports:", error);
        reportsListContainer.innerHTML = `<p class="text-red-action-2">${error.message}</p>`;
    } finally {
        hideLoading();
    }
}

async function viewReportDetails(reportId) {
    showLoading();
    reportDetailTitle.textContent = 'Loading Report...';
    reportDetailContent.innerHTML = '';
    signatureDisplayArea.classList.add('hidden'); // Hide signature area by default
    reportDetailModal.classList.remove('hidden');

    try {
        const brigadeId = localStorage.getItem('activeBrigadeId');
        if (!brigadeId) throw new Error("No active brigade selected.");
        
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${brigadeId}/reports/${reportId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch report details.');
        }

        const report = await response.json();
        
        reportDetailTitle.textContent = `Report for ${report.applianceName}`;

        let contentHtml = `<div class="p-4 space-y-6 bg-gray-100">`;
        contentHtml += `
            <div class="bg-white p-3 rounded-lg shadow">
                <h3 class="text-lg font-bold text-gray-800 mb-2">Report Details</h3>
                <p><strong>Checked by:</strong> ${report.username}</p>
                <p><strong>Date:</strong> ${new Date(report.date).toLocaleString()}</p>
            </div>
        `;

        const statusIcons = { present: '/design_assets/Yes Icon.png', missing: '/design_assets/No Icon.png', note: '/design_assets/Note Icon.png', partial: '/design_assets/Note Icon.png' };

        const renderItem = (item, isSubItem) => {
            const iconSrc = statusIcons[item.status] || '/design_assets/No Icon.png';
            let itemHtml = `
                <div class="${isSubItem ? 'ml-6' : ''}">
                    <div class="bg-white p-3 rounded-lg shadow-sm flex items-center">
                        <img src="${iconSrc}" alt="${item.status}" class="h-6 w-6 mr-3">
                        <span class="font-semibold">${item.name}</span>
                    </div>
            `;
            if (item.note) itemHtml += `<div class="text-sm text-gray-600 italic pl-10 py-1">Note: ${item.note}</div>`;
            if (item.type === 'container' && item.subItems && item.subItems.length > 0) {
                itemHtml += '<div class="mt-2 space-y-2">';
                item.subItems.forEach(subItem => { itemHtml += renderItem(subItem, true); });
                itemHtml += '</div>';
            }
            itemHtml += '</div>';
            return itemHtml;
        };

        if (report.lockers && report.lockers.length > 0) {
            report.lockers.forEach(locker => {
                contentHtml += `
                    <div class="bg-blue p-4 rounded-xl shadow-lg">
                        <h4 class="text-white text-center text-xl font-bold mb-3 uppercase">${locker.name}</h4>
                        <div class="space-y-3">
                `;
                locker.shelves.forEach(shelf => { shelf.items.forEach(item => { contentHtml += renderItem(item, false); }); });
                contentHtml += `</div></div>`;
            });
        } else {
            contentHtml += '<p>This report contains no locker data.</p>';
        }

        contentHtml += `</div>`;
        reportDetailContent.innerHTML = contentHtml;

        // Handle signature display
        if (report.signedBy && report.signatureDataUrl) {
            signerNameDisplay.textContent = report.signedBy;
            signatureImageDisplay.src = report.signatureDataUrl;
            signatureDisplayArea.classList.remove('hidden');
        }

    } catch (error) {
        console.error("Error loading report details:", error);
        reportDetailContent.innerHTML = `<p class="text-red-action-2 p-4">${error.message}</p>`;
    } finally {
        hideLoading();
    }
}
