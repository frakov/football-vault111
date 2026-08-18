// ============================================================
// admin.js — admin-mode toggle, live-editable landing page
// content, and the admin review panels (reports, sell leads,
// LegitCheck approvals).
// Depends on: supabase.js, auth.js, marketplace.js, collection.js
// ============================================================

function initLandingMarquee(){
  const clubs=['FC BARCELONA','REAL MADRID','MANCHESTER CITY','LIVERPOOL FC','JUVENTUS','PARIS SAINT-GERMAIN','BAYERN MONACHIUM','BORUSSIA DORTMUND','AC MILAN','ARSENAL','CHELSEA','INTER MEDIOLAN'];
  const html=clubs.map(c=>`<div class="lp-marquee-item">${c}</div>`).join('');
  const s1=document.getElementById('lp-marquee-set');
  const s2=document.getElementById('lp-marquee-set2');
  if(s1)s1.innerHTML=html;
  if(s2)s2.innerHTML=html;
}

// Generuje realistyczną grafikę koszulki CSS (paski, kolory, kołnierz)
function drawJersey(bodyColor,stripeColor,collarColor,pattern){
  const stripes=pattern==='stripes'
    ?[0,2,4].map(i=>`<div class="cf-stripe" style="left:${i*16.6}%;background:${stripeColor}"></div>`).join('')
    :'';
  const halves=pattern==='halves'
    ?`<div style="position:absolute;inset:0 50% 0 0;background:${stripeColor}"></div>`
    :'';
  const chevron=pattern==='chevron'
    ?`<div style="position:absolute;inset:0;background:linear-gradient(135deg,transparent 45%,${stripeColor} 45%,${stripeColor} 55%,transparent 55%)"></div>`
    :'';
  return `<div class="cf-jersey">
    <div class="cf-jersey-body" style="background:${bodyColor}">${stripes}${halves}${chevron}</div>
    <div class="cf-jersey-collar" style="background:${collarColor}"></div>
  </div>`;
}

let LP_HERO_PHOTOS=[null,null,null,null];
let LP_SPLIT_PHOTO=null;
function initLandingJerseys(){
  const heroConfigs=[
    {body:'#a6192e',stripe:'#14213d',collar:'#ffffff',pattern:'stripes'},
    {body:'#ffffff',stripe:'#a6192e',collar:'#14213d',pattern:'halves'},
    {body:'#0a0f1c',stripe:'#8c9bc3',collar:'#ffffff',pattern:'chevron'},
    {body:'#8c9bc3',stripe:'#14213d',collar:'#14213d',pattern:'stripes'},
  ];
  const heroEl=document.getElementById('lp-hero-jerseys');
  if(heroEl){
    heroEl.innerHTML=heroConfigs.map((c,i)=>{
      const inner=LP_HERO_PHOTOS[i]?`<img src="${LP_HERO_PHOTOS[i]}" alt="" style="width:100%;height:100%;object-fit:cover">`:drawJersey(c.body,c.stripe,c.collar,c.pattern);
      const uploadBtn=adminMode?`<button class="jersey-photo-upload" onclick="event.stopPropagation();uploadHeroJersey(${i})" title="Dodaj zdjęcie">+</button>`:'';
      return `<div class="lp-jersey-tile">${inner}${uploadBtn}</div>`;
    }).join('');
  }
  const splitEl=document.getElementById('lp-split-jersey');
  if(splitEl){
    const inner=LP_SPLIT_PHOTO?`<img src="${LP_SPLIT_PHOTO}" alt="" style="width:100%;height:100%;object-fit:cover">`:drawJersey('#a6192e','#14213d','#ffffff','stripes');
    const uploadBtn=adminMode?`<button class="jersey-photo-upload" onclick="event.stopPropagation();uploadSplitJersey()" title="Dodaj zdjęcie">+</button>`:'';
    splitEl.innerHTML=inner+uploadBtn;
  }
}
async function uploadPhotoTo(path){
  return new Promise(resolve=>{
    const input=document.createElement('input');
    input.type='file';input.accept='image/*';
    input.onchange=async()=>{
      const file=input.files[0];if(!file){resolve(null);return;}
      const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
      const fullPath=`${path}-${Date.now()}.${ext}`;
      const {error}=await sb.storage.from('shirt-photos').upload(fullPath,file,{upsert:true});
      if(error){toast('Błąd uploadu: '+error.message);resolve(null);return;}
      const {data:{publicUrl}}=sb.storage.from('shirt-photos').getPublicUrl(fullPath);
      resolve(publicUrl);
    };
    input.click();
  });
}
async function uploadHeroJersey(i){
  const url=await uploadPhotoTo(`site/hero/tile-${i}`);
  if(url){LP_HERO_PHOTOS[i]=url;initLandingJerseys();}
}
async function uploadSplitJersey(){
  const url=await uploadPhotoTo('site/split/jersey');
  if(url){LP_SPLIT_PHOTO=url;initLandingJerseys();}
}

