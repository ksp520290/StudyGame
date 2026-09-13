/* =========================================================
   舞台演出プランナー script.js  (追加要望②対応版)
   ========================================================= */
'use strict';

const STORAGE_KEY = 'stagePlanner_state_v2';
// 背景色8色（色相順・中央寄せ表示）赤→オレンジ→黄色→緑→青緑→青→ピンク→白
const COLOR_PALETTE = [
  {name:'赤',     hex:'#E26D6C'},
  {name:'オレンジ', hex:'#F4A462'},
  {name:'黄色',   hex:'#FFD166'},
  {name:'緑',     hex:'#95C68A'},
  {name:'青緑',   hex:'#68A1A4'},
  {name:'青',     hex:'#5AA4DE'},
  {name:'ピンク', hex:'#C47297'},
  {name:'白',     hex:'#FFFFFF'}
];
const MIC_CYCLE = ['ワイヤレス1','ワイヤレス2','ワイヤレス3','ワイヤレス4','有線1','有線2','有線3','有線4'];
// 要件⑤：自動割り当ては「ワイヤレス」内のみを循環させる
const AUTO_MIC_CYCLE = ['ワイヤレス1','ワイヤレス2','ワイヤレス3','ワイヤレス4'];
// 要件④：マイクがかぶった際は警告ではなく、マイクごとに固定した強調色で色分けする
const MIC_COLORS = {
  'ワイヤレス1':'#F4A462','ワイヤレス2':'#FFD166','ワイヤレス3':'#95C68A','ワイヤレス4':'#68A1A4',
  '有線1':'#5AA4DE','有線2':'#8974BA','有線3':'#C47297','有線4':'#E26D6C'
};
// 要件⑦：読み上げ音声の種類（男性低音〜女性高音）
const VOICE_CYCLE = ['男1','男2','男3','女1','女2','女3'];
const VOICE_PARAMS = {
  '男1':{pitch:0.55, rate:0.95, gender:'male'},
  '男2':{pitch:0.8,  rate:1.0,  gender:'male'},
  '男3':{pitch:1.05, rate:1.05, gender:'male'},
  '女1':{pitch:1.0,  rate:0.95, gender:'female'},
  '女2':{pitch:1.3,  rate:1.0,  gender:'female'},
  '女3':{pitch:1.6,  rate:1.05, gender:'female'}
};
function textColorFor(hex){
  const h = hex.replace('#','');
  const r=parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
  const yiq = (r*299+g*587+b*114)/1000;
  return yiq>=140 ? '#222' : '#fff';
}

// 管理者ログイン：削除・一覧非表示の固定マスターアカウント（要件⑬）
const ROOT_ADMIN = {id:'syoumei', pass:'最高！'};

const STAGE_FOLDER = {anten:'暗転', zensyou:'全照', hansyou:'半照'};
const STROBE_FOLDER = {none:'ストロボ✖', static:'ストロボ静止', chikachika:'ストロボ独立', kurukuru:'ストロボくるくる'};
const STROBE_LABEL_CUE = {static:'◯', chikachika:'独立', kurukuru:'Effect1', none:'なし'};
const STROBE_BTN_LABEL = {static:'ストロボ静止', chikachika:'ストロボ独立', kurukuru:'ストロボクルクル', none:'ストロボ✖️'};
const EXISTING_STROBE_CYCLE = ['static','chikachika','kurukuru','none'];
const ORIGINAL_STROBE_CYCLE = ['none','static','chikachika','kurukuru'];
const EFFECT_SUBMODE_LABEL = {none:'Effectなし', existing:'既存Effect', original:'独自Effect'};
const FADE_CYCLE = ['none','in','out'];
const FADE_LABEL = {none:'フェードなし', in:'フェードイン', out:'フェードアウト'};

let state = {
  initDone:false,
  bgColorMode:null,        // 'on' | 'off'
  effectOnOff:null,        // 'on' | 'off'（背景色あり時の設定2）
  effectKind:null,         // 'existing' | 'original'
  effectType:null,         // 'none' | 'existing' | 'original'（背景色あり時のみ使用）
  darkMode:false,
  locked:false,
  loggedIn:false,
  admins:[],                // {id,pass}（rootの syoumei は含まない）
  loggedInAdminId:null,     // ログイン中のID（'syoumei' または admins内のid）
  _adminsSeeded:false,      // data.json からの初回読込済みフラグ
  cast:[],                 // {id,name,actor,mic,color,edit}
  scriptHTML:'',
  gdocUrl:'',
  cues:[],                  // {sec,line,audio,stage,bg,effect,strobe,fade}
  stageState:'zensyou',
  activeColorIndex:null,    // COLOR_PALETTE のインデックス
  strobeOn:false,           // effectType==='none' の場合の単純ON/OFF
  strobeMode:'none',        // effectType==='existing'|'original' の場合の状態
  effectOn:false,           // effectType==='existing' の場合のEffect ON/OFF
  effectSubMode:'none',     // effectType==='original' の場合のEffect状態(none/existing/original)
  fadeMode:'none',          // 'none' | 'in' | 'out'
  fadeDurationSec:1,
  stageItems:[],             // {id,src,x,y}
  stageVideoOverride:'',     // 手動指定したステージ動画（ローカルセッションのみ）
  customEffects:[],          // {id,no,step,sec,colorName,strobeLabel}
  versionMemos:[],           // {id,text,date,snapshot}
  stopwatch:{elapsed:0,running:false},
  adminAssets:{},            // { "img/xxx.png": "data:...", "mov/xxx.mov": "data:..." }
  currentAudioLabel:'-',
  audioSourceCount:0
};

let swInterval=null, swStart=0;
let gdocIntervalHandle=null;
let isReading=false;

/* ---------------- ユーティリティ ---------------- */
function uid(){return 'id'+Math.random().toString(36).slice(2,9);}
function $(sel){return document.querySelector(sel);}
function $all(sel){return Array.from(document.querySelectorAll(sel));}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn('save failed',e); }
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ const loaded = JSON.parse(raw); state = Object.assign(state, loaded); }
  }catch(e){ console.warn('load failed', e); }
}
function resolveAsset(path){
  return (state.adminAssets && state.adminAssets[path]) ? state.adminAssets[path] : path;
}
function circledNum(n){
  if(n<1) return '-';
  if(n<=20) return String.fromCodePoint(0x2460+n-1);
  return '('+n+')';
}
function currentColorName(){
  if(state.activeColorIndex==null) return null;
  const c = COLOR_PALETTE[state.activeColorIndex];
  return c ? c.name : null;
}
function currentColorHex(){
  if(state.activeColorIndex==null) return null;
  const c = COLOR_PALETTE[state.activeColorIndex];
  return c ? c.hex : null;
}

/* ============================================================
   初期選択モーダル
   ============================================================ */
function applyModalAssets(){
  $all('[data-asset-path]').forEach(el=>{
    const path = el.dataset.assetPath;
    const resolved = resolveAsset(path);
    if(el.tagName==='IMG'){ el.src = resolved; }
    else if(el.tagName==='VIDEO'){ el.src = resolved; if(el.load) el.load(); }
  });
}

