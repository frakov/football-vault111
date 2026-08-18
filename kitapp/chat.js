// ============================================================
// chat.js — conversations and messages between users.
// Depends on: supabase.js, auth.js
// ============================================================

let activeConvId=null;
async function loadConversations(){
  if(!currentUser)return[];
  const{data}=await sb.from('conversations').select('*,messages(content,created_at,sender_id)').or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`).order('updated_at',{ascending:false});
  return (data||[]).filter(c=>{
    const hiddenForMe=c.user1_id===currentUser.id?c.hidden_for_user1:c.hidden_for_user2;
    return !hiddenForMe;
  });
}
async function getOrCreateConv(otherUserId){
  if(!currentUser||!otherUserId)return null;
  // Check existing
  const{data:existing}=await sb.from('conversations').select('*').or(`and(user1_id.eq.${currentUser.id},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${currentUser.id})`).maybeSingle();
  if(existing){
    // Jeśli sam ukryłem tę konwersację wcześniej, przywróć ją przy ponownym kontakcie
    const myField=existing.user1_id===currentUser.id?'hidden_for_user1':'hidden_for_user2';
    if(existing[myField])await sb.from('conversations').update({[myField]:false}).eq('id',existing.id);
    return existing.id;
  }
  const{data:newConv}=await sb.from('conversations').insert({user1_id:currentUser.id,user2_id:otherUserId,updated_at:new Date().toISOString()}).select().single();
  return newConv?.id||null;
}
async function sendMessage(convId,content,imageUrl=null){
  if(!currentUser||!convId||!content.trim())return;
  await sb.from('messages').insert({conversation_id:convId,sender_id:currentUser.id,content:content.trim(),image_url:imageUrl,read:false});
  // Nowa wiadomość przywraca konwersację, jeśli któraś ze stron ją wcześniej "usunęła" (ukryła u siebie)
  await sb.from('conversations').update({updated_at:new Date().toISOString(),last_message:content.trim(),hidden_for_user1:false,hidden_for_user2:false}).eq('id',convId);
}
function handleNewMessage(msg){
  // Jeśli to własna wiadomość — już załadowana przez sendChatMsg
  if(msg.sender_id===currentUser?.id)return;
  // Jeśli czat z tą konwersacją jest otwarty — odśwież
  const chatArea=document.getElementById('chat-messages-area');
  if(msg.conversation_id===activeConvId&&chatArea){
    loadChatMessages(activeConvId);
  } else {
    // Pokaż badge na ikonce czatu
    const badge=document.getElementById('tb-chat-badge');
    if(badge){const c=parseInt(badge.textContent||'0')+1;badge.textContent=c>9?'9+':c;badge.style.display='flex';}
    toast('Nowa wiadomość');
    // Odśwież listę konwersacji jeśli okno czatu jest otwarte (żeby zaktualizować last_message)
    if(isOpen('chat'))initChatView();
  }
}
async function openChatWith(userId){
  const convId=await getOrCreateConv(userId);
  if(!convId)return;
  activeConvId=convId;
  openApp('chat');
}
async function loadChatMessages(convId){
  const el=document.getElementById('chat-messages-area');
  if(!el)return;
  const{data,error}=await sb.from('messages').select('*').eq('conversation_id',convId).order('created_at',{ascending:true}).limit(100);
  if(error){console.error('loadChatMessages error:',error);return;}
  const msgs=data||[];
  if(!msgs.length){
    el.innerHTML=`<div class="empty-state" style="padding:30px"><div class="empty-icon">${icon('messageCircle',44)}</div><div class="empty-text" style="font-size:9px">BRAK WIADOMOŚCI — NAPISZ PIERWSZĄ!</div></div>`;
    return;
  }
  const atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<80;
  const senderIds=[...new Set(msgs.map(m=>m.sender_id))];
  const{data:profiles}=await sb.from('profiles').select('user_id,nick').in('user_id',senderIds);
  const nickMap={};(profiles||[]).forEach(p=>nickMap[p.user_id]=p.nick||'?');
  el.innerHTML=msgs.map(m=>{
    const isMe=m.sender_id===currentUser?.id;
    const nick=escapeHtml(nickMap[m.sender_id]||'?');
    const time=m.created_at?new Date(m.created_at).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):'';
    if(m.deleted){
      return `<div class="chat-msg ${isMe?'me':'them'}">
        ${!isMe?`<div class="chat-avatar" style="width:28px;height:28px;font-size:12px">${nick[0].toUpperCase()}</div>`:''}
        <div class="chat-bubble ${isMe?'mine':'theirs'}" style="opacity:.5;font-style:italic">
          <div style="font-size:11px">${db.lang==='pl'?'Wiadomość usunięta':'Message deleted'}</div>
          <div class="chat-time">${isMe?'Ty':nick} · ${time}</div>
        </div>
      </div>`;
    }
    return `<div class="chat-msg ${isMe?'me':'them'}" data-msg-id="${m.id}">
      ${!isMe?`<div class="chat-avatar" style="width:28px;height:28px;font-size:12px">${nick[0].toUpperCase()}</div>`:''}
      <div class="chat-bubble ${isMe?'mine':'theirs'}" style="position:relative">
        ${isMe?`<button class="msg-del-btn" onclick="deleteMessage('${m.id}','${convId}')" title="${db.lang==='pl'?'Usuń':'Delete'}">${icon('trash',10)}</button>`:''}
        ${m.image_url?`<img src="${escapeHtml(m.image_url)}" style="max-width:200px;border-radius:8px;display:block;margin-bottom:4px" onclick="document.getElementById('lb-img').src='${escapeHtml(m.image_url)}';document.getElementById('lightbox').classList.add('open')">`:''}
        ${m.content?`<div>${escapeHtml(m.content)}</div>`:''}
        <div class="chat-time">${isMe?'Ty':nick} · ${time}</div>
      </div>
    </div>`;
  }).join('');
  if(atBottom||msgs.length<5)el.scrollTop=el.scrollHeight;
}

async function deleteMessage(msgId,convId){
  if(!await customConfirm(db.lang==='pl'?'Usunąć tę wiadomość?':'Delete this message?'))return;
  const{error}=await sb.from('messages').update({deleted:true,content:'',image_url:null}).eq('id',msgId).eq('sender_id',currentUser.id);
  if(error){toast(db.lang==='pl'?'Błąd usuwania':'Delete error');return;}
  await loadChatMessages(convId);
  toast(db.lang==='pl'?'Wiadomość usunięta':'Message deleted');
}

function bChat(){
  return `
  <div class="fx-b mb12 s1">
    <div><div class="ph-sub" style="border-color:rgba(20,33,61,.3);background:rgba(20,33,61,.08);color:#14213d"><span style="width:5px;height:5px;border-radius:50%;background:#14213d;animation:pulse 3s ease-in-out infinite"></span><span>WIADOMOŚCI</span></div><div class="ph-title">CZAT</div></div>
  </div>
  <div style="display:grid;grid-template-columns:260px 1fr;gap:0;height:calc(100% - 90px);border:1px solid rgba(20,33,61,.12);border-radius:14px;overflow:hidden">
    <div style="border-right:1px solid rgba(20,33,61,.1);display:flex;flex-direction:column">
      <div style="padding:12px;border-bottom:1px solid rgba(20,33,61,.08);flex-shrink:0">
        <div class="field field-search" style="padding:6px 12px">${icon('search',12)}<input type="text" placeholder="Szukaj..." style="font-size:11px"></div>
      </div>
      <div id="conv-list-inner" style="flex:1;overflow-y:auto;padding:8px">
        <div style="padding:20px;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">ŁADOWANIE...</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;min-height:0">
      <!-- NAGŁÓWEK — statyczny -->
      <div style="padding:10px 16px;border-bottom:1px solid rgba(20,33,61,.08);display:flex;align-items:center;gap:10px;flex-shrink:0">
        <div id="chat-avatar-main" class="chat-avatar" style="width:32px;height:32px;font-size:14px">?</div>
        <div id="chat-header-nick" style="font-weight:700;font-size:13px;flex:1">—</div>
        <button class="xbtn" id="chat-del-conv-btn" style="display:none" onclick="deleteCurrentConv()" title="${db.lang==='pl'?'Usuń konwersację':'Delete conversation'}">${icon('trash',13)}</button>
      </div>
      <!-- WIADOMOŚCI — podmieniane przez loadChatMessages -->
      <div id="chat-messages-area" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;min-height:0">
        <div class="empty-state"><div class="empty-icon">${icon('messageCircle',44)}</div><div class="empty-text">WYBIERZ KONWERSACJĘ</div></div>
      </div>
      <!-- INPUT — statyczny, NIGDY nie jest podmieniane -->
      <div style="padding:10px 12px;border-top:1px solid rgba(20,33,61,.15);display:flex;gap:8px;align-items:center;flex-shrink:0;background:var(--bg2)">
        <label for="chat-img-upload" style="cursor:pointer;color:var(--t2);font-size:18px;flex-shrink:0">${icon('paperclip',17)}</label>
        <input type="file" id="chat-img-upload" accept="image/*" style="display:none" onchange="sendChatImageActive(this)">
        <input type="text" id="chat-input-main" placeholder="Napisz wiadomość..." style="flex:1;background:rgba(20,33,61,.08)!important;border:1px solid rgba(20,33,61,.25)!important;border-radius:10px!important;padding:9px 14px!important;font-size:13px!important;color:var(--t1)!important;outline:none!important;width:auto!important" onkeydown="if(event.key==='Enter'){event.preventDefault();sendChatMsgActive()}">
        <button class="btn btn-p" style="padding:8px 16px;flex-shrink:0" onclick="sendChatMsgActive()">Wyślij</button>
      </div>
    </div>
  </div>`;
}

function buildConvList(){
  return `<div id="conv-list-inner"><div style="padding:20px;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">ŁADOWANIE...</div></div>`;
}

async function initChatView(){
  const convs=await loadConversations();
  const inner=document.getElementById('conv-list-inner');
  if(!inner)return;
  if(!convs.length){inner.innerHTML=`<div style="padding:20px;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">BRAK KONWERSACJI</div>`;return;}
  // Get partner profiles
  const partnerIds=convs.map(c=>c.user1_id===currentUser.id?c.user2_id:c.user1_id);
  const{data:profiles}=await sb.from('profiles').select('user_id,nick').in('user_id',partnerIds);
  const profileMap={};(profiles||[]).forEach(p=>profileMap[p.user_id]=p.nick);
  // Pobierz liczbę nieprzeczytanych wiadomości per konwersacja
  const convIds=convs.map(c=>c.id);
  const{data:unreadMsgs}=await sb.from('messages').select('conversation_id').in('conversation_id',convIds).eq('read',false).neq('sender_id',currentUser.id);
  const unreadCountMap={};
  (unreadMsgs||[]).forEach(m=>{unreadCountMap[m.conversation_id]=(unreadCountMap[m.conversation_id]||0)+1;});
  inner.innerHTML=convs.map(c=>{
    const pid=c.user1_id===currentUser.id?c.user2_id:c.user1_id;
    const nick=escapeHtml(profileMap[pid]||'Użytkownik');
    const isActive=activeConvId===c.id;
    const unreadCount=unreadCountMap[c.id]||0;
    return `<div class="conv-item ${isActive?'active':''}" onclick="selectConv('${c.id}','${escJsAttr(profileMap[pid]||'Użytkownik')}')">
      <div class="chat-avatar" style="width:36px;height:36px;font-size:15px;flex-shrink:0">${nick[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--t1)">${nick}</div>
        <div style="font-size:10px;color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(c.last_message||'...')}</div>
      </div>
      ${unreadCount>0?`<div style="min-width:18px;height:18px;border-radius:9px;background:var(--a);color:var(--on-a,#fff);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0">${unreadCount>9?'9+':unreadCount}</div>`:''}
    </div>`;
  }).join('');
}

async function selectConv(convId,nick){
  activeConvId=convId;
  // Aktualizuj tylko nagłówek — NIE przebudowuj całego DOM
  const header=document.getElementById('chat-header-nick');
  if(header)header.textContent=nick||'—';
  const avatar=document.getElementById('chat-avatar-main');
  if(avatar)avatar.textContent=(nick||'?')[0].toUpperCase();
  const delBtn=document.getElementById('chat-del-conv-btn');
  if(delBtn)delBtn.style.display='flex';
  // Oznacz wiadomości jako przeczytane
  await sb.from('messages').update({read:true}).eq('conversation_id',convId).neq('sender_id',currentUser.id).eq('read',false);
  // Załaduj wiadomości
  await loadChatMessages(convId);
  // Oznacz aktywną konwersację w liście
  document.querySelectorAll('.conv-item').forEach(el=>el.classList.remove('active'));
  document.querySelector(`.conv-item[onclick*="${convId}"]`)?.classList.add('active');
  // Realtime
  const chName='conv-'+convId;
  try{sb.removeChannel(sb.channel(chName));}catch(e){}
  const ch=sb.channel(chName)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`conversation_id=eq.${convId}`},()=>{
      loadChatMessages(convId);
    }).subscribe();
  _rtSubs.push(ch);
}

async function deleteCurrentConv(){
  if(!activeConvId)return;
  if(!await customConfirm(db.lang==='pl'?'Usunąć tę konwersację? Zniknie tylko z Twojego widoku — druga osoba nadal będzie ją widzieć.':'Delete this conversation? It will only disappear from your view — the other person will still see it.'))return;
  const {data:conv}=await sb.from('conversations').select('user1_id,user2_id').eq('id',activeConvId).maybeSingle();
  if(conv){
    const myField=conv.user1_id===currentUser.id?'hidden_for_user1':'hidden_for_user2';
    await sb.from('conversations').update({[myField]:true}).eq('id',activeConvId);
  }
  const convId=activeConvId;
  activeConvId=null;
  toast(db.lang==='pl'?'Konwersacja usunięta':'Conversation deleted');
  const header=document.getElementById('chat-header-nick');
  if(header)header.textContent='—';
  const avatar=document.getElementById('chat-avatar-main');
  if(avatar)avatar.textContent='?';
  const delBtn=document.getElementById('chat-del-conv-btn');
  if(delBtn)delBtn.style.display='none';
  const chatArea=document.getElementById('chat-messages-area');
  if(chatArea)chatArea.innerHTML=`<div class="empty-state"><div class="empty-icon">${icon('messageCircle',44)}</div><div class="empty-text">${db.lang==='pl'?'WYBIERZ KONWERSACJĘ':'SELECT A CONVERSATION'}</div></div>`;
  initChatView();
}

async function sendChatMsgActive(){
  if(!activeConvId)return;
  const inp=document.getElementById('chat-input-main');
  if(!inp||!inp.value.trim())return;
  const content=inp.value.trim();
  inp.value='';
  inp.focus();
  await sendMessage(activeConvId,content);
  await loadChatMessages(activeConvId);
}

let _pendingChatImage=null;
function sendChatImageActive(inp){
  if(!activeConvId){toast(db.lang==='pl'?'Wybierz konwersację':'Select a conversation');inp.value='';return;}
  const file=inp.files[0];if(!file)return;
  _pendingChatImage=file;
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('modal-title').textContent=db.lang==='pl'?'Wysłać zdjęcie?':'Send photo?';
    document.getElementById('modal-body').innerHTML=`
    <div style="text-align:center">
      <img src="${e.target.result}" style="max-width:100%;max-height:50vh;border-radius:12px;margin-bottom:16px">
    </div>
    <div class="fx-c gap8" style="justify-content:flex-end">
      <button class="btn btn-g" onclick="_pendingChatImage=null;closeModal();document.getElementById('chat-img-upload').value=''">${T('cancel')}</button>
      <button class="btn btn-p" onclick="confirmSendChatImage()">${db.lang==='pl'?'Wyślij':'Send'}</button>
    </div>`;
    document.getElementById('modal-overlay').classList.add('open');
  };
  reader.readAsDataURL(file);
  inp.value='';
}

async function confirmSendChatImage(){
  if(!_pendingChatImage||!activeConvId)return;
  const file=_pendingChatImage;
  _pendingChatImage=null;
  closeModal();
  toast(db.lang==='pl'?'Wysyłanie...':'Sending...');
  const ext=file.name.split('.').pop()||'jpg';
  const path=`chat/${currentUser.id}/${Date.now()}.${ext}`;
  const{data,error}=await sb.storage.from('shirt-photos').upload(path,file,{upsert:true});
  if(error){toast(db.lang==='pl'?'Błąd uploadu':'Upload error');return;}
  const{data:{publicUrl}}=sb.storage.from('shirt-photos').getPublicUrl(path);
  await sendMessage(activeConvId,'',publicUrl);
  await loadChatMessages(activeConvId);
}

// ══════════════════════════════════════════════════════
// WISHLIST
// ══════════════════════════════════════════════════════