function initLandingTrustBar(){
  const items=db.lang==='pl'?[
    {icon:'checkCircle',text:'Zero prowizji od sprzedaży'},
    {icon:'shieldCheck',text:'Weryfikacja autentyczności'},
    {icon:'zap',text:'Licytacje na żywo'},
    {icon:'heart',text:'Wishlist z dopasowaniem'},
    {icon:'messageCircle',text:'Czat wbudowany w platformę'},
    {icon:'users',text:'Rosnąca społeczność kolekcjonerów'},
  ]:[
    {icon:'checkCircle',text:'Zero selling fees'},
    {icon:'shieldCheck',text:'Authenticity verification'},
    {icon:'zap',text:'Live auctions'},
    {icon:'heart',text:'Smart wishlist matching'},
    {icon:'messageCircle',text:'Chat built into the platform'},
    {icon:'users',text:'A growing collector community'},
  ];
  const build=()=>items.map(it=>`<div class="lp-trust-item">${icon(it.icon,15)}<span>${it.text}</span></div><div class="lp-trust-dot"></div>`).join('');
  const html=build();
  const s1=document.getElementById('lp-trust-set');
  const s2=document.getElementById('lp-trust-set2');
  if(s1)s1.innerHTML=html;
  if(s2)s2.innerHTML=html;
}

let LP_CLUBS=[
  {name:'Barcelona',colors:['#a50044','#004d98']},{name:'Real Madrid',colors:['#ffffff','#febe10']},{name:'Man City',colors:['#6cabdd','#ffffff']},
  {name:'Liverpool',colors:['#c8102e','#f6eb61']},{name:'Juventus',colors:['#000000','#ffffff']},{name:'PSG',colors:['#004170','#da291c']},
  {name:'Dortmund',colors:['#fde100','#000000']},{name:'Man Utd',colors:['#da291c','#fbe122']},{name:'Arsenal',colors:['#ef0107','#ffffff']},
  {name:'Chelsea',colors:['#034694','#ffffff']},{name:'Bayern',colors:['#dc052d','#0066b2']},{name:'Inter',colors:['#0068a8','#000000']},
];
function initLandingClubGrid(){
  const el=document.getElementById('lp-club-grid');
  if(!el)return;
  el.innerHTML=LP_CLUBS.map(c=>{
    const chip=col=>`<span class="lp-club-chip" style="background:${col};${col.toLowerCase()==='#ffffff'?'border:1px solid rgba(20,33,61,.2)':''}"></span>`;
    return `<div class="lp-club-tile" onclick="openAuthModal('register')"><div class="lp-club-colors">${chip(c.colors[0])}${chip(c.colors[1])}</div><div class="lp-club-name">${c.name}</div></div>`;
  }).join('');
}

