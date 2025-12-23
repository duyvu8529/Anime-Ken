/* ===== Keys & config ===== */
const COIN_KEY = "user_coin_v1";
const USED_CODES_KEY = "used_codes_v1";
/* purchased codes stored as objects: [{code:'VIP-...-...', durationMinutes:60}, ...] */
const PURCHASED_CODES_KEY = "purchased_codes_v1";
const VIP_KEY = "vip_code_v1";
const VIP_COST = 100;

/* Menu keys */
const MENU_FAV_KEY = "menu_favorites_v1";
const MENU_HIST_KEY = "menu_history_v1";
const MENU_FOLLOW_KEY = "menu_follow_v1";

/* Helpers: coins & vip */
function getCoin(){ return parseInt(localStorage.getItem(COIN_KEY)||"0",10); }
function setCoin(v){ localStorage.setItem(COIN_KEY,String(v)); updateCoinUI(); }
function addCoin(x){ setCoin(getCoin()+Number(x||0)); }
function updateCoinUI(){ const el=document.getElementById("coinValue"); if(el) el.innerText = getCoin(); }

function getVipObj(){ try{return JSON.parse(localStorage.getItem(VIP_KEY)||"null"); }catch(e){return null;} }
function hasVip(){ const v=getVipObj(); if(!v) return false; if(Date.now() > (v.expire||0)){ localStorage.removeItem(VIP_KEY); return false; } return true; }
function vipRemainingMs(){ const v=getVipObj(); if(!v) return 0; return Math.max(0, (v.expire||0) - Date.now()); }
function formatRemain(ms){ if(ms<=0) return "đã hết"; const m=Math.floor(ms/60000); const s=Math.floor((ms%60000)/1000); return `${m} phút ${s} giây`; }

/* --- purchased-codes helpers (store objects) --- */
function getPurchasedCodes(){
  try{
    const raw = JSON.parse(localStorage.getItem(PURCHASED_CODES_KEY) || "[]");
    return raw.map(item => {
      if(!item) return null;
      if(typeof item === 'string') return { code: item, durationMinutes: 60 };
      if(item.code) return { code: item.code, durationMinutes: item.durationMinutes || 60 };
      return null;
    }).filter(Boolean);
  }catch(e){ return []; }
}
function addPurchasedCode(code, durationMinutes = 60){
  if(!code) return;
  const arr = getPurchasedCodes();
  if(!arr.find(x=>x.code===code)) {
    arr.push({ code, durationMinutes: Number(durationMinutes) || 60 });
    localStorage.setItem(PURCHASED_CODES_KEY, JSON.stringify(arr));
    localStorage.setItem('purchased_update_ts', String(Date.now()));
  }
}
function removePurchasedCode(code){
  let arr = getPurchasedCodes();
  arr = arr.filter(c => c.code !== code);
  localStorage.setItem(PURCHASED_CODES_KEY, JSON.stringify(arr));
  localStorage.setItem('purchased_update_ts', String(Date.now()));
}

/* used codes */
function getUsedCodes(){ try{return JSON.parse(localStorage.getItem(USED_CODES_KEY)||"[]"); }catch(e){return [];} }
function markCodeUsed(code){ const used=getUsedCodes(); if(!used.includes(code)) used.push(code); localStorage.setItem(USED_CODES_KEY, JSON.stringify(used)); }

/* --- code generator --- */
function randomSegment(len){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const out = [];
  const rnd = new Uint32Array(len);
  window.crypto.getRandomValues(rnd);
  for(let i=0;i<len;i++){
    out.push(chars[rnd[i] % chars.length]);
  }
  return out.join('');
}
function generateVipCode(){ return `VIP-${randomSegment(4)}-${randomSegment(4)}`; }

/* ----- Menu arrays helpers ----- */
function _readMenuArr(k){ try{ return JSON.parse(localStorage.getItem(k) || "[]"); }catch(e){ return []; } }
function _writeMenuArr(k, arr){ localStorage.setItem(k, JSON.stringify(arr)); }

/* Expose helpers for other pages */
window.addFavorite = function(id){
  if(!id) return;
  const arr = _readMenuArr(MENU_FAV_KEY);
  if(!arr.includes(id)){ arr.push(id); _writeMenuArr(MENU_FAV_KEY, arr); localStorage.setItem('menu_fav_update_ts', Date.now()); refreshMenuBadges(); }
};
window.removeFavorite = function(id){
  let arr = _readMenuArr(MENU_FAV_KEY);
  arr = arr.filter(x => x !== id);
  _writeMenuArr(MENU_FAV_KEY, arr);
  localStorage.setItem('menu_fav_update_ts', Date.now());
  refreshMenuBadges();
};
window.addHistory = function(obj){
  if(!obj || !obj.id) return;
  let arr = _readMenuArr(MENU_HIST_KEY).filter(x=>x.id !== obj.id);
  arr.unshift({id: obj.id, title: obj.title||"", ts: Date.now()});
  _writeMenuArr(MENU_HIST_KEY, arr.slice(0,200));
  localStorage.setItem('menu_hist_update_ts', Date.now());
  refreshMenuBadges();
};
window.toggleFollow = function(id){
  if(!id) return;
  let arr = _readMenuArr(MENU_FOLLOW_KEY);
  if(arr.includes(id)){ arr = arr.filter(x=>x!==id); _writeMenuArr(MENU_FOLLOW_KEY,arr); localStorage.setItem('menu_follow_update_ts', Date.now()); }
  else { arr.push(id); _writeMenuArr(MENU_FOLLOW_KEY,arr); localStorage.setItem('menu_follow_update_ts', Date.now()); }
  refreshMenuBadges();
};

