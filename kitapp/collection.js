// ============================================================
// collection.js — the user's own jersey collection: CRUD,
// photo upload/compression, dashboard, PDF/CSV export,
// wishlist and the user-facing side of LegitCheck.
// Depends on: supabase.js, auth.js
// ============================================================

async function sbSaveShirt(shirt){
  if(!currentUser)return null;
  const row={
    user_id:currentUser.id, club:shirt.club, brand:shirt.brand, season:shirt.season,
    kind:shirt.kind, shirt_type:shirt.shirtType, size:shirt.size, condition:shirt.condition,
    personalization:shirt.personalization, patches:shirt.patches, style_code:shirt.styleCode,
    buy_price:shirt.buyPrice, market_value:shirt.marketValue, notes:shirt.notes,
    status:shirt.status, photos:shirt.photos||[], value_history:shirt.valueHistory||[],
    market_listed:shirt.marketListed||false, accepts_offers:shirt.acceptsOffers!==false, min_offer:shirt.minOffer||null
  };
  // UUID = istniejacy rekord w Supabase, brak/liczba = nowy rekord
  const isUUID = shirt.id && typeof shirt.id === 'string' && shirt.id.includes('-');
  if(isUUID){
    row.id=shirt.id;
    const {data,error}=await sb.from('shirts').upsert(row).select().single();
    if(error){toast('Błąd zapisu: '+error.message);return null;}
    return data.id;
  } else {
    const {data,error}=await sb.from('shirts').insert(row).select().single();
    if(error){toast('Błąd zapisu: '+error.message);return null;}
    return data.id;
  }
}

async function sbDeleteShirt(id){
  if(!currentUser)return;
  await sb.from('shirts').delete().eq('id',id).eq('user_id',currentUser.id);
}

async function sbUpdateCollHist(){
  if(!currentUser)return;
  const total=(db.shirts||[]).reduce((a,s)=>a+toPLN(s.marketValue||s.buyPrice),0);
  const now=new Date();const date=`${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}`;
  await sb.from('collection_history').upsert({user_id:currentUser.id,date,value:total},{onConflict:'user_id,date'});
  const idx=db.collectionHistory.findIndex(h=>h.date===date);
  if(idx>=0)db.collectionHistory[idx].value=total;else db.collectionHistory.push({date,value:total});
  db.collectionHistory.sort((a,b)=>a.date.localeCompare(b.date));
}

// Compress + resize + convert to WebP before upload. Keeps files small for the free Storage tier.
function compressImage(file,maxDim,targetKB){
  maxDim=maxDim||1200;targetKB=targetKB||200;
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      let{width,height}=img;
      if(width>maxDim||height>maxDim){
        if(width>height){height=Math.round(height*maxDim/width);width=maxDim;}
        else{width=Math.round(width*maxDim/height);height=maxDim;}
      }
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,width,height);
      const tryQuality=q=>{
        canvas.toBlob(blob=>{
          if(!blob){reject(new Error('Kompresja nie powiodła się'));return;}
          if(blob.size>targetKB*1024&&q>0.35){tryQuality(+(q-0.15).toFixed(2));return;}
          const base=(file.name||'photo').replace(/\.[^.]+$/,'');
          resolve(new File([blob],base+'.webp',{type:'image/webp'}));
        },'image/webp',q);
      };
      tryQuality(0.8);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Nie udało się wczytać obrazu'));};
    img.src=url;
  });
}
async function sbUploadPhoto(file,shirtId,photoIndex){
  if(!currentUser)return null;
  const ext=file.name.split('.').pop()||'jpg';
  const path=`${currentUser.id}/${shirtId||'tmp'}_${photoIndex}_${Date.now()}.${ext}`;
  const {data,error}=await sb.storage.from('shirt-photos').upload(path,file,{upsert:true});
  if(error){toast('Błąd uploadu: '+error.message);return null;}
  const {data:{publicUrl}}=sb.storage.from('shirt-photos').getPublicUrl(path);
  return publicUrl;
}

// Marketplace via Supabase table
function bDash(){
  const ss=db.shirts||[];
  const bPLN=ss.reduce((a,s)=>a+toPLN(s.buyPrice),0);
  const mPLN=ss.reduce((a,s)=>a+toPLN(s.marketValue||s.buyPrice),0);
  const profPLN=mPLN-bPLN;
  const forsale=ss.filter(s=>s.status==='forsale').length;
  const listed=ss.filter(s=>s.status==='listed').length;
  const cc={};ss.forEach(s=>{if(s.club)cc[s.club]=(cc[s.club]||0)+1;});
  const topClub=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0];
  const sc={};ss.forEach(s=>{if(s.season)sc[s.season]=(sc[s.season]||0)+1;});
  const topSeas=Object.entries(sc).sort((a,b)=>b[1]-a[1])[0];
  const hist=db.collectionHistory||[];
  const recent=ss.slice(0,3);
  const col=ss.filter(s=>s.status==='collection').length;
  const total=ss.length||1;

  return `
  <div class="ph-sub s1"><span class="dot"></span><span>${db.lang==='pl'?'Przegląd Kolekcji':'Collection Overview'}</span></div>
  <div class="ph-title s1">KIT<span style="color:var(--border)">BASE</span></div>
  <div class="vault-hero-card mb18 s2">
    <div class="vault-hero-eyebrow">${db.lang==='pl'?'Wartość rynkowa kolekcji':'Collection market value'}</div>
    <div class="vault-hero-num">${fmt(toDisp(mPLN))}</div>
    <div class="vault-hero-sub">${db.lang==='pl'?'zainwestowano':'invested'} ${fmt(toDisp(bPLN))} · <b>${profPLN>=0?'+':''}${fmt(toDisp(profPLN))} ${T('profit')}</b></div>
    <div class="vault-ledger-strip">
      <div class="vault-ledger-item"><span class="vault-ledger-num">${ss.length}</span><span class="vault-ledger-lbl">${db.lang==='pl'?'Koszulek':'Jerseys'}</span></div>
      <div class="vault-ledger-item"><span class="vault-ledger-num">${forsale}</span><span class="vault-ledger-lbl">${db.lang==='pl'?'Na sprzedaż':'For sale'}</span></div>
      <div class="vault-ledger-item"><span class="vault-ledger-num">${listed}</span><span class="vault-ledger-lbl">${db.lang==='pl'?'Wystawionych':'Listed'}</span></div>
      <div class="vault-ledger-item"><span class="vault-ledger-num">${topClub?topClub[0]:'—'}</span><span class="vault-ledger-lbl">${T('top_club')}</span></div>
    </div>
  </div>
  <div class="g12 s3 mb18">
    <div class="card c8">
      <div class="clabel">${db.lang==='pl'?'Wykres Wartości Kolekcji':'Collection Value Chart'}</div>
      ${hist.length>1?buildChart(hist):`<div style="padding:24px 0;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">${db.lang==='pl'?'ZAKTUALIZUJ WARTOŚCI KOSZULEK ABY ZOBACZYĆ WYKRES':'UPDATE JERSEY VALUES TO SEE CHART'}</div>`}
    </div>
    <div class="c4" style="display:flex;flex-direction:column;gap:12px">
      <div class="card">
        <div class="clabel">${db.lang==='pl'?'Rozkład':'Breakdown'}</div>
        <div style="display:flex;flex-direction:column;gap:7px;margin-top:6px">
          ${[['collection','var(--t3)',col],['forsale','var(--a)',forsale],['listed','var(--gold)',listed]].map(([st,col2,cnt])=>`
          <div><div class="fx-b" style="margin-bottom:3px"><span style="font-size:8px;color:${col2};font-family:'JetBrains Mono',monospace;letter-spacing:.08em">${statusLabel(st).toUpperCase()}</span><span style="font-size:10px;font-weight:700;color:${col2}">${cnt}</span></div><div class="pbar-track" style="margin-top:0"><div class="pbar-fill" style="width:${(cnt/total*100).toFixed(0)}%;background:${col2}"></div></div></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="clabel">${T('top_season')}</div>
        <div style="font-size:20px;font-weight:700;font-family:'Inter',sans-serif;font-weight:800;letter-spacing:.06em;color:var(--a)">${topSeas?topSeas[0]:'—'}</div>
        ${topSeas?`<div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t2);margin-top:3px">${topSeas[1]} ${db.lang==='pl'?'koszulek':'jerseys'}</div>`:''}
      </div>
    </div>
  </div>
  <div class="s4">
    <div class="fx-b mb12"><div class="clabel" style="margin:0">${db.lang==='pl'?'Ostatnio Dodane':'Recently Added'}</div><button class="btn btn-p" onclick="openApp('collection')">+ ${T('add_shirt')}</button></div>
    ${recent.length?`<div class="vault-shelf">${recent.map(s=>shirtCardMini(s)).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">${icon('shirt',44)}</div><div class="empty-text">${T('empty_col')}</div><button class="btn btn-p" style="margin-top:4px" onclick="openAddShirt()">+ ${T('add_shirt')}</button></div>`}
  </div>
  <div class="s4" style="margin-top:18px">
    <div class="clabel mb12">${db.lang==='pl'?'Aktywność':'Activity'}</div>
    <div class="g4" id="dash-activity-stats">
      <div class="card"><div class="clabel">${db.lang==='pl'?'Konwersacje':'Conversations'}</div><div class="cval loading-pulse">···</div></div>
      <div class="card"><div class="clabel">${db.lang==='pl'?'Moje Licytacje':'My Auctions'}</div><div class="cval loading-pulse">···</div></div>
      <div class="card"><div class="clabel">${db.lang==='pl'?'Licytuję':'Bidding On'}</div><div class="cval loading-pulse">···</div></div>
      <div class="card"><div class="clabel">${db.lang==='pl'?'Na Wishliście':'Wishlist Items'}</div><div class="cval loading-pulse">···</div></div>
    </div>
  </div>`;
}

async function loadDashActivityStats(){
  if(!currentUser)return;
  const statsEl=document.getElementById('dash-activity-stats');
  if(!statsEl)return;
  try{
    const[convsRes,myAucRes,biddingRes,wishRes]=await Promise.all([
      sb.from('conversations').select('id',{count:'exact',head:true}).or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`),
      sb.from('auctions').select('id',{count:'exact',head:true}).eq('user_id',currentUser.id).eq('status','active'),
      sb.from('bids').select('auction_id').eq('user_id',currentUser.id),
      sb.from('wishlist').select('id',{count:'exact',head:true}).eq('user_id',currentUser.id)
    ]);
    const convCount=convsRes.count||0;
    const myAucCount=myAucRes.count||0;
    const biddingAucIds=[...new Set((biddingRes.data||[]).map(b=>b.auction_id))];
    const wishCount=wishRes.count||0;
    const cards=statsEl.querySelectorAll('.card .cval');
    if(cards[0]){cards[0].textContent=convCount;cards[0].classList.remove('loading-pulse');}
    if(cards[1]){cards[1].textContent=myAucCount;cards[1].classList.remove('loading-pulse');}
    if(cards[2]){cards[2].textContent=biddingAucIds.length;cards[2].classList.remove('loading-pulse');}
    if(cards[3]){cards[3].textContent=wishCount;cards[3].classList.remove('loading-pulse');}
  }catch(e){console.error('loadDashActivityStats error:',e);}
}