async function initLandingCommunityGrid(){
  const el=document.getElementById('lp-community-grid');
  const section=document.getElementById('lp-community');
  if(!el)return;
  let data=null;
  try{
    const res=await sb.from('market_listings').select('club,season,seller_nick,photo,listed_at').order('listed_at',{ascending:false}).limit(10);
    data=res.data;
    if(res.error)console.error('initLandingCommunityGrid error:',res.error);
  }catch(e){console.error('initLandingCommunityGrid error:',e);}
  if(!data||!data.length){
    if(section)section.style.display='none';
    return;
  }
  el.innerHTML=data.map(l=>`
    <div class="lp-community-card" onclick="openAuthModal('register')">
      <div class="lp-community-card-jersey">${l.photo?`<img src="${l.photo}" alt="${l.club||''}" loading="lazy" style="width:100%;height:100%;object-fit:cover">`:`<div class="shirt-photo-placeholder" style="color:rgba(244,244,239,.22)"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}</div>
      <div class="lp-community-card-label">${l.club||(db.lang==='pl'?'Koszulka':'Jersey')} ${l.season||''}<div class="lp-community-card-nick">@${l.seller_nick||(db.lang==='pl'?'kolekcjoner':'collector')}</div></div>
    </div>`).join('');
}

function initLandingSeoFooter(){
  const clubs=db.lang==='pl'
    ?['Manchester United','Liverpool','Arsenal','Chelsea','Manchester City','Real Madrid','Barcelona','AC Milan','Inter Mediolan','Juventus','Bayern Monachium','PSG','Ajax','Borussia Dortmund','Napoli','Roma','Atletico Madryt','Tottenham']
    :['Manchester United','Liverpool','Arsenal','Chelsea','Manchester City','Real Madrid','Barcelona','AC Milan','Inter Milan','Juventus','Bayern Munich','PSG','Ajax','Borussia Dortmund','Napoli','Roma','Atletico Madrid','Tottenham'];
  const el=document.getElementById('lp-seo-clubs');
  if(!el)return;
  el.innerHTML=clubs.map((c,i)=>`<span onclick="openAuthModal('register')">${c}</span>${i<clubs.length-1?'<span class="lp-footer-seo-sep">·</span>':''}`).join('');
}

// Landing page language switcher — swaps every [data-en] element between its
// live Polish content (admin-editable) and its English translation.
function applyLandingLang(){
  document.querySelectorAll('[data-en]').forEach(el=>{
    if(db.lang==='en'){
      if(el.dataset.plCache==null)el.dataset.plCache=el.innerHTML;
      el.innerHTML=el.dataset.en;
    } else if(el.dataset.plCache!=null){
      el.innerHTML=el.dataset.plCache;
    }
  });
  document.querySelectorAll('[data-en-placeholder]').forEach(el=>{
    if(db.lang==='en'){
      if(el.dataset.plPlaceholderCache==null)el.dataset.plPlaceholderCache=el.placeholder;
      el.placeholder=el.dataset.enPlaceholder;
    } else if(el.dataset.plPlaceholderCache!=null){
      el.placeholder=el.dataset.plPlaceholderCache;
    }
  });
  initLandingTrustBar();
  initLandingSeoFooter();
  updateLandingLangSwitcher();
}
function setLandingLang(lang){
  db.lang=lang;
  saveLocalCache();
  applyLandingLang();
}
function updateLandingLangSwitcher(){
  document.querySelectorAll('.lp-lang-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.lang===db.lang);
  });
}

// ══════════════════════════════════════════════════════
// ADMIN CONTENT EDITOR (hidden — trigger via #admin in URL)
// ══════════════════════════════════════════════════════
async function checkAdminAccess(){
  if(location.hash!=='#admin')return;
  if(!currentUser)return; // jeszcze nie wiadomo czy ktoś jest zalogowany — sprawdzimy ponownie zaraz po zalogowaniu
  history.replaceState(null,'',location.pathname+location.search);
  const {data}=await sb.from('profiles').select('is_admin').eq('user_id',currentUser.id).maybeSingle();
  if(data?.is_admin)enterAdminMode();
  else toast(db.lang==='pl'?'Brak uprawnień administratora':'No admin privileges');
}

function enterAdminMode(){
  adminMode=true;
  document.body.classList.add('admin-mode');
  document.querySelectorAll('[data-ck]').forEach(el=>{el.contentEditable='true';el.spellcheck=false;});
  // Edycja dotyczy landing page — pokaż ją, nawet jeśli admin jest zalogowany (co chowa ją domyślnie)
  const landing=document.getElementById('landing');
  if(landing)landing.classList.remove('hidden');
  const shell=document.getElementById('app-shell');
  if(shell)shell.classList.add('hidden');
  initLandingClubGrid();
  initLandingJerseys();
  showAdminBar();
}

function exitAdminMode(){
  adminMode=false;
  document.body.classList.remove('admin-mode');
  document.querySelectorAll('[data-ck]').forEach(el=>{el.contentEditable='false';});
  // Wróć tam, gdzie admin faktycznie powinien być: do aplikacji jeśli jest zalogowany, inaczej na landing
  const landing=document.getElementById('landing');
  const shell=document.getElementById('app-shell');
  if(currentUser){
    if(landing)landing.classList.add('hidden');
    if(shell)shell.classList.remove('hidden');
  } else {
    if(landing)landing.classList.remove('hidden');
    if(shell)shell.classList.add('hidden');
  }
  initLandingClubGrid();
  initLandingJerseys();
  const bar=document.getElementById('admin-bar');
  if(bar)bar.remove();
}

function showAdminBar(){
  if(document.getElementById('admin-bar'))return;
  const bar=document.createElement('div');
  bar.id='admin-bar';
  bar.innerHTML=`<span>Tryb edycji strony</span><button class="admin-save" onclick="saveAllAdminContent()">Zapisz zmiany</button><button class="admin-exit" style="background:transparent;border:1px solid rgba(244,244,239,.3)!important;color:#fff" onclick="openReportsPanel()">Zgłoszenia</button><button class="admin-exit" style="background:transparent;border:1px solid rgba(244,244,239,.3)!important;color:#fff" onclick="openSellLeadsPanel()">Oferty sprzedaży</button><button class="admin-exit" style="background:transparent;border:1px solid rgba(244,244,239,.3)!important;color:#fff" onclick="openLegitChecksPanel()">LegitCheck</button><button class="admin-exit" onclick="exitAdminMode()">Wyjdź</button>`;
  document.body.appendChild(bar);
}

async function openSellLeadsPanel(){
  if(!currentUser){toast('Musisz być zalogowany na konto admina, żeby zobaczyć oferty');return;}
  document.getElementById('modal-title').textContent='Oferty sprzedaży (bez konta)';
  document.getElementById('modal-body').innerHTML=`<div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  const {data,error}=await sb.from('sell_leads').select('*').order('created_at',{ascending:false});
  if(error){
    document.getElementById('modal-body').innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('alertTriangle',36)}</div><div class="empty-text">BŁĄD: ${error.message}</div></div>`;
    return;
  }
  if(!data||!data.length){
    document.getElementById('modal-body').innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('cart',36)}</div><div class="empty-text">BRAK OFERT</div></div>`;
    return;
  }
  document.getElementById('modal-body').innerHTML=data.map(l=>`<div class="card mb8">
      <div class="fx-b mb8">
        <div style="font-size:13px;font-weight:700;color:var(--t1)">${escapeHtml(l.email)}</div>
        <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3)">${agoLabel(l.created_at)}</div>
      </div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:10px">${escapeHtml(l.description||'—')}</div>
      ${l.photos&&l.photos.length?`<div class="fx-c gap8" style="flex-wrap:wrap;margin-bottom:10px">${l.photos.map(p=>`<img src="${escapeHtml(p)}" style="width:64px;height:64px;object-fit:cover;border-radius:var(--r2);cursor:pointer" onclick="document.getElementById('lb-img').src='${escJsAttr(p)}';document.getElementById('lightbox').classList.add('open')">`).join('')}</div>`:''}
      <div class="fx-c gap8">
        <button class="btn btn-mkt" style="padding:5px 12px;font-size:10px" onclick="window.location.href='mailto:${escJsAttr(l.email)}'">${icon('messageCircle',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}Napisz e-mail</button>
      </div>
    </div>`).join('');
}