function initModalLogic(){
  $all('.choice-btn[data-group]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const group = btn.dataset.group;
      $all(`.choice-btn[data-group="${group}"]`).forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');

      if(group==='bgColor'){
        state.bgColorMode = btn.dataset.value;
        const showEffect = state.bgColorMode==='on';
        $('#section-effect-toggle').style.display = showEffect ? 'block' : 'none';
        if(!showEffect){
          state.effectOnOff=null; state.effectKind=null; state.effectType=null;
          $('#section-effect-kind').style.display='none';
          $all('.choice-btn[data-group="effectOnOff"],.choice-btn[data-group="effectKind"]').forEach(b=>b.classList.remove('selected'));
        }
      }
      if(group==='effectOnOff'){
        state.effectOnOff = btn.dataset.value;
        const showKind = state.effectOnOff==='on';
        $('#section-effect-kind').style.display = showKind ? 'block' : 'none';
        if(!showKind){
          state.effectKind=null;
          state.effectType='none';
          $all('.choice-btn[data-group="effectKind"]').forEach(b=>b.classList.remove('selected'));
        }
      }
      if(group==='effectKind'){
        state.effectKind = btn.dataset.value;
        state.effectType = btn.dataset.value; // 'existing' | 'original'
      }
      checkModalReady();
    });
  });

  $('#startAppBtn').addEventListener('click', ()=>{
    state.initDone = true;
    state.strobeOn=false; state.strobeMode='none'; state.effectOn=false; state.effectSubMode='none';
    $('#initModal').classList.add('hidden');
    saveState();
    applyAllSettingsToUI();
  });

  function adjustLabelFontSize(){
    $all('.choice-img').forEach(media=>{
      const h = media.getBoundingClientRect().height || 110;
      const label = media.parentElement.querySelector('.choice-label');
      if(label) label.style.fontSize = Math.max(10, h/5) + 'px';
    });
  }
  window.addEventListener('resize', adjustLabelFontSize);
  window.addEventListener('load', adjustLabelFontSize);
  setTimeout(adjustLabelFontSize, 300);
}
function checkModalReady(){
  const bgSelected = !!$('.choice-btn.selected[data-group="bgColor"]');
  let ready = bgSelected;
  if(state.bgColorMode==='on'){
    const effectOnOffSelected = !!$('.choice-btn.selected[data-group="effectOnOff"]');
    ready = ready && effectOnOffSelected;
    if(state.effectOnOff==='on'){
      const kindSelected = !!$('.choice-btn.selected[data-group="effectKind"]');
      ready = ready && kindSelected;
    }
  }
  $('#startAppBtn').disabled = !ready;
}
function prefillModalSelections(){
  $all('.choice-btn').forEach(b=>b.classList.remove('selected'));
  if(state.bgColorMode){
    const b = $(`.choice-btn[data-group="bgColor"][data-value="${state.bgColorMode}"]`);
    if(b) b.classList.add('selected');
  }
  $('#section-effect-toggle').style.display = state.bgColorMode==='on' ? 'block' : 'none';
  if(state.effectOnOff){
    const b = $(`.choice-btn[data-group="effectOnOff"][data-value="${state.effectOnOff}"]`);
    if(b) b.classList.add('selected');
  }
  $('#section-effect-kind').style.display = (state.bgColorMode==='on' && state.effectOnOff==='on') ? 'block' : 'none';
  if(state.effectKind){
    const b = $(`.choice-btn[data-group="effectKind"][data-value="${state.effectKind}"]`);
    if(b) b.classList.add('selected');
  }
  checkModalReady();
}

/* ============================================================
   設定＞Googleログイン（要件②：学校でGoogle Cloud Consoleが使えないため、
   OAuthクライアントIDによる自動認可の代わりに、外部（OAuth 2.0 Playground等）で
   取得したアクセストークンをご自身で貼り付ける方式に変更）
   ============================================================ */
let googleAccessToken = null; // セキュリティのためlocalStorageには保存しない（セッション限り）

function updateGoogleLoginUI(){
  const loggedIn = !!googleAccessToken;
  $('#googleLoginInputArea').classList.toggle('hidden', loggedIn);
  $('#googleLoginStatusArea').classList.toggle('hidden', !loggedIn);
  $('#googleLoginStatus').textContent = loggedIn
    ? 'Googleアカウント：ログイン中（貼り付けられたアクセストークンを使用中）'
    : 'Googleアカウント：未ログイン';
}
function initGoogleLoginUI(){
  // トークン貼り付け方式のため、特別な初期化処理は不要。
  updateGoogleLoginUI();
}
$('#openGoogleLoginBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#googleTokenInput').value='';
  updateGoogleLoginUI();
  $('#googleLoginModal').classList.remove('hidden');
});
$('#googleLoginCloseBtn').addEventListener('click', ()=>{ $('#googleLoginModal').classList.add('hidden'); });
$('#googleTokenApplyBtn').addEventListener('click', ()=>{
  const token = $('#googleTokenInput').value.trim();
  if(!token){ alert('アクセストークンを入力してください。'); return; }
  // 受け取った情報を反映し、ログイン済み表示画面へ遷移する
  googleAccessToken = token;
  updateGoogleLoginUI();
});
$('#googleLogoutBtn').addEventListener('click', ()=>{
  googleAccessToken = null;
  updateGoogleLoginUI();
});

/* ============================================================
   ログイン / 設定 / 管理者画面 / フェード秒数
   ============================================================ */
function updateLoginUI(){
  $('#loginBtn').classList.toggle('hidden', state.loggedIn);
  $('#settingsMenuBtn').classList.toggle('hidden', !state.loggedIn);
  $('#initGatedGroup').classList.toggle('hidden', !state.loggedIn);
  if(!state.loggedIn) $('#settingsMenu').classList.add('hidden');
}
$('#loginBtn').addEventListener('click', ()=>{
  $('#loginIdInput').value='';
  $('#loginPasswordInput').value='';
  $('#loginModal').classList.remove('hidden');
});
$('#loginCancelBtn').addEventListener('click', ()=>{ $('#loginModal').classList.add('hidden'); });
$('#loginSubmitBtn').addEventListener('click', ()=>{
  const id = $('#loginIdInput').value.trim();
  const pass = $('#loginPasswordInput').value;
  const matched = (id===ROOT_ADMIN.id && pass===ROOT_ADMIN.pass)
    ? ROOT_ADMIN
    : state.admins.find(a=>a.id===id && a.pass===pass);
  if(matched){
    state.loggedIn = true;
    state.loggedInAdminId = matched.id;
    updateLoginUI();
    $('#loginModal').classList.add('hidden');
    saveState();
  }else{
    alert('IDまたはパスワードが違います。');
  }
});
$('#settingsMenuBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.toggle('hidden');
});
$('#logoutBtn').addEventListener('click', ()=>{
  state.loggedIn = false;
  state.loggedInAdminId = null;
  updateLoginUI();
  saveState();
});
$('#reopenInitBtn').addEventListener('click', ()=>{
  prefillModalSelections();
  $('#initModal').classList.remove('hidden');
});
$('#openAdminBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#adminModal').classList.remove('hidden');
});
$('#adminCloseBtn').addEventListener('click', ()=>{ $('#adminModal').classList.add('hidden'); });

