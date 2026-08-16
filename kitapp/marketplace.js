// ============================================================
// marketplace.js — public listings, offers, likes, verified
// badges, reports, and the no-account "sell a jersey" lead
// form.
// Depends on: supabase.js, auth.js, collection.js
// ============================================================

async function sbListOnMarket(shirt){
  if(!currentUser||!db.profile?.nick)return false;
  const {error}=await sb.from('market_listings').upsert({
    id:shirt.id, user_id:currentUser.id, seller_nick:db.profile.nick,
    club:shirt.club, season:shirt.season, kind:kindLabel(shirt.kind), size:shirt.customSize||shirt.size,
    condition:shirt.condition, personalization:shirt.personalization,
    price_pln:toPLN(shirt.marketValue||shirt.buyPrice), notes:shirt.notes,
    photo:shirt.photos&&shirt.photos[0]?shirt.photos[0]:null,
    accepts_offers:shirt.acceptsOffers!==false, min_offer:shirt.minOffer||null, legit_status:shirt.legitStatus||null,
    listed_at:new Date().toISOString()
  },{onConflict:'id'});
  if(error){toast('Błąd marketplace: '+error.message);return false;}
  return true;
}

async function sbRemoveFromMarket(shirtId){
  if(!currentUser)return;
  await sb.from('market_listings').delete().eq('id',shirtId);
}

async function sbLoadMarket(){
  const {data,error}=await sb.from('market_listings').select('*').order('listed_at',{ascending:false});
  if(error){toast('Błąd ładowania marketplace');return [];}
  return data||[];
}

let _mktAllItems=[];
let _mktTab='listings';

function bMarket(){
  return `
  <div class="fx-b mb12 s1">
    <div><div class="ph-sub" style="border-color:rgba(20,33,61,.3);background:rgba(20,33,61,.08);color:#14213d"><span style="width:5px;height:5px;border-radius:50%;background:#14213d;animation:pulse 3s ease-in-out infinite"></span><span>${T('nav_market')}</span></div><div class="ph-title">${T('mkt_title').toUpperCase()}</div></div>
    <div class="fx-c gap8">
      <button class="btn btn-g" onclick="loadMarketplace()">↻ ${db.lang==='pl'?'Odśwież':'Refresh'}</button>
      <button class="btn btn-mkt" onclick="openApp('profile')">${db.lang==='pl'?'Mój Profil':'My Profile'}</button>
    </div>
  </div>
  <div class="tabs mb12">
    <div class="tab active" id="mkt-tab-listings" onclick="switchMktTab('listings')">${icon('tag2',13,"display:inline-block;vertical-align:-2px;margin-right:4px")}${db.lang==='pl'?'Ogłoszenia':'Listings'}</div>
    <div class="tab" id="mkt-tab-wishlist" onclick="switchMktTab('wishlist')">${icon('heart',13,"display:inline-block;vertical-align:-2px;margin-right:5px")} ${db.lang==='pl'?'Szukane':'Wanted'}</div>
    <div class="tab" id="mkt-tab-profiles" onclick="switchMktTab('profiles')">${icon('users',13,"display:inline-block;vertical-align:-2px;margin-right:4px")}${db.lang==='pl'?'Profile':'Profiles'}</div>
  </div>
  <div id="mkt-section-listings">
    <div class="mkt-layout">
      <div class="mkt-sidebar">
        <div class="mkt-fgroup">
          <div class="field field-search" style="padding:6px 10px">${icon('search',12)}<input type="text" id="mkt-search" placeholder="${db.lang==='pl'?'Klub, sezon, nick...':'Club, season, nick...'}" oninput="filterMarket()" style="font-size:11px"></div>
        </div>
        <div class="mkt-fgroup">
          <div class="mkt-fgroup-title">${db.lang==='pl'?'Klub':'Club'}</div>
          <div id="mkt-club-list" style="max-height:180px;overflow-y:auto"></div>
        </div>
        <div class="mkt-fgroup">
          <div class="mkt-fgroup-title">${db.lang==='pl'?'Rodzaj':'Kit type'}</div>
          <div class="mkt-chip-row" id="mkt-kind-chips">
            ${['Domowa','Wyjazdowa','Trzecia','Specjalna'].map(k=>`<div class="mkt-chip" data-kind="${k}" onclick="setMktChip('kind','${k}')">${db.lang==='pl'?k:kindLabel(k)}</div>`).join('')}
          </div>
        </div>
        <div class="mkt-fgroup">
          <div class="mkt-fgroup-title">${db.lang==='pl'?'Rozmiar':'Size'}</div>
          <div class="mkt-chip-row" id="mkt-size-chips">
            ${SIZES.map(s=>`<div class="mkt-chip" data-size="${s}" onclick="setMktChip('size','${s}')">${s}</div>`).join('')}
          </div>
        </div>
        <div class="mkt-fgroup">
          <div class="mkt-fgroup-title">${db.lang==='pl'?'Zakres cen (PLN)':'Price range (PLN)'}</div>
          <div class="mkt-price-row">
            <input type="number" id="mkt-price-min" placeholder="${db.lang==='pl'?'Od':'Min'}" oninput="filterMarket()">
            <span style="color:var(--t3)">–</span>
            <input type="number" id="mkt-price-max" placeholder="${db.lang==='pl'?'Do':'Max'}" oninput="filterMarket()">
          </div>
        </div>
        <div class="mkt-fgroup" style="padding:8px 14px">
          <div class="mkt-clear-btn" onclick="clearMktFilters()">${db.lang==='pl'?'Wyczyść filtry':'Clear filters'}</div>
        </div>
      </div>
      <div>
        <div class="fx-b mb12">
          <span class="mkt-count" id="mkt-count">—</span>
          <div class="mkt-sort-tabs" id="mkt-sort-tabs">
            <div class="mkt-sort-tab active" data-sort="new" onclick="setMktSort('new')">${db.lang==='pl'?'Najnowsze':'Newest'}</div>
            <div class="mkt-sort-tab" data-sort="cheap" onclick="setMktSort('cheap')">${db.lang==='pl'?'Cena ↑':'Price ↑'}</div>
            <div class="mkt-sort-tab" data-sort="expensive" onclick="setMktSort('expensive')">${db.lang==='pl'?'Cena ↓':'Price ↓'}</div>
          </div>
        </div>
        <div id="mkt-featured"></div>
        <div id="mkt-grid" class="g3 s2"><div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div></div>
      </div>
    </div>
  </div>
  <div id="mkt-section-wishlist" style="display:none"></div>
  <div id="mkt-section-profiles" style="display:none"></div>`;
}

