const API_URL = ""; 
const card = document.getElementById('main-card');
const scene = document.querySelector('.scene');
let isLoggedIn = false;
let lastEncodedBlob = null; // Store blob for sharing

// --- AUTH & INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        isLoggedIn = data.isLoggedIn;
        updateAuthUI(data);
    } catch (e) { console.error("Auth Error", e); }
});

function updateAuthUI(data) {
    const userDisplay = document.getElementById('user-display');
    const logoutBtn = document.getElementById('logout-btn');
    if (data.isLoggedIn && userDisplay) {
        userDisplay.style.display = 'inline-block';
        userDisplay.innerText = `USER: ${data.name ? data.name.toUpperCase() : 'AGENT'}`;
        if(logoutBtn) logoutBtn.style.display = 'inline-block';
    } else {
        if(userDisplay) userDisplay.style.display = 'none';
        if(logoutBtn) logoutBtn.style.display = 'none';
    }
}

function checkAuthAndToggleHistory() {
    if (isLoggedIn) {
        document.getElementById('history-panel').classList.add('open');
        fetchHistory();
    } else {
        document.getElementById('login-modal').classList.add('active');
    }
}

// --- NEW SHARE LOGIC ---
async function checkAuthAndShare() {
    if (!isLoggedIn) {
        // Trigger login if not authenticated
        document.getElementById('login-modal').classList.add('active');
        return;
    }

    if (!lastEncodedBlob) {
        alert("No file generated yet.");
        return;
    }

    // Convert blob to File object for sharing
    const file = new File([lastEncodedBlob], "vault_secured.png", { type: "image/png" });

    // Use Web Share API (Works on Mobile/Mac/Modern Windows)
    if (navigator.share && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Secure Artifact',
                text: 'Here is the encrypted vault file.',
            });
        } catch (error) {
            console.log('Share canceled', error);
        }
    } else {
        // Fallback for browsers that don't support file sharing
        alert("Your browser does not support direct file sharing. Please use the Download button manually.");
    }
}

// --- AUTH UI HELPERS ---
function closeModal() { document.getElementById('login-modal').classList.remove('active'); }
function closeHistory() { document.getElementById('history-panel').classList.remove('open'); }
function switchMode(mode) {
    document.getElementById('auth-error').innerText = "";
    if (mode === 'register') {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('modal-title').innerText = 'CREATE ACCOUNT';
    } else {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('modal-title').innerText = 'ACCESS VAULT';
    }
}

// --- API ACTIONS ---
async function encodeMessage() {
    const fileInput = document.getElementById('upload-encode');
    const message = document.getElementById('secret-message').value;
    const password = document.getElementById('pass-encode').value;
    const status = document.getElementById('encode-status');
    const shareContainer = document.getElementById('encode-actions');

    if (!fileInput.files[0] || !message) { status.innerText = "MISSING INPUT"; status.style.color = "#f59e0b"; return; }
    
    status.innerText = "ENCRYPTING..."; status.style.color = "#58a6ff"; 
    shareContainer.style.display = 'none'; // Hide previous share btn

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);
    formData.append("message", message);
    if(password) formData.append("password", password);

    try {
        const response = await fetch(`${API_URL}/api/encode`, { method: "POST", body: formData });
        if (response.ok) {
            lastEncodedBlob = await response.blob(); // Save for sharing
            const url = window.URL.createObjectURL(lastEncodedBlob);
            
            // Auto Download
            const a = document.createElement('a');
            a.href = url; a.download = "vault_secured.png";
            document.body.appendChild(a); a.click(); a.remove();
            
            status.innerText = "SUCCESS"; status.style.color = "#10b981"; 
            
            // Show Share Button
            shareContainer.style.display = 'block';

        } else {
            const d = await response.json(); status.innerText = d.error || "ERROR"; status.style.color = "#ef4444";
        }
    } catch (error) { status.innerText = "OFFLINE"; status.style.color = "#ef4444"; }
}

// ... [Include the rest of the file: decodeMessage, login/register fetch functions, physics loop, drag & drop] ...
// (Reuse the exact same Auth/Physics logic from the previous turn)