/* ---------- 管理者一覧画面（要件⑬） ---------- */
$('#openAdminUsersBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  renderAdminUsersTable();
  $('#adminUsersModal').classList.remove('hidden');
});
$('#adminUsersCloseBtn').addEventListener('click', async ()=>{
  await persistAdminsToDataJson();
  $('#adminUsersModal').classList.add('hidden');
});
$('#newAdminAddBtn').addEventListener('click', ()=>{
  const id = $('#newAdminIdInput').value.trim();
  const pass = $('#newAdminPassInput').value;
  if(!id || !pass){ alert('IDとパスワードを入力してください。'); return; }
  if(id===ROOT_ADMIN.id || state.admins.some(a=>a.id===id)){
    alert('そのIDは既に使用されています。'); return;
  }
  state.admins.push({id, pass});
  $('#newAdminIdInput').value=''; $('#newAdminPassInput').value='';
  renderAdminUsersTable();
  saveState();
});
function renderAdminUsersTable(){
  const body = $('#adminUsersTableBody');
  body.innerHTML='';
  const visible = state.admins.filter(a=>a.id!==ROOT_ADMIN.id);
  // 自分の行を最上部に表示
  visible.sort((a,b)=>{
    if(a.id===state.loggedInAdminId) return -1;
    if(b.id===state.loggedInAdminId) return 1;
    return 0;
  });
  visible.forEach(a=>{
    const isSelf = a.id===state.loggedInAdminId;
    const tr = document.createElement('tr');
    if(isSelf) tr.className='admin-user-self-row';

    const idTd = document.createElement('td');
    if(isSelf){
      const idInput = document.createElement('input');
      idInput.type='text'; idInput.value=a.id; idInput.className='admin-user-id-input';
      idInput.addEventListener('change', ()=>{
        const newId = idInput.value.trim();
        if(!newId){ idInput.value=a.id; return; }
        if(newId!==a.id && (newId===ROOT_ADMIN.id || state.admins.some(x=>x.id===newId))){
          alert('そのIDは既に使用されています。'); idInput.value=a.id; return;
        }
        if(state.loggedInAdminId===a.id) state.loggedInAdminId = newId;
        a.id = newId;
        saveState();
        renderAdminUsersTable();
      });
      idTd.appendChild(idInput);
    }else{
      idTd.textContent = a.id;
    }
    tr.appendChild(idTd);

    const passTd = document.createElement('td');
    if(isSelf){
      const passInput = document.createElement('input');
      passInput.type='text'; passInput.value=a.pass; passInput.className='admin-user-pass-input';
      passInput.addEventListener('change', ()=>{ a.pass = passInput.value; saveState(); });
      passTd.appendChild(passInput);
    }else{
      passTd.textContent = '••••••';
    }
    tr.appendChild(passTd);

    const delTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.textContent='削除'; delBtn.className='del-btn';
    delBtn.addEventListener('click', ()=>{
      if(!confirm(`ID「${a.id}」を削除しますか？`)) return;
      state.admins = state.admins.filter(x=>x.id!==a.id);
      if(state.loggedInAdminId===a.id){
        state.loggedIn=false; state.loggedInAdminId=null; updateLoginUI();
      }
      renderAdminUsersTable();
      saveState();
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    body.appendChild(tr);
  });
}

/* ---------- data.json への保存/読込（要件⑬） ---------- */
let adminDataFileHandle = null;
async function loadAdminsFromDataJson(){
  try{
    const res = await fetch('data.json', {cache:'no-store'});
    if(res.ok){
      const json = await res.json();
      if(Array.isArray(json.admins) && !state._adminsSeeded){
        state.admins = json.admins.filter(a=>a && a.id && a.pass && a.id!==ROOT_ADMIN.id);
        state._adminsSeeded = true;
        saveState();
      }
    }
  }catch(e){
    // data.json が存在しない、もしくは file:// 直開きでfetch不可な環境。localStorageの内容をそのまま使用する。
  }
}
async function persistAdminsToDataJson(){
  const payload = JSON.stringify({admins: state.admins}, null, 2);
  try{
    if(!adminDataFileHandle && window.showSaveFilePicker){
      adminDataFileHandle = await window.showSaveFilePicker({
        suggestedName:'data.json',
        types:[{description:'JSON', accept:{'application/json':['.json']}}]
      });
    }
    if(adminDataFileHandle){
      const writable = await adminDataFileHandle.createWritable();
      await writable.write(payload);
      await writable.close();
      return;
    }
  }catch(e){
    console.warn('data.jsonへの保存がキャンセルまたは失敗しました。ダウンロードに切り替えます。', e);
    adminDataFileHandle = null;
  }
  // File System Access API 非対応ブラウザ向けフォールバック：ダウンロード
  const blob = new Blob([payload], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  a.click();
}

$all('.admin-asset-row').forEach(row=>{
  const path = row.dataset.path;
  const input = row.querySelector('input[type=file]');
  input.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev=>{
      state.adminAssets[path] = ev.target.result;
      saveState();
      applyModalAssets();
      updateStagePreviewMedia();
    };
    reader.readAsDataURL(file);
  });
});

// 個別アセット（舞台×ストロボ×色）のアップロード
function populateAdminColorSelect(){
  const sel = $('#adminAssetColor');
  sel.innerHTML='';
  COLOR_PALETTE.forEach(c=>{
    const opt=document.createElement('option'); opt.value=c.name; opt.textContent=c.name; sel.appendChild(opt);
  });
}
function updateAdminAssetPathPreview(){
  const kind=$('#adminAssetKind').value, stage=$('#adminAssetStage').value, strobe=$('#adminAssetStrobe').value, color=$('#adminAssetColor').value;
  const ext = kind==='mov' ? 'mov' : 'png';
  $('#adminAssetPathPreview').textContent = `保存先: ${kind}/${stage}/${strobe}/${color}.${ext}`;
}
['adminAssetKind','adminAssetStage','adminAssetStrobe','adminAssetColor'].forEach(id=>{
  document.getElementById(id).addEventListener('change', updateAdminAssetPathPreview);
});
$('#adminAssetFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const kind=$('#adminAssetKind').value, stage=$('#adminAssetStage').value, strobe=$('#adminAssetStrobe').value, color=$('#adminAssetColor').value;
  const ext = kind==='mov' ? 'mov' : 'png';
  const path = `${kind}/${stage}/${strobe}/${color}.${ext}`;
  const reader = new FileReader();
  reader.onload = ev=>{
    state.adminAssets[path] = ev.target.result;
    saveState();
    updateStagePreviewMedia();
    alert('保存しました: '+path);
  };
  reader.readAsDataURL(file);
});

// フェード秒数設定
$('#fadeSecBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#fadeSecInput').value = state.fadeDurationSec;
  $('#fadeSecModal').classList.remove('hidden');
});
$('#fadeSecCancelBtn').addEventListener('click', ()=>{ $('#fadeSecModal').classList.add('hidden'); });
$('#fadeSecSaveBtn').addEventListener('click', ()=>{
  const v = parseFloat($('#fadeSecInput').value);
  if(!isNaN(v) && v>=0){
    state.fadeDurationSec = v;
    document.documentElement.style.setProperty('--fade-sec', v+'s');
    saveState();
  }
  $('#fadeSecModal').classList.add('hidden');
});

// メニュー外クリックで閉じる
document.addEventListener('click', e=>{
  const area = $('.login-area');
  if(area && !area.contains(e.target)){
    $('#settingsMenu').classList.add('hidden');
  }
});

/* ============================================================
   ダーク/ライトモード & 本番ロックモード
   ============================================================ */
function applyAllSettingsToUI(){
  document.body.classList.toggle('dark-mode', state.darkMode);
  document.body.classList.toggle('light-mode', !state.darkMode);
  document.body.classList.toggle('locked', state.locked);
  $('#lockModeToggle').textContent = state.locked ? '🔒 本番モード' : '🔓 練習モード';
  $('#darkModeToggle').textContent = state.darkMode ? '☀' : '🌙';
  $('#scriptEditor').innerHTML = state.scriptHTML || '';
  $('#gdocUrlInput').value = state.gdocUrl || '';
  document.documentElement.style.setProperty('--fade-sec', (state.fadeDurationSec||1)+'s');
  updateLoginUI();
  applyModalAssets();
  renderCastList();
  renderCueTable();
  renderCustomFxTable();
  renderColorToggles();
  renderStageItems();
  renderVersionMemos();
  updateStrobeUI();
  updateEffectUI();
  updateFadeUI();
  updateStagePreviewMedia();
  setupGdocAutoSync();
  updateCustomFxTabVisibility();
  $('#stageVideoDirectBtn').classList.toggle('active-highlight', !!state.stageVideoOverride);
}

function updateCustomFxTabVisibility(){
  const show = state.effectType==='original';
  const tabBtn = $('#customfxTabBtn');
  tabBtn.classList.toggle('hidden', !show);
  if(!show && tabBtn.classList.contains('active')){
    tabBtn.classList.remove('active');
    $('#tab-customfx').classList.remove('active');
    $('.tab-btn[data-tab="script"]').classList.add('active');
    $('#tab-script').classList.add('active');
  }
}

$('#darkModeToggle').addEventListener('click', ()=>{
  state.darkMode = !state.darkMode;
  applyAllSettingsToUI();
  saveState();
});
$('#lockModeToggle').addEventListener('click', ()=>{
  state.locked = !state.locked;
  applyAllSettingsToUI();
  saveState();
});

/* ============================================================
   ストップウォッチ / タイマー
   ============================================================ */
function formatSW(ms){
  const totalSec = ms/1000;
  const m = Math.floor(totalSec/60);
  const s = (totalSec%60).toFixed(1);
  return `${String(m).padStart(2,'0')}:${s.padStart(4,'0')}`;
}
function updateSWDisplay(){
  $('#stopwatchDisplay').textContent = formatSW(state.stopwatch.elapsed);
}
$('#swStartBtn').addEventListener('click', ()=>{
  if(state.stopwatch.running) return;
  state.stopwatch.running = true;
  swStart = performance.now() - state.stopwatch.elapsed;
  swInterval = setInterval(()=>{
    state.stopwatch.elapsed = performance.now() - swStart;
    updateSWDisplay();
  }, 100);
});
$('#swStopBtn').addEventListener('click', ()=>{
  state.stopwatch.running = false;
  clearInterval(swInterval);
  saveState();
});
$('#swResetBtn').addEventListener('click', ()=>{
  state.stopwatch.running = false;
  clearInterval(swInterval);
  state.stopwatch.elapsed = 0;
  updateSWDisplay();
  saveState();
});