function switchMktTab(tab){
  _mktTab=tab;
  ['listings','wishlist','profiles'].forEach(t=>{
    const btn=document.getElementById('mkt-tab-'+t);
    const sec=document.getElementById('mkt-section-'+t);
    if(btn)btn.classList.toggle('active',t===tab);
    if(sec)sec.style.display=t===tab?'block':'none';
  });
  if(tab==='wishlist')loadPublicWishlists();
  if(tab==='profiles')loadPublicProfilesSection();
}

function filterMarket(){
  _mktFilters.q=(document.getElementById('mkt-search')?.value||'').toLowerCase();
  const pmin=parseFloat(document.getElementById('mkt-price-min')?.value);
  const pmax=parseFloat(document.getElementById('mkt-price-max')?.value);
  _mktFilters.priceMin=isNaN(pmin)?null:pmin;
  _mktFilters.priceMax=isNaN(pmax)?null:pmax;
  let items=[..._mktAllItems];
  const f=_mktFilters;
  if(f.q)items=items.filter(i=>(i.club||'').toLowerCase().includes(f.q)||(i.season||'').toLowerCase().includes(f.q)||(i.seller_nick||'').toLowerCase().includes(f.q));
  if(f.club)items=items.filter(i=>i.club===f.club);
  if(f.kind)items=items.filter(i=>i.kind===f.kind);
  if(f.size)items=items.filter(i=>i.size===f.size);
  if(f.priceMin!=null)items=items.filter(i=>(i.price_pln||0)>=f.priceMin);
  if(f.priceMax!=null)items=items.filter(i=>(i.price_pln||0)<=f.priceMax);
  if(f.sort==='cheap')items.sort((a,b)=>(a.price_pln||0)-(b.price_pln||0));
  else if(f.sort==='expensive')items.sort((a,b)=>(b.price_pln||0)-(a.price_pln||0));
  else items.sort((a,b)=>new Date(b.listed_at||0)-new Date(a.listed_at||0));
  renderMarketItems(items);
  const cEl=document.getElementById('mkt-count');
  if(cEl)cEl.textContent=`${items.length} ${db.lang==='pl'?'dostępnych ogłoszeń':'listings available'}`;
}
let _mktFilters={q:'',club:'',kind:'',size:'',priceMin:null,priceMax:null,sort:'new'};
function setMktChip(type,val){
  _mktFilters[type]=(_mktFilters[type]===val)?'':val;
  document.querySelectorAll(`#mkt-${type}-chips .mkt-chip`).forEach(c=>{
    c.classList.toggle('active',c.dataset[type]===_mktFilters[type]&&_mktFilters[type]!=='');
  });
  filterMarket();
}
function setMktClub(club){
  _mktFilters.club=(_mktFilters.club===club)?'':club;
  document.querySelectorAll('.mkt-club-row').forEach(r=>{
    r.classList.toggle('active',r.dataset.club===_mktFilters.club&&_mktFilters.club!=='');
  });
  filterMarket();
}
function setMktSort(s){
  _mktFilters.sort=s;
  document.querySelectorAll('#mkt-sort-tabs .mkt-sort-tab').forEach(t=>t.classList.toggle('active',t.dataset.sort===s));
  filterMarket();
}
function clearMktFilters(){
  _mktFilters={q:'',club:'',kind:'',size:'',priceMin:null,priceMax:null,sort:'new'};
  const s=document.getElementById('mkt-search');if(s)s.value='';
  const pmin=document.getElementById('mkt-price-min');if(pmin)pmin.value='';
  const pmax=document.getElementById('mkt-price-max');if(pmax)pmax.value='';
  document.querySelectorAll('.mkt-chip,.mkt-club-row').forEach(c=>c.classList.remove('active'));
  document.querySelectorAll('#mkt-sort-tabs .mkt-sort-tab').forEach(t=>t.classList.toggle('active',t.dataset.sort==='new'));
  filterMarket();
}
function buildMktSidebarClubs(items){
  const counts={};
  items.forEach(i=>{if(i.club)counts[i.club]=(counts[i.club]||0)+1;});
  const clubs=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0,15);
  const el=document.getElementById('mkt-club-list');if(!el)return;
  if(!clubs.length){el.innerHTML=`<div style="font-size:10px;color:var(--t3)">—</div>`;return;}
  el.innerHTML=clubs.map(c=>`<div class="mkt-club-row ${_mktFilters.club===c?'active':''}" data-club="${c}" onclick="setMktClub('${c.replace(/'/g,"\\'")}')"><span>${c}</span><span>${counts[c]}</span></div>`).join('');
}
function isMktRecent(dateStr){
  if(!dateStr)return false;
  return (Date.now()-new Date(dateStr).getTime())<1000*60*60*24*3;
}

