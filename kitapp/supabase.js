// ============================================================
// supabase.js — Supabase client, global app state, generic
// helpers (toasts/modals/icons/formatting), navigation shell,
// and the notification system shared by every other module.
// Must load FIRST — every other file depends on globals
// defined here (sb, db, currentUser, toast, icon, T, ...).
// ============================================================

// ══════════════════════════════════════════════════════
// SUPABASE INIT
// ══════════════════════════════════════════════════════
const SUPABASE_URL = 'https://dqqmtzztwetayqyehqkk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcW10enp0d2V0YXlxeWVocWtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDU4MTIsImV4cCI6MjA5Njc4MTgxMn0.66cRmWRuuXEJH3roQklHprppJKW9A2xM7Sk0_4VoKoI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let currentUser = null;
let adminMode = false;
async function sbLoadData(){
  if(!currentUser)return;
  // Load user settings
  const {data:settings}=await sb.from('user_settings').select('*').eq('user_id',currentUser.id).maybeSingle();
  if(settings){
    db.lang=settings.lang||'pl';
    db.currency=settings.currency||'PLN';
    db.fx=settings.fx||DEF.fx;
    db.theme=settings.theme||'#14213d';
    db.themeRgb=settings.theme_rgb||'20,33,61';
    db.bgPreset=settings.bg_preset||'dark';
    // Reset legacy green theme for existing users
    if(db.theme==='#10b981'||db.theme==='#06b6d4'&&db.bgPreset==='pitch'){
      db.theme='#14213d';db.themeRgb='20,33,61';db.bgPreset='dark';db.bgCustom=null;
    }
    if(db.bgPreset==='pitch'&&!db.bgCustom){db.bgPreset='dark';}
    if(db.bgCustom&&(db.bgCustom.includes('2510')||db.bgCustom==='#0a0a0f')){db.bgCustom=null;}
    db.bgCustom=settings.bg_custom||null;
    db.rates=settings.rates||DEF.rates;
    db.profile=settings.profile||DEF.profile;
    db.tbColor=settings.tb_color||null;
    db.tbOpacity=settings.tb_opacity||92;
    db.tbBlur=settings.tb_blur!==false;
  }
  // Load shirts
  const {data:shirts}=await sb.from('shirts').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false});
  db.shirts=(shirts||[]).map(r=>({
    id:r.id, club:r.club, brand:r.brand, season:r.season, kind:r.kind, shirtType:r.shirt_type,
    size:r.size, condition:r.condition, personalization:r.personalization, patches:r.patches,
    styleCode:r.style_code, buyPrice:r.buy_price, marketValue:r.market_value, notes:r.notes,
    status:r.status, photos:r.photos||[], valueHistory:r.value_history||[], marketListed:r.market_listed||false,
    acceptsOffers:r.accepts_offers!==false, minOffer:r.min_offer||null, legitStatus:r.legit_status||null,
    created:r.created_at?new Date(r.created_at).toLocaleDateString('pl-PL'):''
  }));
  // Load collection history
  const {data:hist}=await sb.from('collection_history').select('*').eq('user_id',currentUser.id).order('date',{ascending:true});
  db.collectionHistory=(hist||[]).map(r=>({date:r.date,value:r.value}));
}

async function sbSaveSettings(){
  saveLocalCache();
  if(!currentUser)return;
  await sb.from('user_settings').upsert({
    user_id:currentUser.id,lang:db.lang,currency:db.currency,fx:db.fx,
    theme:db.theme,theme_rgb:db.themeRgb,bg_preset:db.bgPreset,bg_custom:db.bgCustom,
    rates:db.rates,profile:db.profile,
    tb_color:db.tbColor||null,tb_opacity:db.tbOpacity||92,tb_blur:db.tbBlur!==false
  },{onConflict:'user_id'});
}

