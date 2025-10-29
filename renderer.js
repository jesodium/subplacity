let placeIdInput, fetchBtn, tableBody, placesTable, status, emptyState;

// template
document.addEventListener('DOMContentLoaded', () => {
    placeIdInput = document.getElementById('placeId');
    fetchBtn = document.getElementById('fetchBtn');
    tableBody = document.getElementById('tableBody');
    placesTable = document.getElementById('placesTable');
    status = document.getElementById('status');
    emptyState = document.getElementById('emptyState');
    
    setupEventListeners();
});

let currentPlaces = [];

function setupEventListeners() {
    // grab click 
    fetchBtn.addEventListener('click', async () => {
        const placeId = placeIdInput.value.trim();
        
        if (!placeId) {
            updateStatus('enter a place id');
            return;
        }

        updateStatus('fetching...');
        fetchBtn.disabled = true;
        tableBody.innerHTML = '';
        
        try {
            const result = await window.electronAPI.fetchSubplaces(placeId);
            
            if (result.success) {
                currentPlaces = result.places;
                
                if (result.places.length === 0) {
                    updateStatus('no places found');
                    showTable(false);
                } else {
                    renderPlaces(result.places);
                    updateStatus(`found ${result.places.length} place(s)`);
                    showTable(true);
                }
            } else {
                updateStatus(`error: ${result.error}`);
                showTable(false);
            }
        } catch (error) {
            updateStatus(`error: ${error.message}`);
            showTable(false);
        } finally {
            fetchBtn.disabled = false;
        }
    });

    // Enter key to fetch
    placeIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });
}

function renderPlaces(places) {
    tableBody.innerHTML = '';
    
    places.forEach(place => {
        const row = document.createElement('tr');
        
        const nameCell = document.createElement('td');
        nameCell.textContent = place.name;
        
        const idCell = document.createElement('td');
        idCell.textContent = place.id;
        
        const actionsCell = document.createElement('td');
        
        const openBtn = document.createElement('button');
        openBtn.textContent = 'open';
        openBtn.onclick = () => openPlace(place.id);
        
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'copy';
        copyBtn.onclick = () => copyPlaceId(place.id);
        
        actionsCell.appendChild(openBtn);
        actionsCell.appendChild(document.createTextNode(' '));
        actionsCell.appendChild(copyBtn);
        
        row.appendChild(nameCell);
        row.appendChild(idCell);
        row.appendChild(actionsCell);
        
        tableBody.appendChild(row);
    });
}

async function openPlace(placeId) {
    const result = await window.electronAPI.openPlace(placeId);
    if (result.success) {
        updateStatus(`opened ${placeId}`);
    } else {
        updateStatus(`failed to open: ${result.error}`);
    }
}

async function copyPlaceId(placeId) {
    const result = await window.electronAPI.copyToClipboard(placeId.toString());
    if (result.success) {
        updateStatus(`copied ${placeId}`);
    } else {
        updateStatus(`failed to copy: ${result.error}`);
    }
}

function updateStatus(message) {
    status.textContent = message;
}

function showTable(show) {
    if (show) {
        emptyState.classList.add('hidden');
        placesTable.classList.remove('hidden');
    } else {
        emptyState.classList.remove('hidden');
        placesTable.classList.add('hidden');
    }
}