async function loadPublicWishlists(){
  const el=document.getElementById('mkt-section-wishlist');if(!el)return;
  el.innerHTML=`<div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div>`;
  const{data:wlItems}=await sb.from('wishlist').select('*').eq('public',true).order('created_at',{ascending:false});
  if(!wlItems||!wlItems.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('heart',44)}</div><div class="empty-text">${db.lang==='pl'?'NIKT NIE SZUKA — BĄDŹ PIERWSZY!':'NOBODY IS LOOKING YET!'}</div></div>`;return;}
  const wlUserIds=[...new Set(wlItems.map(w=>w.user_id))];
  const{data:wlProfs}=await sb.from('profiles').select('user_id,nick').in('user_id',wlUserIds);
  const wlNickMap={};(wlProfs||[]).forEach(p=>wlNickMap[p.user_id]=p.nick||'?');
  const items=wlItems.map(w=>({...w,_nick:wlNickMap[w.user_id]||'?'}));
  window._wlMktItems=items;
  const clubs=[...new Set(items.map(w=>w.club).filter(Boolean))];
  el.innerHTML=`
  <div class="card mb12" style="padding:10px 14px">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <div class="field field-search" style="flex:1;min-width:140px;padding:5px 10px">${icon('search',12)}<input type="text" id="wl-mkt-search" placeholder="${db.lang==='pl'?'Szukaj...':'Search...'}" oninput="filterPublicWishlist()" style="font-size:11px"></div>
      <select class="form-select" id="wl-mkt-club" style="width:auto;padding:5px 10px;font-size:11px" onchange="filterPublicWishlist()">
        <option value="">${db.lang==='pl'?'Wszystkie kluby':'All clubs'}</option>${clubs.map(c=>`<option>${c}</option>`).join('')}
      </select>
      <select class="form-select" id="wl-mkt-size" style="width:auto;padding:5px 10px;font-size:11px" onchange="filterPublicWishlist()">
        <option value="">${db.lang==='pl'?'Rozmiar':'Size'}</option>${SIZES.map(s=>`<option>${s}</option>`).join('')}
      </select>
    </div>
  </div>
  <div id="wl-mkt-grid" class="g3">${renderPublicWishlistCards(items)}</div>`;
}

function filterPublicWishlist(){
  const q=(document.getElementById('wl-mkt-search')?.value||'').toLowerCase();
  const club=document.getElementById('wl-mkt-club')?.value||'';
  const size=document.getElementById('wl-mkt-size')?.value||'';
  let items=[...(window._wlMktItems||[])];
  if(q)items=items.filter(w=>(w.club||'').toLowerCase().includes(q)||(w._nick||'').toLowerCase().includes(q));
  if(club)items=items.filter(w=>w.club===club);
  if(size)items=items.filter(w=>w.size===size);
  const grid=document.getElementById('wl-mkt-grid');
  if(grid)grid.innerHTML=renderPublicWishlistCards(items);
}

function renderPublicWishlistCards(items){
  if(!items.length)return`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('search',44)}</div><div class="empty-text">BRAK WYNIKÓW</div></div></div>`;
  return items.map(w=>{
    const nick=w._nick||'?';
    const isOwn=w.user_id===currentUser?.id;
    return `<div class="card" style="border-color:rgba(20,33,61,.15)">
      <div class="fx-b mb8">
        <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:18px;color:var(--t1)">${w.club||db.lang==='pl'?'Dowolny klub':'Any club'}</div>
        <span style="color:#14213d;display:inline-flex">${icon('heart',18)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
        ${w.season?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${icon('calendar',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}${w.season}</div>`:''}
        ${w.size?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${icon('ruler',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}${w.size}</div>`:''}
        ${w.max_price?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--a)">${icon('banknote',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}Max: ${w.max_price} PLN</div>`:''}
        ${w.kind?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${icon('shirt',11,"display:inline-block;vertical-align:-2px;margin-right:4px")} ${kindLabel(w.kind)}</div>`:''}
        ${w.notes?`<div style="font-size:10px;color:var(--t2);margin-top:4px">${w.notes}</div>`:''}
      </div>
      <div class="div" style="margin:8px 0"></div>
      <div class="fx-b">
        <div class="fx-c gap6" style="cursor:pointer" onclick="viewProfile('${nick}')">
          <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--a) 0%,color-mix(in srgb,var(--a) 50%,#000) 100%);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--on-a,#fff)">${nick[0].toUpperCase()}</div>
          <span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:#14213d">${nick}</span>
        </div>
        ${!isOwn?`<button class="btn btn-g" style="padding:4px 10px;font-size:10px" onclick="contactSeller('${w.user_id}','${nick}')">${icon('messageCircle',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}Napisz</button>`:`<span style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3)">TWOJA</span>`}
      </div>
    </div>`;
  }).join('');
}

async function loadPublicProfilesSection(){
  const el=document.getElementById('mkt-section-profiles');if(!el)return;
  el.innerHTML=`<div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div>`;
  const{data}=await sb.from('profiles').select('*').eq('visible',true);
  const profiles=data||[];
  if(!profiles.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('users',44)}</div><div class="empty-text">${db.lang==='pl'?'BRAK PUBLICZNYCH PROFILI':'NO PUBLIC PROFILES'}</div></div>`;return;}
  el.innerHTML=`<div class="g3">${profiles.map(p=>`
    <div class="card fx-c gap12" style="cursor:pointer" onclick="viewProfile('${p.nick||''}')">
      <div class="profile-avatar" style="width:44px;height:44px;font-size:18px">${(p.nick||'?')[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:16px;letter-spacing:.04em">${p.nick||'—'}</div>
        ${p.bio?`<div style="font-size:10px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.bio}</div>`:''}
        <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#14213d;margin-top:3px">${p.shirt_count||0} ${db.lang==='pl'?'koszulek':'jerseys'}</div>
      </div>
      <button class="btn btn-g" style="padding:4px 10px;font-size:10px;flex-shrink:0" onclick="event.stopPropagation();contactSeller('${p.user_id}','${p.nick||''}')">${icon('messageCircle',13)}</button>
    </div>`).join('')}</div>`;
}

async function loadMarketplace(){
  const grid=document.getElementById('mkt-grid');if(!grid)return;
  grid.innerHTML=`<div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div>`;
  try{
    const items=await sbLoadMarket();
    _mktAllItems=items;
    buildMktSidebarClubs(items);
    filterMarket();
  }catch(e){
    grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('alertTriangle',44)}</div><div class="empty-text">${db.lang==='pl'?'BŁĄD ŁADOWANIA':'LOAD ERROR'}</div></div></div>`;
  }
}

function mktCardHtml(i){
  const mv=parseFloat(i.price_pln||i.mv)||0;
  const isOwn=i.seller_nick===(db.profile?.nick||'')||i.user_id===currentUser?.id;
  return `<div class="mkt-card" onclick="openListingDetail('${i.id}')">
      <div class="shirt-photo" style="background:var(--bg3)">
        ${i.photo?`<img src="${i.photo}" alt="" style="width:100%;height:100%;object-fit:cover">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
        <div style="position:absolute;top:8px;right:8px"><span class="sh-status public">Marketplace</span></div>
        ${isOwn?`<div style="position:absolute;top:8px;left:8px;background:rgba(var(--a-rgb),.8);border-radius:6px;padding:2px 8px;font-family:'JetBrains Mono',monospace;font-size:8px;color:#fff">TWOJE</div>`:isMktRecent(i.listed_at)?`<div class="mkt-badge">${db.lang==='pl'?'NOWE':'NEW'}</div>`:''}
        <div style="position:absolute;bottom:8px;right:8px">${likeButtonHtml(i.id)}</div>
      </div>
      <div class="shirt-card-body">
        <div class="shirt-card-club">${i.club||'—'}${i.legit_status==='approved'?` ${legitStatusBadge('approved')}`:''}</div>
        <div class="shirt-card-season">${[i.season,i.kind,i.size].filter(Boolean).join(' · ')}</div>
        ${i.personalization?`<div style="font-size:10px;color:var(--t2);margin-bottom:4px;font-family:'JetBrains Mono',monospace">${i.personalization}</div>`:''}
        <div class="fx-b mb8">
          <div class="shirt-card-price" style="color:#14213d">${mv?mv.toFixed(2)+' PLN':'—'}</div>
          ${i.condition?`<div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:${condColor(i.condition)}">${i.condition}/10</div>`:''}
        </div>
        <div class="div" style="margin:8px 0"></div>
        <div class="fx-b">
          <div class="mkt-seller fx-c gap6" style="cursor:pointer" onclick="event.stopPropagation();viewProfile('${i.seller_nick||''}')">
            <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--a) 0%,color-mix(in srgb,var(--a) 50%,#000) 100%);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--on-a,#fff);font-family:'Inter',sans-serif;font-weight:800">${(i.seller_nick||'?')[0].toUpperCase()}</div>
            ${i.seller_nick||'—'}${verifiedBadgeHtml(i.seller_nick)}
          </div>
          ${isOwn?`<button class="btn btn-d" style="padding:4px 10px;font-size:10px" onclick="event.stopPropagation();removeListing('${i.id}')">${icon('x',11,"display:inline-block;vertical-align:-1px;margin-right:4px")} ${T('mkt_remove')}</button>`:`<button class="btn btn-mkt" style="padding:4px 10px;font-size:10px" onclick="event.stopPropagation();contactSeller('${i.user_id||''}','${i.seller_nick||''}')">${icon('messageCircle',12,"display:inline-block;vertical-align:-2px;margin-right:5px")} ${T('mkt_contact')}</button>`}
        </div>
        ${i.notes?`<div style="font-size:10px;color:var(--t2);margin-top:8px;padding-top:8px;border-top:1px solid rgba(20,33,61,.08)">${i.notes}</div>`:''}
      </div>
    </div>`;
}
function renderMarketItems(items){
  const grid=document.getElementById('mkt-grid');if(!grid)return;
  const featEl=document.getElementById('mkt-featured');
  const valid=items.filter(i=>i&&i.club);
  if(!valid.length){
    grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('cart',44)}</div><div class="empty-text">${T('mkt_empty')}</div><button class="btn btn-p" style="margin-top:4px" onclick="openApp('collection')">${db.lang==='pl'?'Wystaw swoją koszulkę':'List your jersey'}</button></div></div>`;
    if(featEl)featEl.innerHTML='';
    return;
  }
  const renderNow=()=>{
    if(featEl){
      const featured=[...valid].sort((a,b)=>(b.price_pln||0)-(a.price_pln||0)).slice(0,3);
      featEl.innerHTML=valid.length>=6?`
        <div class="mkt-fgroup-title" style="margin-bottom:10px">★ ${db.lang==='pl'?'Wyróżnione':'Featured'}</div>
        <div class="mkt-featured-strip">${featured.map(mktCardHtml).join('')}</div>
        <div class="div" style="margin:18px 0"></div>`:'';
    }
    grid.innerHTML=valid.map(mktCardHtml).join('');
  };
  renderNow();
  Promise.all([loadLikesFor(valid.map(i=>i.id)),loadVerifiedNicks()]).then(renderNow);
}

let _verifiedNicks=new Set();
let _verifiedLoaded=false;
async function loadVerifiedNicks(force){
  if(_verifiedLoaded&&!force)return;
  try{
    const {data,error}=await sb.from('profiles').select('nick').eq('is_verified',true);
    if(error||!data)return;
    _verifiedNicks=new Set(data.map(r=>r.nick).filter(Boolean));
    _verifiedLoaded=true;
  }catch(e){console.error('loadVerifiedNicks error:',e);}
}
function verifiedBadgeHtml(nick,size){
  if(!nick||!_verifiedNicks.has(nick))return'';
  size=size||12;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;flex-shrink:0" title="${db.lang==='pl'?'Zweryfikowany sprzedający':'Verified seller'}"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;
}
async function toggleUserVerified(nick,userId){
  if(!adminMode)return;
  const {data}=await sb.from('profiles').select('is_verified').eq('user_id',userId).maybeSingle();
  const newVal=!(data?.is_verified);
  const {error}=await sb.from('profiles').update({is_verified:newVal}).eq('user_id',userId);
  if(error){toast('Błąd: '+error.message);return;}
  toast(newVal?'Użytkownik zweryfikowany':'Weryfikacja cofnięta');
  await loadVerifiedNicks(true);
  viewProfile(nick);
}

let _likesCache={};
async function loadLikesFor(shirtIds){
  const ids=[...new Set(shirtIds.filter(Boolean).map(String))];
  if(!ids.length)return;
  try{
    const {data,error}=await sb.from('shirt_likes').select('shirt_id,user_id').in('shirt_id',ids);
    if(error||!data)return;
    ids.forEach(id=>{_likesCache[id]={count:0,likedByMe:false};});
    data.forEach(row=>{
      const id=String(row.shirt_id);
      if(!_likesCache[id])_likesCache[id]={count:0,likedByMe:false};
      _likesCache[id].count++;
      if(currentUser&&row.user_id===currentUser.id)_likesCache[id].likedByMe=true;
    });
  }catch(e){console.error('loadLikesFor error:',e);}
}
function likeButtonHtml(shirtId,size){
  size=size||'sm';
  const l=_likesCache[String(shirtId)]||{count:0,likedByMe:false};
  const cls=size==='lg'?'like-btn like-btn-lg':'like-btn';
  return `<button class="${cls} ${l.likedByMe?'liked':''}" onclick="event.stopPropagation();toggleLike('${shirtId}',this)">
    <svg viewBox="0 0 24 24" width="${size==='lg'?18:14}" height="${size==='lg'?18:14}" fill="${l.likedByMe?'currentColor':'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
    <span class="like-count">${l.count||''}</span>
  </button>`;
}
async function toggleLike(shirtId,btnEl){
  if(!currentUser){toast(db.lang==='pl'?'Zaloguj się, aby polubić':'Log in to like');return;}
  const id=String(shirtId);
  if(!_likesCache[id])_likesCache[id]={count:0,likedByMe:false};
  const wasLiked=_likesCache[id].likedByMe;
  _likesCache[id].likedByMe=!wasLiked;
  _likesCache[id].count+=wasLiked?-1:1;
  if(btnEl)btnEl.outerHTML=likeButtonHtml(id,btnEl.classList.contains('like-btn-lg')?'lg':'sm');
  if(wasLiked){
    await sb.from('shirt_likes').delete().eq('shirt_id',id).eq('user_id',currentUser.id);
  }else{
    const {error}=await sb.from('shirt_likes').insert({shirt_id:id,user_id:currentUser.id});
    if(error&&error.code!=='23505'){
      _likesCache[id].likedByMe=false;_likesCache[id].count--;
      toast(db.lang==='pl'?'Błąd polubienia':'Like failed');
    }
  }
}

function agoLabel(dateStr){
  if(!dateStr)return '';
  const diff=Date.now()-new Date(dateStr).getTime();
  const min=Math.floor(diff/60000),h=Math.floor(diff/3600000),d=Math.floor(diff/86400000),w=Math.floor(d/7);
  if(min<60)return db.lang==='pl'?`${min||1} min temu`:`${min||1} min ago`;
  if(h<24)return db.lang==='pl'?`${h} godz. temu`:`${h}h ago`;
  if(d<7)return db.lang==='pl'?`${d} dni temu`:`${d}d ago`;
  if(w<5)return db.lang==='pl'?`${w} tyg. temu`:`${w}w ago`;
  return new Date(dateStr).toLocaleDateString('pl-PL');
}

function openListingDetail(id){
  const l=_mktAllItems.find(x=>String(x.id)===String(id));
  if(!l)return;
  const isOwn=l.seller_nick===(db.profile?.nick||'')||l.user_id===currentUser?.id;
  const mv=parseFloat(l.price_pln)||0;
  const flagIcon=`<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:5px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
  document.getElementById('modal-title').textContent=l.club||(db.lang==='pl'?'Koszulka':'Jersey');
  document.getElementById('modal-body').innerHTML=`
    <div class="g12 s2">
    <div class="c8" style="grid-column:span 6">
      <div class="shirt-photo" style="border-radius:var(--r2);aspect-ratio:1;position:relative">
        ${l.photo?`<img src="${l.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r2)">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
      </div>
    </div>
    <div class="c4" style="grid-column:span 6">
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--t2);letter-spacing:.04em;margin-bottom:8px">${[l.season,l.kind,l.size].filter(Boolean).join(' · ')}</div>
      ${l.legit_status==='approved'?`<div style="margin-bottom:8px">${legitStatusBadge('approved')}</div>`:''}
      <div class="fx-b" style="margin-bottom:4px">
        <div style="font-family:'Inter',sans-serif;font-weight:900;font-size:30px;color:#14213d">${mv?mv.toFixed(2)+' PLN':'—'}</div>
        ${likeButtonHtml(l.id,'lg')}
      </div>
      ${l.condition?`<div style="font-size:11px;color:${condColor(l.condition)};font-family:'JetBrains Mono',monospace;margin-bottom:14px">${db.lang==='pl'?'Stan':'Condition'}: ${l.condition}/10</div>`:'<div style="margin-bottom:14px"></div>'}
      ${!isOwn?`
      <button class="btn btn-mkt w100 mb8" onclick="contactSeller('${l.user_id||''}','${l.seller_nick||''}')">${icon('messageCircle',13,"display:inline-block;vertical-align:-2px;margin-right:6px")}${T('mkt_contact')}</button>
      ${l.accepts_offers!==false?`<button class="btn btn-g w100 mb8" onclick="openMakeOffer('${l.id}')">${icon('tag',13,"display:inline-block;vertical-align:-2px;margin-right:6px")}${db.lang==='pl'?'Zaproponuj ofertę':'Make an offer'}${l.min_offer?` (min. ${parseFloat(l.min_offer).toFixed(0)} PLN)`:''}</button>`:`<div style="font-size:9.5px;color:var(--t3);font-family:'JetBrains Mono',monospace;letter-spacing:.06em;margin-bottom:8px">${db.lang==='pl'?'SPRZEDAJĄCY NIE AKCEPTUJE OFERT':'SELLER DOES NOT ACCEPT OFFERS'}</div>`}
      `:''}
      <div class="div" style="margin:14px 0"></div>
      <div class="mkt-seller fx-c gap8" style="cursor:pointer;margin-bottom:10px" onclick="closeModal();viewProfile('${l.seller_nick||''}')">
        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--a) 0%,color-mix(in srgb,var(--a) 50%,#000) 100%);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;font-family:'Inter',sans-serif;font-weight:800">${(l.seller_nick||'?')[0].toUpperCase()}</div>
        <span style="font-size:12px;font-weight:600;color:var(--t1)">${l.seller_nick||'—'}</span>${verifiedBadgeHtml(l.seller_nick,14)}
      </div>
      <div style="font-size:10px;color:var(--t3);font-family:'JetBrains Mono',monospace;display:flex;gap:14px">
        <span>${(l.views||0)+1} ${db.lang==='pl'?'wyświetleń':'views'}</span>
        <span>${db.lang==='pl'?'Wystawiono':'Listed'} ${agoLabel(l.listed_at)}</span>
      </div>
      ${l.notes?`<div style="font-size:12px;color:var(--t2);line-height:1.6;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">${l.notes}</div>`:''}
      <div class="div" style="margin:14px 0"></div>
      <div class="fx-c gap8" style="flex-wrap:wrap">
        ${isOwn?`<button class="btn btn-d" onclick="closeModal();removeListing('${l.id}')">${icon('trash',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${T('mkt_remove')}</button>`:''}
        ${!isOwn?`<button class="btn btn-g" style="opacity:.75" onclick="reportListing('${l.id}')">${flagIcon}${db.lang==='pl'?'Zgłoś ogłoszenie':'Report listing'}</button>`:''}
        ${adminMode?`<button class="btn btn-d" onclick="adminRemoveListing('${l.id}')">${icon('trash',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Usuń (admin)':'Delete (admin)'}</button>`:''}
      </div>
    </div>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
  incrementListingViews(l.id);
  loadLikesFor([l.id]).then(()=>{
    const btn=document.querySelector('#modal-body .like-btn-lg');
    if(btn)btn.outerHTML=likeButtonHtml(l.id,'lg');
  });
}

async function incrementListingViews(id){
  try{
    const l=_mktAllItems.find(x=>String(x.id)===String(id));
    const newViews=(l?.views||0)+1;
    if(l)l.views=newViews;
    await sb.from('market_listings').update({views:newViews}).eq('id',id);
  }catch(e){}
}

function openMakeOffer(id){
  const l=_mktAllItems.find(x=>String(x.id)===String(id));
  if(!l)return;
  if(!currentUser){toast(db.lang==='pl'?'Zaloguj się, aby złożyć ofertę':'Log in to make an offer');return;}
  if(l.user_id===currentUser.id){toast(db.lang==='pl'?'To Twoje ogłoszenie':'This is your listing');return;}
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Zaproponuj ofertę':'Make an offer';
  document.getElementById('modal-body').innerHTML=`
    <div style="font-size:13px;color:var(--t2);margin-bottom:14px">${l.club} ${l.season||''} — ${db.lang==='pl'?'cena wyjściowa':'asking price'} <b style="color:#14213d">${parseFloat(l.price_pln||0).toFixed(2)} PLN</b></div>
    ${l.min_offer?`<div style="font-size:11px;color:var(--t3);font-family:'JetBrains Mono',monospace;margin-bottom:12px">${db.lang==='pl'?'Minimalna oferta akceptowana przez sprzedającego':'Minimum offer accepted by seller'}: ${parseFloat(l.min_offer).toFixed(0)} PLN</div>`:''}
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Twoja oferta (PLN)':'Your offer (PLN)'}</div><input class="form-input" type="text" inputmode="decimal" id="offer-amount" placeholder="0"></div>
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Wiadomość (opcjonalnie)':'Message (optional)'}</div><textarea class="form-input" id="offer-msg" rows="2" placeholder="${db.lang==='pl'?'np. Mogę odebrać osobiście':'e.g. I can pick up in person'}"></textarea></div>
    <div class="fx-c gap8" style="justify-content:flex-end;margin-top:14px">
      <button class="btn btn-g" onclick="openListingDetail('${id}')">${T('cancel')}</button>
      <button class="btn btn-p" onclick="submitOffer('${id}')">${db.lang==='pl'?'Wyślij ofertę':'Send offer'}</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function submitOffer(id){
  const l=_mktAllItems.find(x=>String(x.id)===String(id));
  if(!l)return;
  const amount=parseFloat(document.getElementById('offer-amount')?.value);
  if(!amount||amount<=0){toast(db.lang==='pl'?'Podaj kwotę oferty':'Enter an offer amount');return;}
  if(l.min_offer&&amount<parseFloat(l.min_offer)){toast(db.lang==='pl'?`Minimalna oferta to ${l.min_offer} PLN`:`Minimum offer is ${l.min_offer} PLN`);return;}
  const msg=(document.getElementById('offer-msg')?.value||'').trim();
  const convId=await getOrCreateConv(l.user_id);
  if(!convId){toast(db.lang==='pl'?'Błąd wysyłania oferty':'Error sending offer');return;}
  const text=`💰 ${db.lang==='pl'?'Oferta':'Offer'}: ${amount.toFixed(2)} PLN ${db.lang==='pl'?'za':'for'} ${l.club} ${l.season||''}${msg?`\n"${msg}"`:''}`;
  await sendMessage(convId,text);
  closeModal();
  toast(db.lang==='pl'?'Oferta wysłana!':'Offer sent!');
  activeConvId=convId;openApp('chat');
  setTimeout(()=>initChatView().then(()=>selectConv(convId,l.seller_nick||'Sprzedający')),200);
}

function reportListing(id){
  if(!currentUser){toast(db.lang==='pl'?'Zaloguj się, aby zgłosić':'Log in to report');return;}
  const reasons=db.lang==='pl'
    ?['Podejrzenie oszustwa','Nieprawidłowy opis / zdjęcie','Zakazana treść','Duplikat ogłoszenia','Inne']
    :['Suspected scam','Wrong description / photo','Prohibited content','Duplicate listing','Other'];
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Zgłoś ogłoszenie':'Report listing';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Powód zgłoszenia':'Reason for report'}</div>
      <div id="report-reasons" style="display:flex;flex-direction:column;gap:6px">
        ${reasons.map((r,i)=>`<div class="report-reason-row" data-idx="${i}" onclick="pickReportReason(${i})"><span class="report-reason-dot"></span>${r}</div>`).join('')}
      </div>
    </div>
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Dodatkowe informacje (opcjonalnie)':'Additional details (optional)'}</div>
      <textarea class="form-input" id="report-details" rows="2" placeholder="${db.lang==='pl'?'Opisz krótko problem...':'Briefly describe the issue...'}"></textarea>
    </div>
    <div class="fx-c gap8" style="justify-content:flex-end;margin-top:14px">
      <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
      <button class="btn btn-p" id="report-submit-btn" onclick="submitReport('${id}')" disabled style="opacity:.5">${db.lang==='pl'?'Wyślij zgłoszenie':'Send report'}</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
  window._reportReasons=reasons;
  window._reportPicked=null;
}
function pickReportReason(idx){
  window._reportPicked=idx;
  document.querySelectorAll('.report-reason-row').forEach(el=>el.classList.toggle('active',parseInt(el.dataset.idx)===idx));
  const btn=document.getElementById('report-submit-btn');
  if(btn){btn.disabled=false;btn.style.opacity='1';}
}
function submitReport(id){
  if(window._reportPicked==null)return;
  const reason=window._reportReasons[window._reportPicked];
  const details=(document.getElementById('report-details')?.value||'').trim();
  const full=details?`${reason} — ${details}`:reason;
  sb.from('listing_reports').insert({listing_id:id,reporter_id:currentUser.id,reason:full}).then(({error})=>{
    if(error){toast(db.lang==='pl'?'Błąd zgłoszenia':'Report failed');return;}
    closeModal();
    toast(db.lang==='pl'?'Zgłoszenie wysłane, dziękujemy':'Report sent, thank you');
  });
}

async function adminRemoveListing(id){
  if(!adminMode)return;
  if(!await customConfirm(db.lang==='pl'?'Usunąć to ogłoszenie jako moderator?':'Delete this listing as moderator?'))return;
  const {error}=await sb.from('market_listings').delete().eq('id',id);
  if(error){toast('Błąd: '+error.message);return;}
  closeModal();toast(db.lang==='pl'?'Usunięto ogłoszenie':'Listing removed');loadMarketplace();
}

async function contactSeller(userId,nick){
  if(!userId){toast('Nie można otworzyć czatu — brak ID sprzedającego');return;}
  if(userId===currentUser?.id){toast('To Twoje ogłoszenie');return;}
  toast('Otwieranie czatu...');
  const convId=await getOrCreateConv(userId);
  if(!convId){toast('Błąd otwierania czatu');return;}
  activeConvId=convId;
  openApp('chat');
  setTimeout(()=>initChatView().then(()=>selectConv(convId,nick||'Sprzedający')),200);
}

async function removeListing(listingId){
  await sbRemoveFromMarket(listingId);
  const s=(db.shirts||[]).find(x=>String(x.id)===String(listingId));
  if(s){s.marketListed=false;await sbSaveShirt(s);}
  toast(T('mkt_remove'));loadMarketplace();
}

async function viewProfile(nick){
  if(!nick||nick==='?'||nick==='—'){toast(db.lang==='pl'?'Brak nicku sprzedającego':'No seller nick');return;}
  const{data}=await sb.from('profiles').select('*').ilike('nick',nick).maybeSingle();
  if(!data){
    // Spróbuj po user_id jeśli nick to user_id
    toast(db.lang==='pl'?'Profil nie znaleziony':'Profile not found');
    return;
  }
  openProfileView(data);
}

function openProfileView(p){
  document.getElementById('modal-title').textContent=p.nick||'Profil';
  const shirts=p.public_shirts||[];
  document.getElementById('modal-body').innerHTML=`
  <div class="fx-c gap16 mb18">
    <div class="profile-avatar">${(p.nick||'?')[0].toUpperCase()}</div>
    <div><div style="font-family:'Inter',sans-serif;font-weight:800;font-size:24px;letter-spacing:.06em">${p.nick||'—'}${p.is_verified?`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:2px;margin-left:6px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`:''}</div>
      ${p.bio?`<div style="font-size:13px;color:var(--t2);margin-top:4px">${p.bio}</div>`:''}
      <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:#14213d;margin-top:6px">${(p.shirt_count||0)} ${db.lang==='pl'?'koszulek w kolekcji':'jerseys in collection'}</div>
      ${adminMode?`<button class="btn ${p.is_verified?'btn-d':'btn-p'}" style="padding:5px 12px;font-size:10px;margin-top:10px" onclick="toggleUserVerified('${p.nick}','${p.user_id}')">${p.is_verified?(db.lang==='pl'?'Cofnij weryfikację':'Remove verification'):(db.lang==='pl'?'Zweryfikuj użytkownika':'Verify user')}</button>`:''}
    </div>
  </div>
  ${shirts.length?`
  <div class="clabel">${T('profile_collection')}</div>
  <div class="g3" id="profile-shirt-grid">${shirts.map(s=>`
    <div class="mkt-card" style="background:rgba(20,33,61,.04);border-color:rgba(20,33,61,.12)">
      <div class="shirt-photo" style="position:relative">${s.photo?`<img src="${s.photo}" alt="" style="width:100%;height:100%;object-fit:cover">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
        ${s.id?`<div style="position:absolute;bottom:8px;right:8px">${likeButtonHtml(s.id)}</div>`:''}
      </div>
      <div class="shirt-card-body">
        <div class="shirt-card-club">${s.club||'—'}</div>
        <div class="shirt-card-season">${[s.season,s.kind].filter(Boolean).join(' · ')}</div>
        <span class="sh-status ${s.status}">${statusLabel(s.status)}</span>
      </div>
    </div>`).join('')}</div>`:`<div class="empty-state" style="padding:30px"><div class="empty-text">${db.lang==='pl'?'BRAK PUBLICZNYCH KOSZULEK':'NO PUBLIC JERSEYS'}</div></div>`}
  <div class="div"></div>
  <div style="text-align:right"><button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  const ids=shirts.map(s=>s.id).filter(Boolean);
  if(ids.length)loadLikesFor(ids).then(()=>{
    const grid=document.getElementById('profile-shirt-grid');
    if(grid)grid.querySelectorAll('.like-btn').forEach(btn=>{
      const onclickAttr=btn.getAttribute('onclick')||'';
      const m=onclickAttr.match(/toggleLike\('([^']+)'/);
      if(m)btn.outerHTML=likeButtonHtml(m[1]);
    });
  });
}

// ── PROFILE ──
async function removeFromMkt(id){
  const s=(db.shirts||[]).find(x=>String(x.id)===String(id));if(!s)return;
  s.marketListed=false;
  await sbRemoveFromMarket(id);
  await sbSaveShirt(s);
  save();toast(T('deleted'));
}

// ── SHIRT FORM ──
let leadPhotoFiles=[];
let leadPhotoPreviews=[];

function openSellLeadForm(){
  leadPhotoFiles=[];
  leadPhotoPreviews=[];
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Sprzedaj koszulkę':'Sell your jersey';
  document.getElementById('modal-body').innerHTML=`
    <p style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:18px">${db.lang==='pl'?'Nie chcesz zakładać konta? Zostaw nam swój e-mail, opisz koszulkę i dodaj zdjęcia — odezwiemy się do Ciebie.':'No account needed. Leave your email, describe the jersey and add photos — we will reach out.'}</p>
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Twój e-mail':'Your email'}</div><input class="form-input" type="email" id="lead-email" placeholder="jan@przyklad.pl"></div>
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Opis koszulki':'Jersey description'}</div><textarea class="form-input" id="lead-desc" rows="3" placeholder="${db.lang==='pl'?'np. Real Madrid 2012/13, wyjazdowa, rozmiar L, stan bardzo dobry...':'e.g. Real Madrid 2012/13, away, size L, very good condition...'}"></textarea></div>
    <div class="form-group">
      <div class="form-label">${db.lang==='pl'?'Zdjęcia (max 6)':'Photos (max 6)'}</div>
      <div class="photo-grid" id="lead-photo-grid"></div>
      <input type="file" id="lead-ph-upload" accept="image/*" multiple style="display:none" onchange="handleLeadPhotos(this)">
    </div>
    <div class="fx-c gap8" style="justify-content:flex-end;margin-top:14px">
      <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
      <button class="btn btn-p" id="lead-submit-btn" onclick="submitSellLead()">${db.lang==='pl'?'Wyślij':'Send'}</button>
    </div>`;
  document.getElementById('lead-photo-grid').innerHTML=buildLeadPhotoGrid();
  document.getElementById('modal-overlay').classList.add('open');
}
let leadPhotosProcessing=0;
function buildLeadPhotoGrid(){
  let html=leadPhotoPreviews.map((p,i)=>`<div class="photo-thumb"><img src="${p}"><div class="photo-del" onclick="rmLeadPhoto(${i})">${icon('x',9)}</div></div>`).join('');
  for(let i=0;i<leadPhotosProcessing;i++)html+=`<div class="photo-thumb photo-loading"><div class="photo-spinner"></div></div>`;
  if(leadPhotoPreviews.length+leadPhotosProcessing<6)html+=`<div class="photo-thumb add-photo" onclick="document.getElementById('lead-ph-upload').click()">+</div>`;
  return html;
}
async function handleLeadPhotos(inp){
  const newFiles=Array.from(inp.files).slice(0,6-leadPhotoPreviews.length-leadPhotosProcessing);
  inp.value='';
  if(!newFiles.length)return;
  leadPhotosProcessing+=newFiles.length;
  const g0=document.getElementById('lead-photo-grid');if(g0)g0.innerHTML=buildLeadPhotoGrid();
  for(const f of newFiles){
    try{
      const compressed=await compressImage(f);
      leadPhotoFiles.push(compressed);
      const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(compressed);});
      leadPhotoPreviews.push(dataUrl);
    }catch(e){
      toast(db.lang==='pl'?'Błąd przetwarzania zdjęcia':'Photo processing error');
    }finally{
      leadPhotosProcessing--;
      const g=document.getElementById('lead-photo-grid');if(g)g.innerHTML=buildLeadPhotoGrid();
    }
  }
}
function rmLeadPhoto(i){leadPhotoFiles.splice(i,1);leadPhotoPreviews.splice(i,1);const g=document.getElementById('lead-photo-grid');if(g)g.innerHTML=buildLeadPhotoGrid();}
async function submitSellLead(){
  if(leadPhotosProcessing>0){toast(db.lang==='pl'?'Poczekaj na przetworzenie zdjęć':'Please wait for photos to finish processing');return;}
  const email=(document.getElementById('lead-email')?.value||'').trim();
  const desc=(document.getElementById('lead-desc')?.value||'').trim();
  if(!email||!email.includes('@')){toast(db.lang==='pl'?'Podaj poprawny adres e-mail':'Enter a valid email');return;}
  if(!desc){toast(db.lang==='pl'?'Opisz koszulkę':'Describe the jersey');return;}
  const btn=document.getElementById('lead-submit-btn');
  if(btn){btn.textContent=db.lang==='pl'?'Wysyłanie...':'Sending...';btn.disabled=true;}
  const photoUrls=[];
  for(const file of leadPhotoFiles){
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`leads/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    try{
      const {error:upErr}=await sb.storage.from('shirt-photos').upload(path,file);
      if(!upErr){
        const {data:{publicUrl}}=sb.storage.from('shirt-photos').getPublicUrl(path);
        photoUrls.push(publicUrl);
      }
    }catch(e){}
  }
  const {error}=await sb.from('sell_leads').insert({email,description:desc,photos:photoUrls});
  if(error){
    toast((db.lang==='pl'?'Błąd wysyłania: ':'Send error: ')+error.message);
    if(btn){btn.textContent=db.lang==='pl'?'Wyślij':'Send';btn.disabled=false;}
    return;
  }
  closeModal();
  toast(db.lang==='pl'?'Dziękujemy! Odezwiemy się wkrótce.':'Thanks! We will be in touch soon.');
}