const TR={
pl:{
  nav_dash:'Dashboard',nav_collection:'Kolekcja',nav_forsale:'Na Sprzedaż',
  nav_market:'Marketplace',nav_profile:'Profil',
  add_shirt:'Dodaj Koszulkę',edit_shirt:'Edytuj',save:'Zapisz',cancel:'Anuluj',delete:'Usuń',
  status_collection:'W Kolekcji',status_forsale:'Na Sprzedaż',status_listed:'Wystawiona',status_sold:'Sprzedana',
  filter_all:'Wszystkie',filter_col:'Kolekcja',filter_sale:'Na Sprzedaż',filter_listed:'Wystawione',
  f_club:'Klub / Reprezentacja',f_season:'Sezon',f_kind:'Rodzaj',f_type:'Typ Koszulki',
  f_size:'Rozmiar',f_cond:'Stan (1–10)',f_pers:'Personalizacja',f_patches:'Naszywki/Patche',
  f_code:'Style Code',f_buy:'Cena Zakupu (PLN)',f_mv:'Wartość Rynkowa (PLN)',f_notes:'Uwagi / Wady',
  f_photos:'Zdjęcia (max 8)',f_status:'Status',f_brand:'Marka',
  kind_home:'Domowa',kind_away:'Wyjazdowa',kind_third:'Trzecia',kind_special:'Specjalna',kind_other:'Inna – wpisz własną',
  type_rep:'Replica',type_pi:'Player Issue',type_mw:'Matchworn',type_other:'Inna – wpisz własną',
  size_other:'Inny – wpisz własny',
  patches_yes:'Tak – oryginalne',patches_no:'Nie / Brak',patches_unk:'Nieznane',
  cond_lbl:'Stan',pdf:'Eksport PDF',
  collage:'Generator Kolażu',post:'Generator Ogłoszenia',copy:'Kopiuj',
  sel4:'Zaznacz dokładnie 4 zdjęcia',gen_collage:'Generuj Kolaż 2×2',dl_collage:'Pobierz Kolaż',
  empty_col:'Kolekcja jest pusta. Dodaj pierwszą koszulkę!',empty_sale:'Brak koszulek na sprzedaż.',
  saved:'Zapisano!',deleted:'Usunięto!',copied:'Skopiowano!',confirm_del:'Usunąć tę koszulkę?',
  val_hist:'Historia Wartości',total_val:'Wartość Rynkowa',invested:'Zainwestowano',profit:'Zysk/Strata',
  top_club:'Ulubiony Klub',top_season:'Top Sezon',
  mkt_title:'Publiczny Marketplace',mkt_sub:'Koszulki wystawione przez kolekcjonerów',
  mkt_empty:'Nikt jeszcze nic nie wystawił — bądź pierwszy!',
  mkt_list:'Wystaw na Marketplace',mkt_remove:'Zdejmij z Marketplace',
  mkt_contact:'Kontakt',mkt_seller:'Sprzedający',
  profile_title:'Mój Profil',profile_name:'Nazwa Profilu',profile_bio:'Opis / Bio',
  profile_save:'Zapisz Profil',profile_public:'Widoczność na Marketplace',
  profile_shared:'Profil jest publiczny',profile_private:'Profil jest prywatny',
  browse_profiles:'Przeglądaj Profile',profile_collection:'Kolekcja publiczna',
  your_nick:'Twój nick',
},
en:{
  nav_dash:'Dashboard',nav_collection:'Collection',nav_forsale:'For Sale',
  nav_market:'Marketplace',nav_profile:'Profile',
  add_shirt:'Add Jersey',edit_shirt:'Edit',save:'Save',cancel:'Cancel',delete:'Delete',
  status_collection:'In Collection',status_forsale:'For Sale',status_listed:'Listed',status_sold:'Sold',
  filter_all:'All',filter_col:'Collection',filter_sale:'For Sale',filter_listed:'Listed',
  f_club:'Club / National Team',f_season:'Season',f_kind:'Kit Type',f_type:'Jersey Type',
  f_size:'Size',f_cond:'Condition (1–10)',f_pers:'Personalization',f_patches:'Patches/Badges',
  f_code:'Style Code',f_buy:'Purchase Price (PLN)',f_mv:'Market Value (PLN)',f_notes:'Notes / Flaws',
  f_photos:'Photos (max 8)',f_status:'Status',f_brand:'Brand',
  kind_home:'Home',kind_away:'Away',kind_third:'Third',kind_special:'Special',kind_other:'Other – custom',
  type_rep:'Replica',type_pi:'Player Issue',type_mw:'Matchworn',type_other:'Other – custom',
  size_other:'Other – custom',
  patches_yes:'Yes – original',patches_no:'No / None',patches_unk:'Unknown',
  cond_lbl:'Condition',pdf:'Export PDF',
  collage:'Collage Generator',post:'Post Generator',copy:'Copy',
  sel4:'Select exactly 4 photos',gen_collage:'Generate 2×2 Collage',dl_collage:'Download Collage',
  empty_col:'Collection is empty. Add your first jersey!',empty_sale:'No jerseys for sale.',
  saved:'Saved!',deleted:'Deleted!',copied:'Copied!',confirm_del:'Delete this jersey?',
  val_hist:'Value History',total_val:'Market Value',invested:'Invested',profit:'Profit/Loss',
  top_club:'Favorite Club',top_season:'Top Season',
  mkt_title:'Public Marketplace',mkt_sub:'Jerseys listed by collectors',
  mkt_empty:'Nobody listed anything yet — be the first!',
  mkt_list:'List on Marketplace',mkt_remove:'Remove from Marketplace',
  mkt_contact:'Contact',mkt_seller:'Seller',
  profile_title:'My Profile',profile_name:'Profile Name',profile_bio:'Description / Bio',
  profile_save:'Save Profile',profile_public:'Marketplace Visibility',
  profile_shared:'Profile is public',profile_private:'Profile is private',
  browse_profiles:'Browse Profiles',profile_collection:'Public Collection',
  your_nick:'Your nickname',
}};
const T=k=>(TR[db?.lang||'pl']||TR.pl)[k]||k;

