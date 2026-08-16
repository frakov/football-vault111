// ============================================================
// auth.js — login/register/reset, session bootstrap, profile
// page, account settings panel.
// Depends on: supabase.js
// ============================================================

function switchAuthTab(tab){
  ['login','register','reset'].forEach(t=>{
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
    document.getElementById('form-'+t).style.display=t===tab?'block':'none';
  });
}
function setAuthErr(id,msg){document.getElementById(id).textContent=msg;}
function setAuthOk(id,msg){document.getElementById(id).textContent=msg;}

async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  setAuthErr('login-err','');
  if(!email||!pass){setAuthErr('login-err','Wypełnij wszystkie pola.');return;}
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error)setAuthErr('login-err',error.message==='Invalid login credentials'?'Błędny email lub hasło.':error.message);
}

async function doRegister(){
  const firstName=document.getElementById('reg-firstname').value.trim();
  const lastName=document.getElementById('reg-lastname').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;
  setAuthErr('reg-err','');setAuthOk('reg-ok','');
  if(!firstName||!lastName||!email||!pass){setAuthErr('reg-err','Wypełnij wszystkie pola.');return;}
  if(pass.length<6){setAuthErr('reg-err','Hasło musi mieć min. 6 znaków.');return;}
  const {error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:`${firstName} ${lastName}`}}});
  if(error)setAuthErr('reg-err',error.message);
  else setAuthOk('reg-ok','Konto utworzone! Sprawdź email i potwierdź rejestrację.');
}

async function doReset(){
  const email=document.getElementById('reset-email').value.trim();
  setAuthErr('reset-err','');setAuthOk('reset-ok','');
  if(!email){setAuthErr('reset-err','Wpisz email.');return;}
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
  if(error)setAuthErr('reset-err',error.message);
  else setAuthOk('reset-ok','Link wysłany! Sprawdź email.');
}

// ══════════════════════════════════════════════════════
// SUPABASE DATA LAYER
// ══════════════════════════════════════════════════════
async function sbSaveProfile(){
  if(!currentUser||!db.profile?.nick)return;
  const publicShirts=(db.shirts||[]).slice(0,12).map(s=>({
    id:s.id,club:s.club,season:s.season,kind:kindLabel(s.kind),status:s.status,
    photo:s.photos&&s.photos[0]?s.photos[0].slice(0,500):null
  }));
  const{error}=await sb.from('profiles').upsert({
    user_id:currentUser.id, nick:db.profile.nick, bio:db.profile.bio||'',
    visible:db.profile.public||false, shirt_count:(db.shirts||[]).length, public_shirts:publicShirts
  },{onConflict:'user_id'});
  if(error){console.error('sbSaveProfile error:',error);toast('Błąd zapisu profilu: '+error.message);}
}

async function sbLoadProfiles(){
  const{data,error}=await sb.from('profiles').select('*').eq('visible',true);
  if(error)console.error('sbLoadProfiles error:',error);
  return data||[];
}