/* ============================================================
   バージョン管理メモ ＆ 復元
   ============================================================ */
function buildSnapshot(){
  return JSON.parse(JSON.stringify({
    cast:state.cast, scriptHTML:state.scriptHTML, cues:state.cues, customEffects:state.customEffects,
    stageState:state.stageState, activeColorIndex:state.activeColorIndex,
    bgColorMode:state.bgColorMode, effectOnOff:state.effectOnOff, effectKind:state.effectKind, effectType:state.effectType,
    strobeOn:state.strobeOn, strobeMode:state.strobeMode, effectOn:state.effectOn, effectSubMode:state.effectSubMode,
    fadeMode:state.fadeMode, fadeDurationSec:state.fadeDurationSec, stageItems:state.stageItems, gdocUrl:state.gdocUrl
  }));
}
$('#versionMemoAddBtn').addEventListener('click', ()=>{
  const val = $('#versionMemoInput').value.trim();
  if(!val) return;
  state.versionMemos.unshift({id:uid(), text:val, date:new Date().toLocaleString('ja-JP'), snapshot:buildSnapshot()});
  $('#versionMemoInput').value='';
  renderVersionMemos();
  saveState();
});
$('#versionMemoListToggleBtn').addEventListener('click', ()=>{
  $('#versionMemoList').classList.toggle('hidden');
});
function renderVersionMemos(){
  const list = $('#versionMemoList');
  list.innerHTML='';
  state.versionMemos.slice(0,20).forEach(m=>{
    const li=document.createElement('li');
    const titleBtn = document.createElement('button');
    titleBtn.className='memo-title-btn';
    titleBtn.textContent = m.text; // 要件⑦：一覧では時刻・日付は表示しない
    titleBtn.addEventListener('click', ()=>{
      if(!m.snapshot) return;
      // 要件⑦：復元前の確認画面でどの時点の履歴かを表示する
      if(confirm(`「${m.text}」（${m.date} 時点）の状態に復元しますか？現在の内容は上書きされます。`)){
        Object.assign(state, m.snapshot);
        applyAllSettingsToUI();
        saveState();
      }
    });
    li.appendChild(titleBtn);
    list.appendChild(li);
  });
  $('#versionMemoDisplay').textContent = state.versionMemos[0] ? state.versionMemos[0].text : '';
}

/* ============================================================
   配役パネル（閉時は非表示のみ。3文字強制切り出しは行わない）
   ============================================================ */
$('#castPanelToggle').addEventListener('click', ()=>{
  const panel = $('#castPanel');
  panel.classList.toggle('open');
  panel.classList.toggle('closed');
  $('#castPanelArrow').textContent = panel.classList.contains('open') ? '◀' : '▶';
  document.body.classList.toggle('cast-open', panel.classList.contains('open'));
  renderCastList();
});

function nextMic(){
  // 要件⑤：自動割り当ては「ワイヤレス1→2→3→4→1…」とワイヤレス内だけを循環する
  return AUTO_MIC_CYCLE[state.cast.length % AUTO_MIC_CYCLE.length];
}

$('#castAddBtn').addEventListener('click', ()=>{
  const name = $('#newCharName').value.trim();
  const actor = $('#newActorName').value.trim();
  if(!name) return;
  state.cast.push({
    id:uid(), name, actor, mic:nextMic(), voice:VOICE_CYCLE[0],
    color: COLOR_PALETTE[state.cast.length % COLOR_PALETTE.length].hex, edit:false
  });
  $('#newCharName').value=''; $('#newActorName').value='';
  renderCastList();
  saveState();
});

function renderCastList(){
  const wrap = $('#castList');
  wrap.innerHTML='';
  const micCount = {};
  state.cast.forEach(c=>{ micCount[c.mic] = (micCount[c.mic]||0)+1; });
  const closed = $('#castPanel').classList.contains('closed');
  if(closed) return; // 閉じた状態は表示しない（強制3文字切り出しは行わない）

  state.cast.forEach(c=>{
    const row = document.createElement('div');
    row.className='cast-row';
    row.style.borderLeft = `6px solid ${c.color}`;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name;
    nameSpan.title = c.name;
    row.appendChild(nameSpan);

    const actorInput = document.createElement('input');
    actorInput.type='text'; actorInput.value = c.actor||''; actorInput.placeholder='役者名';
    actorInput.className='actor-input';
    actorInput.disabled = !c.edit;
    actorInput.addEventListener('input', e=>{ c.actor = e.target.value; saveState(); });
    row.appendChild(actorInput);

    // 要件④：マイクがかぶった際は警告表示ではなく、マイクごとに固定した強調色で色分けする
    const micColor = MIC_COLORS[c.mic] || '#ccc';
    const micBtn = document.createElement('button');
    micBtn.className='mic-btn' + (micCount[c.mic]>1 ? ' mic-shared' : '');
    micBtn.textContent = c.mic;
    micBtn.style.background = micColor;
    micBtn.style.color = textColorFor(micColor);
    micBtn.addEventListener('click', ()=>{
      const idx = MIC_CYCLE.indexOf(c.mic);
      c.mic = MIC_CYCLE[(idx+1)%MIC_CYCLE.length];
      renderCastList(); saveState();
    });
    row.appendChild(micBtn);

    const editBtn = document.createElement('button');
    editBtn.className='del-btn editable-only';
    editBtn.textContent = c.edit ? '確定':'変更';
    editBtn.addEventListener('click', ()=>{
      c.edit = !c.edit;
      renderCastList(); saveState();
    });
    row.appendChild(editBtn);

    // 要件⑦：「変更」ボタンの右横に読み上げ音声切り替えボタンを追加
    const voiceBtn = document.createElement('button');
    voiceBtn.className='voice-btn editable-only';
    if(!c.voice) c.voice = VOICE_CYCLE[0];
    voiceBtn.textContent = 'voice:'+c.voice;
    voiceBtn.title='読み上げ音声の種類を切り替え';
    voiceBtn.addEventListener('click', ()=>{
      const idx = VOICE_CYCLE.indexOf(c.voice);
      c.voice = VOICE_CYCLE[(idx+1)%VOICE_CYCLE.length];
      renderCastList(); saveState();
    });
    row.appendChild(voiceBtn);

    if(c.edit){
      const nameInput = document.createElement('input');
      nameInput.type='text'; nameInput.value=c.name; nameInput.style.width='70px';
      nameInput.addEventListener('input', e=>{ c.name = e.target.value; saveState(); });
      row.insertBefore(nameInput, row.firstChild);
      row.removeChild(nameSpan);
    }

    const colorBtn = document.createElement('button');
    colorBtn.className='color-swatch-btn';
    colorBtn.style.background = c.color;
    colorBtn.addEventListener('click', ()=>{
      const idx = COLOR_PALETTE.findIndex(p=>p.hex===c.color);
      c.color = COLOR_PALETTE[(idx+1)%COLOR_PALETTE.length].hex;
      renderCastList(); saveState();
    });
    row.appendChild(colorBtn);

    const delBtn = document.createElement('button');
    delBtn.className='del-btn editable-only';
    delBtn.textContent='✕';
    delBtn.addEventListener('click', ()=>{
      state.cast = state.cast.filter(x=>x.id!==c.id);
      renderCastList(); saveState();
    });
    row.appendChild(delBtn);

    wrap.appendChild(row);
  });
}

/* ============================================================
   タブ切替
   ============================================================ */
$all('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $all('.tab-btn').forEach(b=>b.classList.remove('active'));
    $all('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-'+btn.dataset.tab).classList.add('active');
  });
});

/* ============================================================
   台本エディタ（リッチテキスト / ルビ / ト書き / 自動マッチング）
   ============================================================ */
const scriptEditor = $('#scriptEditor');
scriptEditor.addEventListener('input', ()=>{ state.scriptHTML = scriptEditor.innerHTML; saveState(); });
scriptEditor.addEventListener('paste', ()=>{
  setTimeout(()=>{ state.scriptHTML = scriptEditor.innerHTML; saveState(); }, 0);
});