// ══════════════════════════════════════════════════════
// DATABASE (in-memory, synced to Supabase)
// ══════════════════════════════════════════════════════
const DEF={lang:'pl',currency:'PLN',fx:{scanlines:false,sound:false},
  theme:'#14213d',themeRgb:'20,33,61',bgPreset:'dark',bgCustom:null,
  rates:{EUR:4.30,GBP:5.10,USD:4.00},shirts:[],collectionHistory:[],
  profile:{name:'',bio:'',public:false,nick:''}};

// Laduj z localStorage jako szybki cache (dziala natychmiast po F5)
function loadLocalCache(){
  try{
    const raw=localStorage.getItem('fvault_cache');
    if(raw){
      const d=JSON.parse(raw);
      // Reset legacy green theme
      if(d.theme==='#10b981'){d.theme='#14213d';d.themeRgb='20,33,61';}
      if(d.bgPreset==='pitch')d.bgPreset='dark';
      if(d.bgCustom&&(d.bgCustom==='#0a0a0f'||d.bgCustom==='#08090c'))d.bgCustom=null;
      return d;
    }
  }catch(e){}
  return null;
}
function saveLocalCache(){
  try{ localStorage.setItem('fvault_cache', JSON.stringify(db)); }catch(e){}
}

const _cached = loadLocalCache();
let db = _cached ? _cached : JSON.parse(JSON.stringify(DEF));

function qsave(){sbSaveSettings();updateTaskbar();}
function save(){qsave();rerenderOpen();}

// ══════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════
const CLUBS=['FC Barcelona','Real Madrid','Atletico Madrid','Sevilla','Valencia','Villarreal','Real Sociedad',
  'Manchester City','Manchester United','Liverpool','Chelsea','Arsenal','Tottenham','Everton','West Ham',
  'Newcastle United','Aston Villa','Leicester City','Leeds United','Fulham',
  'Bayern München','Borussia Dortmund','RB Leipzig','Bayer Leverkusen',"Borussia M'gladbach",
  'Paris Saint-Germain','Olympique Lyon','Marseille','Monaco','Nice','Lens',
  'Juventus','AC Milan','Inter Milan','AS Roma','Napoli','Lazio','Atalanta','Fiorentina',
  'Ajax Amsterdam','Feyenoord','PSV Eindhoven','AZ Alkmaar',
  'Benfica','Porto','Sporting CP',
  'Galatasaray','Fenerbahçe','Beşiktaş','Trabzonspor',
  'Celtic','Rangers',
  'Boca Juniors','River Plate','Flamengo','Palmeiras','Santos',
  'Polska 🇵🇱','Niemcy 🇩🇪','Francja 🇫🇷','Brazylia 🇧🇷','Argentyna 🇦🇷',
  'Anglia 🏴󠁧󠁢󠁥󠁮󠁧󠁿','Hiszpania 🇪🇸','Włochy 🇮🇹','Holandia 🇳🇱','Portugalia 🇵🇹',
  'Chorwacja 🇭🇷','Belgia 🇧🇪','Maroko 🇲🇦','Senegal 🇸🇳','USA 🇺🇸','Japonia 🇯🇵','Korea Płd 🇰🇷',
  '⚽ Inna / Własna'];