// ══════════════════════════════════════════════════════
// I18N
// ══════════════════════════════════════════════════════
function bProfile(){
  const p=db.profile||{};
  const u=currentUser;
  return `
  <div class="fx-b mb18 s1">
    <div><div class="ph-sub" style="border-color:rgba(107,114,128,.3);background:rgba(107,114,128,.08);color:#9ca3af"><span style="width:5px;height:5px;border-radius:50%;background:#9ca3af"></span><span>${T('profile_title')}</span></div><div class="ph-title">${T('profile_title').toUpperCase()}</div></div>
  </div>
  <div style="margin-bottom:12px;padding:10px 14px;background:rgba(var(--a-rgb),.04);border:1px solid rgba(var(--a-rgb),.1);border-radius:12px;font-size:11px;color:var(--t2)">
    <span style="color:var(--a);font-weight:600">${u?.email||'—'}</span> · <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.06em">${u?.id?.slice(0,8)||'—'}...</span>
  </div>
  <div class="g2 s2">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="clabel">${db.lang==='pl'?'Informacje':'Info'}</div>
        <div class="form-group">
          <div class="form-label">${T('your_nick')} *</div>
          <input class="form-input" id="p-nick" value="${p.nick||''}" placeholder="${db.lang==='pl'?'np. KoszulkiKolekcjoner':'e.g. JerseyCollector'}">
          <div style="font-size:9px;color:var(--t2);margin-top:4px;font-family:'JetBrains Mono',monospace">${db.lang==='pl'?'Nick widoczny na Marketplace':'Nick visible on Marketplace'}</div>
        </div>
        <div class="form-group">
          <div class="form-label">${T('profile_bio')}</div>
          <textarea class="form-input" id="p-bio" rows="3" placeholder="${db.lang==='pl'?'Krótki opis...':'Short description...'}">${p.bio||''}</textarea>
        </div>
      </div>
      <div class="card">
        <div class="clabel">${T('profile_public')}</div>
        <div class="toggle-row" id="p-public-row" onclick="toggleProfilePublic()">
          <div class="tg-label">
            <span>${p.public?T('profile_shared'):T('profile_private')}</span>
            <small>${db.lang==='pl'?'Widoczny w przeglądzie profili':'Visible in profiles browser'}</small>
          </div>
          <div class="tg-track ${p.public?'on':''}" id="tg-profile-public"><div class="tg-knob"></div></div>
        </div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card">
        <div class="clabel">${db.lang==='pl'?'Podgląd Profilu':'Profile Preview'}</div>
        <div class="fx-c gap14" style="gap:14px;margin-top:8px">
          <div class="profile-avatar">${(p.nick||'?')[0].toUpperCase()}</div>
          <div>
            <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:22px;letter-spacing:.06em">${p.nick||'—'}</div>
            ${p.bio?`<div style="font-size:12px;color:var(--t2);margin-top:3px">${p.bio}</div>`:''}
            <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#14213d;margin-top:6px">${(db.shirts||[]).length} ${db.lang==='pl'?'koszulek':'jerseys'}</div>
            <span class="sh-status ${p.public?'public':'collection'}" style="margin-top:8px;display:inline-block">${p.public?T('profile_shared'):T('profile_private')}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="clabel">${db.lang==='pl'?'Wystawione na Marketplace':'Listed on Marketplace'}</div>
        ${(db.shirts||[]).filter(s=>s.marketListed).length?
          `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${(db.shirts||[]).filter(s=>s.marketListed).slice(0,5).map(s=>`
          <div class="fx-c gap10" style="gap:10px;padding:6px 0;border-bottom:1px solid rgba(var(--a-rgb),.06)">
            <div style="width:36px;height:36px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg3)">${s.photos&&s.photos[0]?`<img src="${s.photos[0]}" style="width:100%;height:100%;object-fit:cover">`:`<div style="display:flex;align-items:center;justify-content:center;height:100%;opacity:.25;color:var(--t2)">${icon('shirt',18)}</div>`}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.club||'—'}</div>
              <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${s.season||''}</div>
            </div>
            <button class="btn btn-d" style="padding:3px 8px;font-size:10px" onclick="removeFromMkt('${s.id}')">${icon('x',12)}</button>
          </div>`).join('')}</div>`
          :`<div style="padding:16px 0;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">${db.lang==='pl'?'BRAK AKTYWNYCH OGŁOSZEŃ':'NO ACTIVE LISTINGS'}</div>`}
      </div>
      <button class="btn btn-p w100" onclick="saveProfile()">${T('profile_save')}</button>
    </div>
  </div>`;
}

function toggleProfilePublic(){
  if(!db.profile)db.profile={};
  db.profile.public=!db.profile.public;
  qsave();
  const track=document.getElementById('tg-profile-public');if(track)track.classList.toggle('on',db.profile.public);
  const row=document.getElementById('p-public-row');if(row){const sp=row.querySelector('.tg-label span');if(sp)sp.textContent=db.profile.public?T('profile_shared'):T('profile_private');}
}