$('#rubyBtn').addEventListener('click', ()=>{
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.toString().length===0){ alert('ルビを振る文字を選択してください'); return; }
  const furigana = prompt('ふりがなを入力してください');
  if(furigana===null) return;
  const range = sel.getRangeAt(0);
  const ruby = document.createElement('ruby');
  ruby.textContent = range.toString();
  const rt = document.createElement('rt');
  rt.textContent = furigana;
  ruby.appendChild(rt);
  range.deleteContents();
  range.insertNode(ruby);
  state.scriptHTML = scriptEditor.innerHTML;
  saveState();
});

$('#tokakiBtn').addEventListener('click', ()=>{
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0){ return; }
  let node = sel.anchorNode;
  while(node && node.nodeType!==1) node = node.parentNode;
  if(node && node!==scriptEditor){
    node.classList.toggle('tokaki');
    node.dataset.tokaki = node.classList.contains('tokaki') ? '1':'';
    state.scriptHTML = scriptEditor.innerHTML;
    saveState();
  }
});

// 話者自動マッチング：「話者名(、・/区切りで複数可)：セリフ」形式を検出
$('#autoMatchBtn').addEventListener('click', ()=>{
  const lines = scriptEditor.querySelectorAll('p, div');
  const targets = lines.length ? Array.from(lines) : [scriptEditor];
  let matchedCount = 0;
  targets.forEach(line=>{
    line.querySelectorAll('.speaker-dot').forEach(d=>d.remove());
    const text = (line.textContent || '').replace(/\u200b/g,'');
    // 要件⑨：「：」「:」に加え、全角・半角スペースの組み合わせ（2文字以上連続）でも話者名の区切りと判定する
    const m = text.match(/^\s*([^\s:：]{1,30})(?:[：:]|[ \u3000]{2,})/);
    if(m){
      const namesRaw = m[1];
      const names = namesRaw.split(/[、・\/]/).map(s=>s.trim()).filter(Boolean);
      const matchedChars = [];
      names.forEach(n=>{
        const char = state.cast.find(c=> c.name===n || (c.name && (c.name.startsWith(n) || n.startsWith(c.name))));
        if(char) matchedChars.push(char);
      });
      if(matchedChars.length){
        line.classList.add('speaker-highlight');
        line.style.borderLeft = `4px solid ${matchedChars[0].color}`;
        line.dataset.speaker = matchedChars.map(c=>c.name).join(',');
        line.dataset.mic = matchedChars[0].mic;
        matchedChars.forEach(c=>{
          const dot = document.createElement('span');
          dot.className='speaker-dot';
          dot.style.background = c.color;
          dot.title = c.name;
          line.insertBefore(dot, line.firstChild);
        });
        matchedCount++;
      }
    }
  });
  state.scriptHTML = scriptEditor.innerHTML;
  saveState();
  alert(`${matchedCount} 行を自動マッチングしました。`);
});

/* ---------- 読み上げ ---------- */
function getScriptLines(){
  const children = Array.from(scriptEditor.children).filter(el=>el.nodeType===1);
  return children.length ? children : [scriptEditor];
}
const SPEAKER_PREFIX_RE = /^\s*[^\s:：]{1,30}(?:[：:]|[ \u3000]{2,})/;

// 要件⑬：ルビ（<ruby><rt>）が付与された箇所は、読み（<rt>）のみを読み上げ対象にし、
// 「漢字＋ふりがな」の二重読み上げを防ぐ
function extractReadableText(lineEl){
  const clone = lineEl.cloneNode(true);
  clone.querySelectorAll('rp').forEach(rp=>rp.remove());
  clone.querySelectorAll('ruby').forEach(ruby=>{
    const rt = ruby.querySelector('rt');
    const reading = rt ? (rt.textContent||'') : (ruby.textContent||'');
    ruby.replaceWith(document.createTextNode(reading));
  });
  return (clone.textContent || '').replace(/\u200b/g,'');
}

// 要件⑪：話者自動マッチングで判定された話者のみに紐づく声で、セリフ本文のみを読み上げる
function findJaVoice(gender){
  const voices = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
  const jaVoices = voices.filter(v=>/^ja/i.test(v.lang));
  if(!jaVoices.length) return null;
  const keyword = gender==='female' ? /female|女/i : /male|男/i;
  return jaVoices.find(v=>keyword.test(v.name)) || jaVoices[0];
}
function voiceParamsForLine(line){
  const speakerNames = (line.dataset.speaker||'').split(',').map(s=>s.trim()).filter(Boolean);
  const char = speakerNames.length ? state.cast.find(c=>c.name===speakerNames[0]) : null;
  const voiceKey = (char && char.voice) ? char.voice : VOICE_CYCLE[0];
  return VOICE_PARAMS[voiceKey] || VOICE_PARAMS[VOICE_CYCLE[0]];
}

// 要件⑫：範囲選択がある場合はその範囲内の行のみを読み上げる（範囲外までは読み進めない）
function getSelectedLineRange(lines){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.isCollapsed || sel.toString().trim().length===0) return null;
  const range = sel.getRangeAt(0);
  const findLineIndex = node=>{
    while(node && node.parentNode !== scriptEditor && node !== scriptEditor) node = node.parentNode;
    return lines.indexOf(node);
  };
  let startIdx = findLineIndex(range.startContainer);
  let endIdx = findLineIndex(range.endContainer);
  if(startIdx<0) startIdx = 0;
  if(endIdx<0) endIdx = startIdx;
  if(startIdx>endIdx){ const t=startIdx; startIdx=endIdx; endIdx=t; }
  return {startIdx, endIdx};
}

$('#speakRowBtn').addEventListener('click', ()=>{
  if(isReading){
    speechSynthesis.cancel();
    isReading = false;
    $('#speakRowBtn').textContent = '🔊 読み上げ';
    return;
  }
  const lines = getScriptLines();
  const range = getSelectedLineRange(lines);
  const startIndex = range ? range.startIdx : 0;
  const endIndex = range ? range.endIdx : (lines.length-1);

  const queue = [];
  for(let i=startIndex;i<=endIndex;i++){
    const line = lines[i];
    if(line.classList && line.classList.contains('tokaki')) continue;
    if(lines.length>1 && !line.dataset.mic) continue;
    const readable = extractReadableText(line).replace(SPEAKER_PREFIX_RE,'').trim();
    if(readable) queue.push({text:readable, line});
  }
  if(queue.length===0){ alert('読み上げ可能な行がありません（マイク割当・ト書き設定・選択範囲をご確認ください）。'); return; }

  // 要件⑧：音声合成の準備中は「音声生成中」と表示する
  isReading = true;
  $('#speakRowBtn').textContent = '音声生成中';
  let started = false;
  queue.forEach((item, i)=>{
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang='ja-JP';
    const params = voiceParamsForLine(item.line);
    u.pitch = params.pitch;
    u.rate = params.rate;
    const voice = findJaVoice(params.gender);
    if(voice) u.voice = voice;
    u.onstart = ()=>{
      if(!started){ started = true; $('#speakRowBtn').textContent = '⏹ 停止'; }
    };
    if(i===queue.length-1){
      u.onend = ()=>{ isReading=false; $('#speakRowBtn').textContent='🔊 読み上げ'; };
    }
    speechSynthesis.speak(u);
  });
});

