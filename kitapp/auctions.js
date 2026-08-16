// ============================================================
// auctions.js — the entire live-bidding system: create,
// bid, buy-now, cancel, countdowns, bid history.
// Depends on: supabase.js, auth.js, collection.js
// ============================================================

let auctionTimers={};
async function loadAuctions(){
  const{data}=await sb.from('auctions').select('*,bids(count)').eq('status','active').order('ends_at',{ascending:true});
  return data||[];
}
async function loadAuctionBids(auctionId){
  const{data}=await sb.from('bids').select('*,profiles(nick)').eq('auction_id',auctionId).order('created_at',{ascending:false}).limit(20);
  return data||[];
}
async function createAuction(shirtId,opts){
  if(!currentUser)return null;
  const shirt=(db.shirts||[]).find(s=>String(s.id)===String(shirtId));
  if(!shirt)return null;
  const endsAt=new Date(Date.now()+opts.durationMs);
  const{data,error}=await sb.from('auctions').insert({
    user_id:currentUser.id,shirt_id:shirtId,
    club:shirt.club,season:shirt.season,kind:kindLabel(shirt.kind),
    size:shirt.customSize||shirt.size,condition:shirt.condition,
    personalization:shirt.personalization,notes:shirt.notes,
    photo:shirt.photos?.[0]||null,
    start_price:opts.startPrice,current_price:opts.startPrice,
    min_bid_increment:opts.minIncrement,buy_now_price:opts.buyNow||null,
    ends_at:endsAt.toISOString(),extend_seconds:opts.extendSeconds,
    extend_threshold_seconds:opts.thresholdSeconds,
    seller_nick:db.profile?.nick||'',status:'active'
  }).select().single();
  if(error){toast('Błąd tworzenia licytacji: '+error.message);return null;}
  return data;
}
async function placeBid(auctionId,amount){
  if(!currentUser){toast(db.lang==='pl'?'Musisz być zalogowany':'You must be logged in');return false;}
  // Fetch current auction
  const{data:auction}=await sb.from('auctions').select('*').eq('id',auctionId).single();
  if(!auction){toast(db.lang==='pl'?'Licytacja nie istnieje':'Auction does not exist');return false;}
  if(auction.status!=='active'){toast(db.lang==='pl'?'Licytacja zakończona':'Auction has ended');return false;}
  const minBid=(parseFloat(auction.current_price)||0)+(parseFloat(auction.min_bid_increment)||1);
  if(amount<minBid){toast((db.lang==='pl'?'Minimalna oferta: ':'Minimum bid: ')+minBid.toFixed(2)+' PLN');return false;}
  if(auction.user_id===currentUser.id){toast(db.lang==='pl'?'Nie możesz licytować własnej koszulki':'You cannot bid on your own jersey');return false;}
  // Check if needs extension
  const now=new Date();const endsAt=new Date(auction.ends_at);
  const secsLeft=(endsAt-now)/1000;
  let newEndsAt=auction.ends_at;
  if(secsLeft<=auction.extend_threshold_seconds&&auction.extend_seconds>0){
    newEndsAt=new Date(now.getTime()+auction.extend_seconds*1000).toISOString();
  }
  // Notify previous highest bidder
  if(auction.highest_bidder_id&&auction.highest_bidder_id!==currentUser.id){
    await createNotification(auction.highest_bidder_id,'outbid',db.lang==='pl'?'Zostałeś przebity!':'You have been outbid!',db.lang==='pl'?`Twoja oferta na ${auction.club} ${auction.season||''} została przebita. Aktualna cena: ${amount.toFixed(2)} PLN`:`Your bid on ${auction.club} ${auction.season||''} has been outbid. Current price: ${amount.toFixed(2)} PLN`,`auction:${auctionId}`);
  }
  // Insert bid
  await sb.from('bids').insert({auction_id:auctionId,user_id:currentUser.id,amount,bidder_nick:db.profile?.nick||currentUser.email});
  // Update auction
  await sb.from('auctions').update({current_price:amount,highest_bidder_id:currentUser.id,highest_bidder_nick:db.profile?.nick||'',ends_at:newEndsAt}).eq('id',auctionId);
  // Notify seller
  await createNotification(auction.user_id,'bid',db.lang==='pl'?'Nowa oferta!':'New bid!',db.lang==='pl'?`${db.profile?.nick||'Ktoś'} złożył ofertę ${amount.toFixed(2)} PLN na ${auction.club}`:`${db.profile?.nick||'Someone'} placed a ${amount.toFixed(2)} PLN bid on ${auction.club}`,`auction:${auctionId}`);
  toast(db.lang==='pl'?'Oferta złożona!':'Bid placed!');
  return true;
}

