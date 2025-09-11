const firebaseConfig = {
          apiKey: "AIzaSyC-fTzW4YzTTSyCtXSIgxZCZAb7a14t3N4",
          authDomain: "flashoverapplication.firebaseapp.com",
          projectId: "flashoverapplication",
          storageBucket: "flashoverapplication.firebasestorage.app",
          messagingSenderId: "74889025348",
          appId: "1:74889025348:web:baaec1803ade7ffbd06911"
        };

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Emulator Connection ---
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Connecting to Firebase Emulators from brigade-management.js");
    auth.useEmulator('http://localhost:9099');
    db.useEmulator('localhost', 8080);
    
    const functions = firebase.functions();
    functions.useEmulator('localhost', 5001);
}
// --- End Emulator Connection ---

const brigadeNameHeader = document.getElementById('brigade-name-header');
const memberListDiv = document.getElementById('member-list');
const loadingMembersMsg = document.getElementById('loading-members-msg');
const adminSection = document.getElementById('admin-section');
const addMemberForm = document.getElementById('add-member-form');
const addMemberError = document.getElementById('add-member-error');
const addMemberSuccess = document.getElementById('add-member-success');
const joinRequestsSection = document.getElementById('join-requests-section');
const joinRequestsListDiv = document.getElementById('join-requests-list');
const joinRequestsError = document.getElementById('join-requests-error');
const loadingOverlay = document.getElementById('loading-overlay');

let currentUser = null;
let brigadeId = null;

// --- Utility Functions ---
function showLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    if(loadingOverlay) loadingOverlay.style.display = 'none';
}

// --- Page Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    brigadeId = params.get('id');

    if (!brigadeId) {
        brigadeNameHeader.textContent = 'Brigade Not Found';
        memberListDiv.innerHTML = '<p class="text-red-action-2">No brigade ID was provided in the URL.</p>';
        return;
    }

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            loadBrigadeData();
        } else {
            window.location.href = '/signin.html';
        }
    });
});