/* ---------- Googleドキュメント自動同期（一方向：あちら→こちら） ---------- */
function extractGoogleDocId(url){
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
async function syncGoogleDoc(silent){
  const url = $('#gdocUrlInput').value.trim();
  state.gdocUrl = url;
  saveState();
  if(!url){ $('#gdocStatus').textContent=''; return; }
  const id = extractGoogleDocId(url);
  if(!id){ $('#gdocStatus').textContent='URLが正しくありません'; return; }

  // Googleアカウントにログイン済みの場合は Drive API 経由で取得（限定公開ドキュメントでも確実に同期可能）
  if(googleAccessToken){
    try{
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/html`;
      const res = await fetch(apiUrl, {headers:{Authorization:'Bearer '+googleAccessToken}});
      if(!res.ok) throw new Error('Drive API 取得失敗 status:'+res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const body = doc.body ? doc.body.innerHTML : html;
      scriptEditor.innerHTML = body;
      state.scriptHTML = scriptEditor.innerHTML;
      saveState();
      $('#gdocStatus').textContent = 'Googleアカウント経由で同期しました（'+new Date().toLocaleTimeString('ja-JP')+'）';
      return;
    }catch(err){
      if(!silent) console.warn('Drive API同期に失敗。公開URL方式にフォールバックします。', err);
    }
  }

  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=html`;
  try{
    const res = await fetch(exportUrl, {mode:'cors'});
    if(!res.ok) throw new Error('取得失敗 status:'+res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body ? doc.body.innerHTML : html;
    scriptEditor.innerHTML = body;
    state.scriptHTML = scriptEditor.innerHTML;
    saveState();
    $('#gdocStatus').textContent = '同期しました（'+new Date().toLocaleTimeString('ja-JP')+'）';
  }catch(err){
    $('#gdocStatus').textContent = googleAccessToken
      ? '同期に失敗しました'
      : '同期に失敗しました（ドキュメントを「ウェブに公開」設定にするか、Googleアカウントにログインしてください）';
    if(!silent) console.warn(err);
  }
}
$('#gdocSyncBtn').addEventListener('click', ()=>{ syncGoogleDoc(false); setupGdocAutoSync(); });
function setupGdocAutoSync(){
  if(gdocIntervalHandle) clearInterval(gdocIntervalHandle);
  if(state.gdocUrl){
    gdocIntervalHandle = setInterval(()=>syncGoogleDoc(true), 60000);
  }
}

/* ---------- 台本タブ内 音源プレーヤー ---------- */
const scriptAudioPlayer = $('#scriptAudioPlayer');
$('#scriptAudioInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  scriptAudioPlayer.src = URL.createObjectURL(file);
  state.audioSourceCount = (state.audioSourceCount||0) + 1;
  state.currentAudioLabel = circledNum(state.audioSourceCount);
  saveState();
});
$('#scriptAudioPlayPause').addEventListener('click', ()=>{
  if(scriptAudioPlayer.paused){ scriptAudioPlayer.play(); $('#scriptAudioPlayPause').textContent='⏸'; }
  else { scriptAudioPlayer.pause(); $('#scriptAudioPlayPause').textContent='▶'; }
});
scriptAudioPlayer.addEventListener('loadedmetadata', ()=>{
  $('#scriptAudioSeek').max = scriptAudioPlayer.duration || 0;
});
scriptAudioPlayer.addEventListener('timeupdate', ()=>{
  $('#scriptAudioSeek').value = scriptAudioPlayer.currentTime;
  $('#scriptAudioTime').textContent = `${scriptAudioPlayer.currentTime.toFixed(1)} / ${(scriptAudioPlayer.duration||0).toFixed(1)}秒`;
});
$('#scriptAudioSeek').addEventListener('input', e=>{
  scriptAudioPlayer.currentTime = parseFloat(e.target.value)||0;
});

/* ============================================================
   配役色トグル（ステージ用8色・色相順・中央寄せ）
   ============================================================ */
function renderColorToggles(){
  const wrap = $('#stageColorToggles');
  wrap.innerHTML='';
  if(state.bgColorMode!=='on'){ wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  COLOR_PALETTE.forEach((col,idx)=>{
    const btn = document.createElement('button');
    btn.className='color-toggle-btn' + (state.activeColorIndex===idx ? ' active':'');
    btn.style.background = col.hex;
    btn.style.color = col.hex;
    btn.title = col.name;
    btn.addEventListener('click', ()=>{
      state.activeColorIndex = (state.activeColorIndex===idx) ? null : idx;
      renderColorToggles();
      updateStagePreviewMedia();
      saveState();
    });
    wrap.appendChild(btn);
  });
}
function applyColorFilter(){
  const filter = $('#stageColorFilter');
  if(state.bgColorMode!=='on' || state.activeColorIndex==null){
    filter.style.opacity=0;
    return;
  }
  filter.style.backgroundColor = currentColorHex();
  filter.style.opacity = .5;
}

/* ============================================================
   ストロボ / Effect / フェード（背景色ありモード時の演出制御）
   ============================================================ */
function currentStrobeKey(){
  if(state.bgColorMode!=='on') return 'none';
  if(state.effectType==='none') return state.strobeOn ? 'static' : 'none';
  return state.strobeMode || 'none';
}
function isEffectActive(){
  if(state.bgColorMode!=='on') return false;
  if(state.effectType==='none') return false;
  if(state.effectType==='existing') return !!state.effectOn;
  if(state.effectType==='original') return state.effectSubMode!=='none';
  return false;
}
function updateStrobeUI(){
  const btn = $('#strobeToggleBtn');
  if(state.bgColorMode!=='on'){ btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  if(state.effectType==='none'){
    btn.textContent = 'ストロボ';
    btn.classList.toggle('active-state', !!state.strobeOn);
  }else{
    btn.textContent = STROBE_BTN_LABEL[state.strobeMode] || 'ストロボ✖️';
    btn.classList.toggle('active-state', !!state.strobeMode && state.strobeMode!=='none');
  }
}
$('#strobeToggleBtn').addEventListener('click', ()=>{
  if(state.bgColorMode!=='on') return;
  if(state.effectType==='none'){
    state.strobeOn = !state.strobeOn;
  }else{
    const cycle = state.effectType==='existing' ? EXISTING_STROBE_CYCLE : ORIGINAL_STROBE_CYCLE;
    const idx = cycle.indexOf(state.strobeMode);
    state.strobeMode = cycle[(idx+1+cycle.length)%cycle.length];
  }
  updateStrobeUI();
  updateStagePreviewMedia();
  saveState();
});

function updateEffectUI(){
  const btn = $('#effectToggleBtn');
  if(state.bgColorMode!=='on' || !state.effectType || state.effectType==='none'){
    btn.classList.add('hidden');
    $('#customEffectAddRow').classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');
  if(state.effectType==='existing'){
    btn.textContent='Effect';
    btn.classList.toggle('active-state', !!state.effectOn);
  }else if(state.effectType==='original'){
    btn.textContent = EFFECT_SUBMODE_LABEL[state.effectSubMode] || 'Effectなし';
    btn.classList.toggle('active-state', state.effectSubMode!=='none');
  }
  const showCustomRow = state.effectType==='original' && state.effectSubMode==='original';
  $('#customEffectAddRow').classList.toggle('hidden', !showCustomRow);
  if(showCustomRow) prefillCfxDefaults();
}
$('#effectToggleBtn').addEventListener('click', ()=>{
  if(state.effectType==='existing'){
    state.effectOn = !state.effectOn;
  }else if(state.effectType==='original'){
    const cyc = ['none','existing','original'];
    const idx = cyc.indexOf(state.effectSubMode);
    state.effectSubMode = cyc[(idx+1)%cyc.length];
  }
  updateEffectUI();
  updateStagePreviewMedia();
  saveState();
});

function updateFadeUI(){
  $('#fadeModeBtn').textContent = FADE_LABEL[state.fadeMode] || 'フェードなし';
  $('#fadeModeBtn').classList.toggle('active-state', state.fadeMode!=='none');
}
$('#fadeModeBtn').addEventListener('click', ()=>{
  const idx = FADE_CYCLE.indexOf(state.fadeMode);
  state.fadeMode = FADE_CYCLE[(idx+1)%FADE_CYCLE.length];
  updateFadeUI();
  saveState();
});

/* ---------- 独自Effect 記録 ---------- */
function prefillCfxDefaults(){
  let nextNo = 1;
  while(state.customEffects.some(e=>e.no===nextNo)) nextNo++;
  if(!$('#cfxNo').dataset.touched) $('#cfxNo').value = nextNo;
  if(!$('#cfxStep').value) $('#cfxStep').value = 1;
  if(!$('#cfxSec').value) $('#cfxSec').value = 0.1;
}
$('#cfxSaveBtn').addEventListener('click', ()=>{
  const no = parseInt($('#cfxNo').value,10) || 1;
  const step = parseInt($('#cfxStep').value,10) || 1;
  const sec = parseFloat($('#cfxSec').value) || 0.1;
  const colorName = currentColorName() || '-';
  const strobeLabel = STROBE_LABEL_CUE[state.strobeMode] || 'なし';
  state.customEffects.push({id:uid(), no, step, sec, colorName, strobeLabel});
  let nextNo=1; while(state.customEffects.some(e=>e.no===nextNo)) nextNo++;
  $('#cfxNo').value = nextNo;
  $('#cfxStep').value = step+1;
  renderCustomFxTable();
  saveState();
});
function renderCustomFxTable(){
  const body = $('#customFxTableBody');
  body.innerHTML='';
  state.customEffects.forEach((e,idx)=>{
    const tr=document.createElement('tr');
    ['no','step','sec','colorName','strobeLabel'].forEach(f=>{
      const td=document.createElement('td');
      td.textContent = e[f];
      tr.appendChild(td);
    });
    const applyTd=document.createElement('td');
    const applyBtn=document.createElement('button');
    applyBtn.textContent='反映'; applyBtn.className='apply-btn';
    applyBtn.addEventListener('click', ()=>{ applyCustomFxToStage(e); });
    applyTd.appendChild(applyBtn);
    tr.appendChild(applyTd);
    const delTd=document.createElement('td');
    const delBtn=document.createElement('button');
    delBtn.textContent='✕'; delBtn.className='del-btn';
    delBtn.addEventListener('click', ()=>{ state.customEffects.splice(idx,1); renderCustomFxTable(); saveState(); });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    body.appendChild(tr);
  });
}

/* ============================================================
   ステージ状態（暗転/全照/50%）＆ 背景メディア表示（画像 or 動画）
   ============================================================ */
$all('.stage-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    state.stageState = btn.dataset.stage;
    updateStagePreviewMedia();
    saveState();
  });
});

function applyStrobeClasses(){
  const preview = $('#stagePreview');
  const k = currentStrobeKey();
  preview.classList.toggle('strobing', k==='chikachika');
  preview.classList.toggle('strobe-kurukuru', k==='kurukuru');
}

function setMediaWithFade(el, newSrc, afterSet){
  const dur = state.fadeDurationSec || 1;
  if(state.fadeMode==='none'){
    el.style.transition='none';
    el.src = newSrc;
    el.style.opacity=1;
    if(afterSet) afterSet();
    return;
  }
  el.style.transition = `opacity ${dur}s ease`;
  if(state.fadeMode==='out'){
    el.style.opacity=0;
    setTimeout(()=>{
      el.src = newSrc;
      if(afterSet) afterSet();
      requestAnimationFrame(()=>{ el.style.opacity=1; });
    }, dur*1000);
  } else { // 'in'
    el.style.opacity=0;
    el.src = newSrc;
    if(afterSet) afterSet();
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ el.style.opacity=1; }); });
  }
}

