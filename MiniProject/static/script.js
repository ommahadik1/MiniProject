const API_URL = ""; 
const card = document.getElementById('main-card');
const scene = document.querySelector('.scene');
let isLoggedIn = false;
let lastEncodedBlob = null;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Login
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        isLoggedIn = data.isLoggedIn;
        updateAuthUI(data);
    } catch (e) { console.error("Auth Check Failed", e); }

    // 2. Load Settings
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const savedAccent = localStorage.getItem('accent') || '#3b82f6';
    const savedBg = localStorage.getItem('glassBg');
    setTheme(savedTheme);
    updateAccent(savedAccent);
    if(savedBg) updateGlassTint(savedBg);
    document.getElementById('accent-color-picker').value = savedAccent;
});

// --- AUTH & UI ---
function updateAuthUI(data) {
    const loginBtn = document.getElementById('side-login-btn');
    const logoutBtn = document.getElementById('side-logout-btn');
    if (data.isLoggedIn) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'flex';
    } else {
        loginBtn.style.display = 'flex';
        logoutBtn.style.display = 'none';
    }
}

// --- SIDEBAR LOGIC ---
function closeAllPanels() {
    document.querySelectorAll('.slide-panel').forEach(el => el.classList.remove('open'));
}

async function checkAuthAndOpen(panelName) {
    if (!isLoggedIn) {
        document.getElementById('login-modal').classList.add('active');
        return;
    }
    closeAllPanels();
    const panel = document.getElementById(`panel-${panelName}`);
    if(panel) {
        panel.classList.add('open');
        if(panelName === 'history') fetchHistory();
        if(panelName === 'profile') loadProfileData();
    }
}

// --- SETTINGS ENGINE ---
function setTheme(mode) {
    if(mode === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    localStorage.setItem('theme', mode);
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));
}

function updateAccent(color) {
    document.documentElement.style.setProperty('--accent', color);
    localStorage.setItem('accent', color);
}

function updateGlassTint(color) {
    const r = parseInt(color.substr(1,2), 16);
    const g = parseInt(color.substr(3,2), 16);
    const b = parseInt(color.substr(5,2), 16);
    document.documentElement.style.setProperty('--glass-card', `rgba(${r}, ${g}, ${b}, 0.85)`);
    localStorage.setItem('glassBg', color);
}

function resetTheme() {
    localStorage.removeItem('theme'); localStorage.removeItem('accent'); localStorage.removeItem('glassBg');
    location.reload();
}

// --- PROFILE & HISTORY ---
async function loadProfileData() {
    try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        document.getElementById('profile-name').innerText = data.name.toUpperCase();
        document.getElementById('profile-level').innerText = data.stats.level.toUpperCase();
        document.getElementById('stat-enc').innerText = data.stats.encoded;
        document.getElementById('stat-dec').innerText = data.stats.decoded;
        document.getElementById('update-name').value = data.name;
        document.getElementById('profile-avatar').src = `https://ui-avatars.com/api/?name=${data.name}&background=random&color=fff&size=128`;
    } catch(e){}
}

async function updateProfileName() {
    const newName = document.getElementById('update-name').value;
    const res = await fetch('/api/profile/update', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:newName})});
    if(res.ok) { alert("Codename Updated."); loadProfileData(); }
}

async function fetchHistory() {
    const l = document.getElementById('history-list');
    const res = await fetch('/api/history');
    if(res.status === 401) { l.innerHTML = '<p>Session Expired.</p>'; return; }
    const logs = await res.json();
    l.innerHTML = logs.length ? logs.map(i=>`<div class="history-item ${i.action}"><span class="history-meta">${i.timestamp} • ${i.action.toUpperCase()}</span><span class="history-detail">${i.filename}</span></div>`).join('') : '<p style="color:var(--text-muted)">No logs found.</p>';
}

// --- CORE VAULT LOGIC ---
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
            s.innerText="SUCCESS"; s.style.color="#10b981"; share.style.display='block';
        } else { const d=await res.json(); s.innerText=d.error||"ERROR"; s.style.color="#ef4444"; }
    } catch(e){ s.innerText="OFFLINE"; s.style.color="#ef4444"; }
}