async function openReportsPanel(){
  if(!currentUser){toast('Musisz być zalogowany na konto admina, żeby zobaczyć zgłoszenia');return;}
  document.getElementById('modal-title').textContent='Zgłoszenia';
  document.getElementById('modal-body').innerHTML=`<div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  const {data,error}=await sb.from('listing_reports').select('*').order('created_at',{ascending:false});
  if(error){
    document.getElementById('modal-body').innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('alertTriangle',36)}</div><div class="empty-text">BŁĄD: ${error.message}</div></div>`;
    return;
  }
  if(!data||!data.length){
    document.getElementById('modal-body').innerHTML=`<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></div><div class="empty-text">BRAK ZGŁOSZEŃ</div></div>`;
    return;
  }
  document.getElementById('modal-body').innerHTML=data.map(r=>{
    const listing=_mktAllItems.find(x=>String(x.id)===String(r.listing_id));
    return `<div class="card mb8">
      <div class="fx-b mb8">
        <div style="font-size:13px;font-weight:700;color:var(--t1)">${listing?escapeHtml(`${listing.club} ${listing.season||''}`):`Ogłoszenie ${escapeHtml(r.listing_id)}`}</div>
        <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3)">${agoLabel(r.created_at)}</div>
      </div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:10px">${escapeHtml(r.reason||'—')}</div>
      <div class="fx-c gap8">
        ${listing?`<button class="btn btn-g" style="padding:5px 12px;font-size:10px" onclick="closeModal();openListingDetail('${r.listing_id}')">Zobacz ogłoszenie</button>`:''}
        <button class="btn btn-d" style="padding:5px 12px;font-size:10px" onclick="adminRemoveListing('${r.listing_id}')">Usuń ogłoszenie</button>
      </div>
    </div>`;
  }).join('');
}