function updateStagePreviewMedia(){
  const imgEl = $('#stageBgImg');
  const videoEl = $('#stageBgVideo');

  if(state.stageVideoOverride){
    videoEl.classList.remove('hidden');
    imgEl.classList.add('hidden');
    if(videoEl.src !== state.stageVideoOverride){
      videoEl.src = state.stageVideoOverride;
      videoEl.load && videoEl.load();
      videoEl.play && videoEl.play().catch(()=>{});
    }
    applyColorFilter();
    applyStrobeClasses();
    return;
  }

  if(state.bgColorMode==='on' && currentColorName()){
    const useVideo = isEffectActive();
    const folder = useVideo ? 'mov' : 'img';
    const stageFolder = STAGE_FOLDER[state.stageState];
    const strobeFolder = STROBE_FOLDER[currentStrobeKey()];
    const colorName = currentColorName();
    const ext = useVideo ? 'mov' : 'png';
    const path = `${folder}/${stageFolder}/${strobeFolder}/${colorName}.${ext}`;
    const resolved = resolveAsset(path);

    if(useVideo){
      videoEl.onerror = ()=>{ videoEl.classList.add('hidden'); };
      setMediaWithFade(videoEl, resolved, ()=>{
        videoEl.classList.remove('hidden');
        imgEl.classList.add('hidden');
        videoEl.load && videoEl.load();
        videoEl.play && videoEl.play().catch(()=>{});
      });
    }else{
      imgEl.onerror = ()=>{ imgEl.classList.add('hidden'); };
      imgEl.onload = ()=>{ imgEl.classList.remove('hidden'); };
      setMediaWithFade(imgEl, resolved, ()=>{ videoEl.classList.add('hidden'); });
    }
  }else{
    const map = {anten:'img/anten.jpg', zensyou:'img/zensyou.jpg', hansyou:'img/hansyou.jpg'};
    const path = map[state.stageState];
    const resolved = resolveAsset(path);
    imgEl.onerror = ()=>{
      imgEl.classList.add('hidden');
      $('#stagePreview').style.background = state.stageState==='anten' ? '#000' : state.stageState==='hansyou' ? '#555' : '#ddd';
    };
    imgEl.onload = ()=>{ imgEl.classList.remove('hidden'); };
    setMediaWithFade(imgEl, resolved, ()=>{ videoEl.classList.add('hidden'); });
  }
  applyColorFilter();
  applyStrobeClasses();
}

$('#stageVideoDirectBtn').addEventListener('click', ()=>{
  if(state.stageVideoOverride){
    // 要件⑪：指定中に再度押すと指定を終了する
    state.stageVideoOverride = '';
    $('#stageVideoDirectBtn').classList.remove('active-highlight');
    updateStagePreviewMedia();
    saveState();
  }else{
    $('#stageVideoInput').click();
  }
});
$('#stageVideoInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  state.stageVideoOverride = URL.createObjectURL(file);
  $('#stageVideoDirectBtn').classList.add('active-highlight');
  updateStagePreviewMedia();
  saveState();
});

/* ============================================================
   ステージアイテム（ドラッグ&ドロップ配置）
   ============================================================ */
$('#stageItemInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    state.stageItems.push({id:uid(), src:ev.target.result, x:20, y:20});
    renderStageItems();
    saveState();
  };
  reader.readAsDataURL(file);
});

/* 要件⑭：ドラッグ&ドロップの代わりに「タップ（クリック）して選択→移動先をタップ」で配置する方式。
   スマホのスクロール操作と競合せず、PC・スマホのどちらでも同じ操作感で快適に動かせる。 */
let selectedStageItemId = null;

function renderStageItems(){
  const layer = $('#stageItemsLayer');
  layer.innerHTML='';
  state.stageItems.forEach(item=>{
    const el = document.createElement('div');
    el.className='stage-item' + (item.id===selectedStageItemId ? ' selected' : '');
    el.style.left = item.x+'px';
    el.style.top = item.y+'px';
    el.dataset.itemId = item.id;
    const img = document.createElement('img');
    img.src = item.src;
    el.appendChild(img);
    if(item.id===selectedStageItemId && !state.locked){
      const removeBtn = document.createElement('button');
      removeBtn.className='stage-item-remove-btn';
      removeBtn.textContent='✖';
      removeBtn.title='このアイテムを削除';
      removeBtn.addEventListener('click', ev=>{
        ev.stopPropagation();
        state.stageItems = state.stageItems.filter(i=>i.id!==item.id);
        if(selectedStageItemId===item.id) selectedStageItemId=null;
        renderStageItems();
        saveState();
      });
      el.appendChild(removeBtn);
    }
    el.addEventListener('click', e=>{
      if(state.locked) return;
      e.stopPropagation();
      selectedStageItemId = (selectedStageItemId===item.id) ? null : item.id;
      renderStageItems();
      updateStagePreviewSelectingClass();
    });
    layer.appendChild(el);
  });
  updateStagePreviewSelectingClass();
}
function updateStagePreviewSelectingClass(){
  $('#stagePreview').classList.toggle('item-selecting', !!selectedStageItemId);
}
$('#stagePreview').addEventListener('click', e=>{
  if(state.locked || !selectedStageItemId) return;
  if(e.target.closest('.stage-item')) return; // アイテム自体のタップは選択切替（上のハンドラ）に任せる
  const item = state.stageItems.find(i=>i.id===selectedStageItemId);
  if(!item) return;
  const rect = $('#stagePreview').getBoundingClientRect();
  const itemSize = 60; // .stage-item の width/height と合わせる
  item.x = e.clientX - rect.left - itemSize/2;
  item.y = e.clientY - rect.top - itemSize/2;
  renderStageItems();
  saveState();
});

/* ============================================================
   動画再生 & Cue記録
   ============================================================ */
const video = $('#rehearsalVideo');
$('#videoInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  video.src = URL.createObjectURL(file);
});
video.addEventListener('timeupdate', ()=>{
  $('#currentVideoTime').textContent = video.currentTime.toFixed(1)+'秒';
});