/* ---------- Load data.json and build animeList ---------- */
let GLOBAL_DB = null;
let animeList = []; // will be array of {id,title,img,genre,rating,uploadISO,vip}

function loadDataJsonAndInit(){
  fetch("data.json")
    .then(r => { if(!r.ok) throw new Error("Cannot load data.json"); return r.json(); })
    .then(db => {
      GLOBAL_DB = db || {};
      animeList = Object.keys(GLOBAL_DB).map(k => {
        const o = GLOBAL_DB[k] || {};
        return {
          id: o.id || k,
          title: o.title || "",
          img: (o.poster || o.img || "").replace(/^\//,''), // keep relative path (remove leading slash)
          genre: o.genre || [],
          rating: o.score || o.rating || 0,
          uploadISO: o.uploadISO || "",
          vip: !!o.vip
        };
      });
      // if poster paths in JSON start with '/', they may still work; we removed leading slash to match earlier code's paths
      updateList();
    })
    .catch(err => {
      console.warn("data.json load failed:", err);
      // fallback: no data -> empty list
      animeList = [];
      updateList();
    });
}

/* Render grid */
function formatDateISO(iso){ try{ const d=new Date(iso); if(isNaN(d)) return iso; const dd=String(d.getDate()).padStart(2,'0'); const mm=String(d.getMonth()+1).padStart(2,'0'); return `${dd}/${mm}/${d.getFullYear()}`;}catch(e){return iso;} }
function getAnimeById(id){ return animeList.find(a=>a.id===id) || null; }

let activeSection = null;

function renderAnime(list){
  const grid=document.getElementById("animeGrid"); grid.innerHTML="";
  if(!list || !list.length){
    grid.innerHTML = `<div style="padding:18px;border-radius:8px;background:#fff;color:#444">Không có anime để hiển thị.</div>`;
    return;
  }
  list.forEach(a=>{
    const showLocked = a.vip && !hasVip();
    const n=document.createElement("div");
    n.className = "anime-item" + (showLocked ? " locked" : "");
    n.addEventListener("click", ()=>{
      if(showLocked){
        showVipRequiredModal(a);
      } else {
        // navigate to watch in same folder (no /anime/ prefix)
        // we expect watch.html to read data.json by id
        location.href = `watch.html?id=${encodeURIComponent(a.id)}`;
      }
    });
    // prefer using poster path from data.json: if it's absolute (starts with http) use directly, else keep as given
    const imgSrc = a.img || '';
    let inner = `<img src="${imgSrc}" alt="${a.title}" loading="lazy" />`;
    if(a.vip){ inner += `<div class="vip-badge">👑 VIP</div>`; if(showLocked){ inner += `<div class="lock-overlay"></div>`; }}
    inner += `<div class="anime-body"><div class="anime-title">${a.title}</div><div class="anime-date">Cập nhật: ${formatDateISO(a.uploadISO)}</div></div>`;
    n.innerHTML = inner;
    grid.appendChild(n);
  });
}

function updateList(){
  // if spin section active, don't change animeGrid visibility here
  if(activeSection){
    document.getElementById('sectionTitle').style.display = 'block';
    document.getElementById('sectionTitle').innerText = `${activeSection.title} ${activeSection.count ? `— ${activeSection.count}` : ''}${activeSection.note ? ' • ' + activeSection.note : ''}`;
    const arr = (activeSection.ids||[]).map(idOrObj=>{
      if(typeof idOrObj === 'string') return getAnimeById(idOrObj);
      if(idOrObj && idOrObj.id) return getAnimeById(idOrObj.id);
      return null;
    }).filter(Boolean);
    renderAnime(arr);
    return;
  }

  document.getElementById('sectionTitle').style.display = 'none';
  let filtered = animeList.slice();
  const key=(document.getElementById("searchInput").value||"").trim().toLowerCase();
  if(key) filtered = filtered.filter(a=>a.title.toLowerCase().includes(key));
  const genre = document.getElementById("genreFilter") ? document.getElementById("genreFilter").value : "all";
  if(genre && genre!=="all") filtered = filtered.filter(a=> (a.genre||[]).includes(genre));
  const opt = document.getElementById("sortFilter") ? document.getElementById("sortFilter").value : "none";
  if(opt==="newest") filtered.sort((a,b)=>new Date(b.uploadISO)-new Date(a.uploadISO));
  else if(opt==="oldest") filtered.sort((a,b)=>new Date(a.uploadISO)-new Date(b.uploadISO));
  else if(opt==="rating") filtered.sort((a,b)=>(b.rating||0)-(a.rating||0));
  renderAnime(filtered);
}

/* Menu view */
function showMenuSection(action){
  closeSideMenu();
  if(action === 'home'){ activeSection = null; hideSpinSection(); updateList(); return; }
  if(action === 'favorites'){ const ids = _readMenuArr(MENU_FAV_KEY); activeSection = { key:'favorites', title:'Yêu thích', ids: ids.slice(), count: ids.length, note: 'Lưu cục bộ' }; hideSpinSection(); updateList(); return; }
  if(action === 'following'){ const ids = _readMenuArr(MENU_FOLLOW_KEY); activeSection = { key:'following', title:'Đang theo dõi', ids: ids.slice(), count: ids.length, note: 'Lưu cục bộ' }; hideSpinSection(); updateList(); return; }
  if(action === 'history'){ const hist = _readMenuArr(MENU_HIST_KEY) || []; activeSection = { key:'history', title:'Lịch sử xem', ids: hist.slice(0,200), count: hist.length, note: 'Mới nhất ở trên' }; hideSpinSection(); updateList(); return; }
  if(action === 'spin'){ openSpinSection(); return; }
  activeSection = null; hideSpinSection(); updateList();
}

/* Buy / Enter / VIP code logic (object codes) */
function openBuyModal(){ document.getElementById("buyModal").style.display = "flex"; document.getElementById("buyResult").style.display = "none"; }
function closeBuyModal(){ document.getElementById("buyModal").style.display = "none"; }
function openEnterModal(){ refreshPurchasedListUI(); document.getElementById("enterResult").style.display="none"; document.getElementById("codeInput").value=""; document.getElementById("enterModal").style.display="flex"; }
function closeEnterModal(){ document.getElementById("enterModal").style.display = "none"; }

function handleBuy(){
  if(getCoin() < VIP_COST){ alert("Không đủ xu."); return; }
  const used = getUsedCodes();
  const purchased = getPurchasedCodes().map(x=>x.code);
  let picked = null;
  for(let i=0;i<12;i++){
    const cand = generateVipCode();
    if(!used.includes(cand) && !purchased.includes(cand)){ picked = cand; break; }
  }
  if(!picked) picked = generateVipCode();
  // default buy gives 60 minutes
  addPurchasedCode(picked, 60);
  setCoin( getCoin() - VIP_COST );
  document.getElementById("boughtCode").innerText = picked;
  document.getElementById("buyResult").style.display = "block";
  document.getElementById("copyBought").onclick = ()=>{
    navigator.clipboard?.writeText(picked).then(()=> alert("Đã sao chép mã."), ()=>{ prompt("Sao chép mã:", picked); });
  };
  document.getElementById("gotoEnter").onclick = ()=>{ closeBuyModal(); openEnterModal(); };
  refreshPurchasedListUI();
  localStorage.setItem('coin_update_ts', String(Date.now()));
}

/* ===== UPDATED: handleEnter with stacking (cộng dồn VIP) ===== */
function handleEnter(){
  const raw = (document.getElementById("codeInput").value||"").trim();
  const code = raw.toUpperCase();
  if(!code){
    document.getElementById("enterResult").style.display="block";
    document.getElementById("enterResult").innerText="Nhập mã trước khi xác nhận.";
    return;
  }

  const used = getUsedCodes();
  if(used.includes(code)){
    document.getElementById("enterResult").style.display="block";
    document.getElementById("enterResult").innerText="Mã đã được sử dụng.";
    return;
  }

  const purchased = getPurchasedCodes();
  const found = purchased.find(x=>x.code === code);
  if(!found){
    document.getElementById("enterResult").style.display="block";
    document.getElementById("enterResult").innerText="Mã không hợp lệ (bạn chưa mua mã này).";
    return;
  }

  // MARK used
  markCodeUsed(code);

  // stacking logic: nếu đang có VIP còn hạn thì cộng thêm vào expire hiện có, nếu không thì từ now
  const minutesToAdd = Number(found.durationMinutes) || 60;
  const now = Date.now();
  const existing = getVipObj(); // may be null
  let base = now;
  if(existing && existing.expire && Number(existing.expire) > now){
    base = Number(existing.expire); // tiếp tục từ expiry hiện tại
  }
  const newExpire = base + minutesToAdd * 60 * 1000;

  // save new VIP object
  localStorage.setItem(VIP_KEY, JSON.stringify({ code, expire: newExpire }));
  localStorage.setItem('vip_update_ts', String(Date.now()));

  // remove purchased code so không nhập lại
  removePurchasedCode(code);

  // UI feedback
  const totalRemainMs = newExpire - now;
  const addedText = `${minutesToAdd} phút`;
  document.getElementById("enterResult").style.display="block";
  document.getElementById("enterResult").innerText = `Kích hoạt thành công: ${code} — +${addedText} VIP. Thời gian còn lại: ${formatRemain(totalRemainMs)}.`;

  refreshVIPUI();
  refreshPurchasedListUI();
  updateCoinUI();

  setTimeout(()=> closeEnterModal(), 1100);
}

/* VIP required modal for clicking locked anime */
function showVipRequiredModal(animeObj){
  document.getElementById("vipRequiredModal").style.display = "flex";
  document.getElementById("vipReqText").innerText = `Bộ phim "${animeObj.title}" cần VIP để xem. Bạn có thể mua mã ngẫu nhiên hoặc nhập mã đã mua.`;
  document.getElementById("vipReqBuy").onclick = ()=>{ closeVipRequiredModal(); openBuyModal(); };
  document.getElementById("vipReqEnter").onclick = ()=>{ closeVipRequiredModal(); openEnterModal(); };
  document.getElementById("vipReqClose").onclick = ()=> closeVipRequiredModal();
}
function closeVipRequiredModal(){ document.getElementById("vipRequiredModal").style.display = "none"; }

function refreshVIPUI(){
  const vdom = document.getElementById("vipHeaderChip");
  const remainSmall = document.getElementById("vipRemainSmall");
  if(hasVip()){
    vdom.style.display = "flex";
    remainSmall.innerText = formatRemain(vipRemainingMs());
  } else {
    vdom.style.display = "none";
    remainSmall.innerText = "";
  }
}
function refreshPurchasedListUI(){ const p = getPurchasedCodes(); document.getElementById("purchasedList").innerText = p.length ? p.map(x=>`${x.code} (${x.durationMinutes}m)`).join(", ") : "—"; }

/* Spin feature - balanced probabilities (kept but wheel animation improved) */
const spinWheelDefs = {
  "50": [
    { label: "Không trúng", minutes: 0, weight: 40, color: "#d1d5db" },
    { label: "VIP 30 phút", minutes: 30, weight: 30, color: "#ff9fb0" },
    { label: "VIP 60 phút", minutes: 60, weight: 20, color: "#7dd3fc" },
    { label: "VIP 120 phút", minutes: 120, weight: 10, color: "#f6d365" }
  ],
  "100": [
    { label: "Không trúng", minutes: 0, weight: 38, color: "#d1d5db" },
    { label: "VIP 60 phút", minutes: 60, weight: 40, color: "#7dd3fc" },
    { label: "VIP 180 phút", minutes: 180, weight: 20, color: "#ffd6a5" },
    { label: "VIP 300 phút", minutes: 300, weight: 2, color: "#f6d365" }
  ],
  "150": [
    { label: "Không trúng", minutes: 0, weight: 43, color: "#d1d5db" },
    { label: "VIP 120 phút", minutes: 120, weight: 34, color: "#7dd3fc" },
    { label: "VIP 240 phút", minutes: 240, weight: 22, color: "#ffd6a5" },
    { label: "VIP 480 phút", minutes: 480, weight: 1, color: "#f6d365" }
  ]
};

/* ---------- wheel rendering & spin logic (responsive & deterministic mapping) ---------- */
const wheelEl = document.getElementById('wheel');
const wheelLegend = document.getElementById('wheelLegend');
let selectedSpin = null;
const spin50El = document.getElementById('spin50');
const spin100El = document.getElementById('spin100');
const spin150El = document.getElementById('spin150');
const spinStartBtn = document.getElementById('spinStartBtn');
const spinCloseBtn = document.getElementById('spinCloseBtn');
const spinResultBlock = document.getElementById('spinResultBlock');
const spinResultText = document.getElementById('spinResultText');
const copySpinCodeBtn = document.getElementById('copySpinCode');

/* pick weighted item */
function weightedPick(arr){
  const total = arr.reduce((s,i)=>s + (i.weight||0),0);
  if(total <= 0) return null;
  let r = Math.random() * total;
  for(const it of arr){
    if(r < it.weight) return it;
    r -= it.weight;
  }
  return arr[arr.length-1];
}

/* build conic gradient from definition */
function buildConicGradient(def){
  const total = def.reduce((s,x)=>s + (x.weight||0),0) || 1;
  let accum = 0;
  const stops = [];
  def.forEach((seg)=>{
    const start = (accum / total) * 360;
    accum += seg.weight;
    const end = (accum / total) * 360;
    stops.push(`${seg.color} ${start}deg ${end}deg`);
  });
  return `conic-gradient(${stops.join(', ')})`;
}

/* compute segments for angle computations */
function computeSegments(def){
  const total = def.reduce((s,x)=>s + (x.weight||0),0) || 1;
  const segments = [];
  let accum = 0;
  def.forEach(seg=>{
    const start = (accum/total) * 360;
    accum += seg.weight;
    const end = (accum/total) * 360;
    segments.push({...seg, startAngle: start, endAngle: end, midAngle: (start + end) / 2, width: end - start});
  });
  return segments;
}

/* render wheel visuals and legend */
function renderWheelFor(cost){
  const wheel = wheelEl;
  const legend = wheelLegend;
  if(!cost || !spinWheelDefs[cost]) {
    wheel.style.background = 'linear-gradient(180deg,#eee,#ddd)';
    legend.innerHTML = '<div style="text-align:center;color:#666">Chọn vòng để xem tỉ lệ</div>';
    return;
  }
  const def = spinWheelDefs[cost];
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';
  void wheel.offsetWidth; // force reflow
  wheel.style.background = buildConicGradient(def);

  legend.innerHTML = def.map(s=>`<div class="row"><div><span class="wheel-color" style="background:${s.color}"></span>${s.label}</div><div><strong>${s.weight}% • ${s.minutes}m</strong></div></div>`).join('');
}

/* compute candidates and spin behavior */
function pickSegmentByLabel(def, picked){
  const segments = computeSegments(def);
  return segments.find(s => s.label === picked.label && Number(s.minutes) === Number(picked.minutes)) || segments[0];
}

/* wheel spin animation */
spinStartBtn.addEventListener('click', ()=>{
  if(!selectedSpin){ alert("Vui lòng chọn 1 vòng quay."); return; }
  const cost = Number(selectedSpin);
  if(getCoin() < cost){ alert("Không đủ xu để quay."); return; }
  setCoin(getCoin() - cost);
  localStorage.setItem('coin_update_ts', String(Date.now()));

  const def = spinWheelDefs[selectedSpin];
  const picked = weightedPick(def);
  if(!picked) {
    spinResultText.innerText = 'Lỗi, thử lại';
    spinResultBlock.style.display = 'block';
    return;
  }

  const segment = pickSegmentByLabel(def, picked);
  const pad = Math.min(segment.width * 0.12, 6);
  const within = Math.max(0, segment.width - pad*2);
  const offset = (within > 0) ? (pad + Math.random() * within) : (segment.width/2);
  const angleInDeg = segment.startAngle + offset;
  const rotations = 5 + Math.floor(Math.random() * 4);
  const targetDeg = rotations * 360 + (360 - angleInDeg);

  wheelEl.style.transition = 'transform 4.6s cubic-bezier(.16,.84,.5,1)';
  wheelEl.style.transform = `rotate(${targetDeg}deg)`;
  spinStartBtn.disabled = true;
  spinResultBlock.style.display = 'none';
  copySpinCodeBtn.style.display = 'none';

  const onEnd = ()=>{
    wheelEl.removeEventListener('transitionend', onEnd);
    spinStartBtn.disabled = false;
    spinResultBlock.style.display = 'block';

    if(picked.minutes && picked.minutes > 0){
      const code = generateVipCode();
      addPurchasedCode(code, picked.minutes);
      spinResultText.innerText = `Chúc mừng! Bạn nhận được ${picked.minutes} phút VIP — mã: ${code}`;
      copySpinCodeBtn.style.display = 'inline-block';
      copySpinCodeBtn.onclick = ()=> {
        navigator.clipboard?.writeText(code).then(()=> alert("Đã sao chép mã."), ()=> prompt("Sao chép mã:", code));
      };
      refreshPurchasedListUI();
      document.getElementById("boughtCode").innerText = code;
      document.getElementById("buyResult").style.display = "block";
      localStorage.setItem(PURCHASED_CODES_KEY, JSON.stringify(getPurchasedCodes()));
      localStorage.setItem('purchased_update_ts', String(Date.now()));
    } else {
      spinResultText.innerText = `Rất tiếc — ${picked.label}.`;
    }

    setTimeout(()=> {
      wheelEl.style.transition = 'transform 520ms cubic-bezier(.2,.9,.2,1)';
      wheelEl.style.transform = `rotate(${(rotations*360 + (360 - angleInDeg))}deg)`;
    }, 120);
  };
  wheelEl.addEventListener('transitionend', onEnd);
});

/* SPIN SECTION control (open/close) */
function openSpinSection(){
  document.getElementById('animeGrid').style.display = 'none';
  document.getElementById('spinSection').style.display = 'block';
  document.getElementById('spinSection').setAttribute('aria-hidden', 'false');
  if(!selectedSpin){ selectedSpin='100'; spin100El.classList.add('selected'); }
  renderWheelFor(selectedSpin);
  spinResultBlock.style.display='none';
  document.getElementById('sectionTitle').style.display = 'none';
}
function hideSpinSection(){
  document.getElementById('animeGrid').style.display = '';
  document.getElementById('spinSection').style.display = 'none';
  document.getElementById('spinSection').setAttribute('aria-hidden', 'true');
}

/* selection wiring (cards) */
[spin50El, spin100El, spin150El].forEach(el=>{
  el.addEventListener('click', ()=> {
    [spin50El, spin100El, spin150El].forEach(x=>x.classList.remove('selected'));
    el.classList.add('selected');
    selectedSpin = el.getAttribute('data-cost');
    renderWheelFor(selectedSpin);
    spinResultBlock.style.display = 'none';
  });
});

/* spin close button hides section and returns to anime grid */
spinCloseBtn.addEventListener('click', ()=>{
  hideSpinSection();
  activeSection = null;
  updateList();
});

/* ---------- rest of original init + wiring (unchanged) ---------- */

/* Init + wiring */
function refreshMenuBadges(){
  document.getElementById('menuFavCount').innerText = _readMenuArr(MENU_FAV_KEY).length;
  document.getElementById('menuHistCount').innerText = _readMenuArr(MENU_HIST_KEY).length;
  document.getElementById('menuFollowCount').innerText = _readMenuArr(MENU_FOLLOW_KEY).length;
}

function init(){
  document.getElementById("modalCost").innerText = VIP_COST;
  document.getElementById("vipCost").innerText = VIP_COST;

  document.getElementById("searchInput").addEventListener("input", ()=>{ if(!activeSection) updateList(); });
  const gf = document.getElementById("genreFilter");
  const sf = document.getElementById("sortFilter");
  if(gf) gf.addEventListener("change", ()=>{ if(!activeSection) updateList(); });
  if(sf) sf.addEventListener("change", ()=>{ if(!activeSection) updateList(); });

  document.getElementById("openBuy").addEventListener("click", openBuyModal);
  document.getElementById("cancelBuy").addEventListener("click", closeBuyModal);
  document.getElementById("confirmBuy").addEventListener("click", handleBuy);

  document.getElementById("openEnter").addEventListener("click", openEnterModal);
  document.getElementById("cancelEnter").addEventListener("click", closeEnterModal);
  document.getElementById("confirmEnter").addEventListener("click", handleEnter);

  document.getElementById("vipReqBuy").addEventListener("click", ()=>{ closeVipRequiredModal(); openBuyModal(); });
  document.getElementById("vipReqEnter").addEventListener("click", ()=>{ closeVipRequiredModal(); openEnterModal(); });
  document.getElementById("vipReqClose").addEventListener("click", closeVipRequiredModal);

  // removed +100 test button from UI per request

  updateCoinUI();
  refreshVIPUI();
  refreshPurchasedListUI();
  updateList();

  setInterval(()=>{ refreshVIPUI(); if(!activeSection) updateList(); }, 1000);

  window.addEventListener('storage', (ev) => {
    if(ev.key === VIP_KEY || ev.key === 'vip_update_ts') { refreshVIPUI(); updateList(); }
    if(ev.key === 'coin_update_ts') updateCoinUI();
    if(ev.key === PURCHASED_CODES_KEY || ev.key === USED_CODES_KEY) refreshPurchasedListUI();
    if(ev.key === MENU_FAV_KEY || ev.key === 'menu_fav_update_ts') refreshMenuBadges();
    if(ev.key === MENU_HIST_KEY || ev.key === 'menu_hist_update_ts') refreshMenuBadges();
    if(ev.key === MENU_FOLLOW_KEY || ev.key === 'menu_follow_update_ts') refreshMenuBadges();
  });

  // menu wiring
  document.getElementById('hamburgerBtn').addEventListener('click', ()=>{
    if(document.getElementById('sidePanel').classList.contains('show')) closeSideMenu(); else openSideMenu();
  });
  document.getElementById('sideOverlay').addEventListener('click', closeSideMenu);
  document.querySelectorAll('#sidePanel .menu-item').forEach(it=>{
    it.addEventListener('click', ()=>{
      const action = it.dataset.action;
      showMenuSection(action);
    });
  });

  // spin menu item (now opens spin section)
  const spinMenuItem = document.querySelector('#sidePanel .menu-item[data-action="spin"]');
  if(spinMenuItem) spinMenuItem.addEventListener('click', (e)=>{
    e.preventDefault(); openSpinSection();
  });

  // sync badges
  refreshMenuBadges();

  // finally load data.json and build animeList
  loadDataJsonAndInit();
}
init();

/* menu open/close + badges */
const hamburgerEl = document.getElementById('hamburgerBtn');
const sideOverlay = document.getElementById('sideOverlay');
const sidePanel = document.getElementById('sidePanel');

function openSideMenu(){ hamburgerEl.classList.add('open'); sideOverlay.classList.add('show'); sidePanel.classList.add('show'); sidePanel.setAttribute('aria-hidden','false'); }
function closeSideMenu(){ hamburgerEl.classList.remove('open'); sideOverlay.classList.remove('show'); sidePanel.classList.remove('show'); sidePanel.setAttribute('aria-hidden','true'); }

/* ===== Utilities available in console per your request ===== */
/**
 * addCoins(amount)
 *  - dùng devtools console: addCoins(100)
 *  - sẽ cộng xu vào storage và cập nhật UI, đồng thời phát hiện qua event 'storage'
 */
window.addCoins = function(amount){
  const n = Number(amount || 0);
  if(isNaN(n) || !isFinite(n) || n === 0){
    console.warn("addCoins: truyền số hợp lệ (ví dụ addCoins(100))");
    return;
  }
  addCoin(n);
  localStorage.setItem('coin_update_ts', String(Date.now()));
  console.log(`Đã cộng ${n} xu. Tổng hiện tại: ${getCoin()} xu.`);
};

/* Expose helper to directly activate VIP (dev only) */
window.debugActivateVip = function(minutes = 60){
  const code = generateVipCode();
  const now = Date.now();
  const expire = now + (Number(minutes)||60)*60000;
  localStorage.setItem(VIP_KEY, JSON.stringify({ code, expire }));
  localStorage.setItem('vip_update_ts', String(Date.now()));
  console.log(`Debug: Kích hoạt VIP ${minutes} phút (code ${code}).`);
  refreshVIPUI();
};

/* keep purchased list refreshed on load */
refreshPurchasedListUI();
updateCoinUI();
// === DAILY CHECKIN INJECT (paste into console or add before </body>) ===
(function(){
  if(window.__daily_injected_v1) return;
  window.__daily_injected_v1 = true;

  const DAILY_KEY = 'daily_checkin_v1';
  const COIN_KEY = 'user_coin_v1';
  const PURCHASED_CODES_KEY = 'purchased_codes_v1';

  /* ---------- small css ---------- */
  const css = `
  #my_daily_modal { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.45); z-index:9999; }
  #my_daily_box { width:520px; max-width:94%; background:#fff; border-radius:10px; padding:18px; box-shadow:0 10px 30px rgba(0,0,0,0.2); font-family:inherit; text-align:center;}
  .my_check_grid{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px}
  .my_cell{width:68px;height:84px;background:#fff;border-radius:8px;border:1px solid #eee;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;box-shadow:0 6px 18px rgba(0,0,0,0.04);}
  .my_cell.missed{opacity:0.46}
  .my_day{font-weight:800;font-size:12px;color:#666;margin-bottom:6px}
  .my_reward{font-size:12px;font-weight:700;color:#111}
  .my_status{margin-top:6px;font-size:12px;color:#0b8a3a;font-weight:800}
  .my_claim_btn{margin-top:14px;padding:10px 16px;border-radius:10px;cursor:pointer;border:none;font-weight:800;background:linear-gradient(90deg,#7dd3fc,#7ce0c3);color:#063}
  .my_close_btn{margin-left:8px;padding:10px 14px;border-radius:10px;border:none;background:#eee;cursor:pointer}
  .my_note{margin-top:10px;font-size:13px;color:#666}
  .my_menu_badge{margin-left:8px;background:#7dd3fc;color:#063;padding:4px 8px;border-radius:999px;font-weight:700}
  `;
  const st = document.createElement('style'); st.innerText = css; document.head.appendChild(st);

  /* ---------- helpers: week and dates ---------- */
  function getWeekStartSundayMs(date = new Date()){
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() - day); // go back to Sunday 00:00 of current week
    return d.getTime();
  }
  function todayIndex(date = new Date()){
    const g = date.getDay(); // 0=Sun
    return (g === 0) ? 7 : g; // Mon=1 .. Sun=7
  }

  function loadState(){
    try{ return JSON.parse(localStorage.getItem(DAILY_KEY) || 'null'); }catch(e){ return null; }
  }
  function saveState(obj){
    localStorage.setItem(DAILY_KEY, JSON.stringify(obj||{}));
    localStorage.setItem('daily_checkin_update_ts', String(Date.now()));
  }
  function ensureState(){
    const wk = getWeekStartSundayMs(new Date());
    let s = loadState();
    if(!s || !s.weekStart || Number(s.weekStart) !== Number(wk)){
      s = { weekStart: wk, claimed: { "1":false,"2":false,"3":false,"4":false,"5":false,"6":false,"7":false }, lastClaimTs:null };
      saveState(s);
    }
    return s;
  }

  /* ---------- rewards mapping ---------- */
  const REWARDS = {
    1: { type:'coins', amount:50 },
    2: { type:'vip', minutes:15 },
    3: { type:'coins', amount:100 },
    4: { type:'vip', minutes:30 },
    5: { type:'coins', amount:150 },
    6: { type:'vip', minutes:45 },
    7: { type:'mixed', coins:200, vipMinutes:60 }
  };

  /* ---------- utility: add coins or add purchased code (use existing helpers if available) ---------- */
  function addCoinsLocal(n){
    try{
      if(typeof window.addCoin === 'function'){ window.addCoin(Number(n)); localStorage.setItem('coin_update_ts', String(Date.now())); return; }
    }catch(e){}
    const cur = parseInt(localStorage.getItem(COIN_KEY) || '0',10);
    localStorage.setItem(COIN_KEY, String(cur + Number(n)));
    localStorage.setItem('coin_update_ts', String(Date.now()));
  }
  function addPurchasedCodeLocal(code, minutes){
    try{
      if(typeof window.addPurchasedCode === 'function'){ window.addPurchasedCode(code, minutes); localStorage.setItem('purchased_update_ts', String(Date.now())); return; }
    }catch(e){}
    // fallback: push into PURCHASED_CODES_KEY array
    try{
      const arr = JSON.parse(localStorage.getItem(PURCHASED_CODES_KEY)||'[]');
      if(!arr.find(x=> x && ((x.code && x.code===code) || x===code))) arr.push({ code: code, durationMinutes: Number(minutes) || 60 });
      localStorage.setItem(PURCHASED_CODES_KEY, JSON.stringify(arr));
      localStorage.setItem('purchased_update_ts', String(Date.now()));
    }catch(e){}
  }
  function genCode(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out='';
    for(let i=0;i<4;i++){ out += chars[Math.floor(Math.random()*chars.length)]; }
    let out2='';
    for(let i=0;i<4;i++){ out2 += chars[Math.floor(Math.random()*chars.length)]; }
    return 'VIP-' + out + '-' + out2;
  }

  /* ---------- build modal (only if not exists) ---------- */
  if(!document.getElementById('my_daily_modal')){
    const modal = document.createElement('div'); modal.id = 'my_daily_modal'; modal.style.display='none';
    modal.innerHTML = `
      <div id="my_daily_box" role="dialog" aria-modal="true">
        <h3 style="margin:0 0 6px;font-size:18px;font-weight:800">Điểm danh hàng tuần</h3>
        <div style="font-size:13px;color:#666">Reset thưởng vào 00:00 Chủ nhật, mong các bạn sẽ tiếp tục quay lại ủng hộ web</div>
        <div class="my_check_grid" id="my_check_grid"></div>
        <div style="margin-top:12px">
          <button id="my_claim_btn" class="my_claim_btn">Nhận thưởng hôm nay</button>
          <button id="my_close_btn" class="my_close_btn">Đóng</button>
        </div>
        <div class="my_note" id="my_note"></div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('my_close_btn').addEventListener('click', ()=>{ document.getElementById('my_daily_modal').style.display='none'; refreshMenuBadge(); });
    document.getElementById('my_claim_btn').addEventListener('click', ()=>{
      const res = claimToday();
      renderModal();
      refreshMenuBadge();
      if(res.ok){
        setTimeout(()=>{ alert('Bạn nhận được:' + (res.grant.join('\\n'))); }, 40);
      } else {
        if(res.reason === 'already') alert('Bạn đã nhận thưởng hôm nay.');
      }
    });
  }

  /* ---------- menu item: add to sidePanel without touching existing items ---------- */
  function ensureMenuItem(){
    try{
      const panel = document.querySelector('#sidePanel .menu-list');
      if(!panel) return;
      if(panel.querySelector('.my_daily_menu')) return;
      const div = document.createElement('div');
      div.className = 'menu-item my_daily_menu';
      div.style.cursor='pointer';
      div.innerHTML = '📅 <span>Điểm danh</span> <span class="my_menu_badge" id="my_menu_badge" style="display:none">NEW</span>';
      div.addEventListener('click', (e)=>{
        e.preventDefault();
        // close side panel if exists
        try{ if(typeof closeSideMenu === 'function') closeSideMenu(); }catch(e){}
        setTimeout(()=> openModal(), 200);
      });
      panel.appendChild(div);
    }catch(e){}
  }

  /* ---------- render modal content ---------- */
  function renderModal(){
    const s = ensureState();
    const grid = document.getElementById('my_check_grid');
    grid.innerHTML = '';
    const today = todayIndex(new Date());
    for(let d=1; d<=7; d++){
      const cell = document.createElement('div');
      cell.className = 'my_cell';
      if(!s.claimed[String(d)] && d < today) cell.classList.add('missed');
      const dayLabels = ['T2','T3','T4','T5','T6','T7','CN'];
      const r = REWARDS[d];
      let rewardText = (r.type==='coins')?`${r.amount} xu`:(r.type==='vip')?`${r.minutes}m VIP`:(r.type==='mixed')?`${r.coins} xu\n+ ${r.vipMinutes}m VIP`:'';
      cell.innerHTML = `<div class="my_day">${dayLabels[d-1]}</div><div class="my_reward">${rewardText.replace('\\n','<br>')}</div>`;
      if(s.claimed[String(d)]) cell.innerHTML += `<div class="my_status">Đã nhận</div>`;
      else {
        if(d < today) cell.innerHTML += `<div style="color:#d9534f;font-weight:800;margin-top:6px">Bỏ qua</div>`;
        else if(d === today) cell.innerHTML += `<div style="color:#0b8a3a;font-weight:800;margin-top:6px">Hôm nay</div>`;
        else cell.innerHTML += `<div style="color:#777;margin-top:6px">Chưa tới</div>`;
      }
      grid.appendChild(cell);
    }

    const claimBtn = document.getElementById('my_claim_btn');
    if(s.claimed[String(today)]){
      claimBtn.disabled = true;
      claimBtn.textContent = 'Đã nhận hôm nay';
      claimBtn.style.opacity = '0.7';
      document.getElementById('my_note').innerText = `Bạn đã nhận thưởng cho ngày ${today}.`;
    } else {
      claimBtn.disabled = false;
      claimBtn.textContent = 'Nhận thưởng hôm nay';
      claimBtn.style.opacity = '1';
      document.getElementById('my_note').innerText = `Bạn có thể nhận thưởng cho hôm nay (ngày ${today}). Nếu không nhận trong ngày sẽ bị bỏ qua.`;
    }
  }

  /* ---------- claim function ---------- */
  function claimToday(){
    const s = ensureState();
    const today = todayIndex(new Date());
    if(s.claimed[String(today)]) return { ok:false, reason:'already' };
    s.claimed[String(today)] = true;
    s.lastClaimTs = Date.now();
    saveState(s);

    const r = REWARDS[today];
    const granted = [];
    if(!r) return { ok:false, reason:'no_reward' };
    if(r.type === 'coins'){
      addCoinsLocal(r.amount);
      granted.push(`+${r.amount} xu`);
    } else if(r.type === 'vip'){
      const code = genCode();
      addPurchasedCodeLocal(code, r.minutes);
      granted.push(`${r.minutes} phút VIP (mã: ${code})`);
    } else if(r.type === 'mixed'){
      addCoinsLocal(r.coins);
      const code = genCode();
      addPurchasedCodeLocal(code, r.vipMinutes);
      granted.push(`+${r.coins} xu`);
      granted.push(`${r.vipMinutes} phút VIP (mã: ${code})`);
    }
    return { ok:true, grant: granted };
  }

  function openModal(){
    ensureState();
    renderModal();
    document.getElementById('my_daily_modal').style.display = 'flex';
    refreshMenuBadge();
  }
  function refreshMenuBadge(){
    try{
      const s = ensureState();
      const today = todayIndex(new Date());
      const b = document.getElementById('my_menu_badge');
      if(b) {
        if(!s.claimed[String(today)]) b.style.display='inline-block'; else b.style.display='none';
      }
    }catch(e){}
  }

  /* ---------- show on load ---------- */
  window.addEventListener('load', function(){
    ensureMenuItem();
    refreshMenuBadge();
    // show popup immediately as requested
    setTimeout(()=>{ openModal(); }, 120);
  });

  // expose small debug helpers
  window.__daily_checkin = {
    open: openModal,
    state: ensureState,
    claimToday: function(){ const r = claimToday(); renderModal(); refreshMenuBadge(); return r; },
    resetWeek: function(){ localStorage.removeItem(DAILY_KEY); localStorage.setItem('daily_checkin_update_ts', String(Date.now())); alert('Daily reset removed.'); }
  };

})(); 
// === END injected code ===