const BRANDS=['Nike','Adidas','Puma','Umbro','Hummel','Kappa','Lotto','New Balance','Joma','Errea','Under Armour','Le Coq Sportif','Castore','Altra / Własna'];
const SIZES=['XS','S','M','L','XL','XXL','3XL','4XL','XXS','Kids XS','Kids S','Kids M','Kids L','Kids XL'];
const CURR_SYM={PLN:'zł',EUR:'€',GBP:'£',USD:'$'};

function fmt(n,cur){const c=cur||db.currency||'PLN';const s=CURR_SYM[c]||c;return n.toLocaleString('pl-PL',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+s;}
function toPLN(v){return parseFloat(v)||0;}
function toDisp(pln){const c=db.currency||'PLN';if(c==='PLN')return pln;const r=db.rates||{EUR:4.30,GBP:5.10,USD:4.00};return pln/(r[c]||1);}

// ══════════════════════════════════════════════════════
// FX
// ══════════════════════════════════════════════════════
let _ac=null;
function beep(){/* Sound FX usunięte */return;}
function chime(){[440,550,660].forEach((f,i)=>setTimeout(()=>beep(f,.12,.04),i*80));}
let _toast=null;
function escapeHtml(str){
  if(str==null)return'';
  return String(str).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
// Do wartości wstawianych jako argument JS wewnątrz onclick="fn('...')" —
// ucieka i backslash/cudzysłów-pojedynczy (żeby nie wyrwać się ze stringa JS)
// i znaki HTML (bo to nadal siedzi w atrybucie HTML).
function escJsAttr(str){
  if(str==null)return'';
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function toast(msg){if(_toast){_toast.remove();_toast=null;}const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);_toast=el;setTimeout(()=>{if(_toast){_toast.style.opacity='0';_toast.style.transform='translateY(4px)';setTimeout(()=>{_toast&&_toast.remove();_toast=null;},280);}},2200);}
function customConfirm(message){
  return new Promise(resolve=>{
    document.getElementById('modal-title').textContent=db.lang==='pl'?'Potwierdź':'Confirm';
    document.getElementById('modal-body').innerHTML=`
      <p style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:18px">${message}</p>
      <div class="fx-c gap8" style="justify-content:flex-end">
        <button class="btn btn-g" id="confirm-no-btn">${db.lang==='pl'?'Anuluj':'Cancel'}</button>
        <button class="btn btn-d" id="confirm-yes-btn">${db.lang==='pl'?'Potwierdź':'Confirm'}</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
    const cleanup=(result)=>{
      document.getElementById('confirm-yes-btn').onclick=null;
      document.getElementById('confirm-no-btn').onclick=null;
      closeModal();
      resolve(result);
    };
    document.getElementById('confirm-yes-btn').onclick=()=>cleanup(true);
    document.getElementById('confirm-no-btn').onclick=()=>cleanup(false);
  });
}
function applyFX(){const sl=document.getElementById('sl');if(sl)sl.style.opacity=db.fx.scanlines?'1':'0';}
function tglFX(name){if(!db.fx)db.fx={};db.fx[name]=!db.fx[name];qsave();if(settingsOpen)renderSP();}
function applyTaskbar(){
  const tb=document.getElementById('topbar');if(!tb)return;
  const col=db.tbColor||'';
  const op=db.tbOpacity!==undefined?db.tbOpacity:100;
  const blur=db.tbBlur!==false;
  if(col){
    const r=parseInt(col.slice(1,3),16),g=parseInt(col.slice(3,5),16),b=parseInt(col.slice(5,7),16);
    tb.style.background=`rgba(${r},${g},${b},${op/100})`;
  } else {
    tb.style.background='';
  }
  tb.style.backdropFilter=blur?'blur(20px)':'none';
  tb.style.webkitBackdropFilter=blur?'blur(20px)':'none';
}
const DPL=['Nd','Pon','Wt','Śr','Czw','Pt','Sob'];
setInterval(()=>{const d=new Date(),h=d.getHours().toString().padStart(2,'0'),m=d.getMinutes().toString().padStart(2,'0'),s=d.getSeconds().toString().padStart(2,'0'),D=db.lang==='pl'?DPL:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const et=document.getElementById('tb-clock-time'),ed=document.getElementById('tb-clock-date');if(et)et.textContent=`${h}:${m}:${s}`;if(ed)ed.textContent=`${D[d.getDay()]} ${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}`;},1000);

// ══════════════════════════════════════════════════════
// THEME — zablokowany na stałą markę (biel + granat), bez customizacji przez użytkownika
// ══════════════════════════════════════════════════════
function applyTheme(){
  const r=document.documentElement.style;
  r.setProperty('--a','#14213d');
  r.setProperty('--a-rgb','20,33,61');
  r.setProperty('--on-a','#fff');
}
function setLang(l){db.lang=l;qsave();toast(l==='pl'?'Polski':'English');rerenderOpen();if(settingsOpen)renderSP();}
function setCurr(c){db.currency=c;qsave();updateTaskbar();rerenderOpen();if(settingsOpen)renderSP();}

function updateTaskbar(){const ss=db.shirts||[];const total=ss.reduce((a,s)=>a+toPLN(s.marketValue||s.buyPrice),0);const ev=document.getElementById('tb-value');const ec=document.getElementById('tb-count');if(ev)ev.textContent=fmt(toDisp(total));if(ec)ec.textContent=`${ss.length} ${db.lang==='pl'?'koszulek':'jerseys'}`;}

// ══════════════════════════════════════════════════════
// WINDOW MANAGER
// ══════════════════════════════════════════════════════
const APPS=[
  {id:'dash',     lpl:'Dashboard',   len:'Dashboard',  icon:'dash',  group:'Ogólne'},
  {id:'collection',lpl:'Kolekcja',   len:'Collection', icon:'shirt', group:'Moja kolekcja'},
  {id:'forsale',  lpl:'Na Sprzedaż', len:'For Sale',   icon:'tag',   group:'Moja kolekcja'},
  {id:'market',   lpl:'Marketplace', len:'Marketplace',icon:'mkt',   group:'Handel'},
  {id:'auctions', lpl:'Licytacje',   len:'Auctions',   icon:'auc',   group:'Handel'},
  {id:'wishlist', lpl:'Wishlist',    len:'Wishlist',   icon:'wish',  group:'Handel'},
  {id:'legitcheck',lpl:'LegitCheck', len:'LegitCheck', icon:'shieldCheck', group:'Konto'},
  {id:'chat',     lpl:'Czat',        len:'Chat',       icon:'chat',  group:'Konto'},
  {id:'profile',  lpl:'Profil',      len:'Profile',    icon:'user',  group:'Konto'},
];
const WICO={
  dash:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  shirt:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/></svg>`,
  tag:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  mkt:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.97-1.67L23 6H6"/></svg>`,
  auc:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14.5 10.5l-8 8a2.12 2.12 0 01-3-3l8-8"/><path d="M15.5 5.5l3 3"/><path d="M20 9l-9 9"/><path d="M7 4l3 3"/></svg>`,
  chat:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  wish:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`,
  user:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  shieldCheck:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  bell:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
};

// ══════════════════════════════════════════════════════
// IKONY — pełny zestaw, jeden spójny styl (line, 1.5–2px stroke)
// Użycie: icon('nazwa', rozmiarPx, dodatkoweKlasy)
// ══════════════════════════════════════════════════════
const ICONS={
  heart:`<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>`,
  heartFilled:`<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="currentColor"/>`,
  alertTriangle:`<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  x:`<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
  messageCircle:`<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>`,
  check:`<polyline points="20 6 9 17 4 12"/>`,
  checkCircle:`<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
  zap:`<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
  search:`<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
  tag2:`<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`,
  trophy:`<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/><path d="M5 4H3v2a4 4 0 004 4M19 4h2v2a4 4 0 01-4 4"/>`,
  ruler:`<path d="M21.3 8.7L8.7 21.3a1 1 0 01-1.4 0l-4.6-4.6a1 1 0 010-1.4L15.3 2.7a1 1 0 011.4 0l4.6 4.6a1 1 0 010 1.4z"/><line x1="14.5" y1="5.5" x2="18.5" y2="9.5"/><line x1="11.5" y1="8.5" x2="13.5" y2="10.5"/><line x1="8.5" y1="11.5" x2="10.5" y2="13.5"/><line x1="5.5" y1="14.5" x2="7.5" y2="16.5"/>`,
  banknote:`<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="6" y1="10" x2="6" y2="10.01"/><line x1="18" y1="14" x2="18" y2="14.01"/>`,
  trash:`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>`,
  globe:`<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>`,
  cart:`<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.97-1.67L23 6H6"/>`,
  camera:`<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>`,
  logout:`<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>`,
  eye:`<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`,
  paperclip:`<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>`,
  pencil:`<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
  users:`<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>`,
  calendar:`<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
  flame:`<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>`,
  award:`<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>`,
  key:`<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>`,
  package:`<path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>`,
  image:`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`,
  bellRing:`<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/><path d="M2 8a10 10 0 0118.3-5.7M22 8a10 10 0 00-2.3-5.7" opacity=".5"/>`,
  ban:`<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>`,
  user2:`<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  volumeX:`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`,
  send:`<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>`,
  shieldCheck:`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>`,
  edit3:`<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>`,
  clock:`<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>`,
};

function icon(name,size=16,extraStyle=''){
  const body=ICONS[name];
  if(!body)return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;${extraStyle}">${body}</svg>`;
}
let activeSection=null;
function appLabel(app){return db.lang==='en'?app.len:app.lpl;}
function isOpen(id){return activeSection===id;}

function isMobile(){return window.matchMedia('(max-width: 900px)').matches||('ontouchstart' in window&&window.matchMedia('(pointer: coarse)').matches);}

function switchSection(id){
  const app=APPS.find(a=>a.id===id);if(!app)return;
  activeSection=id;
  const inner=document.getElementById('content-inner');
  if(inner)inner.innerHTML=buildContent(id);
  renderSidebarNav();
  renderBottomNav();
  if(isMobile())closeMobileSidebar();
  const panel=document.getElementById('content-panel');
  if(panel)panel.scrollTop=0;
  if(_postOpen[id])_postOpen[id]();
}
function renderBottomNav(){
  document.querySelectorAll('.bn-item[data-section]').forEach(el=>{
    el.classList.toggle('active',el.getAttribute('data-section')===activeSection);
  });
}
// Zachowana nazwa dla wstecznej kompatybilności wywołań w kodzie
function openApp(id){switchSection(id);}

function rerenderOpen(){
  if(!activeSection)return;
  // NIE przebudowuj czatu — zniszczyłoby input w trakcie pisania
  if(activeSection==='chat'){updateTaskbar();applyFX();return;}
  const inner=document.getElementById('content-inner');
  if(inner)inner.innerHTML=buildContent(activeSection);
  if(_postOpen[activeSection])_postOpen[activeSection]();
  updateTaskbar();applyFX();
}

function renderSidebarNav(){
  const el=document.getElementById('sidebar-nav');
  if(!el)return;
  const groups=[];
  APPS.forEach(app=>{
    let g=groups.find(x=>x.name===app.group);
    if(!g){g={name:app.group,apps:[]};groups.push(g);}
    g.apps.push(app);
  });
  el.innerHTML=groups.map(g=>`
    <div class="sb-group-label">${g.name}</div>
    ${g.apps.map(app=>`
      <div class="sb-item ${activeSection===app.id?'active':''}" onclick="switchSection('${app.id}')">
        ${WICO[app.icon]||''}
        <span class="sb-item-label">${appLabel(app)}</span>
        ${app.id==='chat'?'<span class="sb-item-badge" id="sb-chat-badge" style="display:none">0</span>':''}
      </div>`).join('')}
  `).join('');
}

function toggleMobileSidebar(){
  const sb=document.getElementById('sidebar');
  const scrim=document.getElementById('sidebar-scrim');
  if(!sb)return;
  const willOpen=!sb.classList.contains('mobile-open');
  sb.classList.toggle('mobile-open',willOpen);
  if(scrim)scrim.classList.toggle('show',willOpen);
}
function closeMobileSidebar(){
  const sb=document.getElementById('sidebar');
  const scrim=document.getElementById('sidebar-scrim');
  if(sb)sb.classList.remove('mobile-open');
  if(scrim)scrim.classList.remove('show');
}

function handleGlobalSearch(val){
  clearTimeout(window._gsTimer);
  window._gsTimer=setTimeout(()=>{
    if(!val||!val.trim())return;
    switchSection('collection');
    setTimeout(()=>{
      sF.search=val;
      const inp=document.getElementById('sh-search');
      if(inp)inp.value=val;
      renderGrid();
    },60);
  },350);
}
// Alias wsteczny — sidebar zastąpił ikony pulpitu
function renderDesktopIcons(){renderSidebarNav();}

// ══════════════════════════════════════════════════════
// CONTENT BUILDER
// ══════════════════════════════════════════════════════
function buildContent(id){switch(id){case 'dash':return bDash();case 'collection':return bCollection();case 'forsale':return bForSale();case 'market':return bMarket();case 'auctions':return bAuctions();case 'chat':return bChat();case 'wishlist':return bWishlist();case 'legitcheck':return bLegitCheck();case 'profile':return bProfile();default:return '';}}

// Post-open hooks for async content
const _postOpen={
  dash:()=>setTimeout(()=>loadDashActivityStats(),50),
  market:()=>setTimeout(()=>loadMarketplace(),50),
  auctions:()=>setTimeout(()=>initAuctionsView(),50),
  chat:()=>setTimeout(()=>initChatView(),50),
  wishlist:()=>setTimeout(()=>initWishlistView(),50),
  legitcheck:()=>setTimeout(()=>initLegitCheckView(),50),
};

// ── HELPERS ──
function statusLabel(s){return {collection:T('status_collection'),forsale:T('status_forsale'),listed:T('status_listed'),sold:T('status_sold')}[s]||s;}
function kindLabel(k){return {home:T('kind_home'),away:T('kind_away'),third:T('kind_third'),special:T('kind_special')}[k]||k||'';}
function typeLabel(t){return {replica:'Replica',player:'Player Issue',matchworn:'Matchworn'}[t]||t||'';}
function condColor(c){const n=parseInt(c);if(!n)return 'var(--t2)';if(n>=9)return 'var(--a)';if(n>=7)return 'var(--a)';if(n>=5)return 'var(--gold)';return 'var(--red)';}

// ── DASHBOARD ──
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');editId=null;editPhotos=[];editPhotoFiles=[];}
// keydown handled above in auth modal section

// ══════════════════════════════════════════════════════
// REALTIME SUBSCRIPTIONS
// ══════════════════════════════════════════════════════
let _rtSubs=[];
function initRealtimeSubscriptions(){
  _rtSubs.forEach(s=>{try{sb.removeChannel(s);}catch(e){}});
  _rtSubs=[];
  if(!currentUser)return;
  // Notifications
  const notifCh=sb.channel('notifications-'+currentUser.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${currentUser.id}`},payload=>{
      if(payload.new)handleNewNotification(payload.new);
    }).subscribe();
  _rtSubs.push(notifCh);
  // Messages
  const msgCh=sb.channel('messages-'+currentUser.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{
      if(payload.new)handleNewMessage(payload.new);
    }).subscribe();
  _rtSubs.push(msgCh);
  // Auctions - bids
  const bidCh=sb.channel('bids-global')
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'bids'},payload=>{
      if(payload.new)handleNewBid(payload.new);
    }).subscribe();
  _rtSubs.push(bidCh);
}

// ══════════════════════════════════════════════════════
// NOTIFICATIONS SYSTEM
// ══════════════════════════════════════════════════════
let unreadNotifs=0;
async function loadNotifications(){
  if(!currentUser)return[];
  const{data}=await sb.from('notifications').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(50);
  return data||[];
}
async function createNotification(userId,type,title,body,link=''){
  if(!userId)return;
  await sb.from('notifications').insert({user_id:userId,type,title,body,link,read:false});
}
function handleNewNotification(n){
  unreadNotifs++;
  updateNotifBadge();
  toast(n.title);
  // refresh notif panel if open
  const panel=document.getElementById('notif-panel');
  if(panel&&panel.classList.contains('open'))renderNotifPanel();
}
function updateNotifBadge(){
  const b=document.getElementById('tb-notif-badge');
  if(b){b.textContent=unreadNotifs>9?'9+':unreadNotifs;b.style.display=unreadNotifs>0?'flex':'none';}
}
async function toggleNotifPanel(){
  const panel=document.getElementById('notif-panel');
  if(!panel)return;
  const isOpen=panel.classList.contains('open');
  panel.classList.toggle('open',!isOpen);
  if(!isOpen){
    await renderNotifPanel();
    // mark all read
    unreadNotifs=0;updateNotifBadge();
    await sb.from('notifications').update({read:true}).eq('user_id',currentUser.id).eq('read',false);
  }
}
async function renderNotifPanel(){
  const el=document.getElementById('notif-list');
  if(!el)return;
  el.innerHTML=`<div style="padding:20px;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">ŁADOWANIE...</div>`;
  const notifs=await loadNotifications();
  if(!notifs.length){el.innerHTML=`<div style="padding:30px;text-align:center;font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--t3);letter-spacing:.1em">BRAK POWIADOMIEŃ</div>`;return;}
  el.innerHTML=notifs.map(n=>{
    const iconMap={bid:'zap',outbid:'alertTriangle',won:'trophy',msg:'messageCircle',wishlist:'heart',verified:'checkCircle',watcher:'eye',sale:'tag2',cancelled:'ban',question:'messageCircle'};
    const colorMap={bid:'#f59e0b',outbid:'#f43f5e',won:'#f59e0b',msg:'#3b82f6',wishlist:'#14213d',verified:'var(--a)',watcher:'#14213d',sale:'#8b5cf6',cancelled:'#f43f5e',question:'#3b82f6'};
    const nType=iconMap[n.type]?n.type:'default';
    const iconName=iconMap[n.type]||'bellRing';
    const iconColor=colorMap[n.type]||'var(--a)';
    return `
  <div class="notif-item ${n.read?'':'unread'}" onclick="notifClick('${n.link||''}')">
    <div class="notif-ico" style="color:${iconColor}">${icon(iconName,18)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:600;color:var(--t1);margin-bottom:2px">${escapeHtml(n.title||'')}</div>
      <div style="font-size:10px;color:var(--t2);line-height:1.4">${escapeHtml(n.body||'')}</div>
      <div style="font-size:8px;font-family:'JetBrains Mono',monospace;color:var(--t3);margin-top:4px">${n.created_at?new Date(n.created_at).toLocaleString('pl-PL'):''}</div>
    </div>
    ${!n.read?`<div style="width:7px;height:7px;border-radius:50%;background:var(--a);flex-shrink:0;box-shadow:0 0 6px rgba(var(--a-rgb),.7)"></div>`:''}
  </div>`;
  }).join('');
}
function notifClick(link){
  if(!link)return;
  if(link.startsWith('auction:'))openAuctionById(link.split(':')[1]);
  else if(link==='auctions')openApp('auctions');
  else if(link.startsWith('chat:'))openChatWith(link.split(':')[1]);
  else if(link.startsWith('market'))openApp('market');
  else if(link==='wishlist')openApp('wishlist');
}

// ══════════════════════════════════════════════════════
// CHAT SYSTEM
// ══════════════════════════════════════════════════════
function customPrompt(message){
  return new Promise(resolve=>{
    document.getElementById('modal-title').textContent=db.lang==='pl'?'Podaj informację':'Enter info';
    document.getElementById('modal-body').innerHTML=`
      <p style="font-size:13px;color:var(--t2);line-height:1.6;margin-bottom:10px">${message}</p>
      <input class="form-input" id="custom-prompt-input" style="margin-bottom:18px">
      <div class="fx-c gap8" style="justify-content:flex-end">
        <button class="btn btn-g" id="prompt-no-btn">${db.lang==='pl'?'Anuluj':'Cancel'}</button>
        <button class="btn btn-p" id="prompt-yes-btn">${db.lang==='pl'?'Potwierdź':'Confirm'}</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
    document.getElementById('custom-prompt-input').focus();
    const cleanup=(result)=>{
      document.getElementById('prompt-yes-btn').onclick=null;
      document.getElementById('prompt-no-btn').onclick=null;
      closeModal();
      resolve(result);
    };
    document.getElementById('prompt-yes-btn').onclick=()=>cleanup(document.getElementById('custom-prompt-input').value.trim());
    document.getElementById('prompt-no-btn').onclick=()=>cleanup(null);
  });
}
