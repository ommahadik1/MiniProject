const API_URL = "/api"; 
const card = document.getElementById('main-card');
const scene = document.querySelector('.scene');

// --- PHYSICS VARIABLES ---
let currentRotX = 0, currentRotY = 0;
let targetRotX = 0, targetRotY = 0;
let currentFlip = 0, targetFlip = 0; // JS controls the flip now
let currentX = 0, currentY = 0; 
let targetX = 0, targetY = 0;

// --- 1. MOUSE TRACKING (MAGNETIC POP) ---
scene.addEventListener('mousemove', (e) => {
    const rect = scene.getBoundingClientRect();
    const xVal = e.clientX - rect.left - rect.width / 2;
    const yVal = e.clientY - rect.top - rect.height / 2;

    // Corrected Math: Top & Bottom, Left & Right all pop UP towards user.
    targetRotX = yVal / 20; 
    targetRotY = -xVal / 20; 

    // Spotlight Targets
    targetX = e.clientX - rect.left;
    targetY = e.clientY - rect.top;
});

// --- 2. RESET ON LEAVE ---
scene.addEventListener('mouseleave', () => {
    targetRotX = 0;
    targetRotY = 0;
});

// --- 3. FLIP LOGIC ---
function flipCard() {
    // Smoothly toggle between 0 and 180
    targetFlip = (targetFlip === 0) ? 180 : 0;
}

// --- 4. PHYSICS ENGINE (60 FPS) ---
function updatePhysics() {
    const smoothFactor = 0.1; 
    const flipSmooth = 0.05;

    // Interpolate Tilt
    currentRotX += (targetRotX - currentRotX) * smoothFactor;
    currentRotY += (targetRotY - currentRotY) * smoothFactor;

    // Interpolate Flip
    currentFlip += (targetFlip - currentFlip) * flipSmooth;

    // Interpolate Spotlight
    currentX += (targetX - currentX) * smoothFactor;
    currentY += (targetY - currentY) * smoothFactor;

    // Apply Transforms
    // If flipped, invert tilt so controls feel natural
    let tiltMultiplier = (currentFlip > 90) ? -1 : 1;

    card.style.transform = `
        translateZ(50px) 
        rotateX(${currentRotX * tiltMultiplier}deg) 
        rotateY(${currentFlip + (currentRotY * tiltMultiplier)}deg)
    `;

    // Update Spotlight on all faces
    document.querySelectorAll('.card-face').forEach(face => {
        face.style.setProperty('--x', `${currentX}px`);
        face.style.setProperty('--y', `${currentY}px`);
    });

    requestAnimationFrame(updatePhysics);
}
updatePhysics(); // Start Engine

// --- 5. DRAG & DROP LOGIC ---
function setupDragDrop(dropZoneId, inputId, previewId, isEncode) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            handleFileSelect({ target: input }, previewId, isEncode);
        }
    });
}
setupDragDrop('drop-encode', 'upload-encode', 'preview-encode', true);
setupDragDrop('drop-decode', 'upload-decode', 'preview-decode', false);

// --- 6. FILE HANDLING ---
function handleFileSelect(event, previewId, isEncode) {
    const file = event.target.files[0];
    const previewDiv = document.getElementById(previewId);
    const nameSpan = isEncode ? document.getElementById('file-name-encode') : document.getElementById('file-name-decode');
    if(nameSpan) nameSpan.textContent = file ? file.name : "No file selected";

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewDiv.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            previewDiv.style.border = "1px solid rgba(59, 130, 246, 0.5)";
            if(isEncode) {
                const img = new Image(); img.src = e.target.result;
                img.onload = () => {
                   const maxChars = Math.floor((img.width * img.height * 3) / 8);
                   const msg = document.getElementById('secret-message');
                   if(msg) msg.dataset.max = maxChars;
                }
            }
        };
        reader.readAsDataURL(file);
    }
}
document.getElementById('upload-encode').addEventListener('change', (e) => handleFileSelect(e, 'preview-encode', true));
document.getElementById('upload-decode').addEventListener('change', (e) => handleFileSelect(e, 'preview-decode', false));

const msgInput = document.getElementById('secret-message');
if(msgInput) {
    msgInput.addEventListener('input', function(e) {
        const len = e.target.value.length; const max = this.dataset.max || 5000; 
        let percent = (len / max) * 100; if(percent > 100) percent = 100;
        const bar = document.getElementById('capacity-fill');
        if(bar) { bar.style.width = `${percent}%`; bar.style.backgroundColor = percent > 90 ? "#ef4444" : "#3b82f6"; }
    });
}

// --- 7. API CALLS ---
async function encodeMessage() {
    const fileInput = document.getElementById('upload-encode');
    const message = document.getElementById('secret-message').value;
    const password = document.getElementById('pass-encode').value;
    const status = document.getElementById('encode-status');

    if (!fileInput.files[0] || !message) { status.innerText = "MISSING INPUT"; status.style.color = "#f59e0b"; return; }
    status.innerText = "ENCRYPTING..."; status.style.color = "#58a6ff"; 
    
    const formData = new FormData();
    formData.append("image", fileInput.files[0]);
    formData.append("message", message);
    if(password) formData.append("password", password);

    try {
        const response = await fetch(`${API_URL}/encode`, { method: "POST", body: formData });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = "vault_secured.png";
            document.body.appendChild(a); a.click(); a.remove();
            status.innerText = "SUCCESS"; status.style.color = "#10b981"; 
        } else {
            const d = await response.json(); status.innerText = d.error || "ERROR"; status.style.color = "#ef4444";
        }
    } catch (error) { status.innerText = "OFFLINE"; status.style.color = "#ef4444"; }
}

async function decodeMessage() {
    const fileInput = document.getElementById('upload-decode');
    const password = document.getElementById('pass-decode').value;
    const output = document.getElementById('decoded-output');

    if (!fileInput.files[0]) { output.innerText = "NO FILE"; output.style.color = "#f59e0b"; return; }
    output.innerText = "SCANNING..."; output.style.color = "#58a6ff";

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);
    if(password) formData.append("password", password);

    try {
        const response = await fetch(`${API_URL}/decode`, { method: "POST", body: formData });
        const data = await response.json();
        if (data.message) { output.innerText = data.message; output.style.color = "#10b981"; }
        else { output.innerText = data.error || "FAILED"; output.style.color = "#ef4444"; }
    } catch (error) { output.innerText = "OFFLINE"; output.style.color = "#ef4444"; }
}