// --- PHYSICS LOOP ---
let currentRotX=0, targetRotX=0, currentRotY=0, targetRotY=0, currentFlip=0, targetFlip=0, currentX=0, targetX=0, currentY=0, targetY=0;
scene.addEventListener('mousemove', (e) => {
    const r = scene.getBoundingClientRect();
    const x = e.clientX - r.left - r.width/2;
    const y = e.clientY - r.top - r.height/2;
    targetRotX = y/20; targetRotY = -x/20;
    targetX = e.clientX - r.left; targetY = e.clientY - r.top;
});
scene.addEventListener('mouseleave', () => { targetRotX=0; targetRotY=0; });
function flipCard() { targetFlip = targetFlip===0 ? 180 : 0; }
function updatePhysics() {
    const s = 0.1; const fs = 0.05;
    currentRotX += (targetRotX-currentRotX)*s; currentRotY += (targetRotY-currentRotY)*s;
    currentFlip += (targetFlip-currentFlip)*fs;
    currentX += (targetX-currentX)*s; currentY += (targetY-currentY)*s;
    let tm = currentFlip > 90 ? -1 : 1;
    card.style.transform = `translateZ(50px) rotateX(${currentRotX*tm}deg) rotateY(${currentFlip+(currentRotY*tm)}deg)`;
    document.querySelectorAll('.card-face').forEach(f => { f.style.setProperty('--x', `${currentX}px`); f.style.setProperty('--y', `${currentY}px`); });
    requestAnimationFrame(updatePhysics);
}
updatePhysics();

// --- FILE HELPERS ---
function setupDragDrop(zid, iid, pid, isEnc) {
    const z=document.getElementById(zid), i=document.getElementById(iid);
    z.addEventListener('dragover', e=>{e.preventDefault();z.classList.add('drag-over')});
    z.addEventListener('dragleave', ()=>{z.classList.remove('drag-over')});
    z.addEventListener('drop', e=>{e.preventDefault();z.classList.remove('drag-over');if(e.dataTransfer.files.length){i.files=e.dataTransfer.files;handleFile({target:i},pid,isEnc)}});
}
function handleFile(e, pid, isEnc) {
    const f=e.target.files[0], p=document.getElementById(pid);
    const n = isEnc ? document.getElementById('file-name-encode') : document.getElementById('file-name-decode');
    if(n) n.textContent = f ? f.name : "No file";
    if(f) {
        const r = new FileReader();
        r.onload = ev => {
            p.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
            p.style.border = "1px solid rgba(59, 130, 246, 0.5)";
        };
        r.readAsDataURL(f);
    }
}
setupDragDrop('drop-encode','upload-encode','preview-encode',true);
setupDragDrop('drop-decode','upload-decode','preview-decode',false);
document.getElementById('upload-encode').addEventListener('change',e=>handleFile(e,'preview-encode',true));
document.getElementById('upload-decode').addEventListener('change',e=>handleFile(e,'preview-decode',false));

async function performLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const res = await fetch('/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, password:pass})});
    const d = await res.json();
    if(d.success) location.reload(); else document.getElementById('auth-error').innerText = d.error;
}
async function performRegister() {
    const name=document.getElementById('reg-name').value, email=document.getElementById('reg-email').value, pass=document.getElementById('reg-pass').value;
    const res = await fetch('/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, email, password:pass})});
    const d = await res.json();
    if(d.success) location.reload(); else document.getElementById('auth-error').innerText = d.error;
}
async function logout() { await fetch('/auth/logout'); location.reload(); }
async function fetchHistory() {
    const l = document.getElementById('history-list');
    const res = await fetch('/api/history');
    if(res.status === 401) { l.innerHTML = '<p>Session Expired.</p>'; return; }
    const logs = await res.json();
    l.innerHTML = logs.length ? logs.map(i=>`<div class="history-item ${i.action}"><span class="history-meta">${i.timestamp} • ${i.action.toUpperCase()}</span><span class="history-detail">${i.filename}</span></div>`).join('') : '<p>No logs found.</p>';
}
async function decodeMessage() {
    const f=document.getElementById('upload-decode'), p=document.getElementById('pass-decode').value, o=document.getElementById('decoded-output');
    if(!f.files[0]) { o.innerText="NO FILE"; o.style.color="#f59e0b"; return; }
    o.innerText="SCANNING..."; o.style.color="#58a6ff";
    const fd = new FormData(); fd.append("image", f.files[0]); if(p) fd.append("password", p);
    try {
        const res = await fetch(`${API_URL}/api/decode`, {method:"POST", body:fd});
        const d = await res.json();
        if(d.message) { o.innerText=d.message; o.style.color="#10b981"; if(isLoggedIn && document.getElementById('history-panel').classList.contains('open')) fetchHistory(); }
        else { o.innerText=d.error||"FAILED"; o.style.color="#ef4444"; }
    } catch(e) { o.innerText="OFFLINE"; o.style.color="#ef4444"; }
}