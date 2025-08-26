const auth = firebase.auth();
const db = firebase.firestore();
const loadingOverlay = document.getElementById('loading-overlay');
const reportsListContainer = document.getElementById('reports-list-container');
const reportDetailModal = document.getElementById('report-detail-modal');
const reportDetailTitle = document.getElementById('report-detail-title');
const reportDetailContent = document.getElementById('report-detail-content');
const closeReportDetailBtn = document.getElementById('close-report-detail-btn');

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
    reportDetailModal.classList.remove('hidden');

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/reports/${reportId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch report details.');
        }

        const report = await response.json();
        
        reportDetailTitle.textContent = `Report for ${report.applianceName} - ${new Date(report.date).toLocaleDateString()}`;

        let contentHtml = `
            <p><strong>Checked by:</strong> ${report.username}</p>
            <p><strong>Total Items Checked:</strong> ${report.totalItems}</p>
            <p><strong>Duration:</strong> ${report.duration}</p>
        `;

        if (report.issues && report.issues.length > 0) {
            contentHtml += '<h4 class="text-xl font-bold mt-4 text-red-action-2">Issues Found</h4>';
            contentHtml += '<ul class="list-disc list-inside space-y-2">';
            report.issues.forEach(issue => {
                contentHtml += `<li class="p-2 bg-red-100 rounded-md"><strong>${issue.name}</strong> (${issue.location}): ${issue.status} - ${issue.notes || 'No notes'}</li>`;
            });
            contentHtml += '</ul>';
        } else {
            contentHtml += '<p class="mt-4 text-green-action-1 font-bold">No issues were found during this check.</p>';
        }

        reportDetailContent.innerHTML = contentHtml;

    } catch (error) {
        console.error("Error loading report details:", error);
        reportDetailContent.innerHTML = `<p class="text-red-action-2">${error.message}</p>`;
    } finally {
        hideLoading();
    }
}