async function saveProfile(){
  const nick=(document.getElementById('p-nick')?.value||'').trim();
  if(!nick){toast(db.lang==='pl'?'Wpisz nick!':'Enter a nickname!');return;}
  if(!db.profile)db.profile={};
  db.profile.nick=nick;
  db.profile.bio=document.getElementById('p-bio')?.value||'';
  qsave();
  await sbSaveProfile();
  toast(T('saved'));chime();
  const b=document.getElementById('body-profile');if(b)b.innerHTML=bProfile();
}

let settingsOpen=false;
function toggleSettings(){settingsOpen=!settingsOpen;document.getElementById('settings-panel').classList.toggle('open',settingsOpen);if(settingsOpen)renderSP();const b=document.getElementById('tb-settings-btn');if(b)b.style.background=settingsOpen?'rgba(var(--a-rgb),.2)':'rgba(var(--a-rgb),.07)';}
function renderSP(){
  const cur=db.currency||'PLN';
  document.getElementById('sp-body').innerHTML=`
    <div><div class="sp-section-title">${db.lang==='pl'?'Język':'Language'}</div>
      <div class="lang-row"><div class="lb ${db.lang==='pl'?'on':''}" onclick="setLang('pl')">Polski</div><div class="lb ${db.lang==='en'?'on':''}" onclick="setLang('en')">English</div></div></div>
    <div><div class="sp-section-title">${db.lang==='pl'?'Waluta':'Currency'}</div>
      <div class="curr-row">${['PLN','EUR','GBP','USD'].map(c=>`<div class="curr-btn ${cur===c?'on':''}" onclick="setCurr('${c}')">${c}</div>`).join('')}</div></div>
    <div><div class="sp-section-title">${db.lang==='pl'?'Kursy (do PLN)':'Rates (to PLN)'}</div>
      <div class="sp-group">${['EUR','GBP','USD'].map(c=>`<div class="sp-row"><div class="sp-row-left"><span>1 ${c} =</span></div><div class="field fx-c" style="width:110px;padding:5px 10px;gap:6px"><input type="text" inputmode="decimal" value="${(db.rates||{})[c]||''}" oninput="if(!db.rates)db.rates={};db.rates['${c}']=parseFloat(this.value)||0;qsave();updateTaskbar()" style="font-size:14px;font-weight:700;text-align:right;width:60px"><span style="font-size:9px;color:var(--t2)">PLN</span></div></div>`).join('')}</div></div>
    <div><div class="sp-section-title">Konto</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="font-size:10px;color:var(--t2);padding:8px 0;font-family:'JetBrains Mono',monospace">${currentUser?.email||'—'}</div>
        <div class="div"></div>
        <button class="btn btn-d w100" onclick="doSignOut()">${icon('logout',13,"display:inline-block;vertical-align:-2px;margin-right:6px")}Wyloguj</button>
      </div></div>`;
}

// ══════════════════════════════════════════════════════
// INIT — Auth state listener
// ══════════════════════════════════════════════════════
// Jedyna funkcja inicjalizacji — wywolywana zawsze po zalogowaniu
// ── LANDING PAGE FUNCTIONS ──
function openAuthModal(tab){
  const modal=document.getElementById('auth-modal');
  if(modal)modal.classList.add('open');
  if(tab)switchAuthTab(tab);
}
function closeAuthModal(){
  const modal=document.getElementById('auth-modal');
  if(modal)modal.classList.remove('open');
}
async function doSignOut(){
  _rtSubs.forEach(s=>{try{sb.removeChannel(s);}catch(e){}});
  _rtSubs=[];
  await sb.auth.signOut();
}

function doLogout(){
  currentUser=null;
  localStorage.removeItem('fvault_cache');
  db=JSON.parse(JSON.stringify(DEF));
  activeSection=null;
  unreadNotifs=0;updateNotifBadge();
  // Ukryj aplikację, pokaż landing
  const shell=document.getElementById('app-shell');
  if(shell)shell.classList.add('hidden');
  const landing=document.getElementById('landing');
  if(landing)landing.classList.remove('hidden');
  const ue=document.getElementById('tb-user-email');
  if(ue)ue.textContent='—';
  const inner=document.getElementById('content-inner');
  if(inner)inner.innerHTML='';
}
