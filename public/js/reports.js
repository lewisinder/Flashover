
document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References specific to this page
    const reportsScreen = document.getElementById('reports-screen');
    const reportsListContainer = document.getElementById('reports-list-container');
    const reportDetailModal = { overlay: document.getElementById('report-detail-modal'), title: document.getElementById('report-detail-title'), content: document.getElementById('report-detail-content'), closeBtn: document.getElementById('close-report-detail-btn') };

    // Functions specific to this page
    async function showReportsScreen() {
        showLoader();
        try {
            const response = await fetch(`/api/reports/${username}`);
            const reports = await response.json();
            reportsListContainer.innerHTML = '';
            if (reports.length === 0) {
                reportsListContainer.innerHTML = '<p class="text-center text-gray-500">No past reports found.</p>';
            } else {
                reports.forEach(report => {
                    const reportDiv = document.createElement('div');
                    reportDiv.className = 'bg-gray-100 p-4 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors';
                    reportDiv.innerHTML = `<p class="font-bold">${report.date}</p>`;
                    reportDiv.addEventListener('click', () => showReportDetails(report.fileName, report.date));
                    reportsListContainer.appendChild(reportDiv);
                });
            }
            showScreen('reports-screen');
        } catch (error) {
            console.error('Error fetching reports:', error);
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
            
            reportDetailModal.title.textContent = `Report from ${date}`;
            reportDetailModal.content.innerHTML = '';

            if (reportData.lockers && reportData.lockers.length > 0) {
                reportData.lockers.forEach(locker => {
                    const lockerDiv = document.createElement('div');
                    lockerDiv.className = 'border-b pb-2';
                    
                    const statusIcons = {
                        present: '<span class="text-green-action-1">●</span>',
                        missing: '<span class="text-red-action-1">●</span>',
                        note: '<span class="text-orange-action-1">●</span>',
                        partial: '<span class="text-purple-500">●</span>',
                        untouched: '<span class="text-gray-400">●</span>'
                    };

                    let lockerHtml = `<div class="flex items-center justify-between cursor-pointer p-2 bg-gray-100 rounded-lg" onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <h4 class="text-lg font-semibold">${locker.name}</h4>
                        <span class="text-xl">&#9662;</span>
                    </div><div class="pl-4 pt-2 hidden">`;

                    locker.shelves.forEach(shelf => {
                        shelf.items.forEach(item => {
                            lockerHtml += `<div class="flex items-center py-1">
                                ${statusIcons[item.status] || statusIcons.untouched}
                                <span class="ml-2">${item.name}</span>
                                ${item.note ? `<em class="ml-2 text-gray-500 text-sm"> - "${item.note}"</em>` : ''}
                            </div>`;
                            
                            if (item.type === 'container' && item.subItems) {
                                lockerHtml += '<div class="pl-6 border-l-2 border-gray-300 ml-1">';
                                item.subItems.forEach(subItem => {
                                    lockerHtml += `<div class="flex items-center py-1">
                                        ${statusIcons[subItem.status] || statusIcons.untouched}
                                        <span class="ml-2">${subItem.name}</span>
                                        ${subItem.note ? `<em class="ml-2 text-gray-500 text-sm"> - "${subItem.note}"</em>` : ''}
                                    </div>`;
                                });
                                lockerHtml += '</div>';
                            }
                        });
                    });

                    lockerHtml += `</div>`;
                    lockerDiv.innerHTML = lockerHtml;
                    reportDetailModal.content.appendChild(lockerDiv);
                });
            } else {
                reportDetailModal.content.innerHTML = '<p class="text-center text-gray-500">This report contains no locker data.</p>';
            }

            reportDetailModal.overlay.classList.remove('hidden');
        } catch (error) {
            console.error('Error fetching report details:', error);
            alert('Could not load the report details.');
        } finally {
            hideLoader();
        }
    }

    // Event Listeners
    document.getElementById('back-home-from-reports-btn').addEventListener('click', () => { window.location.href = '/appliance-checks.html'; });
    reportDetailModal.closeBtn.addEventListener('click', () => {
        reportDetailModal.overlay.classList.add('hidden');
    });

    // Initial load for reports page
    loadData(); // Load truckData for findItemById in showReportDetails
    showReportsScreen();
});