function buildChart(hist){
  const vals=hist.map(h=>h.value);const labels=hist.map(h=>h.date);
  const mn=Math.min(...vals)*.95,mx2=Math.max(...vals)*1.05,range=mx2-mn||1;
  const W=600,H=100;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1))*W},${H-((v-mn)/range*H*.8+H*.1)}`).join(' ');
  const fill=`0,${H} ${pts} ${W},${H}`;
  const last=toDisp(vals[vals.length-1]),first=toDisp(vals[0]),diff=last-first;
  const pct=first>0?((diff/first)*100).toFixed(1):0;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100px" preserveAspectRatio="none"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(var(--a-rgb),.28)"/><stop offset="100%" stop-color="rgba(var(--a-rgb),0)"/></linearGradient></defs><polygon points="${fill}" fill="url(#cg)"/><polyline points="${pts}" fill="none" stroke="var(--a)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="fx-b" style="margin-top:6px"><div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${labels[0]} → ${labels[labels.length-1]}</div><div style="font-size:10px;font-weight:700;color:${diff>=0?'var(--a)':'var(--red)'};font-family:'JetBrains Mono',monospace">${diff>=0?'+':''}${fmt(diff)} (${pct}%)</div></div>`;
}

function shirtCardMini(s){
  const mv=toPLN(s.marketValue||s.buyPrice),bp=toPLN(s.buyPrice);
  const lotIdx=(db.shirts||[]).indexOf(s)+1;
  return `<div class="shirt-card" onclick="openEditShirt('${s.id}')">
    <div class="shirt-photo">${s.photos&&s.photos[0]?`<img src="${s.photos[0]}" alt="">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
      ${lotIdx>0?`<div class="lot-tag">№ ${String(lotIdx).padStart(3,'0')}</div>`:''}
      <div style="position:absolute;top:8px;right:8px"><span class="sh-status ${s.status}">${statusLabel(s.status)}</span></div>
      ${s.legitStatus?`<div style="position:absolute;top:34px;left:8px">${legitStatusBadge(s.legitStatus)}</div>`:''}
      ${s.condition?`<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,.7);border-radius:6px;padding:2px 8px;font-family:'JetBrains Mono',monospace;font-size:9px;color:${condColor(s.condition)}">${s.condition}/10</div>`:''}
    </div>
    <div class="shirt-card-body">
      <div class="shirt-card-club">${escapeHtml(s.club||'—')}</div>
      <div class="shirt-card-season">${escapeHtml([s.season,kindLabel(s.kind),s.brand].filter(Boolean).join(' · '))}</div>
      ${s.personalization?`<div style="font-size:10px;color:var(--t2);margin-bottom:4px;font-family:'JetBrains Mono',monospace">${escapeHtml(s.personalization)}</div>`:''}
      <div class="fx-b">
        <div><div class="shirt-card-price">${fmt(toDisp(mv))}</div>${mv&&bp?`<div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:${mv>=bp?'var(--a)':'var(--red)'}">${mv>=bp?'+':''}${fmt(toDisp(mv-bp))}</div>`:''}</div>
        <div class="fx-c gap4"><button class="btn btn-g" style="padding:4px 8px;font-size:10px" onclick="event.stopPropagation();openEditShirt('${s.id}')">${T('edit_shirt')}</button><button class="xbtn" onclick="event.stopPropagation();delShirt('${s.id}')">${icon('x',13)}</button></div>
      </div>
      ${s.marketListed?`<button class="btn w100" style="margin-top:8px;padding:6px 0;font-size:10px;background:rgba(var(--a-rgb),.12);border:1px solid rgba(var(--a-rgb),.3);color:var(--a)" onclick="event.stopPropagation();removeFromMkt('${s.id}')">${icon('check',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Wystawiona na Marketplace':'Listed on Marketplace'}</button>`:s.status!=='sold'?`<button class="btn btn-mkt w100" style="margin-top:8px;padding:6px 0;font-size:10px" onclick="event.stopPropagation();confirmListOnMkt('${s.id}')" ${!db.profile?.nick?'disabled style="opacity:.5"':''}>${icon('tag',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Wystaw na Marketplace':'List on Marketplace'}</button>`:''}
    </div>
  </div>`;
}

// ── COLLECTION ──
let sF={status:'all',search:'',size:'',brand:'',sort:''};
function bCollection(){
  return `
  <div class="fx-b mb12 s1">
    <div><div class="ph-sub"><span class="dot"></span><span>${T('nav_collection')}</span></div><div class="ph-title">${db.lang==='pl'?'KOLEKCJA':'COLLECTION'}</div></div>
    <div class="fx-c gap8"><button class="btn btn-g" onclick="exportCSV('all')">CSV</button><button class="btn btn-g" onclick="exportPDF('all')">${T('pdf')}</button><button class="btn btn-p" onclick="openAddShirt()">+ ${T('add_shirt')}</button></div>
  </div>
  <div class="card mb12 s2" style="padding:12px 16px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="field field-search" style="flex:1;min-width:160px;padding:6px 12px">${icon('search',13)}<input type="text" id="sh-search" placeholder="${db.lang==='pl'?'Szukaj...':'Search...'}" oninput="sF.search=this.value;renderGrid()" style="font-size:12px"></div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${['all','collection','forsale','listed','sold'].map(v=>`<button onclick="sF.status='${v}';this.closest('.card').querySelectorAll('.filt-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');renderGrid()" class="filt-btn ${sF.status===v?'active':''}">${v==='all'?T('filter_all'):statusLabel(v)}</button>`).join('')}
      </div>
      <select class="form-select" style="width:auto;padding:6px 10px;font-size:11px" onchange="sF.size=this.value;renderGrid()">
        <option value="">${T('f_size')}</option>${SIZES.map(s=>`<option value="${s}" ${sF.size===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <select class="form-select" style="width:auto;padding:6px 10px;font-size:11px" onchange="sF.brand=this.value;renderGrid()">
        <option value="">${T('f_brand')}</option>${BRANDS.map(b=>`<option value="${b}" ${sF.brand===b?'selected':''}>${b}</option>`).join('')}
      </select>
      <select class="form-select" style="width:auto;padding:6px 10px;font-size:11px" onchange="sF.sort=this.value;renderGrid()">
        <option value="" ${sF.sort===''?'selected':''}>${db.lang==='pl'?'Najnowsze':'Newest'}</option>
        <option value="oldest" ${sF.sort==='oldest'?'selected':''}>${db.lang==='pl'?'Najstarsze':'Oldest'}</option>
        <option value="value-desc" ${sF.sort==='value-desc'?'selected':''}>${db.lang==='pl'?'Wartość: malejąco':'Value: high to low'}</option>
        <option value="value-asc" ${sF.sort==='value-asc'?'selected':''}>${db.lang==='pl'?'Wartość: rosnąco':'Value: low to high'}</option>
        <option value="club" ${sF.sort==='club'?'selected':''}>${db.lang==='pl'?'Klub A-Z':'Club A-Z'}</option>
      </select>
    </div>
  </div>
  <div class="g3 s3" id="col-grid">${renderGrid(true)}</div>`;
}

function renderGrid(ret=false){
  let list=[...(db.shirts||[])];
  if(sF.status!=='all')list=list.filter(s=>s.status===sF.status);
  if(sF.search){const q=sF.search.toLowerCase();list=list.filter(s=>(s.club||'').toLowerCase().includes(q)||(s.season||'').includes(q)||(s.personalization||'').toLowerCase().includes(q)||(s.notes||'').toLowerCase().includes(q));}
  if(sF.size)list=list.filter(s=>(s.customSize||s.size)===sF.size);
  if(sF.brand)list=list.filter(s=>s.brand===sF.brand);
  if(sF.sort==='value-desc')list.sort((a,b)=>toPLN(b.marketValue||b.buyPrice)-toPLN(a.marketValue||a.buyPrice));
  else if(sF.sort==='value-asc')list.sort((a,b)=>toPLN(a.marketValue||a.buyPrice)-toPLN(b.marketValue||b.buyPrice));
  else if(sF.sort==='club')list.sort((a,b)=>(a.club||'').localeCompare(b.club||''));
  else if(sF.sort==='oldest')list.reverse();
  // domyślnie: najnowsze pierwsze (kolejność z db.shirts, bo unshift dodaje na początek)
  const html=list.length?list.map(s=>shirtCardMini(s)).join(''):`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('search',44)}</div><div class="empty-text">${T('empty_col')}</div><button class="btn btn-p" style="margin-top:4px" onclick="openAddShirt()">+ ${T('add_shirt')}</button></div></div>`;
  if(ret)return html;
  const el=document.getElementById('col-grid');if(el)el.innerHTML=html;
}

// ── FOR SALE ──
function bForSale(){
  const ss=(db.shirts||[]).filter(s=>s.status==='forsale'||s.status==='listed');
  return `
  <div class="fx-b mb18 s1">
    <div><div class="ph-sub"><span class="dot"></span><span>${T('nav_forsale')}</span></div><div class="ph-title">${db.lang==='pl'?'NA SPRZEDAŻ':'FOR SALE'}</div></div>
    <div class="fx-c gap8"><button class="btn btn-g" onclick="exportCSV('forsale')">CSV</button><button class="btn btn-g" onclick="exportPDF('forsale')">${T('pdf')}</button></div>
  </div>
  ${ss.length?`<div class="g3 s2">${ss.map(s=>saleCard(s)).join('')}</div>`:`<div class="empty-state s2"><div class="empty-icon">${icon('tag2',44)}</div><div class="empty-text">${T('empty_sale')}</div></div>`}`;
}

function saleCard(s){
  const mv=toPLN(s.marketValue||s.buyPrice),bp=toPLN(s.buyPrice),prof=mv-bp;
  return `<div class="shirt-card">
    <div class="shirt-photo">${s.photos&&s.photos[0]?`<img src="${escapeHtml(s.photos[0])}" alt="">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
      <div style="position:absolute;top:8px;right:8px"><span class="sh-status ${s.status}">${statusLabel(s.status)}</span></div>
    </div>
    <div class="shirt-card-body">
      <div class="shirt-card-club">${escapeHtml(s.club||'—')}</div>
      <div class="shirt-card-season">${escapeHtml([s.season,kindLabel(s.kind)].filter(Boolean).join(' · '))}</div>
      ${s.personalization?`<div style="font-size:10px;color:var(--t2);margin-bottom:6px;font-family:'JetBrains Mono',monospace">${escapeHtml(s.personalization)}</div>`:''}
      <div class="fx-b mb8">
        <div><div class="clabel" style="font-size:8px;margin-bottom:2px">${db.lang==='pl'?'CENA':'PRICE'}</div><div class="shirt-card-price">${fmt(toDisp(mv))}</div></div>
        <div style="text-align:right"><div class="clabel" style="font-size:8px;margin-bottom:2px">${T('profit').toUpperCase()}</div><div style="font-size:16px;font-weight:800;font-family:'Inter',sans-serif;font-weight:800;color:${prof>=0?'var(--a)':'var(--red)'}">${prof>=0?'+':''}${fmt(toDisp(prof))}</div></div>
      </div>
      <div class="fx-c gap6 mb8">
        <button class="btn btn-p" style="flex:1;padding:7px 0;font-size:10px" onclick="openMarketPack('${s.id}')">${T('collage')}</button>
        <button class="btn btn-g" style="padding:7px 10px;font-size:10px" onclick="openEditShirt('${s.id}')">${T('edit_shirt')}</button>
      </div>
      ${s.marketListed?`<button class="btn w100 mb8" style="padding:6px 0;font-size:10px;background:rgba(var(--a-rgb),.12);border:1px solid rgba(var(--a-rgb),.3);color:var(--a)" onclick="removeFromMkt('${s.id}')">${icon('check',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Wystawiona na Marketplace':'Listed on Marketplace'}</button>`:`<button class="btn btn-mkt w100 mb8" style="padding:6px 0;font-size:10px" onclick="confirmListOnMkt('${s.id}')" ${!db.profile?.nick?'disabled style="opacity:.5"':''}>${icon('tag',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Wystaw na Marketplace':'List on Marketplace'}</button>`}
      <button class="btn w100" style="padding:6px 0;font-size:10px;background:rgba(var(--a-rgb),.12);border:1px solid rgba(var(--a-rgb),.25);color:var(--a)" onclick="markAsSold('${s.id}')">${icon('check',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Oznacz jako sprzedane':'Mark as sold'}</button>
    </div>
  </div>`;
}

async function markAsSold(id){
  const s=(db.shirts||[]).find(x=>String(x.id)===String(id));if(!s)return;
  const activeAuc=await getActiveAuctionForShirt(id);
  if(activeAuc){toast(db.lang==='pl'?'Koszulka jest w trakcie licytacji — zakończ ją najpierw':'Jersey has an active auction — finish it first');return;}
  if(!await customConfirm(db.lang==='pl'?'Oznaczyć koszulkę jako sprzedaną? Zostanie zdjęta z Marketplace.':'Mark jersey as sold? It will be removed from Marketplace.'))return;
  s.status='sold';
  s.marketListed=false;
  await sbRemoveFromMarket(id);
  await sbSaveShirt(s);
  save();toast(db.lang==='pl'?'Oznaczono jako sprzedane':'Marked as sold');
}

// ── MARKETPLACE ──
let editId=null,editPhotos=[],editPhotoFiles=[];

async function getActiveAuctionForShirt(shirtId){
  const{data}=await sb.from('auctions').select('id,status,current_price,highest_bidder_nick').eq('shirt_id',shirtId).eq('status','active').maybeSingle();
  return data||null;
}

function openAddShirt(){editId=null;editPhotos=[];editPhotoFiles=[];document.getElementById('modal-title').textContent=T('add_shirt');document.getElementById('modal-body').innerHTML=buildShirtForm(null);document.getElementById('modal-overlay').classList.add('open');beep(500,.06);}

async function openEditShirt(id){
  const s=(db.shirts||[]).find(x=>String(x.id)===String(id));if(!s)return;
  const activeAuc=await getActiveAuctionForShirt(id);
  if(activeAuc){
    const hasBids=!!activeAuc.highest_bidder_nick;
    document.getElementById('modal-title').textContent=db.lang==='pl'?'Koszulka w trakcie licytacji':'Jersey in active auction';
    document.getElementById('modal-body').innerHTML=`
    <div class="card mb14" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.06)">
      <div style="font-size:13px;font-weight:600;color:#f87171;margin-bottom:8px;display:flex;align-items:center;gap:7px">${icon('alertTriangle',15)}${db.lang==='pl'?'Ta koszulka jest aktualnie licytowana':'This jersey has an active auction'}</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.7">
        ${hasBids
          ?(db.lang==='pl'?`Ktoś już złożył ofertę (${activeAuc.current_price} PLN). Edycja danych koszulki w tym momencie mogłaby wprowadzić licytujących w błąd co do tego, na co faktycznie licytują.`:`Someone already placed a bid (${activeAuc.current_price} PLN). Editing jersey details now could mislead bidders about what they're bidding on.`)
          :(db.lang==='pl'?'Licytacja jest aktywna, ale nikt jeszcze nie złożył oferty.':'Auction is active, but no bids yet.')}
      </div>
    </div>
    <div class="fx-c gap8" style="justify-content:flex-end">
      <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
      <button class="btn" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#f87171" onclick="closeModal();openApp('auctions')">${db.lang==='pl'?'Przejdź do licytacji':'Go to auction'}</button>
      ${!hasBids?`<button class="btn btn-d" onclick="closeModal();cancelAuction('${activeAuc.id}').then(()=>openEditShirt('${id}'))">${db.lang==='pl'?'Anuluj licytację i edytuj':'Cancel auction and edit'}</button>`:''}
    </div>`;
    document.getElementById('modal-overlay').classList.add('open');
    return;
  }
  editId=id;editPhotos=[...(s.photos||[])];editPhotoFiles=[];document.getElementById('modal-title').textContent=T('edit_shirt');document.getElementById('modal-body').innerHTML=buildShirtForm(s);document.getElementById('modal-overlay').classList.add('open');beep(500,.06);
}


function buildShirtForm(s){
  const v=s||{};
  const isCC=s&&!CLUBS.includes(s.club)&&s.club;
  const isCB=s&&!BRANDS.includes(s.brand)&&s.brand;
  const isCK=s&&!['home','away','third','special'].includes(s.kind)&&s.kind;
  const isCT=s&&!['replica','player','matchworn'].includes(s.shirtType)&&s.shirtType;
  const isCS=s&&!SIZES.includes(s.size)&&s.size;
  const condOpts=[...[1,2,3,4,5,6,7,8,9,10]].map(n=>`<option value="${n}" ${v.condition==n?'selected':''}>${n}/10</option>`).join('');
  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div>
      <div class="form-group"><div class="form-label">${T('f_status')}</div>
        <select class="form-select" id="f-status">
          <option value="collection" ${(v.status||'collection')==='collection'?'selected':''}>${T('status_collection')}</option>
          <option value="forsale" ${v.status==='forsale'?'selected':''}>${T('status_forsale')}</option>
          <option value="listed" ${v.status==='listed'?'selected':''}>${T('status_listed')}</option>
          <option value="sold" ${v.status==='sold'?'selected':''}>${T('status_sold')}</option>
        </select>
      </div>
      <div class="form-group"><div class="form-label">${T('f_club')}</div>
        <select class="form-select" id="f-club" onchange="toggleCustom('f-club-c',this.value,'⚽ Inna / Własna')">
          ${CLUBS.map(c=>`<option value="${c}" ${(!isCC&&v.club===c)||(!s&&c===CLUBS[0])?'selected':''}>${c}</option>`).join('')}
        </select>
        <div class="custom-wrap ${isCC?'show':''}" id="f-club-c"><input class="form-input" id="f-club-t" value="${isCC?v.club:''}" placeholder="${db.lang==='pl'?'Wpisz nazwę...':'Enter name...'}"></div>
      </div>
      <div class="form-group"><div class="form-label">${T('f_season')}</div><input class="form-input" id="f-season" value="${v.season||''}" placeholder="2024/25"></div>
      <div class="form-group"><div class="form-label">${T('f_brand')}</div>
        <select class="form-select" id="f-brand" onchange="toggleCustom('f-brand-c',this.value,'Altra / Własna')">
          ${BRANDS.map(b=>`<option value="${b}" ${(!isCB&&v.brand===b)?'selected':''}>${b}</option>`).join('')}
        </select>
        <div class="custom-wrap ${isCB?'show':''}" id="f-brand-c"><input class="form-input" id="f-brand-t" value="${isCB?v.brand:''}" placeholder="${db.lang==='pl'?'Wpisz markę...':'Enter brand...'}"></div>
      </div>
      <div class="form-group"><div class="form-label">${T('f_kind')}</div>
        <select class="form-select" id="f-kind" onchange="toggleCustom('f-kind-c',this.value,'custom')">
          <option value="home" ${(v.kind==='home'||!v.kind)?'selected':''}>${T('kind_home')}</option>
          <option value="away" ${v.kind==='away'?'selected':''}>${T('kind_away')}</option>
          <option value="third" ${v.kind==='third'?'selected':''}>${T('kind_third')}</option>
          <option value="special" ${v.kind==='special'?'selected':''}>${T('kind_special')}</option>
          <option value="custom" ${isCK?'selected':''}>${T('kind_other')}</option>
        </select>
        <div class="custom-wrap ${isCK?'show':''}" id="f-kind-c"><input class="form-input" id="f-kind-t" value="${isCK?v.kind:''}" placeholder="${db.lang==='pl'?'Wpisz rodzaj...':'Enter type...'}"></div>
      </div>
      <div class="form-group"><div class="form-label">${T('f_type')}</div>
        <select class="form-select" id="f-type" onchange="toggleCustom('f-type-c',this.value,'custom')">
          <option value="replica" ${(v.shirtType==='replica'||!v.shirtType)?'selected':''}>${T('type_rep')}</option>
          <option value="player" ${v.shirtType==='player'?'selected':''}>${T('type_pi')}</option>
          <option value="matchworn" ${v.shirtType==='matchworn'?'selected':''}>${T('type_mw')}</option>
          <option value="custom" ${isCT?'selected':''}>${T('type_other')}</option>
        </select>
        <div class="custom-wrap ${isCT?'show':''}" id="f-type-c"><input class="form-input" id="f-type-t" value="${isCT?v.shirtType:''}" placeholder="${db.lang==='pl'?'Wpisz typ...':'Enter type...'}"></div>
      </div>
    </div>
    <div>
      <div class="form-group"><div class="form-label">${T('f_size')}</div>
        <select class="form-select" id="f-size" onchange="toggleCustom('f-size-c',this.value,'__other',true)">
          ${SIZES.map(sz=>`<option value="${sz}" ${(!isCS&&v.size===sz)?'selected':''}>${sz}</option>`).join('')}
          <option value="__other" ${isCS?'selected':''}>${T('size_other')}</option>
        </select>
        <div class="custom-wrap ${isCS?'show':''}" id="f-size-c"><input class="form-input" id="f-size-t" value="${isCS?v.size:''}" placeholder="${db.lang==='pl'?'Wpisz rozmiar...':'Enter size...'}"></div>
      </div>
      <div class="form-group"><div class="form-label">${T('f_cond')}</div>
        <select class="form-select" id="f-cond"><option value="">${db.lang==='pl'?'Wybierz...':'Select...'}</option>${condOpts}</select>
      </div>
      <div class="form-group"><div class="form-label">${T('f_pers')}</div><input class="form-input" id="f-pers" value="${v.personalization||''}" placeholder="${db.lang==='pl'?'np. Lewandowski 9 / czysta':'e.g. Messi 10 / blank'}"></div>
      <div class="form-group"><div class="form-label">${T('f_patches')}</div>
        <select class="form-select" id="f-patches">
          <option value="yes" ${v.patches==='yes'?'selected':''}>${T('patches_yes')}</option>
          <option value="no" ${v.patches==='no'?'selected':''}>${T('patches_no')}</option>
          <option value="unknown" ${(!v.patches||v.patches==='unknown')?'selected':''}>${T('patches_unk')}</option>
        </select>
      </div>
      <div class="form-group"><div class="form-label">${T('f_code')}</div><input class="form-input" id="f-code" value="${v.styleCode||''}" placeholder="CD4232-011"></div>
      <div class="form-group"><div class="form-label">${T('f_buy')}</div><input class="form-input" type="text" inputmode="decimal" id="f-buy" value="${v.buyPrice||''}" placeholder="0"></div>
      <div class="form-group"><div class="form-label">${T('f_mv')}</div><input class="form-input" type="text" inputmode="decimal" id="f-mv" value="${v.marketValue||''}" placeholder="0">
        ${v.valueHistory&&v.valueHistory.length?`<div style="margin-top:8px"><div class="form-label" style="margin-bottom:4px">${T('val_hist')}</div><div style="max-height:70px;overflow-y:auto">${v.valueHistory.map(h=>`<div class="vh-row"><span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--t2)">${h.date}</span><span style="font-family:'Inter',sans-serif;font-weight:800;font-size:14px;color:var(--a)">${h.value.toFixed(0)} PLN</span></div>`).join('')}</div></div>`:''}
      </div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Akceptuję oferty na marketplace':'Accept offers on marketplace'}</div>
        <select class="form-select" id="f-offers" onchange="document.getElementById('f-minoffer-wrap').style.display=this.value==='no'?'none':'block'">
          <option value="yes" ${v.acceptsOffers!==false?'selected':''}>${db.lang==='pl'?'Tak — kupujący mogą negocjować':'Yes — buyers can negotiate'}</option>
          <option value="no" ${v.acceptsOffers===false?'selected':''}>${db.lang==='pl'?'Nie — tylko cena stała':'No — fixed price only'}</option>
        </select>
      </div>
      <div class="form-group" id="f-minoffer-wrap" style="display:${v.acceptsOffers===false?'none':'block'}"><div class="form-label">${db.lang==='pl'?'Minimalna akceptowana oferta (opcjonalnie)':'Minimum accepted offer (optional)'}</div><input class="form-input" type="text" inputmode="decimal" id="f-minoffer" value="${v.minOffer||''}" placeholder="0"></div>
      <div class="form-group"><div class="form-label">${T('f_notes')}</div><textarea class="form-input" id="f-notes" rows="3" placeholder="${db.lang==='pl'?'Uwagi, wady, historia...':'Notes, flaws, history...'}">${v.notes||''}</textarea></div>
    </div>
  </div>
  <div class="form-group">
    <div class="form-label">${T('f_photos')} (${editPhotos.length}/8)</div>
    <div class="photo-grid" id="photo-grid-e">${buildPhotoGrid()}</div>
    <input type="file" id="ph-upload" accept="image/*" multiple style="display:none" onchange="handlePhotos(this)">
  </div>
  <div class="div"></div>
  <div class="fx-c gap8" style="justify-content:flex-end">
    ${s?`<button class="btn btn-d" onclick="delShirt('${s.id}')">${icon('trash',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${T('delete')}</button>`:''}
    <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
    <button class="btn btn-p" id="save-btn" onclick="saveShirt()">${T('save')}</button>
  </div>`;
}

function toggleCustom(wrId,val,trigger,emptyTrigger=false){
  const w=document.getElementById(wrId);if(!w)return;
  w.classList.toggle('show',emptyTrigger?val==='__other':val===trigger);
}
let photosProcessing=0;
function buildPhotoGrid(){
  let html=editPhotos.map((p,i)=>`<div class="photo-thumb"><img src="${p}" onclick="document.getElementById('lb-img').src='${p}';document.getElementById('lightbox').classList.add('open')"><div class="photo-del" onclick="rmPhoto(${i})">${icon('x',9)}</div></div>`).join('');
  for(let i=0;i<photosProcessing;i++)html+=`<div class="photo-thumb photo-loading"><div class="photo-spinner"></div></div>`;
  if(editPhotos.length+photosProcessing<8)html+=`<div class="photo-thumb add-photo" onclick="document.getElementById('ph-upload').click()">+</div>`;
  return html;
}
function rmPhoto(i){editPhotos.splice(i,1);editPhotoFiles.splice&&editPhotoFiles.splice(i,1);const g=document.getElementById('photo-grid-e');if(g)g.innerHTML=buildPhotoGrid();}

// Store raw File objects for upload
let pendingPhotoFiles=[];
async function handlePhotos(inp){
  const newFiles=Array.from(inp.files).slice(0,8-editPhotos.length-photosProcessing);
  inp.value='';
  if(!newFiles.length)return;
  photosProcessing+=newFiles.length;
  const g0=document.getElementById('photo-grid-e');if(g0)g0.innerHTML=buildPhotoGrid();
  for(const f of newFiles){
    try{
      const compressed=await compressImage(f);
      pendingPhotoFiles.push(compressed);
      const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(compressed);});
      editPhotos.push(dataUrl);
    }catch(e){
      toast(db.lang==='pl'?'Błąd przetwarzania zdjęcia':'Photo processing error');
    }finally{
      photosProcessing--;
      const g=document.getElementById('photo-grid-e');if(g)g.innerHTML=buildPhotoGrid();
    }
  }
}

async function saveShirt(){
  if(photosProcessing>0){toast(db.lang==='pl'?'Poczekaj na przetworzenie zdjęć':'Please wait for photos to finish processing');return;}
  const saveBtn=document.getElementById('save-btn');
  if(saveBtn){saveBtn.textContent=db.lang==='pl'?'Zapisuję...':'Saving...';saveBtn.disabled=true;}

  const clubSel=document.getElementById('f-club')?.value;
  const club=clubSel==='⚽ Inna / Własna'?(document.getElementById('f-club-t')?.value||'').trim():clubSel;
  const brandSel=document.getElementById('f-brand')?.value;
  const brand=brandSel==='Altra / Własna'?(document.getElementById('f-brand-t')?.value||'').trim():brandSel;
  const kindSel=document.getElementById('f-kind')?.value;
  const kind=kindSel==='custom'?(document.getElementById('f-kind-t')?.value||'').trim()||'custom':kindSel;
  const typeSel=document.getElementById('f-type')?.value;
  const shirtType=typeSel==='custom'?(document.getElementById('f-type-t')?.value||'').trim()||'replica':typeSel;
  const sizeSel=document.getElementById('f-size')?.value;
  const size=sizeSel==='__other'?(document.getElementById('f-size-t')?.value||'').trim()||'M':sizeSel;
  const buyPrice=parseFloat(document.getElementById('f-buy')?.value)||0;
  const marketValue=parseFloat(document.getElementById('f-mv')?.value)||0;
  const acceptsOffers=document.getElementById('f-offers')?.value!=='no';
  const minOffer=parseFloat(document.getElementById('f-minoffer')?.value)||null;

  // Build shirt object
  const shirt={club,brand,season:document.getElementById('f-season')?.value||'',kind,shirtType,size,
    condition:document.getElementById('f-cond')?.value||'',personalization:document.getElementById('f-pers')?.value||'',
    patches:document.getElementById('f-patches')?.value||'unknown',styleCode:document.getElementById('f-code')?.value||'',
    buyPrice,marketValue,acceptsOffers,minOffer,notes:document.getElementById('f-notes')?.value||'',
    status:document.getElementById('f-status')?.value||'collection',photos:[...editPhotos]};

  if(!db.shirts)db.shirts=[];
  if(editId){
    const idx=db.shirts.findIndex(x=>String(x.id)===String(editId));
    if(idx>=0){
      const prev=db.shirts[idx];
      if(!prev.valueHistory)prev.valueHistory=[];
      const oldMV=parseFloat(prev.marketValue)||0;
      if(marketValue&&marketValue!==oldMV)prev.valueHistory.push({date:new Date().toLocaleDateString('pl-PL'),value:marketValue});
      shirt.id=editId;shirt.created=prev.created;shirt.valueHistory=prev.valueHistory;shirt.marketListed=prev.marketListed;
      db.shirts[idx]={...shirt};
    }
  }else{
    shirt.id=null;shirt.created=new Date().toLocaleDateString('pl-PL');
    shirt.valueHistory=marketValue?[{date:new Date().toLocaleDateString('pl-PL'),value:marketValue}]:[];
  }

  // Save to Supabase first to get real UUID
  const newId=await sbSaveShirt(shirt);
  if(!newId){if(saveBtn){saveBtn.textContent=T('save');saveBtn.disabled=false;}return;}
  shirt.id=newId;

  // Upload any new photos to Supabase Storage
  if(pendingPhotoFiles.length){
    const uploadedUrls=[];
    const existingPhotos=editPhotos.filter(p=>p.startsWith('http'));
    for(let i=0;i<pendingPhotoFiles.length;i++){
      const url=await sbUploadPhoto(pendingPhotoFiles[i],newId,existingPhotos.length+i);
      if(url)uploadedUrls.push(url);
    }
    // Replace base64 with uploaded URLs
    shirt.photos=[...existingPhotos,...uploadedUrls];
    pendingPhotoFiles=[];
    // Update shirt with final photo URLs
    await sbSaveShirt(shirt);
  }

  if(editId){
    const idx=db.shirts.findIndex(x=>String(x.id)===String(editId));
    if(idx>=0)db.shirts[idx]={...shirt};
  }else{
    db.shirts.unshift(shirt);
  }

  await sbUpdateCollHist();
  save();closeModal();toast(T('saved'));chime();
}

async function delShirt(id){
  const activeAuc=await getActiveAuctionForShirt(id);
  if(activeAuc){
    toast(db.lang==='pl'?'Nie można usunąć — koszulka jest licytowana. Anuluj licytację najpierw.':'Cannot delete — jersey has an active auction. Cancel the auction first.');
    return;
  }
  if(!await customConfirm(T('confirm_del')))return;
  db.shirts=(db.shirts||[]).filter(x=>String(x.id)!==String(id));
  await sbDeleteShirt(id);
  await sbRemoveFromMarket(id);
  save();toast(T('deleted'));
  closeModal();
}

// ── MARKETPLACE PACK ──
let mktPackId=null,colSel=[];
function openMarketPack(id){
  const s=(db.shirts||[]).find(x=>String(x.id)===String(id));if(!s)return;
  mktPackId=id;colSel=[];
  document.getElementById('modal-title').textContent=`${T('collage')} — ${s.club||''} ${s.season||''}`;
  document.getElementById('modal-body').innerHTML=buildPackModal(s);
  document.getElementById('modal-overlay').classList.add('open');
}

function buildPackModal(s){
  return `
  <div class="tabs">
    <div class="tab active" onclick="switchTab('pack-collage','pack-post',this)">${T('collage')}</div>
    <div class="tab" onclick="switchTab('pack-post','pack-collage',this)">${T('post')}</div>
    <div class="tab" onclick="switchTab('pack-mkt','pack-collage',this);switchTab('pack-mkt','pack-post',this)">${T('mkt_list')}</div>
  </div>
  <div id="pack-collage">
    <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t2);letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px">${T('sel4')} — <span id="sel-count">0</span>/4</div>
    ${(s.photos||[]).length?`
    <div class="photo-grid mb18" id="cs-grid">
      ${(s.photos||[]).map((p,i)=>`<div class="photo-thumb collage-sel" id="cs-${i}" onclick="toggleCS(${i})">
        <img src="${p}" style="width:100%;height:100%;object-fit:cover">
        <div class="csel-num" id="csn-${i}"></div>
      </div>`).join('')}
    </div>
    <button class="btn btn-p w100 mb12" id="gen-btn" style="opacity:.5;pointer-events:none" onclick="genCollage()">${T('gen_collage')}</button>
    <div id="col-result" style="display:none">
      <canvas id="col-canvas" width="800" height="800" style="width:100%;border-radius:12px;display:block"></canvas>
      <button class="btn btn-p w100" style="margin-top:10px" onclick="dlCollage()">${T('dl_collage')}</button>
    </div>`:`<div class="empty-state" style="padding:28px"><div class="empty-icon">${icon('camera',44)}</div><div class="empty-text">${db.lang==='pl'?'BRAK ZDJĘĆ':'NO PHOTOS'}</div></div>`}
  </div>
  <div id="pack-post" style="display:none">
    <div class="form-group">
      <div class="form-label">${db.lang==='pl'?'Gotowe ogłoszenie (Vinted/Grailed/FB):':'Ready listing text:'}</div>
      <textarea class="post-box" id="post-text" rows="12">${genPost(s)}</textarea>
    </div>
    <div class="fx-c gap8" style="justify-content:flex-end">
      <button class="btn btn-g" onclick="document.getElementById('post-text').value=genPost((db.shirts||[]).find(x=>String(x.id)===String(mktPackId)))">${db.lang==='pl'?'Regeneruj':'Regenerate'}</button>
      <button class="btn btn-p" onclick="copyPost()">${T('copy')}</button>
    </div>
  </div>
  <div id="pack-mkt" style="display:none">
    <div class="card mb14" style="border-color:rgba(20,33,61,.2);background:rgba(20,33,61,.05)">
      <div style="font-size:12px;font-weight:600;color:#14213d;margin-bottom:6px">${db.lang==='pl'?'Wyświetl koszulkę na publicznym Marketplace':'List jersey on the public Marketplace'}</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.6">${db.lang==='pl'?'Wszyscy zalogowani użytkownicy zobaczą Twoje ogłoszenie.':'All logged-in users will see your listing.'}</div>
    </div>
    ${!db.profile?.nick?`<div class="card mb14" style="border-color:rgba(var(--gold-rgb),.2);background:rgba(var(--gold-rgb),.05)"><div style="font-size:11px;color:var(--gold);display:flex;align-items:center;gap:6px">${icon('alertTriangle',13)}${db.lang==='pl'?'Ustaw nick w zakładce Profil przed wystawieniem.':'Set a nickname in the Profile tab before listing.'}</div></div>`:``}
    <div class="g2 mb14">
      ${s.photos&&s.photos[0]?`<div style="border-radius:12px;overflow:hidden;aspect-ratio:1/1;background:var(--bg3)"><img src="${escapeHtml(s.photos[0])}" style="width:100%;height:100%;object-fit:contain"></div>`:`<div class="card" style="aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;opacity:.25;color:var(--t2)">${icon('shirt',32)}</div>`}
      <div>
        <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:20px;letter-spacing:.05em;margin-bottom:6px">${escapeHtml(s.club||'—')}</div>
        <div style="font-size:11px;color:var(--t2);margin-bottom:4px">${escapeHtml([s.season,kindLabel(s.kind),s.size].filter(Boolean).join(' · '))}</div>
        <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:24px;color:#14213d;margin-bottom:12px">${toPLN(s.marketValue||s.buyPrice)?toPLN(s.marketValue||s.buyPrice).toFixed(2)+' PLN':'—'}</div>
        ${s.marketListed?`<button class="btn btn-d w100" onclick="removeFromMkt('${s.id}');closeModal()">${icon('x',11,"display:inline-block;vertical-align:-1px;margin-right:4px")} ${T('mkt_remove')}</button>`:`<button class="btn btn-mkt w100" onclick="confirmListOnMkt('${s.id}')" ${!db.profile?.nick?'disabled style="opacity:.5"':''}>${T('mkt_list')}</button>`}
      </div>
    </div>
  </div>`;
}

function switchTab(show,hide,el){
  document.querySelectorAll('#modal-body .tab').forEach(t=>t.classList.remove('active'));el.classList.add('active');
  ['pack-collage','pack-post','pack-mkt'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='none';});
  const se=document.getElementById(show);if(se)se.style.display='block';
}

function toggleCS(idx){
  const pos=colSel.indexOf(idx);
  if(pos>=0){colSel.splice(pos,1);document.getElementById('cs-'+idx)?.classList.remove('selected');const n=document.getElementById('csn-'+idx);if(n)n.style.display='none';reNumCS();}
  else if(colSel.length<4){colSel.push(idx);document.getElementById('cs-'+idx)?.classList.add('selected');const n=document.getElementById('csn-'+idx);if(n){n.textContent=colSel.length;n.style.display='flex';}}
  const cnt=document.getElementById('sel-count');if(cnt)cnt.textContent=colSel.length;
  const btn=document.getElementById('gen-btn');if(btn){btn.style.opacity=colSel.length===4?'1':'.5';btn.style.pointerEvents=colSel.length===4?'auto':'none';}
}
function reNumCS(){
  document.querySelectorAll('[id^="cs-"]').forEach(el=>{
    if(!el.id.startsWith('cs-')||el.id.startsWith('csn-')||el.id==='cs-grid')return;
    const i=parseInt(el.id.slice(3));
    const pos=colSel.indexOf(i);
    const n=document.getElementById('csn-'+i);
    if(pos>=0&&n){n.textContent=pos+1;n.style.display='flex';el.classList.add('selected');}
    else{if(n)n.style.display='none';el.classList.remove('selected');}
  });
}

function genCollage(){
  if(colSel.length!==4){toast(T('sel4'));return;}
  const canvas=document.getElementById('col-canvas');document.getElementById('col-result').style.display='block';
  const ctx=canvas.getContext('2d');const sz=800,h=sz/2;let ld=0;
  const s=(db.shirts||[]).find(x=>String(x.id)===String(mktPackId));
  const photos=(s?.photos||[]);
  colSel.forEach((photoIdx,i)=>{
    const src=photos[photoIdx];if(!src)return;
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{
      const x=(i%2)*h,y=Math.floor(i/2)*h;
      const scale=Math.max(h/img.width,h/img.height);
      const sw=h/scale,sh=h/scale,sx=(img.width-sw)/2,sy=(img.height-sh)/2;
      ctx.drawImage(img,sx,sy,sw,sh,x,y,h,h);
      ld++;if(ld===4){ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(h,0);ctx.lineTo(h,sz);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h);ctx.lineTo(sz,h);ctx.stroke();toast(db.lang==='pl'?'Kolaż gotowy!':'Collage ready!');}
    };img.onerror=()=>{ld++;};img.src=src;
  });
}

function dlCollage(){
  const canvas=document.getElementById('col-canvas');const s=(db.shirts||[]).find(x=>String(x.id)===String(mktPackId));
  const name=`${s?.club||'shirt'}-${s?.season||'collage'}`.replace(/\s+/g,'-').toLowerCase();
  const a=document.createElement('a');a.download=name+'.png';a.href=canvas.toDataURL('image/png');a.click();
}

function genPost(s){
  if(!s)return '';
  const mv=toPLN(s.marketValue||s.buyPrice);
  const size=s.customSize||s.size||'—';const kind=kindLabel(s.kind);const type=typeLabel(s.shirtType);
  const cond=s.condition?`${s.condition}/10`:'';const pers=s.personalization||'Czysta';
  const patches=s.patches==='yes'?(db.lang==='pl'?'Oryginalne naszywki ✓':'Original patches ✓'):s.patches==='no'?(db.lang==='pl'?'Bez naszywek':'No patches'):'';
  if(db.lang==='pl'){return `🔥 NA SPRZEDAŻ: ${s.club||''} — Koszulka ${kind} ${s.season||''}\n\n👕 Typ: ${type}\n📏 Rozmiar: ${size}\n⭐ Stan: ${cond}\n🎽 Personalizacja: ${pers}${patches?'\n🏅 '+patches:''}${s.styleCode?'\n🔑 Style Code: '+s.styleCode:''}${s.notes?'\n⚠️ '+s.notes:''}\n\n💰 Cena: ${mv?mv.toFixed(2)+' PLN':'do uzgodnienia'}\n\n📦 Wysyłka do uzgodnienia\n📸 Więcej zdjęć na prośbę\n✅ Pytania mile widziane!\n\n#koszulki #piłkanożna #football #jerseys #${(s.club||'').replace(/\s+/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}`;}
  else{return `🔥 FOR SALE: ${s.club||''} — ${kind} Kit ${s.season||''}\n\n👕 Type: ${type}\n📏 Size: ${size}\n⭐ Condition: ${cond}\n🎽 Personalization: ${pers}${patches?'\n🏅 '+patches:''}${s.styleCode?'\n🔑 Style Code: '+s.styleCode:''}${s.notes?'\n⚠️ '+s.notes:''}\n\n💰 Price: ${mv?mv.toFixed(2)+' PLN':'negotiable'}\n\n📦 Shipping: negotiable\n📸 More photos on request\n✅ Questions welcome!\n\n#jersey #football #kit #${(s.club||'').replace(/\s+/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}`;}
}
function copyPost(){const el=document.getElementById('post-text');if(!el)return;navigator.clipboard.writeText(el.value).then(()=>toast(T('copied'))).catch(()=>{el.select();document.execCommand('copy');toast(T('copied'));});}

function confirmListOnMkt(id){
  const s=(db.shirts||[]).find(x=>String(x.id)===String(id));if(!s)return;
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Wystaw na Marketplace':'List on Marketplace';
  document.getElementById('modal-body').innerHTML=`
    <p style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:16px">${db.lang==='pl'?`Zamierzasz wystawić <strong>${s.club||''} ${s.season||''}</strong> na publicznym Marketplace. Odpowiadasz za zgodność opisu i zdjęć ze stanem faktycznym koszulki.`:`You're about to list <strong>${s.club||''} ${s.season||''}</strong> on the public Marketplace. You're responsible for the listing matching the jersey's actual condition.`}</p>
    <label style="display:flex;align-items:flex-start;gap:9px;font-size:12px;line-height:1.5;color:var(--t2);margin-bottom:18px;cursor:pointer">
      <input type="checkbox" id="mkt-terms" style="width:auto;margin-top:2px;flex-shrink:0;accent-color:var(--a)">
      <span>${db.lang==='pl'?'Akceptuję':'I accept the'} <a href="regulamin.html" target="_blank" style="color:var(--t1);font-weight:600">${db.lang==='pl'?'Regulamin':'Terms of Service'}</a> ${db.lang==='pl'?'i oświadczam, że koszulka jest oryginalna oraz zgodna z opisem.':'and confirm the jersey is authentic and matches its description.'}</span>
    </label>
    <div class="fx-c gap8" style="justify-content:flex-end">
      <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
      <button class="btn btn-mkt" id="mkt-confirm-btn" onclick="listOnMkt('${id}')">${db.lang==='pl'?'Wystaw':'List it'}</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
async function listOnMkt(id){
  if(!document.getElementById('mkt-terms')?.checked){toast(db.lang==='pl'?'Musisz zaakceptować Regulamin, aby wystawić ogłoszenie.':'You must accept the Terms of Service to list an item.');return;}
  const s=(db.shirts||[]).find(x=>String(x.id)===String(id));if(!s)return;
  if(!db.profile?.nick){toast(db.lang==='pl'?'Ustaw nick w Profilu!':'Set a nickname in Profile!');return;}
  const ok=await sbListOnMarket(s);
  if(ok){s.marketListed=true;await sbSaveShirt(s);save();toast(db.lang==='pl'?'Wystawiono na Marketplace!':'Listed on Marketplace!');chime();closeModal();}
}

// ── PDF EXPORT ──
function exportPDF(mode){
  let ss=db.shirts||[];if(mode==='forsale')ss=ss.filter(s=>s.status==='forsale'||s.status==='listed');
  const cur=db.currency||'PLN';const sym=CURR_SYM[cur]||cur;
  const accentColor='#14213d';
  const tB=ss.reduce((a,s)=>a+toDisp(toPLN(s.buyPrice)),0);
  const tV=ss.reduce((a,s)=>a+toDisp(toPLN(s.marketValue||s.buyPrice)),0);
  const prof=tV-tB;const now=new Date().toLocaleDateString('pl-PL');
  const rows=ss.map(s=>{const mv=toDisp(toPLN(s.marketValue||s.buyPrice)),bp=toDisp(toPLN(s.buyPrice)),p=mv-bp;
    return `<tr><td>${s.club||'—'}</td><td>${s.season||'—'}</td><td>${kindLabel(s.kind)}</td><td>${typeLabel(s.shirtType)||'Replica'}</td><td>${s.customSize||s.size||'—'}</td><td style="color:${condColor(s.condition)}">${s.condition?s.condition+'/10':'—'}</td><td>${s.personalization||'Czysta'}</td><td>${statusLabel(s.status)}</td><td>${bp?bp.toFixed(2)+' '+sym:'—'}</td><td style="color:${accentColor};font-weight:700">${mv?mv.toFixed(2)+' '+sym:'—'}</td><td style="color:${p>=0?accentColor:'#c0392b'};font-weight:700">${(bp||mv)?(p>=0?'+':'')+p.toFixed(2)+' '+sym:'—'}</td><td style="font-size:10px;color:#888">${s.notes||''}</td></tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KitBase</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;color:#111;padding:32px;font-size:12px}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;padding-bottom:14px;border-bottom:2.5px solid ${accentColor}}
h1{font-size:26px;font-weight:900}h1 span{color:${accentColor}}
.meta{text-align:right;font-size:11px;color:#888;line-height:1.8}
.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.sc{padding:12px 14px;border-radius:10px;background:#f8f9fa;border:1px solid #e9ecef}
.sl{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#888;margin-bottom:4px}
.sv{font-size:18px;font-weight:800}.sv.g{color:${accentColor}}.sv.r{color:#c0392b}
table{width:100%;border-collapse:collapse}thead tr{background:#14213d;color:#fff}
th{padding:8px 10px;text-align:left;font-size:8px;letter-spacing:.12em;text-transform:uppercase}
td{padding:7px 10px;border-bottom:1px solid #f0f0f0;font-size:11px}tr:hover td{background:#f8faf9}
</style></head><body>
<div class="hdr"><div><h1>KIT<span> BASE</span></h1><div style="font-size:11px;color:#888;margin-top:3px;letter-spacing:.1em;text-transform:uppercase">${mode==='forsale'?(db.lang==='pl'?'Koszulki Na Sprzedaż':'For Sale Report'):(db.lang==='pl'?'Pełny Raport Kolekcji':'Full Collection Report')}</div></div>
<div class="meta"><div>${db.lang==='pl'?'Wygenerowano':'Generated'}: <strong>${now}</strong></div><div>${db.lang==='pl'?'Pozycji':'Items'}: <strong>${ss.length}</strong></div><div>${db.lang==='pl'?'Waluta':'Currency'}: <strong>${cur}</strong></div></div></div>
<div class="sum">
  <div class="sc"><div class="sl">${db.lang==='pl'?'Koszulek':'Jerseys'}</div><div class="sv">${ss.length}</div></div>
  <div class="sc"><div class="sl">${T('invested')}</div><div class="sv">${tB.toFixed(2)} ${sym}</div></div>
  <div class="sc"><div class="sl">${T('total_val')}</div><div class="sv g">${tV.toFixed(2)} ${sym}</div></div>
  <div class="sc"><div class="sl">${T('profit')}</div><div class="sv ${prof>=0?'g':'r'}">${prof>=0?'+':''}${prof.toFixed(2)} ${sym}</div></div>
</div>
<table><thead><tr><th>Klub</th><th>Sezon</th><th>Rodzaj</th><th>Typ</th><th>Rozmiar</th><th>Stan</th><th>Personalizacja</th><th>Status</th><th>Zakup</th><th>Wartość</th><th>Zysk</th><th>Uwagi</th></tr></thead>
<tbody>${rows||'<tr><td colspan="12" style="text-align:center;color:#aaa;padding:24px">Brak danych</td></tr>'}</tbody></table>
</body></html>`;
  const w=window.open('','_blank','width=1200,height=800');w.document.write(html);w.document.close();setTimeout(()=>w.print(),450);toast(db.lang==='pl'?'PDF gotowy!':'PDF ready!');
}

function csvEscape(val){
  const s=String(val??'');
  if(s.includes(',')||s.includes('"')||s.includes('\n'))return '"'+s.replace(/"/g,'""')+'"';
  return s;
}

function exportCSV(mode){
  let ss=db.shirts||[];if(mode==='forsale')ss=ss.filter(s=>s.status==='forsale'||s.status==='listed');
  const headers=['Klub','Sezon','Marka','Rodzaj','Typ','Rozmiar','Stan','Personalizacja','Naszywki','Style Code','Cena Zakupu','Wartość Rynkowa','Zysk/Strata','Status','Uwagi','Data Dodania'];
  const rows=ss.map(s=>{
    const mv=toPLN(s.marketValue||s.buyPrice),bp=toPLN(s.buyPrice),p=mv-bp;
    return [
      s.club||'',s.season||'',s.brand||'',kindLabel(s.kind),typeLabel(s.shirtType)||'Replica',
      s.customSize||s.size||'',s.condition||'',s.personalization||'',
      s.patches==='yes'?'Tak':s.patches==='no'?'Nie':'Nieznane',
      s.styleCode||'',bp.toFixed(2),mv.toFixed(2),p.toFixed(2),
      statusLabel(s.status),s.notes||'',s.created||''
    ].map(csvEscape).join(',');
  });
  const csv='\uFEFF'+[headers.map(csvEscape).join(','),...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`kitbase-${mode==='forsale'?'na-sprzedaz':'kolekcja'}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(db.lang==='pl'?'CSV pobrany!':'CSV downloaded!');
}

// ── SETTINGS PANEL ──
async function loadWishlist(){
  if(!currentUser)return[];
  const{data}=await sb.from('wishlist').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
  return data||[];
}
async function addToWishlist(item){
  if(!currentUser)return;
  await sb.from('wishlist').insert({user_id:currentUser.id,...item});
  toast('Dodano do Wishlisty!');
}
async function removeFromWishlist(id){
  await sb.from('wishlist').delete().eq('id',id).eq('user_id',currentUser.id);
}
async function checkWishlistMatches(listing){
  if(!listing)return;
  const{data:wishes}=await sb.from('wishlist').select('*').neq('user_id',currentUser?.id||'');
  if(!wishes)return;
  wishes.forEach(async w=>{
    const clubMatch=!w.club||listing.club?.toLowerCase().includes(w.club.toLowerCase());
    const sizeMatch=!w.size||(listing.size||'')===w.size;
    const maxBudget=!w.max_price||(listing.price_pln||0)<=w.max_price;
    if(clubMatch&&sizeMatch&&maxBudget){
      await createNotification(w.user_id,'wishlist',`Koszulka z Wishlisty!`,`${listing.club} ${listing.season||''} — ${listing.price_pln||'?'} PLN`,'market');
    }
  });
}

function bWishlist(){
  return `
  <div class="fx-b mb12 s1">
    <div><div class="ph-sub" style="border-color:rgba(20,33,61,.3);background:rgba(20,33,61,.08);color:#14213d"><span style="width:5px;height:5px;border-radius:50%;background:#14213d;animation:pulse 3s ease-in-out infinite"></span><span>WISHLIST</span></div><div class="ph-title">SZUKANE</div></div>
    <button class="btn btn-p" onclick="openAddWishlistItem()" style="background:linear-gradient(135deg,#14213d,#0a0f1c)">+ Dodaj</button>
  </div>
  <div id="wishlist-grid" class="g3 s2"><div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div></div>
  <div class="s3" id="wishlist-matches" style="margin-top:20px"></div>`;
}

async function initWishlistView(){
  const items=await loadWishlist();
  const grid=document.getElementById('wishlist-grid');
  if(!grid)return;
  if(!items.length){grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('heart',44)}</div><div class="empty-text">WISHLIST JEST PUSTA — DODAJ KOSZULKĘ KTÓREJ SZUKASZ</div></div></div>`;return;}
  grid.innerHTML=items.map(w=>`
  <div class="card" style="border-color:rgba(20,33,61,.15)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:18px;letter-spacing:.05em;color:var(--t1)">${w.club||'Dowolny klub'}</div>
      <div class="fx-c gap4">
        <button class="xbtn" style="color:var(--t2)" onclick="openEditWishlistItem('${w.id}')" title="${db.lang==='pl'?'Edytuj':'Edit'}">${icon('edit3',13)}</button>
        <button class="xbtn" onclick="removeFromWishlist('${w.id}');initWishlistView()">${icon('x',13)}</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
      ${w.season?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${icon('calendar',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}${escapeHtml(w.season)}</div>`:''}
      ${w.size?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${icon('ruler',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}Rozmiar: ${escapeHtml(w.size)}</div>`:''}
      ${w.max_price?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--a)">${icon('banknote',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}Max: ${escapeHtml(String(w.max_price))} PLN</div>`:''}
      ${w.kind?`<div style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--t2)">${icon('shirt',11,"display:inline-block;vertical-align:-2px;margin-right:4px")} ${escapeHtml(kindLabel(w.kind))}</div>`:''}
      ${w.notes?`<div style="font-size:10px;color:var(--t2);margin-top:4px">${escapeHtml(w.notes)}</div>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding-top:8px;border-top:1px solid rgba(20,33,61,.08)">
      <div style="width:6px;height:6px;border-radius:50%;background:#14213d;box-shadow:0 0 6px rgba(20,33,61,.6)"></div>
      <span style="font-size:8px;font-family:'JetBrains Mono',monospace;color:rgba(20,33,61,.7);letter-spacing:.1em">${w.public?'PUBLICZNA':'PRYWATNA'}</span>
    </div>
  </div>`).join('');
  // Check marketplace matches
  const{data:listings}=await sb.from('market_listings').select('*');
  const matches=(listings||[]).filter(l=>items.some(w=>{
    const cm=!w.club||l.club?.toLowerCase().includes(w.club.toLowerCase());
    const sm=!w.size||l.size===w.size;
    const pm=!w.max_price||l.price_pln<=w.max_price;
    return cm&&sm&&pm;
  }));
  const matchEl=document.getElementById('wishlist-matches');
  if(matchEl&&matches.length){
    matchEl.innerHTML=`<div class="fx-b mb12"><div class="clabel" style="color:#14213d">DOPASOWANIA NA MARKETPLACE (${matches.length})</div></div>
    <div class="g3">${matches.map(l=>`
    <div class="mkt-card" style="border-color:rgba(20,33,61,.2);background:rgba(20,33,61,.04)">
      <div class="shirt-photo">${l.photo?`<img src="${l.photo}" style="width:100%;height:100%;object-fit:contain">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
        <div style="position:absolute;top:8px;left:8px;background:rgba(20,33,61,.9);border-radius:6px;padding:3px 8px;font-family:'JetBrains Mono',monospace;font-size:8px;color:#fff;display:flex;align-items:center;gap:4px">${icon('heart',10)}MATCH</div>
      </div>
      <div class="shirt-card-body">
        <div class="shirt-card-club">${l.club||'—'}</div>
        <div class="shirt-card-season">${[l.season,l.kind,l.size].filter(Boolean).join(' · ')}</div>
        <div class="shirt-card-price" style="color:#14213d">${l.price_pln?l.price_pln+' PLN':'—'}</div>
        <button class="btn w100" style="margin-top:8px;background:rgba(20,33,61,.15);border:1px solid rgba(20,33,61,.3);color:#14213d;font-size:10px;padding:6px" onclick="openApp('market')">Zobacz na Marketplace →</button>
      </div>
    </div>`).join('')}</div>`;
  }
}

// ── LEGITCHECK ──
function bLegitCheck(){
  return `
  <div class="fx-b mb12 s1">
    <div><div class="ph-sub" style="border-color:rgba(37,99,235,.3);background:rgba(37,99,235,.08);color:#2563eb"><span style="width:5px;height:5px;border-radius:50%;background:#2563eb;animation:pulse 3s ease-in-out infinite"></span><span>LEGITCHECK</span></div><div class="ph-title">WERYFIKACJA AUTENTYCZNOŚCI</div></div>
    <button class="btn btn-p" onclick="openLegitCheckRequestForm()" style="background:linear-gradient(135deg,#2563eb,#1d4ed8)">+ ${db.lang==='pl'?'Zgłoś koszulkę':'Submit jersey'}</button>
  </div>
  <p style="font-size:12.5px;color:var(--t2);line-height:1.6;margin-bottom:18px;max-width:620px">${db.lang==='pl'?'Wyślij koszulkę ze swojej kolekcji do weryfikacji. Nasz zespół sprawdzi zdjęcia i oznaczy ją jako zweryfikowaną — zaufanie kupujących na Marketplace rośnie.':'Submit a jersey from your collection for review. Our team checks the photos and marks it as verified — buyer trust on the Marketplace goes up.'}</p>
  <div id="legitcheck-grid" class="g3 s2"><div class="empty-state"><div class="empty-icon loading-pulse">${icon('shieldCheck',28)}</div></div></div>`;
}
function legitStatusBadge(status){
  if(status==='approved')return `<span class="lc-badge lc-approved">${icon('checkCircle',11)}${db.lang==='pl'?'Zweryfikowana':'Verified'}</span>`;
  if(status==='rejected')return `<span class="lc-badge lc-rejected">${icon('x',11)}${db.lang==='pl'?'Odrzucona':'Rejected'}</span>`;
  if(status==='pending')return `<span class="lc-badge lc-pending">${icon('clock',11)}${db.lang==='pl'?'W trakcie weryfikacji':'Under review'}</span>`;
  return '';
}
async function initLegitCheckView(){
  const grid=document.getElementById('legitcheck-grid');
  if(!grid||!currentUser)return;
  const {data,error}=await sb.from('legit_checks').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
  if(error){grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-text">${db.lang==='pl'?'Błąd wczytywania':'Load error'}: ${error.message}</div></div></div>`;return;}
  if(!data||!data.length){grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('shieldCheck',44)}</div><div class="empty-text">${db.lang==='pl'?'NIE ZGŁOSIŁEŚ JESZCZE ŻADNEJ KOSZULKI DO WERYFIKACJI':'YOU HAVE NOT SUBMITTED A JERSEY FOR VERIFICATION YET'}</div></div></div>`;return;}
  grid.innerHTML=data.map(req=>{
    const s=(db.shirts||[]).find(x=>String(x.id)===String(req.shirt_id));
    const photo=s&&s.photos&&s.photos[0];
    return `<div class="card" style="border-color:rgba(20,33,61,.15);padding:0;overflow:hidden">
      <div class="shirt-photo" style="border-radius:0">${photo?`<img src="${escapeHtml(photo)}" alt="">`:`<div class="shirt-photo-placeholder">${icon('shirt',40)}</div>`}
        <div style="position:absolute;top:8px;right:8px">${legitStatusBadge(req.status)}</div>
      </div>
      <div class="shirt-card-body">
        <div class="shirt-card-club">${escapeHtml(s?s.club:(db.lang==='pl'?'Koszulka usunięta':'Jersey removed'))}</div>
        <div class="shirt-card-season">${escapeHtml(s?[s.season,kindLabel(s.kind)].filter(Boolean).join(' · '):'')}</div>
        ${req.notes?`<div style="font-size:10px;color:var(--t2);margin-top:6px">${escapeHtml(req.notes)}</div>`:''}
        ${req.status==='rejected'&&req.admin_notes?`<div style="font-size:10px;color:var(--red);margin-top:6px">${db.lang==='pl'?'Powód':'Reason'}: ${escapeHtml(req.admin_notes)}</div>`:''}
        <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);margin-top:8px">${req.created_at?new Date(req.created_at).toLocaleDateString('pl-PL'):''}</div>
      </div>
    </div>`;
  }).join('');
}
function openLegitCheckRequestForm(){
  const eligible=(db.shirts||[]).filter(s=>!s.legitStatus||s.legitStatus==='rejected');
  if(!eligible.length){toast(db.lang==='pl'?'Wszystkie Twoje koszulki są już zweryfikowane lub w trakcie weryfikacji':'All your jerseys are already verified or under review');return;}
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Zgłoś koszulkę do weryfikacji':'Submit jersey for verification';
  document.getElementById('modal-body').innerHTML=`
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Wybierz koszulkę':'Choose jersey'}</div>
      <select class="form-input" id="lc-shirt">${eligible.map(s=>`<option value="${s.id}">${s.club||'—'} · ${s.season||''} · ${kindLabel(s.kind)}</option>`).join('')}</select>
    </div>
    <div class="form-group"><div class="form-label">${db.lang==='pl'?'Uwagi dla weryfikującego (opcjonalnie)':'Notes for reviewer (optional)'}</div>
      <textarea class="form-input" id="lc-notes" rows="3" placeholder="${db.lang==='pl'?'np. metka w środku, hologram na szwie...':'e.g. tag inside, hologram on seam...'}"></textarea>
    </div>
    <p style="font-size:11px;color:var(--t2);line-height:1.5;margin-bottom:14px">${db.lang==='pl'?'Do weryfikacji użyjemy zdjęć już dodanych do tej koszulki w Twojej kolekcji.':'We will use the photos already added to this jersey in your collection.'}</p>
    <div class="fx-c gap8" style="justify-content:flex-end">
      <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
      <button class="btn btn-p" id="lc-submit-btn" onclick="submitLegitCheckRequest()">${db.lang==='pl'?'Wyślij zgłoszenie':'Submit'}</button>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
async function submitLegitCheckRequest(){
  const shirtId=document.getElementById('lc-shirt')?.value;
  const notes=(document.getElementById('lc-notes')?.value||'').trim();
  if(!shirtId)return;
  const btn=document.getElementById('lc-submit-btn');
  if(btn){btn.textContent=db.lang==='pl'?'Wysyłanie...':'Sending...';btn.disabled=true;}
  const {error}=await sb.from('legit_checks').insert({user_id:currentUser.id,shirt_id:shirtId,notes,status:'pending'});
  if(error){toast((db.lang==='pl'?'Błąd: ':'Error: ')+error.message);if(btn){btn.textContent=db.lang==='pl'?'Wyślij zgłoszenie':'Submit';btn.disabled=false;}return;}
  await sb.from('shirts').update({legit_status:'pending'}).eq('id',shirtId).eq('user_id',currentUser.id);
  const s=(db.shirts||[]).find(x=>String(x.id)===String(shirtId));
  if(s)s.legitStatus='pending';
  closeModal();
  toast(db.lang==='pl'?'Zgłoszono do weryfikacji':'Submitted for verification');
  initLegitCheckView();
}
// Admin review panel
async function openLegitChecksPanel(){
  if(!currentUser)return;
  document.getElementById('modal-title').textContent='LegitCheck — zgłoszenia';
  document.getElementById('modal-body').innerHTML=`<div id="lc-admin-list" class="empty-state"><div class="empty-icon loading-pulse">${icon('shieldCheck',28)}</div></div>`;
  document.getElementById('modal-overlay').classList.add('open');
  const {data,error}=await sb.from('legit_checks').select('*').eq('status','pending').order('created_at',{ascending:true});
  const list=document.getElementById('lc-admin-list');
  if(error){list.innerHTML=`<div class="empty-text">Błąd: ${error.message}</div>`;return;}
  if(!data||!data.length){list.innerHTML=`<div class="empty-text">BRAK ZGŁOSZEŃ DO WERYFIKACJI</div>`;return;}
  list.className='';
  list.innerHTML=data.map(req=>{
    const s=(db.shirts||[]).find(x=>String(x.id)===String(req.shirt_id));
    const photo=s&&s.photos&&s.photos[0];
    return `<div class="report-card" style="display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid rgba(20,33,61,.12);border-radius:10px;margin-bottom:10px">
      <div style="width:64px;height:64px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg3)">${photo?`<img src="${escapeHtml(photo)}" style="width:100%;height:100%;object-fit:cover">`:''}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px">${escapeHtml(s?s.club:'—')} <span style="font-weight:400;color:var(--t2);font-size:11px">${escapeHtml(s?[s.season,kindLabel(s.kind)].filter(Boolean).join(' · '):'')}</span></div>
        ${req.notes?`<div style="font-size:11px;color:var(--t2);margin-top:4px">${escapeHtml(req.notes)}</div>`:''}
        <div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);margin-top:6px">${req.created_at?new Date(req.created_at).toLocaleDateString('pl-PL'):''}</div>
        <div class="fx-c gap6" style="margin-top:8px">
          <button class="btn btn-p" style="padding:5px 12px;font-size:10px" onclick="adminReviewLegitCheck('${req.id}','${req.shirt_id}',true)">${db.lang==='pl'?'Zatwierdź':'Approve'}</button>
          <button class="btn btn-d" style="padding:5px 12px;font-size:10px" onclick="adminReviewLegitCheck('${req.id}','${req.shirt_id}',false)">${db.lang==='pl'?'Odrzuć':'Reject'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function openAddWishlistItem(){
  editWishlistId=null;
  _wlPublic=false;
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Dodaj do Wishlisty':'Add to Wishlist';
  document.getElementById('modal-body').innerHTML=buildWishlistForm(null);
  document.getElementById('modal-overlay').classList.add('open');
}

async function openEditWishlistItem(id){
  const items=await loadWishlist();
  const item=items.find(w=>String(w.id)===String(id));
  if(!item){toast(db.lang==='pl'?'Nie znaleziono pozycji':'Item not found');return;}
  editWishlistId=id;
  _wlPublic=!!item.public;
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Edytuj Wishlistę':'Edit Wishlist Item';
  document.getElementById('modal-body').innerHTML=buildWishlistForm(item);
  document.getElementById('modal-overlay').classList.add('open');
}

function buildWishlistForm(item){
  const w=item||{};
  return `
  <div class="g2">
    <div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Klub / Reprezentacja':'Club / National team'}</div><input class="form-input" id="wl-club" value="${w.club||''}" placeholder="np. FC Barcelona"></div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Sezon':'Season'}</div><input class="form-input" id="wl-season" value="${w.season||''}" placeholder="2024/25"></div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Rodzaj':'Kit type'}</div>
        <select class="form-select" id="wl-kind">
          <option value="" ${!w.kind?'selected':''}>${db.lang==='pl'?'Dowolny':'Any'}</option>
          <option value="home" ${w.kind==='home'?'selected':''}>${T('kind_home')}</option>
          <option value="away" ${w.kind==='away'?'selected':''}>${T('kind_away')}</option>
          <option value="third" ${w.kind==='third'?'selected':''}>${T('kind_third')}</option>
          <option value="special" ${w.kind==='special'?'selected':''}>${T('kind_special')}</option>
        </select>
      </div>
    </div>
    <div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Rozmiar':'Size'}</div>
        <select class="form-select" id="wl-size">
          <option value="" ${!w.size?'selected':''}>${db.lang==='pl'?'Dowolny':'Any'}</option>
          ${SIZES.map(s=>`<option ${w.size===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Maks. cena (PLN)':'Max price (PLN)'}</div><input class="form-input" type="number" id="wl-price" value="${w.max_price||''}" placeholder="np. 300"></div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Uwagi':'Notes'}</div><textarea class="form-input" id="wl-notes" rows="3" placeholder="${db.lang==='pl'?'Dodatkowe wymagania...':'Additional requirements...'}">${w.notes||''}</textarea></div>
      <div class="toggle-row" id="wl-pub-row" onclick="toggleWLPublic()">
        <div class="tg-label"><span>${db.lang==='pl'?'Publiczna wishlist':'Public wishlist'}</span><small>${db.lang==='pl'?'Widoczna na Twoim profilu':'Visible on your profile'}</small></div>
        <div class="tg-track ${_wlPublic?'on':''}" id="tg-wl-pub"><div class="tg-knob"></div></div>
      </div>
    </div>
  </div>
  <div class="div"></div>
  <div class="fx-c gap8" style="justify-content:flex-end">
    ${item?`<button class="btn btn-d" onclick="removeFromWishlist('${item.id}');closeModal();if(isOpen('wishlist'))initWishlistView()">${icon('trash',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${T('delete')}</button>`:''}
    <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
    <button class="btn btn-p" style="background:linear-gradient(135deg,#14213d,#0a0f1c)" onclick="saveWishlistItem()">${item?(db.lang==='pl'?'Zapisz zmiany':'Save changes'):(db.lang==='pl'?'Dodaj do Wishlisty':'Add to Wishlist')}</button>
  </div>`;
}

let _wlPublic=false;
function toggleWLPublic(){_wlPublic=!_wlPublic;document.getElementById('tg-wl-pub')?.classList.toggle('on',_wlPublic);}

async function saveWishlistItem(){
  const item={
    club:document.getElementById('wl-club')?.value||'',
    season:document.getElementById('wl-season')?.value||'',
    kind:document.getElementById('wl-kind')?.value||'',
    size:document.getElementById('wl-size')?.value||'',
    max_price:parseFloat(document.getElementById('wl-price')?.value)||null,
    notes:document.getElementById('wl-notes')?.value||'',
    public:_wlPublic
  };
  if(editWishlistId){
    const{error}=await sb.from('wishlist').update(item).eq('id',editWishlistId).eq('user_id',currentUser.id);
    if(error){toast(db.lang==='pl'?'Błąd zapisu':'Save error');return;}
    toast(db.lang==='pl'?'Zaktualizowano!':'Updated!');
  } else {
    await addToWishlist(item);
  }
  editWishlistId=null;
  closeModal();
  if(isOpen('wishlist'))initWishlistView();
}

// ══════════════════════════════════════════════════════
// VERIFICATION SYSTEM
// ══════════════════════════════════════════════════════
async function requestVerification(shirtId){
  if(!currentUser)return;
  const shirt=(db.shirts||[]).find(s=>String(s.id)===String(shirtId));
  if(!shirt){toast('Nie znaleziono koszulki');return;}
  document.getElementById('modal-title').textContent='Wyślij do Weryfikacji';
  document.getElementById('modal-body').innerHTML=`
  <div class="card mb14" style="border-color:rgba(var(--a-rgb),.2);background:rgba(var(--a-rgb),.05)">
    <div style="font-size:12px;font-weight:600;color:var(--a);margin-bottom:6px;display:flex;align-items:center;gap:7px">${icon('checkCircle',14)}Jak działa weryfikacja?</div>
    <div style="font-size:11px;color:var(--t2);line-height:1.7">Weryfikator sprawdza zdjęcia tagów, style code i autentyczność koszulki. Po weryfikacji pojawi się badge <strong style="color:var(--a)">VERIFIED</strong> na Twoim ogłoszeniu.</div>
  </div>
  <div class="g2">
    <div>
      <div class="form-group"><div class="form-label">Style Code</div><input class="form-input" id="ver-code" value="${shirt.styleCode||''}" placeholder="np. CD4232-011"></div>
      <div class="form-group"><div class="form-label">Skąd pochodzi koszulka?</div>
        <select class="form-select" id="ver-source">
          <option>Sklep oficjalny</option><option>Nike/Adidas Store</option><option>Allegro</option>
          <option>Vinted</option><option>Grailed</option><option>Klub bezpośrednio</option><option>Inne</option>
        </select>
      </div>
    </div>
    <div>
      <div class="form-group"><div class="form-label">Dodatkowe informacje</div>
        <textarea class="form-input" id="ver-notes" rows="5" placeholder="Opisz historię koszulki, gdzie ją kupiłeś, czy masz paragon/fakturę..."></textarea>
      </div>
    </div>
  </div>
  <div class="div"></div>
  <div class="fx-c gap8" style="justify-content:flex-end">
    <button class="btn btn-g" onclick="closeModal()">Anuluj</button>
    <button class="btn btn-p" style="background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 40%,#000))" onclick="submitVerification('${shirtId}')">${icon('checkCircle',13,"display:inline-block;vertical-align:-2px;margin-right:5px")}Wyślij do weryfikacji</button>
  </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}
async function submitVerification(shirtId){
  const shirt=(db.shirts||[]).find(s=>String(s.id)===String(shirtId));
  await sb.from('verification_requests').upsert({
    shirt_id:shirtId,user_id:currentUser.id,
    style_code:document.getElementById('ver-code')?.value||'',
    source:document.getElementById('ver-source')?.value||'',
    notes:document.getElementById('ver-notes')?.value||'',
    status:'pending',photos:shirt?.photos||[]
  },{onConflict:'shirt_id'});
  if(shirt){shirt.verificationStatus='pending';await sbSaveShirt(shirt);}
  closeModal();toast('Wysłano do weryfikacji');
}
function verBadge(status){
  const map={pending:`<span style="font-family:'JetBrains Mono',monospace;font-size:7px;padding:2px 7px;border-radius:4px;background:rgba(var(--gold-rgb),.15);color:var(--gold);letter-spacing:.08em;display:inline-flex;align-items:center;gap:3px">${icon('clock',9)}WERYFIKACJA</span>`,
  verified:`<span style="font-family:'JetBrains Mono',monospace;font-size:7px;padding:2px 7px;border-radius:4px;background:rgba(var(--a-rgb),.15);color:var(--a);letter-spacing:.08em;display:inline-flex;align-items:center;gap:3px">${icon('checkCircle',9)}VERIFIED</span>`,
  rejected:`<span style="font-family:'JetBrains Mono',monospace;font-size:7px;padding:2px 7px;border-radius:4px;background:rgba(244,33,46,.1);color:var(--red);letter-spacing:.08em;display:inline-flex;align-items:center;gap:3px">${icon('x',9)}ODRZUCONA</span>`};
  return map[status]||'';
}

// ══════════════════════════════════════════════════════
// AUCTIONS SYSTEM
// ══════════════════════════════════════════════════════