// --- Data Loading ---
async function loadBrigadeData() {
    showLoading();
    try {
        // We need to pass the user's token to the backend for authentication
        const token = await currentUser.getIdToken();

        const response = await fetch(`/api/brigades/${brigadeId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Could not fetch brigade data.');
        }

        const brigadeData = await response.json();
        
        // Update UI with brigade data
        brigadeNameHeader.textContent = `${brigadeData.name} (${brigadeData.stationNumber})`;
        
        // Check user's role and show admin tools if applicable
        const currentUserMembership = brigadeData.members.find(m => m.id === currentUser.uid);
        const isCurrentUserAdmin = currentUserMembership && currentUserMembership.role === 'Admin';
        
        if (isCurrentUserAdmin) {
            adminSection.classList.remove('hidden');
            joinRequestsSection.classList.remove('hidden');
            await loadJoinRequests();
        }

        // Display members
        memberListDiv.innerHTML = ''; // Clear loading message
        brigadeData.members.forEach(member => {
            const memberElement = document.createElement('div');
            memberElement.className = 'bg-gray-100 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between';
            
            let adminControls = '';
            
            if (isCurrentUserAdmin) {
                // If the current user is an admin, show controls
                const isSelf = member.id === currentUser.uid; // Check if the member is the admin viewing the page
                
                adminControls = `
                    <div class="flex items-center mt-2 sm:mt-0">
                        <label for="role-${member.id}" class="sr-only">Role</label>
                        <select id="role-${member.id}" class="bg-white border border-gray-300 rounded-md py-1 px-2">
                            <option value="Member" ${member.role === 'Member' ? 'selected' : ''}>Member</option>
                            <option value="Gear Manager" ${member.role === 'Gear Manager' ? 'selected' : ''}>Gear Manager</option>
                            <option value="Admin" ${member.role === 'Admin' ? 'selected' : ''}>Admin</option>
                        </select>
                        <button onclick="updateRole('${member.id}')" class="ml-2 bg-green-action-1 text-white font-semibold py-1 px-3 rounded-lg">Save</button>
                        ${!isSelf ? `<button onclick="removeMember('${member.id}', '${member.name}')" class="ml-2 bg-red-action-2 text-white font-semibold py-1 px-3 rounded-lg">Remove</button>` : ''}
                    </div>
                `;
            }

            memberElement.innerHTML = `
                <div>
                    <p class="text-lg font-semibold">${member.name || 'N/A'}</p>
                    ${!isCurrentUserAdmin ? `<p class="text-gray-600">Role: ${member.role}</p>`: ''}
                </div>
                ${adminControls}
            `;
            memberListDiv.appendChild(memberElement);
        });


    } catch (error) {
        console.error('Error loading brigade data:', error);
        brigadeNameHeader.textContent = 'Error';
        memberListDiv.innerHTML = `<p class="text-red-action-2">${error.message}</p>`;
    } finally {
        hideLoading();
    }
}

async function loadJoinRequests() {
    joinRequestsListDiv.innerHTML = '<p>Loading join requests...</p>';
    joinRequestsError.textContent = '';
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${brigadeId}/join-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Could not fetch join requests.');

        const requests = await response.json();
        joinRequestsListDiv.innerHTML = '';

        if (requests.length === 0) {
            joinRequestsListDiv.innerHTML = '<p>There are no pending join requests.</p>';
            return;
        }

        requests.forEach(req => {
            const reqElement = document.createElement('div');
            reqElement.className = 'bg-gray-100 p-3 rounded-lg flex justify-between items-center';
            reqElement.innerHTML = `
                <div>
                    <p class="font-semibold">${req.userName}</p>
                    <p class="text-sm text-gray-500">Requested on: ${new Date(req.requestedAt._seconds * 1000).toLocaleString()}</p>
                </div>
                <div>
                    <button onclick="handleJoinRequest('${req.id}', 'accept')" class="bg-green-action-1 text-white font-semibold py-1 px-3 rounded-lg">Accept</button>
                    <button onclick="handleJoinRequest('${req.id}', 'deny')" class="ml-2 bg-red-action-2 text-white font-semibold py-1 px-3 rounded-lg">Deny</button>
                </div>
            `;
            joinRequestsListDiv.appendChild(reqElement);
        });

    } catch (error) {
        console.error('Error loading join requests:', error);
        joinRequestsError.textContent = error.message;
    }
}

// --- Admin Actions ---
addMemberForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('member-email').value;
    const addButton = document.getElementById('add-member-btn');

    addMemberError.textContent = '';
    addMemberSuccess.textContent = '';
    addButton.disabled = true;
    addButton.textContent = 'Adding...';
    showLoading();

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${brigadeId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ email: email })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to add member.');
        }

        addMemberSuccess.textContent = result.message;
        addMemberForm.reset();
        await loadBrigadeData(); // Refresh the member list

    } catch (error) {
        console.error('Error adding member:', error);
        addMemberError.textContent = error.message;
    } finally {
        addButton.disabled = false;
        addButton.textContent = 'Add Member';
        hideLoading();
    }
});

async function updateRole(memberId) {
    const roleSelect = document.getElementById(`role-${memberId}`);
    const newRole = roleSelect.value;
    
    addMemberError.textContent = '';
    addMemberSuccess.textContent = '';
    showLoading();

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${brigadeId}/members/${memberId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ role: newRole })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to update role.');
        }

        addMemberSuccess.textContent = result.message;
        // No need to reload data, the UI is already updated visually.
        // Optionally, you could reload to be 100% sure: loadBrigadeData();

    } catch (error) {
        console.error('Error updating role:', error);
        addMemberError.textContent = error.message;
    } finally {
        hideLoading();
    }
}

async function removeMember(memberId, memberName) {
    if (!confirm(`Are you sure you want to remove ${memberName} from the brigade? This action cannot be undone.`)) {
        return;
    }

    addMemberError.textContent = '';
    addMemberSuccess.textContent = '';
    showLoading();

    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${brigadeId}/members/${memberId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to remove member.');
        }

        addMemberSuccess.textContent = result.message;
        await loadBrigadeData(); // Refresh the member list

    } catch (error) {
        console.error('Error removing member:', error);
        addMemberError.textContent = error.message;
    } finally {
        hideLoading();
    }
}

async function handleJoinRequest(userId, action) {
    joinRequestsError.textContent = '';
    showLoading();
    try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/brigades/${brigadeId}/join-requests/${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action: action })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        // Refresh both lists
        await loadJoinRequests();
        await loadBrigadeData();

    } catch (error) {
        console.error('Error handling join request:', error);
        joinRequestsError.textContent = error.message;
    } finally {
        hideLoading();
    }
}