async function buyNow(auctionId){
  const{data:auction}=await sb.from('auctions').select('*').eq('id',auctionId).single();
  if(!auction||!auction.buy_now_price){return;}
  if(auction.highest_bidder_id){toast(db.lang==='pl'?'Są już oferty — nie można użyć Kup Teraz':'Bids already placed — Buy Now unavailable');return;}
  await sb.from('auctions').update({status:'sold',winner_id:currentUser.id,winner_nick:db.profile?.nick||''}).eq('id',auctionId);
  await createNotification(auction.user_id,'sale',db.lang==='pl'?'Koszulka sprzedana!':'Jersey sold!',`${db.profile?.nick||(db.lang==='pl'?'Ktoś':'Someone')} ${db.lang==='pl'?'kupił':'bought'} ${auction.club} ${db.lang==='pl'?'za':'for'} ${auction.buy_now_price} PLN`,`auction:${auctionId}`);
  toast(db.lang==='pl'?'Kup Teraz — sukces! Skontaktuj się ze sprzedającym.':'Buy Now successful! Get in touch with the seller.');
  if(isOpen('auctions'))setTimeout(()=>initAuctionsView(),100);
}

function formatCountdown(endsAt){
  const diff=new Date(endsAt)-new Date();
  if(diff<=0)return db.lang==='pl'?'KONIEC':'ENDED';
  const d=Math.floor(diff/86400000),h=Math.floor((diff%86400000)/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
  if(d>0)return`${d}d ${h}h ${m}m`;
  if(h>0)return`${h}h ${m}m ${s}s`;
  return`${m}m ${s}s`;
}

function startAuctionTimer(id,endsAt,elId){
  if(auctionTimers[id])clearInterval(auctionTimers[id]);
  auctionTimers[id]=setInterval(()=>{
    const el=document.getElementById(elId);
    if(!el){clearInterval(auctionTimers[id]);return;}
    const txt=formatCountdown(endsAt);
    el.textContent=txt;
    const diff=new Date(endsAt)-new Date();
    el.style.color=diff<60000?'var(--red)':diff<300000?'var(--gold)':'var(--a)';
    if(diff<=0){clearInterval(auctionTimers[id]);el.textContent=db.lang==='pl'?'ZAKOŃCZONA':'ENDED';el.style.color='var(--t2)';}
  },1000);
}

function bAuctions(){
  return `
  <div class="fx-b mb12 s1">
    <div><div class="ph-sub" style="border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08);color:#f87171"><span style="width:5px;height:5px;border-radius:50%;background:#f87171;animation:pulse 1s ease-in-out infinite"></span><span>${db.lang==='pl'?'LICYTACJE LIVE':'LIVE AUCTIONS'}</span></div><div class="ph-title">${db.lang==='pl'?'AUKCJE':'AUCTIONS'}</div></div>
    <div class="fx-c gap8">
      <button class="btn btn-g" onclick="initAuctionsView()">↻ ${db.lang==='pl'?'Odśwież':'Refresh'}</button>
      <button class="btn" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#f87171" onclick="openCreateAuction()">+ ${db.lang==='pl'?'Nowa Licytacja':'New Auction'}</button>
    </div>
  </div>
  <div class="tabs mb12">
    <div class="tab active" id="auc-tab-live" onclick="switchAucTab('live')"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:5px;vertical-align:1px;box-shadow:0 0 5px #ef4444;animation:pulse 1s ease-in-out infinite"></span>Live</div>
    <div class="tab" id="auc-tab-mine" onclick="switchAucTab('mine')">${icon('user2',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}${db.lang==='pl'?'Moje':'Mine'}</div>
    <div class="tab" id="auc-tab-bidding" onclick="switchAucTab('bidding')">${icon('zap',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}${db.lang==='pl'?'Licytuję':'Bidding'}</div>
    <div class="tab" id="auc-tab-ended" onclick="switchAucTab('ended')">${icon('checkCircle',11,"display:inline-block;vertical-align:-2px;margin-right:4px")}${db.lang==='pl'?'Zakończone':'Ended'}</div>
  </div>
  <div id="auctions-grid" class="g3 s2"><div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div></div>`;
}

let _aucTab='live';
function switchAucTab(tab){
  _aucTab=tab;
  ['live','mine','bidding','ended'].forEach(t=>{
    document.getElementById('auc-tab-'+t)?.classList.toggle('active',t===tab);
  });
  initAuctionsView();
}

async function initAuctionsView(){
  const grid=document.getElementById('auctions-grid');if(!grid)return;
  grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon loading-pulse"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg></div></div></div>`;
  let auctions=[];
  const tab=_aucTab||'live';
  if(tab==='live'){
    const{data}=await sb.from('auctions').select('*').eq('status','active').order('ends_at',{ascending:true});
    auctions=data||[];
  } else if(tab==='mine'){
    const{data}=await sb.from('auctions').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
    auctions=data||[];
  } else if(tab==='bidding'){
    // Aukcje w których złożyłem ofertę
    const{data:myBids}=await sb.from('bids').select('auction_id').eq('user_id',currentUser.id);
    const aucIds=[...new Set((myBids||[]).map(b=>b.auction_id))];
    if(aucIds.length){
      const{data}=await sb.from('auctions').select('*').in('id',aucIds).order('ends_at',{ascending:true});
      auctions=data||[];
    }
  } else if(tab==='ended'){
    const{data}=await sb.from('auctions').select('*').in('status',['ended','sold','cancelled']).or(`user_id.eq.${currentUser.id},winner_id.eq.${currentUser.id}`).order('created_at',{ascending:false}).limit(20);
    auctions=data||[];
  }
  if(!auctions.length){
    const msgs=db.lang==='pl'
      ?{live:'BRAK AKTYWNYCH LICYTACJI — BĄDŹ PIERWSZY!',mine:'NIE MASZ ŻADNYCH LICYTACJI',bidding:'NIE LICYTUJESZ W ŻADNEJ AUKCJI',ended:'BRAK ZAKOŃCZONYCH LICYTACJI'}
      :{live:'NO ACTIVE AUCTIONS — BE THE FIRST!',mine:'YOU HAVE NO AUCTIONS',bidding:'YOU ARE NOT BIDDING ON ANYTHING',ended:'NO ENDED AUCTIONS'};
    grid.innerHTML=`<div style="grid-column:span 3"><div class="empty-state"><div class="empty-icon">${icon('tag2',44)}</div><div class="empty-text">${msgs[tab]||(db.lang==='pl'?'BRAK':'NONE')}</div></div></div>`;
    return;
  }
  grid.innerHTML=auctions.map(a=>buildAuctionCard(a)).join('');
  // Realtime tylko dla live — stała nazwa kanału żeby uniknąć wycieku subskrypcji
  if(tab==='live'){
    try{sb.removeChannel(sb.channel('auctions-live-feed'));}catch(e){}
    const auctionCh=sb.channel('auctions-live-feed')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'auctions'},()=>{
        if(isOpen('auctions')&&_aucTab==='live')initAuctionsView();
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'auctions'},()=>{
        if(isOpen('auctions')&&_aucTab==='live')initAuctionsView();
      })
      .subscribe();
    _rtSubs.push(auctionCh);
  }
}