function currentTimeSource(){
  if(!video.paused && !video.ended) return video.currentTime;
  if(!scriptAudioPlayer.paused && !scriptAudioPlayer.ended) return scriptAudioPlayer.currentTime;
  return video.currentTime || scriptAudioPlayer.currentTime || 0;
}
function currentLineText(){
  // 要件⑨：読み上げ中の行を自動取得する仕組みは廃止し、常に選択範囲のみを記録する
  const sel = window.getSelection();
  if(sel && sel.toString().trim().length>0) return sel.toString().trim();
  return '';
}
function recordCue(sec){
  const strobeKey = currentStrobeKey();
  const strobeLabel = (state.effectType==='none' || !state.effectType)
    ? (strobeKey==='static' ? '◯' : 'なし')
    : (STROBE_LABEL_CUE[strobeKey] || 'なし');
  const effectMark = (state.effectType==='original' && state.effectSubMode!=='none') ? '◯' : '';
  const stageLabelMap = {anten:'暗転', zensyou:'全照', hansyou:'半照'};
  const cue = {
    sec: (typeof sec==='number') ? sec.toFixed(1) : String(sec||0),
    line: currentLineText(),
    audio: state.currentAudioLabel || '-',
    stage: stageLabelMap[state.stageState] || state.stageState,
    bg: currentColorName() || '',
    effect: effectMark,
    strobe: strobeLabel,
    fade: FADE_LABEL[state.fadeMode] || 'フェードなし'
  };
  state.cues.push(cue);
  state.cues.sort((a,b)=>parseFloat(a.sec)-parseFloat(b.sec));
  renderCueTable();
  saveState();
}
$('#videoCueBtn').addEventListener('click', ()=> recordCue(video.currentTime));
$('#scriptCueBtn').addEventListener('click', ()=> recordCue(scriptAudioPlayer.currentTime || 0));
$('#cueTabAddBtn').addEventListener('click', ()=> recordCue(currentTimeSource()));
$('#customfxCueBtn').addEventListener('click', ()=> recordCue(currentTimeSource()));

/* ---------- Cue/独自Effect一覧の内容をステージ画面へ上書き反映（要件⑤） ---------- */
function applyCueToStage(cue){
  const stageRevMap = {'暗転':'anten','全照':'zensyou','半照':'hansyou'};
  if(stageRevMap[cue.stage]) state.stageState = stageRevMap[cue.stage];

  if(state.bgColorMode==='on'){
    if(cue.bg){
      const idx = COLOR_PALETTE.findIndex(c=>c.name===cue.bg);
      state.activeColorIndex = idx>=0 ? idx : null;
    }else{
      state.activeColorIndex = null;
    }
    if(state.effectType==='none'){
      state.strobeOn = (cue.strobe==='◯');
    }else{
      const revKey = Object.keys(STROBE_LABEL_CUE).find(k=>STROBE_LABEL_CUE[k]===cue.strobe);
      state.strobeMode = revKey || 'none';
    }
    if(state.effectType==='existing'){
      state.effectOn = !!cue.effect;
    }else if(state.effectType==='original'){
      state.effectSubMode = cue.effect ? 'original' : 'none';
    }
  }
  const revFadeKey = Object.keys(FADE_LABEL).find(k=>FADE_LABEL[k]===cue.fade);
  state.fadeMode = revFadeKey || 'none';

  renderColorToggles();
  updateStrobeUI();
  updateEffectUI();
  updateFadeUI();
  updateStagePreviewMedia();
  saveState();
}
function applyCustomFxToStage(fx){
  if(state.bgColorMode==='on'){
    const idx = COLOR_PALETTE.findIndex(c=>c.name===fx.colorName);
    state.activeColorIndex = idx>=0 ? idx : null;
    if(state.effectType!=='none'){
      const revKey = Object.keys(STROBE_LABEL_CUE).find(k=>STROBE_LABEL_CUE[k]===fx.strobeLabel);
      state.strobeMode = revKey || 'none';
    }
  }
  renderColorToggles();
  updateStrobeUI();
  updateStagePreviewMedia();
  saveState();
}

const CUE_TBODY_IDS = ['cueTableBody_script','cueTableBody_video','cueTableBody_cue'];
const CUE_FIELDS = ['sec','line','audio','stage','bg','effect','strobe','fade'];
function renderCueTable(){
  CUE_TBODY_IDS.forEach(id=>{
    const body = document.getElementById(id);
    if(!body) return;
    body.innerHTML='';
    state.cues.forEach((c,idx)=>{
      const tr = document.createElement('tr');
      tr.className='cue-row';
      CUE_FIELDS.forEach(f=>{
        const td = document.createElement('td');
        td.textContent = c[f];
        td.contentEditable = 'true';
        td.addEventListener('blur', ()=>{ c[f]=td.textContent; saveState(); });
        tr.appendChild(td);
      });
      const applyTd = document.createElement('td');
      const applyBtn = document.createElement('button');
      applyBtn.textContent='反映'; applyBtn.className='apply-btn';
      applyBtn.addEventListener('click', ev=>{ ev.stopPropagation(); applyCueToStage(c); });
      applyTd.appendChild(applyBtn);
      tr.appendChild(applyTd);
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.textContent='✕'; delBtn.className='del-btn';
      delBtn.addEventListener('click', ev=>{ ev.stopPropagation(); state.cues.splice(idx,1); renderCueTable(); saveState(); });
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tr.addEventListener('click', ()=>{ video.currentTime = parseFloat(c.sec)||0; });
      body.appendChild(tr);
    });
  });
}

/* ============================================================
   CSV出力（UTF-8 BOM付き）
   ============================================================ */
$('#exportCsvBtn').addEventListener('click', ()=>{
  const headers = ['秒数','セリフ','音源','舞台','背景','Effect','ストロボ','フェード'];
  const rows = state.cues.map(c=>[c.sec,c.line,c.audio,c.stage,c.bg,c.effect,c.strobe,c.fade]);
  let csv = headers.join(',') + '\n';
  rows.forEach(r=>{
    csv += r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',') + '\n';
  });
  const bom = new Uint8Array([0xEF,0xBB,0xBF]);
  const blob = new Blob([bom, csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stage_cue_sheet.csv';
  a.click();
  $('#settingsMenu').classList.add('hidden');
});

/* ============================================================
   JSON エクスポート / インポート
   ============================================================ */
$('#exportJsonBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stage_planner_data.json';
  a.click();
});
$('#importJsonInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const loaded = JSON.parse(ev.target.result);
      state = Object.assign(state, loaded);
      applyAllSettingsToUI();
      saveState();
      alert('読み込みが完了しました。');
    }catch(err){ alert('JSONの読み込みに失敗しました: '+err.message); }
  };
  reader.readAsText(file);
});

/* ============================================================
   印刷 / PDF
   ============================================================ */
$('#printBtn').addEventListener('click', ()=>{
  const printArea = $('#printArea');
  printArea.innerHTML = `<h1>台本・キューシート</h1>` + scriptEditor.innerHTML +
    `<h2>キューシート一覧</h2>` +
    `<table border="1" style="width:100%;border-collapse:collapse;">
      <tr><th>秒数</th><th>セリフ</th><th>音源</th><th>舞台</th><th>背景</th><th>Effect</th><th>ストロボ</th><th>フェード</th></tr>
      ${state.cues.map(c=>`<tr><td>${c.sec}</td><td>${c.line}</td><td>${c.audio}</td><td>${c.stage}</td><td>${c.bg}</td><td>${c.effect}</td><td>${c.strobe}</td><td>${c.fade}</td></tr>`).join('')}
    </table>`;
  window.print();
});

/* ============================================================
   自動保存
   ============================================================ */
setInterval(saveState, 30000);
window.addEventListener('beforeunload', saveState);

/* ============================================================
   初期化
   ============================================================ */
document.addEventListener('DOMContentLoaded', async ()=>{
  loadState();
  await loadAdminsFromDataJson();
  populateAdminColorSelect();
  updateAdminAssetPathPreview();
  applyModalAssets();
  initModalLogic();
  initGoogleLoginUI();
  updateGoogleLoginUI();
  if(state.initDone){
    $('#initModal').classList.add('hidden');
    applyAllSettingsToUI();
  }else{
    prefillModalSelections();
  }
  updateLoginUI();
  updateSWDisplay();
});