async function decodeMessage() {
    const f=document.getElementById('upload-decode'), p=document.getElementById('pass-decode').value, o=document.getElementById('decoded-output');
    if(!f.files[0]) { o.innerText="NO FILE"; o.style.color="#f59e0b"; return; }
    o.innerText="SCANNING..."; o.style.color="#58a6ff";
    const fd=new FormData(); fd.append("image",f.files[0]); if(p) fd.append("password",p);
    try {
        const res=await fetch(`${API_URL}/api/decode`,{method:"POST",body:fd});
        const d=await res.json();
        if(d.message) o.innerText=d.message; else { o.innerText=d.error||"FAILED"; o.style.color="#ef4444"; }
        if(d.message) o.style.color="#10b981";
    } catch(e){ o.innerText="OFFLINE"; o.style.color="#ef4444"; }
}

async function checkAuthAndShare() {
    if(!isLoggedIn){ document.getElementById('login-modal').classList.add('active'); return; }
    if(!lastEncodedBlob){ alert("No file generated."); return; }
    const file = new File([lastEncodedBlob], "vault_secured.png", { type: "image/png" });
    if(navigator.share && navigator.canShare({files:[file]})) navigator.share({files:[file], title:'Secure Artifact'});
    else alert("Browser does not support direct sharing.");
}

// --- AUTH FUNCTIONS ---
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openLoginModal() { document.getElementById('login-modal').classList.add('active'); }
function switchMode(m) {
    if(m==='register') { document.getElementById('login-form').style.display='none'; document.getElementById('register-form').style.display='block'; }
    else { document.getElementById('login-form').style.display='block'; document.getElementById('register-form').style.display='none'; }
}
async function performLogin() {
    const email=document.getElementById('login-email').value, pass=document.getElementById('login-pass').value;
    const res=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})});
    if((await res.json()).success) location.reload(); else document.getElementById('auth-error').innerText="Login Failed";
}
async function performRegister() {
    const name=document.getElementById('reg-name').value, email=document.getElementById('reg-email').value, pass=document.getElementById('reg-pass').value;
    const res=await fetch('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password:pass})});
    if((await res.json()).success) location.reload(); else document.getElementById('auth-error').innerText="Register Failed";
}
async function logout() { await fetch('/auth/logout'); location.reload(); }

// --- FILE & PHYSICS ---
function setupDragDrop(zid, iid, pid, isEnc) {
    const z=document.getElementById(zid), i=document.getElementById(iid);
    z.addEventListener('dragover', e=>{e.preventDefault();z.classList.add('drag-over')});
    z.addEventListener('dragleave', ()=>{z.classList.remove('drag-over')});
    z.addEventListener('drop', e=>{e.preventDefault();z.classList.remove('drag-over');if(e.dataTransfer.files.length){i.files=e.dataTransfer.files;handleFile({target:i},pid,isEnc)}});
}
function handleFile(e, pid, isEnc) {
    const f=e.target.files[0], p=document.getElementById(pid), n=isEnc?document.getElementById('file-name-encode'):document.getElementById('file-name-decode');
    if(n) n.textContent = f ? f.name : "No file";
    if(f) { const r=new FileReader(); r.onload=ev=>{p.innerHTML=`<img src="${ev.target.result}">`; p.style.border="1px solid rgba(59,130,246,0.5)";}; r.readAsDataURL(f); }
}
setupDragDrop('drop-encode','upload-encode','preview-encode',true);
setupDragDrop('drop-decode','upload-decode','preview-decode',false);
document.getElementById('upload-encode').addEventListener('change',e=>handleFile(e,'preview-encode',true));
document.getElementById('upload-decode').addEventListener('change',e=>handleFile(e,'preview-decode',false));

// Physics
let crX=0, trX=0, crY=0, trY=0, cF=0, tF=0, cX=0, tX=0, cY=0, tY=0;
scene.addEventListener('mousemove', e=>{
    const r=scene.getBoundingClientRect();
    trX=(e.clientY-r.top-r.height/2)/20; trY=-(e.clientX-r.left-r.width/2)/20;
    tX=e.clientX-r.left; tY=e.clientY-r.top;
});
scene.addEventListener('mouseleave', ()=>{trX=0;trY=0;});
function flipCard(){tF=tF===0?180:0;}
function upd(){
    crX+=(trX-crX)*0.1; crY+=(trY-crY)*0.1; cF+=(tF-cF)*0.05; cX+=(tX-cX)*0.1; cY+=(tY-cY)*0.1;
    const tm=cF>90?-1:1;
    card.style.transform=`translateZ(50px) rotateX(${crX*tm}deg) rotateY(${cF+(crY*tm)}deg)`;
    document.querySelectorAll('.card-face').forEach(f=>{f.style.setProperty('--x',`${cX}px`);f.style.setProperty('--y',`${cY}px`)});
    requestAnimationFrame(upd);
}
upd();