function buildAuctionCard(a){
  const isOwn=a.user_id===currentUser?.id;
  const isWinner=a.winner_id===currentUser?.id;
  const hasKN=a.buy_now_price&&!a.highest_bidder_id;
  const isEnded=a.status!=='active';
  const timerId=`timer-${a.id}`;
  if(!isEnded)setTimeout(()=>startAuctionTimer(a.id,a.ends_at,timerId),50);
  return `<div class="mkt-card" data-auction-id="${a.id}" style="border-color:${isEnded?'var(--border)':'rgba(239,68,68,.25)'};background:${isEnded?'var(--bg2)':'rgba(239,68,68,.03)'}">
    <div class="shirt-photo" style="background:var(--bg3)">
      ${a.photo?`<img src="${a.photo}" style="width:100%;height:100%;object-fit:cover">`:`<div class="shirt-photo-placeholder"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg></div>`}
      ${!isEnded?`<div style="position:absolute;top:8px;left:8px;background:rgba(239,68,68,.9);border-radius:6px;padding:3px 8px;font-family:'JetBrains Mono',monospace;font-size:8px;color:#fff;display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:#fff;animation:pulse 1s ease-in-out infinite;flex-shrink:0"></span>LIVE</div>`:`<div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.7);border-radius:6px;padding:3px 8px;font-family:'JetBrains Mono',monospace;font-size:8px;color:rgba(255,255,255,.5)">${a.status==='sold'?(db.lang==='pl'?'SPRZEDANA':'SOLD'):a.status==='cancelled'?(db.lang==='pl'?'ANULOWANA':'CANCELLED'):(db.lang==='pl'?'ZAKOŃCZONA':'ENDED')}</div>`}
      ${isWinner?`<div style="position:absolute;top:8px;right:8px;background:rgba(var(--gold-rgb),.9);border-radius:6px;padding:3px 8px;font-family:'JetBrains Mono',monospace;font-size:8px;color:#fff">${icon('trophy',10,"display:inline-block;vertical-align:-2px;margin-right:3px")}${db.lang==='pl'?'WYGRAŁEŚ':'YOU WON'}</div>`:''}
      ${hasKN?`<div style="position:absolute;top:8px;right:8px;background:rgba(var(--a-rgb),.9);border-radius:6px;padding:3px 8px;font-family:'JetBrains Mono',monospace;font-size:8px;color:#fff">${db.lang==='pl'?'KUP TERAZ':'BUY NOW'}</div>`:''}
      ${!isEnded?`<div style="position:absolute;bottom:8px;left:8px;right:8px;background:rgba(0,0,0,.75);border-radius:8px;padding:5px 10px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-family:'JetBrains Mono',monospace;font-size:8px;color:rgba(255,255,255,.6);letter-spacing:.06em">${db.lang==='pl'?'KOŃCZY SIĘ':'ENDS IN'}</div>
        <div id="${timerId}" style="font-family:'Inter',sans-serif;font-weight:800;font-size:15px;color:var(--a);letter-spacing:.05em">${formatCountdown(a.ends_at)}</div>
      </div>`:''}
    </div>
    <div class="shirt-card-body">
      <div class="shirt-card-club">${a.club||'—'}</div>
      <div class="shirt-card-season">${[a.season,a.kind,a.size].filter(Boolean).join(' · ')}</div>
      ${a.personalization?`<div style="font-size:10px;color:var(--t2);margin-bottom:4px;font-family:'JetBrains Mono',monospace">${a.personalization}</div>`:''}
      <div class="fx-b mb8">
        <div>
          <div style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--t2);letter-spacing:.1em;margin-bottom:2px">${isEnded?(db.lang==='pl'?'KOŃCOWA CENA':'FINAL PRICE'):(db.lang==='pl'?'AKTUALNA OFERTA':'CURRENT BID')}</div>
          <div class="shirt-card-price" style="color:${isEnded?'var(--t2)':'#f87171'}">${parseFloat(a.current_price||0).toFixed(2)} PLN</div>
          ${!isEnded?`<div style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--t2);margin-top:2px">${db.lang==='pl'?'min. podbicie':'min. increment'}: +${a.min_bid_increment||1} PLN</div>`:''}
        </div>
        ${hasKN?`<div style="text-align:right"><div style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--a);letter-spacing:.1em;margin-bottom:2px">${db.lang==='pl'?'KUP TERAZ':'BUY NOW'}</div><div style="font-family:'Inter',sans-serif;font-weight:800;font-size:18px;color:var(--a)">${parseFloat(a.buy_now_price).toFixed(2)} PLN</div></div>`:''}
      </div>
      ${a.highest_bidder_nick?`<div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t2);margin-bottom:8px"><span style="display:inline-flex;align-items:center;gap:5px">${icon('trophy',10)}${a.highest_bidder_nick}</span></div>`:''}
      ${a.winner_nick&&isEnded?`<div style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--gold);margin-bottom:8px"><span style="display:inline-flex;align-items:center;gap:5px;color:var(--gold)">${icon('trophy',10)}${db.lang==='pl'?'Wygrał':'Won by'}: ${a.winner_nick}</span></div>`:''}
      <div class="div" style="margin:6px 0"></div>
      <div class="fx-c gap6">
        ${!isEnded&&isOwn?`<button class="btn btn-d w100" style="font-size:10px;padding:6px" onclick="cancelAuction('${a.id}')">${db.lang==='pl'?'Anuluj':'Cancel'}</button>`:''}
        ${!isEnded&&!isOwn?`<button class="btn w100" style="font-size:10px;padding:6px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#f87171" onclick="openBidModal('${a.id}',${a.current_price},${a.min_bid_increment})">${icon('zap',12,"display:inline-block;vertical-align:-2px;margin-right:4px")}${db.lang==='pl'?'Złóż ofertę':'Place bid'}</button>`:''}
        ${hasKN&&!isOwn&&!isEnded?`<button class="btn btn-p" style="font-size:10px;padding:6px;flex-shrink:0" onclick="buyNow('${a.id}')">${db.lang==='pl'?'Kup Teraz':'Buy Now'}</button>`:''}
        <button class="btn btn-g" style="font-size:10px;padding:6px;flex-shrink:0" onclick="openBidHistory('${a.id}')">${db.lang==='pl'?'Historia':'History'}</button>
        ${isWinner?`<button class="btn" style="font-size:10px;padding:6px;flex-shrink:0;background:rgba(var(--gold-rgb),.15);border:1px solid rgba(var(--gold-rgb),.3);color:var(--gold)" onclick="contactSeller('${a.user_id}','${a.seller_nick||''}')">${icon('messageCircle',12,"display:inline-block;vertical-align:-2px;margin-right:5px")}${db.lang==='pl'?'Kontakt':'Contact'}</button>`:''}
      </div>
      <div class="fx-b" style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(239,68,68,.06)">
        <div class="mkt-seller fx-c gap6" style="color:rgba(239,68,68,.7)">
          <div style="width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#7f1d1d);display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-family:'Inter',sans-serif;font-weight:800">${(a.seller_nick||'?')[0].toUpperCase()}</div>
          ${a.seller_nick||'—'}
        </div>
        ${isOwn?`<span style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--a)">${db.lang==='pl'?'TWOJA':'YOURS'}</span>`:''}
      </div>
    </div>
  </div>`;
}

function openBidModal(auctionId,currentPrice,minIncrement){
  const minBid=(parseFloat(currentPrice)||0)+(parseFloat(minIncrement)||1);
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Złóż Ofertę':'Place a Bid';
  document.getElementById('modal-body').innerHTML=`
  <div class="card mb14" style="border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.05)">
    <div class="fx-b">
      <div><div class="clabel" style="font-size:8px">${db.lang==='pl'?'AKTUALNA CENA':'CURRENT PRICE'}</div><div style="font-family:'Inter',sans-serif;font-weight:800;font-size:28px;color:#f87171">${parseFloat(currentPrice).toFixed(2)} PLN</div></div>
      <div style="text-align:right"><div class="clabel" style="font-size:8px">${db.lang==='pl'?'MIN. PODBICIE':'MIN. INCREMENT'}</div><div style="font-family:'Inter',sans-serif;font-weight:800;font-size:18px;color:var(--gold)">+${parseFloat(minIncrement).toFixed(2)} PLN</div></div>
    </div>
  </div>
  <div class="form-group">
    <div class="form-label">${db.lang==='pl'?'Twoja oferta':'Your bid'} (min. ${minBid.toFixed(2)} PLN)</div>
    <input class="form-input" type="number" id="bid-amount" value="${minBid.toFixed(2)}" min="${minBid}" step="${minIncrement}" style="font-size:20px;font-weight:700;text-align:center">
  </div>
  <div class="div"></div>
  <div class="fx-c gap8" style="justify-content:flex-end">
    <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
    <button class="btn" style="background:rgba(239,68,68,.9);color:#fff;box-shadow:0 2px 16px rgba(239,68,68,.4);font-size:13px;padding:10px 24px" onclick="submitBid('${auctionId}',${minBid})">${icon('zap',14,"display:inline-block;vertical-align:-3px;margin-right:5px")}${db.lang==='pl'?'LICYTUJĘ':'BID NOW'}</button>
  </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function submitBid(auctionId,minBid){
  const amount=parseFloat(document.getElementById('bid-amount')?.value);
  if(isNaN(amount)||amount<minBid){toast((db.lang==='pl'?'Minimalna oferta: ':'Minimum bid: ')+minBid.toFixed(2)+' PLN');return;}
  const ok=await placeBid(auctionId,amount);
  if(ok){closeModal();if(isOpen('auctions'))setTimeout(()=>initAuctionsView(),200);}
}