async function saveAllAdminContent(){
  const rows=[];
  document.querySelectorAll('[data-ck]').forEach(el=>{
    rows.push({key:el.getAttribute('data-ck'),value:el.innerHTML.trim()});
  });
  rows.push({key:'clubs',value:JSON.stringify(LP_CLUBS)});
  rows.push({key:'hero_jerseys',value:JSON.stringify(LP_HERO_PHOTOS)});
  rows.push({key:'split_jersey',value:LP_SPLIT_PHOTO||''});
  const {error}=await sb.from('site_content').upsert(rows,{onConflict:'key'});
  if(error){toast('Błąd zapisu: '+error.message);return;}
  toast('Zapisano zmiany na stronie.');
}

async function loadSiteContent(){
  try{
    const {data,error}=await sb.from('site_content').select('key,value');
    if(error||!data){applyLandingLang();return;}
    const map={};
    data.forEach(r=>map[r.key]=r.value);
    document.querySelectorAll('[data-ck]').forEach(el=>{
      const k=el.getAttribute('data-ck');
      if(map[k]!=null&&map[k]!=='')el.innerHTML=map[k];
    });
    if(map['hero_jerseys']){
      try{const parsed=JSON.parse(map['hero_jerseys']);if(Array.isArray(parsed)){LP_HERO_PHOTOS=parsed;}}catch(e){}
    }
    if(map['split_jersey']){LP_SPLIT_PHOTO=map['split_jersey'];}
    initLandingJerseys();
    applyLandingLang();
  }catch(e){console.error('loadSiteContent error:',e);applyLandingLang();}
}

async function initAfterLogin(user){
  currentUser=user;
  // Hide landing, show app shell
  const landing=document.getElementById('landing');
  if(landing)landing.classList.add('hidden');
  closeAuthModal();
  const shell=document.getElementById('app-shell');
  if(shell)shell.classList.remove('hidden');
  const ue=document.getElementById('tb-user-email');
  if(ue)ue.textContent=currentUser.email;
  const av=document.getElementById('tb-user-avatar');
  if(av)av.textContent=(currentUser.email||'?')[0].toUpperCase();
  applyTheme();applyFX();applyTaskbar();renderDesktopIcons();updateTaskbar();
  if(!isOpen('dash'))switchSection('dash');
  setTimeout(async()=>{
    await sbLoadData();
    saveLocalCache();
    applyTheme();applyFX();applyTaskbar();renderDesktopIcons();updateTaskbar();
    initRealtimeSubscriptions();
    const{data}=await sb.from('notifications').select('id').eq('user_id',currentUser.id).eq('read',false);
    unreadNotifs=(data||[]).length;
    updateNotifBadge();
    checkAdminAccess();
  },0);
}

async function adminReviewLegitCheck(reqId,shirtId,approve){
  if(!adminMode)return;
  let adminNotes=null;
  if(!approve){
    adminNotes=await customPrompt(db.lang==='pl'?'Powód odrzucenia (opcjonalnie):':'Rejection reason (optional):');
    if(adminNotes===null)return;
  }
  const status=approve?'approved':'rejected';
  await sb.from('legit_checks').update({status,admin_notes:adminNotes,reviewed_at:new Date().toISOString()}).eq('id',reqId);
  await sb.from('shirts').update({legit_status:status}).eq('id',shirtId);
  await sb.from('market_listings').update({legit_status:status}).eq('id',shirtId);
  toast(approve?(db.lang==='pl'?'Zweryfikowano':'Verified'):(db.lang==='pl'?'Odrzucono':'Rejected'));
  const activeTab=document.getElementById('lc-tab-all')?.classList.contains('active')?'all':'pending';
  if(typeof renderLcAdminList==='function')renderLcAdminList(activeTab);
  else openLegitChecksPanel();
}

