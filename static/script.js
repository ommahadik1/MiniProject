const API_URL = ""; 
const card = document.getElementById('main-card');
const scene = document.querySelector('.scene');
let isLoggedIn = false;
let lastEncodedBlob = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    checkLoginStatus();
});

async function checkLoginStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        isLoggedIn = data.isLoggedIn;
        updateAuthUI(data);
    } catch (e) { console.error("Auth Check Failed", e); }
}

// --- UI & MODALS ---
function updateAuthUI(data) {
    const loggedOutDiv = document.getElementById('auth-logged-out');
    const loggedInDiv = document.getElementById('auth-logged-in');
    const greeting = document.getElementById('user-greeting');

    if (data.isLoggedIn) {
        loggedOutDiv.style.display = 'none';
        loggedInDiv.style.display = 'flex';
        // Simply show the name if available, or just a welcome
        greeting.innerText = data.name ? `Hi, ${data.name}` : 'Welcome';
    } else {
        loggedOutDiv.style.display = 'block';
        loggedInDiv.style.display = 'none';
        greeting.innerText = '';
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    // Clear auth forms on close
    if(id === 'login-modal') {
        document.getElementById('login-form').style.display='block';
        document.getElementById('register-form').style.display='none';
        document.getElementById('auth-error').innerText = "";
    }
}

function openLoginModal() {
    document.getElementById('login-modal').classList.add('active');
}

async function openHistoryModal() {
    if (!isLoggedIn) return;
    document.getElementById('history-modal').classList.add('active');
    fetchHistory();
}

// --- HISTORY FETCHING ---
async function fetchHistory() {
    const listContainer = document.getElementById('history-list');
    listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Loading logs...</p>';
    
    try {
        const res = await fetch('/api/history');
        if(res.status === 401) {
             listContainer.innerHTML = '<p style="color:#ef4444;">Session Expired. Please login again.</p>'; return; 
        }
        const logs = await res.json();
        
        if (logs.length === 0) {
            listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding: 20px;">No activity logs found.</p>';
            return;
        }

        listContainer.innerHTML = logs.map(item => `
            <div class="history-item ${item.action}">
                <div class="h-left">
                    <span class="h-action">${item.action.toUpperCase()}</span>
                    <span class="h-file">${item.filename}</span>
                </div>
                <span class="h-time">${item.timestamp}</span>
            </div>
        `).join('');

    } catch (e) {
        listContainer.innerHTML = '<p style="color:#ef4444;">Error fetching logs.</p>';
    }
}


// --- AUTH ACTIONS ---
function switchMode(m) {
    document.getElementById('auth-error').innerText = "";
    if(m==='register') { document.getElementById('login-form').style.display='none'; document.getElementById('register-form').style.display='block'; }
    else { document.getElementById('login-form').style.display='block'; document.getElementById('register-form').style.display='none'; }
}

async function performLogin() {
    const email=document.getElementById('login-email').value, pass=document.getElementById('login-pass').value;
    if(!email || !pass) { document.getElementById('auth-error').innerText="Please fill in all fields."; return; }
    
    const res=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
    const data = await res.json();
    if(data.success) location.reload(); else document.getElementById('auth-error').innerText=data.error || "Login Failed";
}

async function performRegister() {
    const name=document.getElementById('reg-name').value, email=document.getElementById('reg-email').value, pass=document.getElementById('reg-pass').value;
    if(!name || !email || !pass) { document.getElementById('auth-error').innerText="Please fill in all fields."; return; }

    const res=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass})});
    const data = await res.json();
    if(data.success) location.reload(); else document.getElementById('auth-error').innerText=data.error || "Register Failed";
}

async function logout() { await fetch('/auth/logout'); location.reload(); }