async function openBidHistory(auctionId){
  const bids=await loadAuctionBids(auctionId);
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Historia Ofert':'Bid History';
  document.getElementById('modal-body').innerHTML=`
  ${bids.length?bids.map((b,i)=>`
  <div class="vh-row">
    <div class="fx-c gap8" style="gap:8px">
      ${i===0?`<span style="font-family:'JetBrains Mono',monospace;font-size:8px;padding:2px 7px;border-radius:4px;background:rgba(var(--gold-rgb),.15);color:var(--gold)"><span style="display:inline-flex;align-items:center;gap:3px">${icon('trophy',9)}${db.lang==='pl'?'NAJWYŻSZA':'HIGHEST'}</span>`:''}
      <span style="font-size:12px;font-weight:600">${b.profiles?.nick||b.bidder_nick||'—'}</span>
    </div>
    <div style="text-align:right">
      <div style="font-family:'Inter',sans-serif;font-weight:800;font-size:18px;color:${i===0?'#f87171':'var(--t2)'}">${parseFloat(b.amount).toFixed(2)} PLN</div>
      <div style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--t3)">${b.created_at?new Date(b.created_at).toLocaleString(db.lang==='pl'?'pl-PL':'en-GB'):''}</div>
    </div>
  </div>`).join(''):`<div class="empty-state" style="padding:30px"><div class="empty-icon">${icon('volumeX',44)}</div><div class="empty-text">${db.lang==='pl'?'BRAK OFERT':'NO BIDS'}</div></div>`}
  <div class="div"></div>
  <div style="text-align:right"><button class="btn btn-g" onclick="closeModal()">${db.lang==='pl'?'Zamknij':'Close'}</button></div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function cancelAuction(auctionId){
  const{data:auction}=await sb.from('auctions').select('*').eq('id',auctionId).maybeSingle();
  if(!auction)return;
  const hasBids=!!auction.highest_bidder_id;
  const msg=hasBids
    ?(db.lang==='pl'?`Ktoś już licytuje (${auction.current_price} PLN). Na pewno chcesz anulować? Licytujący zostanie powiadomiony.`:`Someone is already bidding (${auction.current_price} PLN). Cancel anyway? The bidder will be notified.`)
    :(db.lang==='pl'?'Anulować licytację?':'Cancel auction?');
  if(!await customConfirm(msg))return;
  await sb.from('auctions').update({status:'cancelled'}).eq('id',auctionId).eq('user_id',currentUser.id);
  // Powiadom wszystkich licytujących o anulowaniu
  if(hasBids){
    const{data:bidders}=await sb.from('bids').select('user_id').eq('auction_id',auctionId);
    const uniqueBidders=[...new Set((bidders||[]).map(b=>b.user_id))];
    for(const bidderId of uniqueBidders){
      if(bidderId!==currentUser.id){
        await createNotification(bidderId,'cancelled',db.lang==='pl'?'Licytacja anulowana':'Auction cancelled',`${auction.club} ${auction.season||''} — ${db.lang==='pl'?'sprzedający anulował licytację':'seller cancelled the auction'}`,`auction:${auctionId}`);
      }
    }
  }
  toast(db.lang==='pl'?'Licytacja anulowana':'Auction cancelled');
  if(isOpen('auctions'))initAuctionsView();
}

async function openAuctionById(id){
  openApp('auctions');
  const{data:auction}=await sb.from('auctions').select('status').eq('id',id).maybeSingle();
  const targetTab=auction&&auction.status==='active'?'live':'ended';
  const highlight=()=>{
    setTimeout(()=>{
      const target=document.querySelector(`[data-auction-id="${id}"]`);
      if(target){
        target.scrollIntoView({behavior:'smooth',block:'center'});
        target.style.outline='2px solid #f87171';target.style.outlineOffset='2px';
        setTimeout(()=>{target.style.outline='';},2500);
      }
    },250);
  };
  setTimeout(()=>{
    if(_aucTab!==targetTab){switchAucTab(targetTab);}
    else{initAuctionsView();}
    highlight();
  },100);
}

function openCreateAuction(){
  const myShirts=(db.shirts||[]).filter(s=>s.status==='forsale'||s.status==='collection');
  document.getElementById('modal-title').textContent=db.lang==='pl'?'Nowa Licytacja':'New Auction';
  document.getElementById('modal-body').innerHTML=`
  <div class="form-group">
    <div class="form-label">${db.lang==='pl'?'Koszulka':'Jersey'}</div>
    <select class="form-select" id="auc-shirt">
      <option value="">${db.lang==='pl'?'— Wybierz koszulkę —':'— Choose a jersey —'}</option>
      ${myShirts.map(s=>`<option value="${s.id}">${s.club||'?'} ${s.season||''} ${kindLabel(s.kind)||''}</option>`).join('')}
    </select>
  </div>
  <div class="g2">
    <div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Cena wywoławcza (PLN)':'Starting price (PLN)'}</div><input class="form-input" type="number" id="auc-start" placeholder="${db.lang==='pl'?'np. 50':'e.g. 50'}" min="1"></div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Minimalne podbicie (PLN)':'Minimum increment (PLN)'}</div><input class="form-input" type="number" id="auc-inc" placeholder="${db.lang==='pl'?'np. 5':'e.g. 5'}" value="5" min="1"></div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Cena Kup Teraz (PLN, opcjonalnie)':'Buy Now price (PLN, optional)'}</div><input class="form-input" type="number" id="auc-buynow" placeholder="${db.lang==='pl'?'pozostaw puste = brak':'leave empty = none'}"></div>
    </div>
    <div>
      <div class="form-group"><div class="form-label">${db.lang==='pl'?'Czas trwania':'Duration'}</div>
        <select class="form-select" id="auc-dur">
          <option value="3600000">${db.lang==='pl'?'1 godzina':'1 hour'}</option>
          <option value="21600000">${db.lang==='pl'?'6 godzin':'6 hours'}</option>
          <option value="43200000">${db.lang==='pl'?'12 godzin':'12 hours'}</option>
          <option value="86400000" selected>${db.lang==='pl'?'24 godziny':'24 hours'}</option>
          <option value="259200000">${db.lang==='pl'?'3 dni':'3 days'}</option>
          <option value="604800000">${db.lang==='pl'?'7 dni':'7 days'}</option>
        </select>
      </div>
      <div class="form-group">
        <div class="form-label">${db.lang==='pl'?'Przedłużenie gdy oferta w ostatnich...':'Extend if a bid comes in the last...'}</div>
        <select class="form-select" id="auc-threshold">
          <option value="30">${db.lang==='pl'?'30 sekundach':'30 seconds'}</option>
          <option value="60" selected>${db.lang==='pl'?'1 minucie':'1 minute'}</option>
          <option value="120">${db.lang==='pl'?'2 minutach':'2 minutes'}</option>
          <option value="300">${db.lang==='pl'?'5 minutach':'5 minutes'}</option>
        </select>
      </div>
      <div class="form-group">
        <div class="form-label">${db.lang==='pl'?'Przedłuż o...':'Extend by...'}</div>
        <select class="form-select" id="auc-extend">
          <option value="0">${db.lang==='pl'?'Nie przedłużaj':'Do not extend'}</option>
          <option value="30">${db.lang==='pl'?'30 sekund':'30 seconds'}</option>
          <option value="60" selected>${db.lang==='pl'?'1 minutę':'1 minute'}</option>
          <option value="120">${db.lang==='pl'?'2 minuty':'2 minutes'}</option>
          <option value="300">${db.lang==='pl'?'5 minut':'5 minutes'}</option>
        </select>
      </div>
    </div>
  </div>
  <div class="div"></div>
  <div class="fx-c gap8" style="justify-content:flex-end">
    <button class="btn btn-g" onclick="closeModal()">${T('cancel')}</button>
    <button class="btn" style="background:rgba(239,68,68,.9);color:#fff;box-shadow:0 2px 16px rgba(239,68,68,.4)" onclick="submitCreateAuction()"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#fff;margin-right:6px;vertical-align:0px;animation:pulse 1s ease-in-out infinite;box-shadow:0 0 4px rgba(255,255,255,.6)"></span>${db.lang==='pl'?'Uruchom Licytację':'Start Auction'}</button>
  </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function submitCreateAuction(){
  const shirtId=document.getElementById('auc-shirt')?.value;
  if(!shirtId){toast(db.lang==='pl'?'Wybierz koszulkę!':'Choose a jersey!');return;}
  const startPrice=parseFloat(document.getElementById('auc-start')?.value);
  if(!startPrice||startPrice<=0){toast(db.lang==='pl'?'Wpisz cenę wywoławczą!':'Enter a starting price!');return;}
  const opts={
    startPrice,
    minIncrement:parseFloat(document.getElementById('auc-inc')?.value)||5,
    buyNow:parseFloat(document.getElementById('auc-buynow')?.value)||null,
    durationMs:parseInt(document.getElementById('auc-dur')?.value)||86400000,
    thresholdSeconds:parseInt(document.getElementById('auc-threshold')?.value)||60,
    extendSeconds:parseInt(document.getElementById('auc-extend')?.value)||60,
  };
  const auc=await createAuction(shirtId,opts);
  if(auc){closeModal();toast(db.lang==='pl'?'Licytacja uruchomiona!':'Auction started!');openApp('auctions');setTimeout(()=>initAuctionsView(),200);}
}

