const username = localStorage.getItem('username');
if (!username) {
    window.location.href = '/login.html';
    // Stop executing the script if not logged in, as this script is for logged-in users.
    throw new Error("User not logged in. Redirecting to login page."); 
}

let truckData = { lockers: [] };

async function loadData() {
    window.showLoader(); // Use global showLoader
    try {
        const response = await fetch(`/api/data/${username}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        truckData = await response.json();
    } catch (error) {
        console.error("Could not load truck data:", error);
        alert("Could not load truck data. Please check the server connection and try again.");
    } finally {
        window.hideLoader(); // Use global hideLoader
    }
}

async function saveData() {
    window.showLoader(); // Use global showLoader
    console.log('Attempting to save data:', truckData);
    try {
        const response = await fetch(`/api/data/${username}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(truckData),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log('Data saved successfully');
    } catch (error) {
        console.error('Failed to save data:', error);
        alert('Failed to save data to the server.');
    } finally {
        window.hideLoader(); // Use global hideLoader
    }
}

function generateFullReportData() {
    const reportTruckData = JSON.parse(JSON.stringify(truckData)); // Deep copy

    reportTruckData.lockers.forEach(locker => {
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
    return reportTruckData;
}

async function deleteImage(imageUrl) {
    if (!imageUrl || !imageUrl.startsWith('/uploads/')) {
        return; // Not a server-managed image
    }
    const fileName = imageUrl.split('/').pop();
    try {
        await fetch(`/api/image/${fileName}`, { method: 'DELETE' });
    } catch (error) {
        console.error('Failed to delete image:', error);
    }
}

function findItemById(itemId, parentItemId = null) {
    if (parentItemId) {
        const parent = findItemById(parentItemId);
        return parent ? parent.subItems.find(i => i.id === itemId) : null;
    }
    for (const locker of truckData.lockers) {
        for (const shelf of locker.shelves) {
            const item = shelf.items.find(i => i.id === itemId);
            if (item) return item;
        }
    }
    return null;
}

function findShelfById(shelfId) {
    for (const locker of truckData.lockers) {
        const shelf = locker.shelves.find(s => s.id === shelfId);
        if (shelf) return shelf;
    }
    return null;
}

// Global screen management
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const loadingOverlay = document.getElementById('loading-overlay');

    window.showLoader = function() {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('hidden');
        }
    };

    window.hideLoader = function() {
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
    };

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('username');
            window.location.href = '/login.html';
        });
    }
});