// --- CORE VAULT LOGIC (Encode/Decode/Share) ---
// (This section remains largely unchanged from previous versions)
async function encodeMessage() {
    const f=document.getElementById('upload-encode'), m=document.getElementById('secret-message').value, p=document.getElementById('pass-encode').value, s=document.getElementById('encode-status'), share=document.getElementById('encode-actions');
    if(!f.files[0] || !m) { s.innerText="MISSING INPUT"; s.style.color="#f59e0b"; return; }
    s.innerText="ENCRYPTING..."; s.style.color="#58a6ff"; share.style.display='none';
    const fd=new FormData(); fd.append("image",f.files[0]); fd.append("message",m); if(p) fd.append("password",p);
    try {
        const res=await fetch(`${API_URL}/api/encode`,{method:"POST",body:fd});
        if(res.ok){
            lastEncodedBlob=await res.blob();
            const a=document.createElement('a'); a.href=window.URL.createObjectURL(lastEncodedBlob); a.download="vault_secured.png"; document.body.appendChild(a); a.click(); a.remove();
            s.innerText="SUCCESS. File Downloaded."; s.style.color="#10b981"; share.style.display='block';
        } else { const d=await res.json(); s.innerText=d.error||"ERROR"; s.style.color="#ef4444"; }
    } catch(e){ s.innerText="CONNECTION ERROR"; s.style.color="#ef4444"; }
}

async function decodeMessage() {
    const f=document.getElementById('upload-decode'), p=document.getElementById('pass-decode').value, o=document.getElementById('decoded-output');
    if(!f.files[0]) { o.innerText="Please select an image first."; o.style.color="#f59e0b"; return; }
    o.innerText="SCANNING ARTIFACT..."; o.style.color="#58a6ff";
    const fd=new FormData(); fd.append("image",f.files[0]); if(p) fd.append("password",p);
    try {
        const res=await fetch(`${API_URL}/api/decode`,{method:"POST",body:fd});
        const d=await res.json();
        if(d.message) { o.innerText=d.message; o.style.color="#10b981"; } 
        else { o.innerText=d.error||"DECRYPTION FAILED"; o.style.color="#ef4444"; }
    } catch(e){ o.innerText="CONNECTION ERROR"; o.style.color="#ef4444"; }
}

async function checkAuthAndShare() {
    if(!isLoggedIn){ openLoginModal(); return; }
    if(!lastEncodedBlob){ alert("No file generated yet."); return; }
    const file = new File([lastEncodedBlob], "vault_secured.png", { type: "image/png" });
    if(navigator.share && navigator.canShare({files:[file]})) navigator.share({files:[file], title:'Secure Artifact'});
    else alert("Your browser does not support direct file sharing.");
}


// --- FILE HANDLING & PHYSICS ---
function setupDragDrop(zid, iid, n_id) {
    const z=document.getElementById(zid), i=document.getElementById(iid);
    z.addEventListener('dragover', e=>{e.preventDefault();z.classList.add('drag-over')});
    z.addEventListener('dragleave', ()=>{z.classList.remove('drag-over')});
    z.addEventListener('drop', e=>{e.preventDefault();z.classList.remove('drag-over');if(e.dataTransfer.files.length){i.files=e.dataTransfer.files;handleFile(i.files[0], n_id)}});
    i.addEventListener('change',e=>{if(i.files[0])handleFile(i.files[0], n_id)});
}

function handleFile(f, n_id) {
    document.getElementById(n_id).textContent = f.name;
    // Optional: Add preview logic here if desired, simplified for minimalism
}
setupDragDrop('drop-encode','upload-encode','file-name-encode');
setupDragDrop('drop-decode','upload-decode','file-name-decode');


// 3D Card Physics (Simplified for smoother feel)
let crX=0, trX=0, crY=0, trY=0, cF=0, tF=0;
scene.addEventListener('mousemove', e=>{
    const r=scene.getBoundingClientRect();
    trX=(e.clientY-r.top-r.height/2)/25; trY=-(e.clientX-r.left-r.width/2)/25;
});
scene.addEventListener('mouseleave', ()=>{trX=0;trY=0;});
function flipCard(){tF=tF===0?180:0;}
function upd(){
    crX+=(trX-crX)*0.1; crY+=(trY-crY)*0.1; cF+=(tF-cF)*0.08;
    card.style.transform=`translateZ(20px) rotateX(${crX}deg) rotateY(${cF+crY}deg)`;
    requestAnimationFrame(upd);
}
upd();