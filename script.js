import { SoftTennisMatchEngine } from './engine.mjs';
import { servingSideForGame, normalPointRoles, finalPointRoles, otherSide } from './service.mjs';
import { summarizeMatch } from './stats.mjs';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const STORAGE_KEY = 'rally-note-poc-v1';
const ARCHIVE_KEY = 'rally-note-match-archive-v1';
const PLAYER_PROFILE_KEY = 'rally-note-player-profiles-v1';
const el = Object.fromEntries(['setupScreen','workspace','youtubeTab','localTab','photosTab','photosSetup','photosUrl','photosError','photosOpen','youtubeSetup','localSetup','youtubeUrl','youtubeError','videoFile','fileLabel','startBtn','newMatchBtn','formatBadge','saveState','youtubePlayer','localPlayer','emptyVideo','videoName','currentTime','gameLabel','modeBadge','selfPoint','opponentPoint','selfGames','opponentGames','matchComplete','tagChips','quickAddTag','manageTagsBtn','selfScoreBtn','opponentScoreBtn','undoBtn','historyCount','emptyHistory','historyList','pastMatchesBtn','pastMatchesDialog','closePastMatchesBtn','pointConfirm','pointConfirmSummary','confirmPointBtn','statsGrid','inputPanel','historyPanel','statsPanel','tagDialog','newTagName','addTagBtn','tagManagerList','tagError','toast','videoError','videoErrorTitle','videoErrorMessage','switchLocalBtn','openYoutubeLink','reselectLocalVideoBtn','selfPlayer1','selfPlayer2','opponentPlayer1','opponentPlayer2','selfPosition1','selfPosition2','opponentPosition1','opponentPosition2','savedSelfPlayer1','savedSelfPlayer2','savedOpponentPlayer1','savedOpponentPlayer2','saveSelfPlayer1','saveSelfPlayer2','saveOpponentPlayer1','saveOpponentPlayer2','serviceCourt','currentServer','currentReceiver','changeSideNote','normalServiceSettings','finalServiceSettings','firstServerSelect','rightReceiverSelect','finalSelfServer','finalOpponentServer','finalSelfReceiver','finalOpponentReceiver','serveFirstBtn','serveSecondBtn','selfFrontWinner','selfBackWinner','opponentFrontWinner','opponentBackWinner','selfFrontError','selfBackError','opponentFrontError','opponentBackError','resultTab','resultPanel','resultSummary','reviewTab','reviewPanel','reflectionTab','reflectionPanel','reflectionSummary','resultDrilldown','detailEntry','detailSummary','shotTypeChips','tagTargetLabel','tagTargetSwitch','playerDetailDialog','playerDetailTitle','playerDetailSubtitle','playerDetailBody','closePlayerDetailBtn','matchDate','tournamentName','matchLabel','archiveOverview','savedPlayersPanel','mobilePointEntry','mobileOutcomeStep','mobileShotStep','mobileStepTitle','mobileSideChoice','mobileCategoryLabel','mobileStepBack','playersBtn','playersDialog','closePlayersBtn','playersManagerPanel','newProfileName','newProfileSchool','newProfilePosition','createProfileBtn','saveSetupBtn','setupSaveStatus','keepLocalVideo','videoStorageStatus'].map(id=>[id,$(`#${id}`)]));

let sourceType = 'youtube';

const VIDEO_DB='rally-note-videos-v1', VIDEO_STORE='videos';
function openVideoDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(VIDEO_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(VIDEO_STORE))r.result.createObjectStore(VIDEO_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function putStoredVideo(matchId,file){const db=await openVideoDB();return new Promise((resolve,reject)=>{const tx=db.transaction(VIDEO_STORE,'readwrite');tx.objectStore(VIDEO_STORE).put(file,matchId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
async function getStoredVideo(matchId){const db=await openVideoDB();return new Promise((resolve,reject)=>{const r=db.transaction(VIDEO_STORE).objectStore(VIDEO_STORE).get(matchId);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
async function deleteStoredVideo(matchId){const db=await openVideoDB();return new Promise(resolve=>{const tx=db.transaction(VIDEO_STORE,'readwrite');tx.objectStore(VIDEO_STORE).delete(matchId);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});}
async function clearStoredVideos(){try{const db=await openVideoDB();await new Promise(resolve=>{const tx=db.transaction(VIDEO_STORE,'readwrite');tx.objectStore(VIDEO_STORE).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();});}catch{}}
async function persistLocalVideoIfRequested(){if(state?.videoSource?.type!=='local'||!state.videoSource.file||!state.videoSource.keepStored)return;try{if(el.videoStorageStatus)el.videoStorageStatus.textContent='動画をこのブラウザに保存中…';await putStoredVideo(state.matchId,state.videoSource.file);state.videoSource.storedVideo=true;save();if(el.videoStorageStatus)el.videoStorageStatus.textContent='動画も保存済み ✓';showToast('分析データと動画をこのブラウザに保存しました');}catch(err){state.videoSource.storedVideo=false;if(el.videoStorageStatus)el.videoStorageStatus.textContent='動画を保存できませんでした。空き容量を確認してください。';showToast('動画の保存に失敗しました');}}
async function attachStoredLocalVideo(){if(state?.videoSource?.type!=='local'||!state.videoSource?.storedVideo)return false;try{const file=await getStoredVideo(state.matchId);if(!file)return false;state.videoSource={...state.videoSource,file};sourceType='local';el.reselectLocalVideoBtn.hidden=true;initVideo();return true;}catch{return false;}}

let objectUrl = '';
let ytPlayer = null;
let clockTimer = null;
let pendingServeAttempt = 'first';
let pendingShotType = '';
let pendingShotBase = '';
let pendingShotModifier = '';
let pendingShotModifiers = [];
let pendingShotSubtype = '';
let pendingNetSide = '';
let mobileShotCategory = '';
let pendingPointStartTimestamp = null;
let tagTargetPointId = null;
let reviewingPoint = false;
let pendingOutcome = null;
let lastServerId = null;
let state = { matchDate:'', tournamentName:'', matchLabel:'', createdAt:null, updatedAt:null, playbackTime:0, format:7, videoSource:null, points:[], tags:[], selectedTagIds:[], players:null, startServiceSide:'self', serviceSettings:{}, finalServiceSettings:null };
let engine = new SoftTennisMatchEngine(7);

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const esc = (v='') => String(v).replace(/[&<>'"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
const formatTime = value => { const t=Math.max(0,Math.floor(Number(value)||0)); return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; };
const videoTime = () => sourceType==='youtube' && ytPlayer?.getCurrentTime ? ytPlayer.getCurrentTime() : (el.localPlayer.currentTime||0);
const showToast = message => { el.toast.textContent=message; el.toast.classList.add('show'); setTimeout(()=>el.toast.classList.remove('show'),1600); };
const hideVideoError = () => { el.videoError.hidden = true; };
function showYoutubeError(code){
  const messages={
    2:'動画IDまたはURLが正しくありません。URLを確認してください。',
    5:'この動画は埋め込みプレーヤーで再生できません。端末内動画での分析を試してください。',
    100:'動画が削除済み、または非公開の可能性があります。',
    101:'動画の所有者が外部サイトでの埋め込み再生を許可していません。',
    150:'動画の所有者が外部サイトでの埋め込み再生を許可していません。',
    153:'YouTubeへのリクエストに必要なHTTP Refererが不足しています。動画側の埋め込み許可とは別の問題です。file://で直接開かず、HTTP/HTTPS環境で起動してください。'
  };
  el.videoErrorTitle.textContent='YouTube動画をアプリ内再生できません';
  el.videoErrorMessage.textContent=messages[code]||`YouTubeプレーヤーでエラーが発生しました（${code}）。端末内動画での分析も利用できます。`;
  el.openYoutubeLink.href=state.videoSource?.url||`https://www.youtube.com/watch?v=${state.videoSource?.videoId||''}`;
  el.videoError.hidden=false;
}

function extractYoutubeId(input){
  const value=input.trim(); if(/^[\w-]{11}$/.test(value)) return value;
  try { const url=new URL(value); if(url.hostname.includes('youtu.be')) return url.pathname.split('/')[1]?.slice(0,11)||''; if(url.hostname.includes('youtube.com')) return url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1] || ''; } catch{}
  return '';
}
function getPlayerProfiles(){
  try{return JSON.parse(localStorage.getItem(PLAYER_PROFILE_KEY))||[];}catch{return [];}
}
function setPlayerProfiles(profiles){
  localStorage.setItem(PLAYER_PROFILE_KEY,JSON.stringify(profiles));
}
const playerSlots=[
  {key:'self1',side:'self',name:'selfPlayer1',position:'selfPosition1',saved:'savedSelfPlayer1',save:'saveSelfPlayer1',fallback:'自分A'},
  {key:'self2',side:'self',name:'selfPlayer2',position:'selfPosition2',saved:'savedSelfPlayer2',save:'saveSelfPlayer2',fallback:'自分B'},
  {key:'opponent1',side:'opponent',name:'opponentPlayer1',position:'opponentPosition1',saved:'savedOpponentPlayer1',save:'saveOpponentPlayer1',fallback:'相手A'},
  {key:'opponent2',side:'opponent',name:'opponentPlayer2',position:'opponentPosition2',saved:'savedOpponentPlayer2',save:'saveOpponentPlayer2',fallback:'相手B'}
];
function renderSavedPlayerSelectors(){
  const profiles=getPlayerProfiles();
  playerSlots.forEach(slot=>{
    const sel=el[slot.saved]; if(!sel)return;
    const current=sel.value;
    sel.innerHTML=`<option value="">${sel.id.includes('Opponent')?'対戦履歴':'保存選手'}</option>`+profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    if(profiles.some(p=>p.id===current))sel.value=current;
  });
}
function bindSavedPlayerSelectors(){
  playerSlots.forEach(slot=>{
    const sel=el[slot.saved], input=el[slot.name], pos=el[slot.position], saveBox=el[slot.save];
    if(!sel||!input)return;
    sel.onchange=()=>{
      const profile=getPlayerProfiles().find(p=>p.id===sel.value);
      if(profile){
        input.value=profile.name||'';
        if(profile.position&&[...pos.options].some(o=>o.value===profile.position))pos.value=profile.position;
        if(saveBox)saveBox.checked=false;
      }
    };
    input.addEventListener('input',()=>{
      if(sel.value)sel.value='';
    });
  });
}
function resolveSetupPlayer(slot){
  const input=el[slot.name], pos=el[slot.position], sel=el[slot.saved], saveBox=el[slot.save];
  const name=input.value.trim()||slot.fallback;
  let profileId=sel?.value||null;
  if(!profileId && saveBox?.checked && input.value.trim()){
    const profiles=getPlayerProfiles();
    const profile={id:uid(),name:input.value.trim(),position:pos.value,school:'',grade:'',handedness:'',styleTags:[],notes:'',isSelf:false,isFavorite:false,createdAt:new Date().toISOString()};
    profiles.push(profile);setPlayerProfiles(profiles);profileId=profile.id;
  }
  return {id:slot.key,profileId,side:slot.side,name,position:pos.value};
}
function save(){
  state.updatedAt=new Date().toISOString();
  state.playbackTime=Number(videoTime()||state.playbackTime||0);
  const safe={...state,selectedTagIds:[],videoSource:state.videoSource?.type==='local'?{...state.videoSource,file:null}:state.videoSource};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(safe)); if(state.matchId&&state.points?.length) archiveCurrentMatch(true); if(el.saveState){el.saveState.textContent='保存しました'; setTimeout(()=>el.saveState.textContent='この端末に自動保存',800);}
}

function getArchive(){
  try{return JSON.parse(localStorage.getItem(ARCHIVE_KEY))||[];}catch{return [];}
}
function archiveSafeState(){
  return {...state,selectedTagIds:[],videoSource:state.videoSource?.type==='local'?{...state.videoSource,file:null}:state.videoSource};
}
function archiveCurrentMatch(force=false){
  if(!state.points.length)return false;
  if(!force&&!engine.getState().matchComplete)return false;
  state.matchId ||= uid();
  const archive=getArchive();
  const snapshot={id:state.matchId,savedAt:new Date().toISOString(),complete:engine.getState().matchComplete,data:archiveSafeState()};
  const idx=archive.findIndex(x=>x.id===state.matchId);
  if(idx>=0)archive[idx]=snapshot; else archive.unshift(snapshot);
  localStorage.setItem(ARCHIVE_KEY,JSON.stringify(archive.slice(0,100)));
  renderHistory();
  return true;
}
function restoreArchivedMatch(item){
  if(!item?.data)return;
  state={...item.data,selectedTagIds:[],matchId:item.id};
  sourceType=state.videoSource?.type||'youtube';
  engine=new SoftTennisMatchEngine(state.format,state.points.map(p=>p.winner));
  el.workspace.hidden=false; el.setupScreen.hidden=true;
  el.formatBadge.textContent=`${state.format} GAME MATCH`;
  el.videoName.textContent=state.videoSource?.type==='youtube'?`YouTube · ${state.videoSource.videoId}`:(state.videoSource?.fileName||'端末内動画（再選択が必要）');
  if(state.videoSource?.type==='youtube')initVideo();
  else {el.youtubePlayer.hidden=true;el.localPlayer.style.display='none';el.emptyVideo.hidden=false;el.emptyVideo.querySelector('p')&&(el.emptyVideo.querySelector('p').textContent=`分析データは保存済みです。元の端末動画を選ぶと ${formatTime(state.playbackTime||0)} から再開できます。`);if(el.reselectLocalVideoBtn)el.reselectLocalVideoBtn.hidden=false;}
  render();showPanel(engine.getState().matchComplete?'stats':'input');
}
function loadYoutubeApi(){
  if(window.YT?.Player) return Promise.resolve();
  return new Promise(resolve=>{ window.onYouTubeIframeAPIReady=resolve; const s=document.createElement('script'); s.src='https://www.youtube.com/iframe_api'; document.head.append(s); });
}
async function initVideo(){
  el.emptyVideo.hidden=false;
  if(sourceType==='local'){
    hideVideoError();
    el.youtubePlayer.hidden=true; el.localPlayer.style.display='block';
    if(objectUrl) URL.revokeObjectURL(objectUrl); objectUrl=URL.createObjectURL(state.videoSource.file); el.localPlayer.src=objectUrl;
    el.localPlayer.onloadedmetadata=()=>{ el.emptyVideo.hidden=true; state.videoSource.duration=el.localPlayer.duration; if(state.playbackTime)el.localPlayer.currentTime=Math.min(state.playbackTime,el.localPlayer.duration||state.playbackTime); };
    el.localPlayer.onplay=()=>{if(!reviewingPoint&&pendingPointStartTimestamp==null)pendingPointStartTimestamp=el.localPlayer.currentTime||0;};
  } else {
    el.localPlayer.style.display='none'; el.youtubePlayer.hidden=false;
    // YouTube埋め込みはHTTP Refererが必要。index.htmlをfile://で直接開くと
    // ブラウザからYouTubeへRefererを送れず、埋め込み許可済みの動画でも153になり得る。
    if (location.protocol === 'file:') {
      el.emptyVideo.hidden = true;
      el.videoError.hidden = false;
      el.videoErrorTitle.textContent = 'YouTube再生にはHTTP/HTTPSでの起動が必要です';
      el.videoErrorMessage.textContent = 'このページはファイルを直接開いています（file://）。YouTubeの埋め込み再生にはHTTP Refererが必要なため、同梱の start-local-server.command から起動するか、GitHub Pages等のHTTP/HTTPS環境で開いてください。動画側の「埋め込みを許可」がONでも、この状態ではエラー153になることがあります。';
      el.openYoutubeLink.href = state.videoSource?.url || `https://www.youtube.com/watch?v=${state.videoSource?.videoId||''}`;
      return;
    }
    await loadYoutubeApi();
    // YouTubeはHTTP Refererを必要とする。IFrame API任せにせずiframeを先に作り、
    // referrerpolicyを明示してからPlayer APIへ渡す。
    const holder = document.createElement('iframe');
    holder.id = 'youtubePlayerFrame';
    holder.setAttribute('title','YouTube video player');
    holder.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    holder.setAttribute('allowfullscreen','');
    holder.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    const validOrigin = /^https?:$/.test(location.protocol) ? location.origin : '';
    const params = new URLSearchParams({enablejsapi:'1',playsinline:'1',rel:'0'});
    if(validOrigin) params.set('origin', validOrigin);
    holder.src = `https://www.youtube.com/embed/${state.videoSource.videoId}?${params.toString()}`;
    const mount = el.youtubePlayer;
    mount.replaceChildren(holder);
    ytPlayer=new YT.Player(holder,{events:{onReady:()=>{el.emptyVideo.hidden=true;hideVideoError();if(state.playbackTime){try{ytPlayer.seekTo(state.playbackTime,true);}catch{}}},onStateChange:e=>{if(e.data===YT.PlayerState.PLAYING&&!reviewingPoint&&pendingPointStartTimestamp==null)pendingPointStartTimestamp=ytPlayer.getCurrentTime?.()||0;},onError:e=>{el.emptyVideo.hidden=true;showYoutubeError(e.data);}}});
  }
  clearInterval(clockTimer); clockTimer=setInterval(()=>el.currentTime.textContent=formatTime(videoTime()),500);
}

function setSource(type){ sourceType=type; el.youtubeTab.classList.toggle('active',type==='youtube'); el.localTab.classList.toggle('active',type==='local'); el.photosTab.classList.toggle('active',type==='photos'); el.youtubeSetup.hidden=type!=='youtube'; el.localSetup.hidden=type!=='local'; el.photosSetup.hidden=type!=='photos'; }
el.youtubeTab.onclick=()=>setSource('youtube'); el.localTab.onclick=()=>setSource('local'); el.photosTab.onclick=()=>setSource('photos'); el.photosUrl.addEventListener('input',()=>{const url=el.photosUrl.value.trim();const valid=/^https:\/\/(photos\.app\.goo\.gl|photos\.google\.com)\//i.test(url);el.photosOpen.hidden=!valid;if(valid)el.photosOpen.href=url;});
document.getElementById('photosVideoFile').addEventListener('change',e=>{const f=e.target.files?.[0];document.getElementById('photosFileStatus').textContent=f?'選択済み：'+f.name+'（分析を開始できます）':'動画が選択されていません';if(f){el.videoFile.files=e.target.files;el.videoFile.dispatchEvent(new Event('change'));}});
el.videoFile.onchange=()=>{ const file=el.videoFile.files[0]; el.fileLabel.textContent=file?file.name:'MP4 / MOV など・端末内だけで再生'; };
if(el.reselectLocalVideoBtn)el.reselectLocalVideoBtn.onclick=()=>el.videoFile.click();
el.videoFile.addEventListener('change',()=>{const file=el.videoFile.files[0];if(!file||!state?.videoSource||state.videoSource.type!=='local'||!el.workspace||el.workspace.hidden)return;const expectedName=state.videoSource.fileName||'',expectedSize=Number(state.videoSource.fileSize||0);if((expectedName&&file.name!==expectedName)||(expectedSize&&file.size!==expectedSize)){if(!confirm(`前回の動画（${expectedName||'不明'}）と異なる可能性があります。\nこの動画を再リンクしますか？`)){el.videoFile.value='';return;}}state.videoSource={...state.videoSource,file,fileName:file.name,fileSize:file.size||0};sourceType='local';el.reselectLocalVideoBtn.hidden=true;initVideo();save();showToast(`端末動画を再リンクしました。${formatTime(state.playbackTime||0)} から再開できます`);});
renderSavedPlayerSelectors();bindSavedPlayerSelectors();

el.startBtn.onclick=()=>{
  const format=Number($('input[name=format]:checked').value); let videoSource;
  if(sourceType==='youtube'){ const videoId=extractYoutubeId(el.youtubeUrl.value); if(!videoId){ el.youtubeError.textContent='有効なYouTube URLまたは動画IDを入力してください'; el.youtubeError.classList.add('error'); return; } videoSource={type:'youtube',url:el.youtubeUrl.value.trim(),videoId}; }
  else if(sourceType==='photos'){ const file=document.getElementById('photosVideoFile').files[0]; if(!file){el.photosError.textContent='共有URLだけでは分析を開始できません。Googleフォトから動画を保存して、下の動画選択から読み込んでください。';return;} videoSource={type:'local',file,fileName:file.name,fileSize:file.size||0,duration:0,photosShareUrl:el.photosUrl.value.trim()}; }
  else { const file=el.videoFile.files[0]; if(!file){ el.fileLabel.textContent='動画ファイルを選択してください'; return; } videoSource={type:'local',file,fileName:file.name,fileSize:file.size||0,duration:0}; }
  const resolvedPlayers=playerSlots.map(resolveSetupPlayer);
  const players={
    self:resolvedPlayers.filter(p=>p.side==='self'),
    opponent:resolvedPlayers.filter(p=>p.side==='opponent')
  };
  renderSavedPlayerSelectors();
  const startServiceSide=$('input[name=startService]:checked').value;
  state={matchId:uid(),matchDate:el.matchDate?.value||'',tournamentName:el.tournamentName?.value.trim()||'',matchLabel:el.matchLabel?.value.trim()||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),playbackTime:0,format,videoSource,points:[],tags:state.tags||[],selectedTagIds:[],players,startServiceSide,serviceSettings:{},serviceOrder:null,finalServiceSettings:null,reflection:{}}; lastServerId=null; engine=new SoftTennisMatchEngine(format); el.setupScreen.hidden=true; el.workspace.hidden=false; el.formatBadge.textContent=`${format} GAME MATCH`; el.videoName.textContent=videoSource.fileName||`YouTube · ${videoSource.videoId}`; initVideo(); render(); save();
};

function resetPointInputs(){
  pendingShotType=''; pendingShotBase=''; pendingShotModifier=''; pendingShotModifiers=[]; pendingShotSubtype=''; pendingNetSide=''; renderShotType();
  pendingServeAttempt='first';
  state.selectedTagIds=[];
  pendingPointStartTimestamp=null;
  pendingOutcome=null;
  $$('.outcome-grid button,.pair-only button').forEach(b=>b.classList.remove('pending-selected'));
  renderPointConfirm();
  renderServeAttempt();
}
function addPoint(winner, outcome=null){
  if(engine.getState().matchComplete) return;
  const timestamp=videoTime(); const startTimestamp=pendingPointStartTimestamp!=null?pendingPointStartTimestamp:Math.max(0,timestamp-12); const before=[...engine.winners]; const service=serviceRoles(); if(outcome&&isForcedErrorShot(pendingShotType)){const player=playerById(outcome.playerId);if(player){winner=player.side==='self'?'opponent':'self';outcome={...outcome,type:'error'};}}
  const score=engine.addPoint(winner);
  const point={id:uid(),sequence:state.points.length+1,winner,timestamp,startTimestamp,gameScore:{...score.games},pointScore:{...score.points},isFinalGame:score.isFinalGame || (score.matchComplete && before.length>0 && new SoftTennisMatchEngine(state.format,before).getState().isFinalGame),tagIds:[...state.selectedTagIds],service,serveAttempt:pendingServeAttempt,outcome:outcome?{...outcome,shotType:pendingShotType}:null,detail:{...(pendingShotSubtype?{shotSubtype:pendingShotSubtype}:{}),...(pendingShotModifiers.length?{shotModifiers:[...pendingShotModifiers]}:{})},note:''};
  state.points.push(point);
  tagTargetPointId=point.id;
  resetPointInputs(); resetMobilePointFlow(); render(); save();
  if(score.matchComplete){archiveCurrentMatch();showPanel('stats');}
}
function undo(){
  if(!state.points.length)return;
  const removed=state.points[state.points.length-1];
  const t=Math.max(0,Number.isFinite(Number(removed.startTimestamp))?Number(removed.startTimestamp):Math.max(0,(Number(removed.timestamp)||0)-12));
  state.points.pop(); engine.undo(); resetPointInputs(); resetMobilePointFlow(); render(); save();
  reviewingPoint=true;
  if(sourceType==='youtube'&&ytPlayer?.seekTo){ytPlayer.seekTo(t,true);ytPlayer.pauseVideo?.();}
  else if(el.localPlayer?.src){el.localPlayer.currentTime=t;el.localPlayer.pause?.();}
  showToast('1ポイント戻し、動画もポイント開始位置へ戻しました');
}
el.selfScoreBtn.onclick=()=>{stagePoint('self');$$('.outcome-grid button,.pair-only button').forEach(b=>b.classList.remove('pending-selected'));el.selfScoreBtn.classList.add('pending-selected');renderPointConfirm();};
el.opponentScoreBtn.onclick=()=>{stagePoint('opponent');$$('.outcome-grid button,.pair-only button').forEach(b=>b.classList.remove('pending-selected'));el.opponentScoreBtn.classList.add('pending-selected');renderPointConfirm();};
el.undoBtn.onclick=undo;

function renderServeAttempt(){
  el.serveFirstBtn?.classList.toggle('selected',pendingServeAttempt==='first');
  el.serveSecondBtn?.classList.toggle('selected',pendingServeAttempt==='second');
}
el.serveFirstBtn.onclick=()=>{tagTargetPointId=null;reviewingPoint=false;pendingServeAttempt='first';renderServeAttempt();renderTags();};
el.serveSecondBtn.onclick=()=>{tagTargetPointId=null;reviewingPoint=false;pendingServeAttempt='second';renderServeAttempt();renderTags();};

function playerForPosition(side,position){
  const pair=state.players?.[side]||[];
  return pair.find(p=>p.position===position) || (position==='前衛' ? pair[1] : pair[0]) || pair[0];
}
function outcomeButtonConfig(){
  const sf=playerForPosition('self','前衛'), sb=playerForPosition('self','後衛');
  const of=playerForPosition('opponent','前衛'), ob=playerForPosition('opponent','後衛');
  return [
    [el.selfFrontWinner,sf,'winner','self'],[el.selfBackWinner,sb,'winner','self'],[el.opponentFrontWinner,of,'winner','opponent'],[el.opponentBackWinner,ob,'winner','opponent'],
    [el.selfFrontError,sf,'error','opponent'],[el.selfBackError,sb,'error','opponent'],[el.opponentFrontError,of,'error','self'],[el.opponentBackError,ob,'error','self']
  ];
}
function renderOutcomeButtons(){
  outcomeButtonConfig().forEach(([button,player,type])=>{
    if(!button||!player)return;
    button.textContent=`${player.name}（${player.position}） ${type==='winner'?'得点':'ミス'}`;
    button.classList.toggle('side-self',player.side==='self');
    button.classList.toggle('side-opponent',player.side==='opponent');
    // 各ペアは登録順 A→B で左→右に固定。前衛/後衛を入れ替えても位置は変えない。
    const idx=(state.players?.[player.side]||[]).findIndex(p=>p.id===player.id);
    button.style.order=player.side==='self' ? idx : 2+idx;
  });
}

const isMobileInput=()=>window.matchMedia('(max-width:700px)').matches;
function resetMobilePointFlow(){
  mobileShotCategory='';
  if(!el.mobileOutcomeStep)return;
  el.mobileOutcomeStep.hidden=true;el.mobileShotStep.hidden=false;el.mobileSideChoice.hidden=true;
  el.mobileStepTitle.textContent='ショット → 得点 / ミス';
}
function openMobileShotStep(){ resetMobilePointFlow(); }
function commitMobileShot(shot){
  pendingShotType=shot;pendingShotSubtype='';
  el.mobileShotStep.hidden=false;el.mobileOutcomeStep.hidden=false;
  el.mobileStepTitle.textContent=isForcedErrorShot(shot)?`${shot}（ミス）→ ミスした選手を選択`:`${shot} → 最後に得点 / ミスを選択`;
}

// 大会日カレンダー（アプリ内表示）
const calendarDialog=document.querySelector('#calendarDialog'), calendarDays=document.querySelector('#calendarDays'), calendarTitle=document.querySelector('#calendarTitle');
let calendarCursor=new Date();
function updateDateLabel(){const t=document.querySelector('#matchDateText');if(!t||!el.matchDate)return;if(!el.matchDate.value){t.textContent='日付を選択';return;}const [y,m,d]=el.matchDate.value.split('-');t.textContent=`${y}/${Number(m)}/${Number(d)}`;}
function renderCalendar(){if(!calendarDays)return;const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();calendarTitle.textContent=`${y}年 ${m+1}月`;const first=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate();const today=new Date(),selected=el.matchDate?.value||'';let html='';for(let i=0;i<first;i++)html+='<span class="blank"></span>';for(let d=1;d<=last;d++){const val=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const cls=[val===selected?'selected':'',today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===d?'today':''].filter(Boolean).join(' ');html+=`<button type="button" class="${cls}" data-date="${val}">${d}</button>`;}calendarDays.innerHTML=html;calendarDays.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{el.matchDate.value=b.dataset.date;updateDateLabel();saveSetupDraft();calendarDialog.close();});}
document.querySelector('#matchDateButton')?.addEventListener('click',()=>{const v=el.matchDate?.value;if(v){const [y,m]=v.split('-').map(Number);calendarCursor=new Date(y,m-1,1);}else calendarCursor=new Date();renderCalendar();calendarDialog.showModal();});
document.querySelector('#calendarPrev')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar();});
document.querySelector('#calendarNext')?.addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();});
document.querySelector('#calendarToday')?.addEventListener('click',()=>{const n=new Date();el.matchDate.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;updateDateLabel();saveSetupDraft();calendarDialog.close();});
document.querySelector('#calendarClose')?.addEventListener('click',()=>calendarDialog.close());
el.matchDate?.addEventListener('change',updateDateLabel);updateDateLabel();

// v40: 動画を先に確認し、試合設定/大会情報を分ける
const setupTabs=[...document.querySelectorAll('[data-setup-tab]')];
setupTabs.forEach(btn=>btn.onclick=()=>{setupTabs.forEach(x=>x.classList.toggle('active',x===btn));const match=btn.dataset.setupTab==='match';document.querySelector('#setupMatchTab').hidden=!match;document.querySelector('#setupEventTab').hidden=match;});
const SETUP_DRAFT_KEY='rally-note-setup-draft-v1';
function setupDraft(){return {matchDate:el.matchDate?.value||'',tournamentName:el.tournamentName?.value||'',matchLabel:el.matchLabel?.value||'',youtubeUrl:el.youtubeUrl?.value||'',format:document.querySelector('input[name=format]:checked')?.value||'7'};}
function saveSetupDraft(manual=false){localStorage.setItem(SETUP_DRAFT_KEY,JSON.stringify(setupDraft()));if(el.setupSaveStatus)el.setupSaveStatus.textContent=manual?'保存しました ✓':'設定は自動保存されます';}
try{const d=JSON.parse(localStorage.getItem(SETUP_DRAFT_KEY)||'null');if(d){if(el.matchDate)el.matchDate.value=d.matchDate||'';if(el.tournamentName)el.tournamentName.value=d.tournamentName||'';if(el.matchLabel)el.matchLabel.value=d.matchLabel||'';if(el.youtubeUrl)el.youtubeUrl.value=d.youtubeUrl||'';const f=document.querySelector(`input[name=format][value="${d.format||7}"]`);if(f)f.checked=true;}}catch{}
updateDateLabel();
[el.matchDate,el.tournamentName,el.matchLabel,el.youtubeUrl,...document.querySelectorAll('input[name=format]')].filter(Boolean).forEach(x=>x.addEventListener('change',()=>saveSetupDraft(false)));
el.saveSetupBtn?.addEventListener('click',()=>saveSetupDraft(true));

function youtubeIdFromInput(v){const s=(v||'').trim();if(!s)return '';const m=s.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/);return m?m[1]:(/^[A-Za-z0-9_-]{6,}$/.test(s)?s:'');}
const setupYt=document.querySelector('#setupYoutubePreview'),setupLocal=document.querySelector('#setupLocalPreview'),setupEmpty=document.querySelector('.setup-preview-empty');
function refreshSetupPreview(){const id=youtubeIdFromInput(el.youtubeUrl?.value);if(id&&setupYt){setupYt.src=`https://www.youtube.com/embed/${id}?playsinline=1`;setupYt.hidden=false;setupLocal.hidden=true;setupEmpty.hidden=true;}else if(setupYt){setupYt.hidden=true;setupYt.src='';if(!setupLocal?.src)setupEmpty.hidden=false;}}
el.youtubeUrl?.addEventListener('change',refreshSetupPreview);el.youtubeUrl?.addEventListener('blur',refreshSetupPreview);
el.videoFile?.addEventListener('change',()=>{const f=el.videoFile.files?.[0];if(!f||!setupLocal)return;if(setupLocal.src)URL.revokeObjectURL(setupLocal.src);setupLocal.src=URL.createObjectURL(f);setupLocal.hidden=false;setupYt.hidden=true;setupEmpty.hidden=true;});
function renderPointConfirm(){
  if(!el.pointConfirmSummary||!el.confirmPointBtn)return;
  const isPairOnly=!!pendingOutcome && !pendingOutcome.outcome;
  const shot=pendingShotType ? `${pendingShotType}${pendingShotSubtype?`・${pendingShotSubtype}`:''}` : (isPairOnly?'ショット不明':'ショット未選択');
  let outcome='得点/ミス未選択';
  if(pendingOutcome){
    const player=pendingOutcome.outcome?.playerId?playerById(pendingOutcome.outcome.playerId):null;
    outcome=player?`${player.name} ${pendingOutcome.outcome.type==='winner'?'得点':'ミス'}`:(pendingOutcome.winner==='self'?'自分たち得点':'相手得点');
  }
  el.pointConfirmSummary.textContent=`${shot} → ${outcome}${isForcedErrorShot(pendingShotType)?'（ミスした選手の相手側に得点）':''}`;
  el.confirmPointBtn.disabled=!(pendingOutcome && (isPairOnly||pendingShotType));
}

function isForcedErrorShot(shot){return shot==='ネット'||shot==='チップ';}
function stagePoint(winner,outcome=null){
  if(outcome&&isForcedErrorShot(pendingShotType)){
    const player=playerById(outcome.playerId);
    if(player){winner=player.side==='self'?'opponent':'self';outcome={...outcome,type:'error'};}
  }
  // 選手まで特定する詳細入力ではショット必須。
  // 「自分たち得点 / 相手得点」の簡単入力は、ショット不明でも記録できる。
  if(outcome && !pendingShotType && !isMobileInput()){showToast('選手まで記録する場合は先にショットを選択してください');return;}
  pendingOutcome={winner,outcome};
  if(isMobileInput() && outcome && pendingShotType){const staged=pendingOutcome;pendingOutcome=null;addPoint(staged.winner,staged.outcome);resetMobilePointFlow();return;}
  if(isMobileInput() && outcome && !pendingShotType){showToast('先にショットを選択してください');pendingOutcome=null;return;}
  if(!isMobileInput() && outcome && pendingShotType){const staged=pendingOutcome;pendingOutcome=null;addPoint(staged.winner,staged.outcome);return;}
  $$('.outcome-grid button,.pair-only button').forEach(b=>b.classList.remove('pending-selected'));
  renderPointConfirm();
}
el.confirmPointBtn.onclick=()=>{
  if(!pendingOutcome){showToast('得点・ミスを選択してください');return;}
  const pairOnly=!pendingOutcome.outcome;
  if(!pairOnly&&!pendingShotType){showToast('選手まで記録する場合はショットを選択してください');return;}
  const staged=pendingOutcome; pendingOutcome=null;
  addPoint(staged.winner,staged.outcome);
};
const outcomeBindings=[['selfFrontWinner','self','前衛','winner','self'],['selfBackWinner','self','後衛','winner','self'],['opponentFrontWinner','opponent','前衛','winner','opponent'],['opponentBackWinner','opponent','後衛','winner','opponent'],['selfFrontError','self','前衛','error','opponent'],['selfBackError','self','後衛','error','opponent'],['opponentFrontError','opponent','前衛','error','self'],['opponentBackError','opponent','後衛','error','self']];
outcomeBindings.forEach(([id,side,position,type,winner])=>{ el[id].onclick=()=>{const player=playerForPosition(side,position);stagePoint(winner,{type,playerId:player?.id||null});$$('.outcome-grid button,.pair-only button').forEach(b=>b.classList.remove('pending-selected'));el[id].classList.add('pending-selected');renderPointConfirm();}; });
document.querySelectorAll('[data-mobile-outcome]').forEach(btn=>{
  const target=btn.dataset.mobileOutcome;
  const original=el[target];
  if(original){btn.textContent=original.textContent;btn.onclick=()=>original.click();}
});
document.querySelectorAll('[data-mobile-direct]').forEach(btn=>btn.onclick=()=>commitMobileShot(btn.dataset.mobileDirect));
document.querySelectorAll('[data-mobile-category]').forEach(btn=>btn.onclick=()=>{
  mobileShotCategory=btn.dataset.mobileCategory;
  el.mobileCategoryLabel.textContent=`${mobileShotCategory}：フォア / バック`;
  el.mobileSideChoice.hidden=false;
});
document.querySelectorAll('[data-mobile-side]').forEach(btn=>btn.onclick=()=>{
  if(mobileShotCategory)commitMobileShot(`${btn.dataset.mobileSide}${mobileShotCategory}`);
});
el.mobileStepBack?.addEventListener('click',()=>{pendingOutcome=null;pendingShotType='';resetMobilePointFlow();renderPointConfirm();});



function syncMobileOutcomeLabels(){
  document.querySelectorAll('[data-mobile-outcome]').forEach(btn=>{
    const original=el[btn.dataset.mobileOutcome];if(original){const label=original.textContent.trim();btn.textContent=label||'選手を選択';btn.setAttribute('aria-label',label||'選手を選択');}
  });
}
function composeShotType(){
  if(!pendingShotBase)return pendingShotModifier||'';
  if(isForcedErrorShot(pendingShotModifier))return pendingShotModifier;
  if(!pendingShotModifier)return pendingShotBase;
  if(['フォア','バック'].includes(pendingShotBase) && ['ロブ','中ロブ','トップ打ち','ツイスト','ローボレー','ハイボレー'].includes(pendingShotModifier)) return `${pendingShotBase}${pendingShotModifier}`;
  if(pendingShotBase==='ボレー' && ['ローボレー','ハイボレー'].includes(pendingShotModifier)) return pendingShotModifier;
  return pendingShotModifier==='その他'?pendingShotBase:`${pendingShotBase}・${pendingShotModifier}`;
}
function renderShotType(){
  if(!el.shotTypeChips)return;
  pendingShotModifier=pendingShotModifiers.find(m=>isForcedErrorShot(m))||pendingShotModifiers[0]||'';
  pendingShotType=composeShotType();
  el.shotTypeChips.querySelectorAll('[data-shot-base]').forEach(b=>b.classList.toggle('selected',(b.dataset.shotBase||'')===pendingShotBase));
  el.shotTypeChips.querySelectorAll('[data-shot-mod]').forEach(b=>b.classList.toggle('selected',pendingShotModifiers.includes(b.dataset.shotMod||'')));
  if(el.detailSummary)el.detailSummary.textContent=[pendingShotBase,...pendingShotModifiers].filter(Boolean).join(' ＋ ')||'選択必須';
  renderPointConfirm();
}
el.shotTypeChips?.querySelectorAll('[data-shot-base]').forEach(b=>b.onclick=()=>{
  tagTargetPointId=null;reviewingPoint=false;pendingNetSide='';pendingShotSubtype='';pendingShotBase=pendingShotBase===b.dataset.shotBase?'':b.dataset.shotBase||'';renderShotType();renderTags();
});
el.shotTypeChips?.querySelectorAll('[data-shot-mod]').forEach(b=>b.onclick=()=>{
  tagTargetPointId=null;reviewingPoint=false;{const mod=b.dataset.shotMod||'';if(pendingShotModifiers.includes(mod))pendingShotModifiers=pendingShotModifiers.filter(x=>x!==mod);else if(isForcedErrorShot(mod))pendingShotModifiers=[mod];else pendingShotModifiers=[...pendingShotModifiers.filter(x=>!isForcedErrorShot(x)),mod];}renderShotType();renderTags();
});
function openTags(){ renderTagManager(); el.tagError.textContent=''; el.tagDialog.showModal(); setTimeout(()=>el.newTagName.focus(),50); }
el.manageTagsBtn.onclick=openTags; el.quickAddTag.onclick=openTags;
function addTag(){ const name=el.newTagName.value.trim(); if(!name){el.tagError.textContent='タグ名を入力してください';return;} if(state.tags.some(t=>t.name.trim().toLowerCase()===name.toLowerCase())){el.tagError.textContent='同じ名前のタグがすでにあります';return;} state.tags.push({id:uid(),name,createdAt:new Date().toISOString()}); el.newTagName.value=''; el.tagError.textContent=''; renderTagManager(); renderTags(); save(); if(el.resultDrilldown&&!el.resultDrilldown.hidden){const f=el.resultDrilldown.querySelector('[data-review-filter].active')?.dataset.reviewFilter||'all';showAllPointReview(f);} }
el.addTagBtn.onclick=addTag; el.newTagName.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addTag();}};
function renderTagManager(){ el.tagManagerList.innerHTML=state.tags.length?state.tags.map(t=>`<div class="tag-manager-row" data-id="${t.id}"><input value="${esc(t.name)}" maxlength="30"><button class="rename" type="button">変更</button><button class="delete" type="button">削除</button></div>`).join(''):'<p class="field-note">タグはまだありません。</p>'; $$('.tag-manager-row').forEach(row=>{ const id=row.dataset.id; row.querySelector('.rename').onclick=()=>{const name=row.querySelector('input').value.trim();if(!name)return;if(state.tags.some(t=>t.id!==id&&t.name.trim().toLowerCase()===name.toLowerCase())){el.tagError.textContent='同じ名前のタグがあります';return;}el.tagError.textContent='';state.tags.find(t=>t.id===id).name=name;renderTags();renderHistory();renderStats();save();showToast('タグ名を変更しました');}; row.querySelector('.delete').onclick=()=>{state.tags=state.tags.filter(t=>t.id!==id);state.selectedTagIds=state.selectedTagIds.filter(x=>x!==id);state.points.forEach(p=>p.tagIds=p.tagIds.filter(x=>x!==id));renderTagManager();render();save();if(el.resultDrilldown&&!el.resultDrilldown.hidden){const f=el.resultDrilldown.querySelector('[data-review-filter].active')?.dataset.reviewFilter||'all';showAllPointReview(f);}}; }); }
function renderTags(){
  const targetPoint=tagTargetPointId?state.points.find(p=>p.id===tagTargetPointId):null;
  const activeIds=targetPoint?(targetPoint.tagIds||[]):state.selectedTagIds;
  if(el.tagTargetLabel)el.tagTargetLabel.textContent=targetPoint?`直前の Point ${targetPoint.sequence} に追加します`:'次のポイントに付けます';
  if(el.tagTargetSwitch){
    el.tagTargetSwitch.textContent=targetPoint?'次のポイント用に切替':(state.points.length?'直前ポイントに戻す':'次のポイント用');
    el.tagTargetSwitch.disabled=!state.points.length;
  }
  el.tagChips.innerHTML=state.tags.map(t=>`<button class="tag-chip ${activeIds.includes(t.id)?'selected':''}" data-id="${t.id}" type="button">${esc(t.name)}</button>`).join('')+'<button class="add-tag" id="quickAddTag" type="button">＋ 新しいタグ</button>';
  el.quickAddTag=$('#quickAddTag');el.quickAddTag.onclick=openTags;
  $$('.tag-chip').forEach(chip=>chip.onclick=()=>{
    const id=chip.dataset.id;
    if(targetPoint){
      targetPoint.tagIds=targetPoint.tagIds||[];
      targetPoint.tagIds=targetPoint.tagIds.includes(id)?targetPoint.tagIds.filter(x=>x!==id):[...targetPoint.tagIds,id];
      save(); if(engine.getState().matchComplete)archiveCurrentMatch(); renderStats();renderResult();
    }else{
      state.selectedTagIds=state.selectedTagIds.includes(id)?state.selectedTagIds.filter(x=>x!==id):[...state.selectedTagIds,id];
    }
    renderTags();
  });
}
el.tagTargetSwitch.onclick=()=>{
  if(tagTargetPointId){tagTargetPointId=null;}
  else if(state.points.length){tagTargetPointId=state.points[state.points.length-1].id;}
  renderTags();
};

function pairIds(side){ return (state.players?.[side]||[]).map(p=>p.id); }
function playerById(id){ return [...(state.players?.self||[]),...(state.players?.opponent||[])].find(p=>p.id===id); }
function playerLabel(id){ const p=playerById(id); return p ? `${p.name}${p.position&&p.position!=='未設定'?`（${p.position}）`:''}` : '—'; }
function fillSelect(select, ids, value){
  if(!select) return;
  select.innerHTML=ids.map(id=>`<option value="${esc(id)}">${esc(playerLabel(id))}</option>`).join('');
  if(ids.includes(value)) select.value=value;
}
function ensureServiceSettings(){
  if(!state.players) return;
  const m=engine.getState();
  const selfIds=pairIds('self'), oppIds=pairIds('opponent');
  if(m.isFinalGame){
    state.finalServiceSettings ||= {
      firstServerBySide:{self:selfIds[0],opponent:oppIds[0]},
      rightReceiverBySide:{self:selfIds[0],opponent:oppIds[0]}
    };
    return;
  }
  const servingSide=servingSideForGame(state.startServiceSide||'self',m.gameNumber);
  const receivingSide=otherSide(servingSide);
  const key=String(m.gameNumber);
  state.serviceSettings ||= {};
  state.serviceOrder ||= {
    self:{firstServerId:selfIds[0],rightReceiverId:selfIds[0]},
    opponent:{firstServerId:oppIds[0],rightReceiverId:oppIds[0]}
  };
  state.serviceSettings[key] ||= {
    firstServerId:state.serviceOrder[servingSide]?.firstServerId||pairIds(servingSide)[0],
    rightReceiverId:state.serviceOrder[receivingSide]?.rightReceiverId||pairIds(receivingSide)[0]
  };
}
function serviceRoles(){
  if(!state.players) return null;
  ensureServiceSettings();
  const m=engine.getState();
  const pointIndex=m.points.self+m.points.opponent;
  const pairIdsBySide={self:pairIds('self'),opponent:pairIds('opponent')};
  if(m.isFinalGame){
    const f=state.finalServiceSettings;
    return finalPointRoles({pointIndex,startServiceSide:state.startServiceSide||'self',pairIdsBySide,firstServerBySide:f.firstServerBySide,rightReceiverBySide:f.rightReceiverBySide});
  }
  const servingSide=servingSideForGame(state.startServiceSide||'self',m.gameNumber);
  const receivingSide=otherSide(servingSide);
  const cfg=state.serviceSettings[String(m.gameNumber)];
  return {...normalPointRoles({pointIndex,servingPairIds:pairIdsBySide[servingSide],receivingPairIds:pairIdsBySide[receivingSide],firstServerId:cfg.firstServerId,rightReceiverId:cfg.rightReceiverId}),servingSide,receivingSide,changeSidesBeforePoint:false};
}
function renderService(){
  if(!state.players){ if(el.currentServer) el.currentServer.textContent='—'; return; }
  ensureServiceSettings();
  const m=engine.getState();
  if(m.matchComplete){ el.currentServer.textContent='—';el.currentReceiver.textContent='—';return; }
  const roles=serviceRoles();
  el.currentServer.textContent=playerLabel(roles.server);
  el.currentReceiver.textContent=playerLabel(roles.receiver);
  el.serviceCourt.textContent=roles.serviceFrom==='right'?'右から':'左から';
  if(lastServerId && lastServerId!==roles.server && state.points.length){ showToast(`サーバー交代：${playerLabel(roles.server)}`); }
  lastServerId=roles.server;
  el.changeSideNote.hidden=!roles.changeSidesBeforePoint;
  if(m.isFinalGame){
    el.normalServiceSettings.hidden=true;el.finalServiceSettings.hidden=false;
    const f=state.finalServiceSettings;
    fillSelect(el.finalSelfServer,pairIds('self'),f.firstServerBySide.self);
    fillSelect(el.finalOpponentServer,pairIds('opponent'),f.firstServerBySide.opponent);
    fillSelect(el.finalSelfReceiver,pairIds('self'),f.rightReceiverBySide.self);
    fillSelect(el.finalOpponentReceiver,pairIds('opponent'),f.rightReceiverBySide.opponent);
  }else{
    el.finalServiceSettings.hidden=true;el.normalServiceSettings.hidden=false;
    const servingSide=servingSideForGame(state.startServiceSide||'self',m.gameNumber);
    const receivingSide=otherSide(servingSide);
    const cfg=state.serviceSettings[String(m.gameNumber)];
    fillSelect(el.firstServerSelect,pairIds(servingSide),cfg.firstServerId);
    fillSelect(el.rightReceiverSelect,pairIds(receivingSide),cfg.rightReceiverId);
  }
}
function bindServiceControls(){
  if(el.firstServerSelect) el.firstServerSelect.onchange=()=>{const m=engine.getState();ensureServiceSettings();const side=servingSideForGame(state.startServiceSide||'self',m.gameNumber);state.serviceOrder||={};state.serviceOrder[side]||={};state.serviceOrder[side].firstServerId=el.firstServerSelect.value;Object.keys(state.serviceSettings||{}).forEach(k=>{if(servingSideForGame(state.startServiceSide||'self',Number(k))===side)state.serviceSettings[k].firstServerId=el.firstServerSelect.value;});state.serviceSettings[String(m.gameNumber)].firstServerId=el.firstServerSelect.value;renderService();save();showToast(`${side==='self'?'自分':'相手'}ペアのサーブ順を固定しました`);};
  if(el.rightReceiverSelect) el.rightReceiverSelect.onchange=()=>{const m=engine.getState();ensureServiceSettings();const serving=servingSideForGame(state.startServiceSide||'self',m.gameNumber),side=otherSide(serving);state.serviceOrder||={};state.serviceOrder[side]||={};state.serviceOrder[side].rightReceiverId=el.rightReceiverSelect.value;Object.keys(state.serviceSettings||{}).forEach(k=>{if(otherSide(servingSideForGame(state.startServiceSide||'self',Number(k)))===side)state.serviceSettings[k].rightReceiverId=el.rightReceiverSelect.value;});state.serviceSettings[String(m.gameNumber)].rightReceiverId=el.rightReceiverSelect.value;renderService();save();};
  const updateFinal=()=>{ensureServiceSettings();const f=state.finalServiceSettings;f.firstServerBySide.self=el.finalSelfServer.value;f.firstServerBySide.opponent=el.finalOpponentServer.value;f.rightReceiverBySide.self=el.finalSelfReceiver.value;f.rightReceiverBySide.opponent=el.finalOpponentReceiver.value;renderService();save();};
  [el.finalSelfServer,el.finalOpponentServer,el.finalSelfReceiver,el.finalOpponentReceiver].forEach(x=>{if(x)x.onchange=updateFinal;});
}
bindServiceControls();

function renderScore(){ const s=engine.getState(); el.gameLabel.textContent=s.matchComplete?'MATCH COMPLETE':`GAME ${s.gameNumber}`; el.modeBadge.textContent=s.isFinalGame?'FINAL GAME':'NORMAL GAME'; el.selfPoint.textContent=s.points.self;el.opponentPoint.textContent=s.points.opponent;el.selfGames.textContent=s.games.self;el.opponentGames.textContent=s.games.opponent;el.undoBtn.disabled=!state.points.length;el.selfScoreBtn.disabled=s.matchComplete;el.opponentScoreBtn.disabled=s.matchComplete;el.matchComplete.hidden=!s.matchComplete;el.matchComplete.textContent=s.matchComplete?`${s.winner==='self'?'自分たち':'相手'}の勝利 · ${s.games.self}–${s.games.opponent}`:''; }
function tagName(id){return state.tags.find(t=>t.id===id)?.name;}
function outcomeText(p){
  if(!p.outcome?.playerId) return '選手未分類';
  const player=playerById(p.outcome.playerId);
  return `${player?.name||'選手'} ${p.outcome.type==='winner'?'得点':'ミス'}`;
}
function renderPlayerManager(host=el.savedPlayersPanel){
  if(!host)return;
  const profiles=getPlayerProfiles();
  const archive=getArchive();
  const linkedFor=id=>archive.filter(item=>[...(item.data?.players?.self||[]),...(item.data?.players?.opponent||[])].some(x=>x.profileId===id));
  if(!profiles.length){
    host.innerHTML=`<section class="saved-player-manager"><div class="archive-overview-head"><div><span>選手カルテ</span><h3>保存選手</h3></div><small>まだ保存選手はいません</small></div><p class="saved-player-empty">試合開始時に「この選手を保存」を選ぶと、ここで所属やプレースタイルを追記できます。</p></section>`;
    return;
  }
  host.innerHTML=`<section class="saved-player-manager">
    <div class="archive-overview-head"><div><span>選手カルテ</span><h3>保存選手</h3></div><small>${profiles.length}人・タップして編集</small></div>
    <div class="saved-player-cards">${profiles.map(p=>`<details class="saved-player-card" data-profile="${esc(p.id)}">
      <summary>${(()=>{const linked=linkedFor(p.id);const latest=linked[0];const d=latest?.data||{};let recent='分析試合なし';if(latest){const md=d.matchDate?new Date(d.matchDate+'T00:00:00').toLocaleDateString('ja-JP'):'日付未入力';const pts=d.points||[];const me=new SoftTennisMatchEngine(d.format||7,pts.map(x=>x.winner));const ms=me.getState();recent=`${md}・${d.tournamentName||'大会名未入力'}・${latest.complete?(ms.winner==='self'?'勝利':'敗戦'):'途中保存'}`;}return `<div class="saved-player-summary-main"><strong>${esc(p.name)}${p.isSelf?'<span class="profile-badge">自分</span>':''}${p.isFavorite?'<span class="profile-badge">注目</span>':''}</strong><small>${[p.school,p.grade,p.position].filter(Boolean).map(esc).join('・')||'基本情報を追加できます'}</small><em>${linked.length}試合分析</em><i>${esc(recent)}</i></div>`;})()}<span>編集 →</span></summary>
      <div class="saved-player-form">
        <label>選手名<input data-profile-field="name" maxlength="30" value="${esc(p.name||'')}"></label>
        <label>所属・学校<input data-profile-field="school" maxlength="60" value="${esc(p.school||'')}" placeholder="例：○○高校 / ○○クラブ"></label>
        <label>ポジション<select data-profile-field="position"><option value="">未設定</option>${['前衛','後衛','両方'].map(v=>`<option value="${v}" ${p.position===v?'selected':''}>${v}</option>`).join('')}</select></label>
        <label>学年・年代<input data-profile-field="grade" maxlength="30" value="${esc(p.grade||'')}" placeholder="例：高2 / 大学3年 / 社会人"></label>
        <label>利き手<select data-profile-field="handedness"><option value="">未設定</option><option value="右" ${p.handedness==='右'?'selected':''}>右</option><option value="左" ${p.handedness==='左'?'selected':''}>左</option></select></label>
        <div class="profile-flags"><label><input type="checkbox" data-profile-check="isSelf" ${p.isSelf?'checked':''}> 自分自身</label><label><input type="checkbox" data-profile-check="isFavorite" ${p.isFavorite?'checked':''}> 注目選手</label></div><label class="wide">戦い方・特徴タグ<input data-profile-field="styleTagsText" maxlength="160" value="${esc((p.styleTags||[]).join('、'))}" placeholder="例：平面主体、ロブ多め、カットサーブ"></label>
        <label class="wide">自由メモ<textarea data-profile-field="notes" rows="3" maxlength="500" placeholder="次に対戦する時に見返したいこと">${esc(p.notes||'')}</textarea></label>
        <div class="profile-linked-matches wide"><strong>分析した試合</strong>${linkedFor(p.id).length?linkedFor(p.id).slice(0,8).map(item=>{const d=item.data||{},pts=d.points||[];const me=new SoftTennisMatchEngine(d.format||7,pts.map(x=>x.winner));const ms=me.getState();const md=d.matchDate?new Date(d.matchDate+'T00:00:00').toLocaleDateString('ja-JP'):'日付未入力';return `<button type="button" data-profile-match="${item.id}"><span>${esc(md)}・${esc(d.tournamentName||'大会名未入力')}</span><b>${item.complete?(ms.winner==='self'?'勝利':'敗戦'):'途中'} ${ms.games.self}-${ms.games.opponent}</b></button>`;}).join(''):'<p>まだ紐づいた分析試合はありません。</p>'}</div>
        <div class="saved-player-actions wide"><button type="button" data-save-profile>保存</button><button type="button" class="danger-lite" data-delete-profile>この保存選手を削除</button></div>
      </div>
    </details>`).join('')}</div>
  </section>`;
  host.querySelectorAll('.saved-player-card').forEach(card=>{
    const id=card.dataset.profile;
    card.querySelector('[data-save-profile]').onclick=()=>{
      const profiles=getPlayerProfiles(),p=profiles.find(x=>x.id===id);if(!p)return;
      card.querySelectorAll('[data-profile-field]').forEach(field=>{
        const k=field.dataset.profileField;
        if(k==='styleTagsText')p.styleTags=field.value.split(/[、,]/).map(x=>x.trim()).filter(Boolean);
        else p[k]=field.value.trim();
      });
      card.querySelectorAll('[data-profile-check]').forEach(field=>{p[field.dataset.profileCheck]=field.checked;});
      setPlayerProfiles(profiles);renderSavedPlayerSelectors();renderSavedPlayersPanel();renderPlayersManagerPanel();renderArchiveOverview();showToast('選手カルテを保存しました');
    };
    card.querySelectorAll('[data-profile-match]').forEach(btn=>btn.onclick=()=>{const item=getArchive().find(x=>x.id===btn.dataset.profileMatch);if(!item)return;el.playersDialog?.close();el.pastMatchesDialog?.close();restoreArchivedMatch(item);});
    card.querySelector('[data-delete-profile]').onclick=()=>{
      if(!confirm('この保存選手を削除しますか？ 過去試合データ自体は削除されません。'))return;
      setPlayerProfiles(getPlayerProfiles().filter(x=>x.id!==id));
      renderSavedPlayerSelectors();renderSavedPlayersPanel();renderPlayersManagerPanel();renderArchiveOverview();showToast('保存選手を削除しました');
    };
  });
}
function renderSavedPlayersPanel(){renderPlayerManager(el.savedPlayersPanel);}
function renderPlayersManagerPanel(){renderPlayerManager(el.playersManagerPanel);}

const ARCHIVE_SHOT_TYPES=['フォア','バック','ロブ','中ロブ','トップ打ち','後ツイスト','ボレー','ローボレー','ハイボレー','スマッシュ','サーブ','レシーブ','ネット','チップ','その他'];
function archiveShotCategory(name=''){
  if(!name)return null;
  if(name.includes('中ロブ'))return '中ロブ';
  if(name.includes('トップ打ち'))return 'トップ打ち';
  if(name.includes('後ツイスト')||name==='ツイスト')return '後ツイスト';
  if(name.includes('ローボレー'))return 'ローボレー';
  if(name.includes('ハイボレー'))return 'ハイボレー';
  if(name.includes('ボレー'))return 'ボレー';
  if(name.includes('ロブ'))return 'ロブ';
  if(name.includes('ネット'))return 'ネット';
  if(name.includes('チップ'))return 'チップ';
  if(['フォア','バック','スマッシュ','サーブ','レシーブ','その他'].includes(name))return name;
  return 'その他';
}
function formatPercent(value){
  const n=Number(value);
  if(!Number.isFinite(n))return '—';
  const rounded=Math.round(n*10)/10;
  return `${Number.isInteger(rounded)?rounded:rounded.toFixed(1)}%`;
}
let archiveViewFilters={year:'all',tournament:'all'};
function archiveAggregate(scopeProfileId="pair", filters=archiveViewFilters){
  const archive=getArchive();
  const matches=archive.map(item=>item.data||{}).filter(d=>(d.points||[]).length).filter(d=>{const year=(d.matchDate||'').slice(0,4);return (filters.year==='all'||year===filters.year)&&(filters.tournament==='all'||(d.tournamentName||'大会名未入力')===filters.tournament);});
  const all=matches.flatMap(d=>(d.points||[]).map(p=>({p,d})));
  const selfPts=all.filter(x=>x.p.winner==='self').length;
  const serviceSelf=all.filter(x=>{
    const srv=x.p.service||{}; const id=srv.serverId||srv.server?.id||srv.server;
    const side=srv.serverSide||srv.servingSide||((x.d.players?.self||[]).some(pl=>pl.id===id)?'self':((x.d.players?.opponent||[]).some(pl=>pl.id===id)?'opponent':null));
    return side==='self';
  });
  const selfServeWins=serviceSelf.filter(x=>x.p.winner==='self').length;
  const first=serviceSelf.filter(x=>x.p.serveAttempt==='first');
  const second=serviceSelf.filter(x=>x.p.serveAttempt==='second');
  const firstWins=first.filter(x=>x.p.winner==='self').length, secondWins=second.filter(x=>x.p.winner==='self').length;
  let wins=0,losses=0;
  matches.forEach(d=>{
    const e=new SoftTennisMatchEngine(d.format||7,(d.points||[]).map(p=>p.winner));
    const m=e.getState(); if(m.matchComplete){if(m.winner==='self')wins++;else losses++;}
  });
  const shotMap=Object.fromEntries(ARCHIVE_SHOT_TYPES.map(name=>[name,{total:0,w:0,e:0}]));
  all.forEach(({p,d})=>{const sh=archiveShotCategory(p.outcome?.shotType);if(!sh||!p.outcome?.playerId)return;const pl=[...(d.players?.self||[]),...(d.players?.opponent||[])].find(x=>x.id===p.outcome.playerId);if(!pl||pl.side!=='self')return;if(scopeProfileId==='self'){const profiles=getPlayerProfiles();const marked=profiles.some(x=>x.isSelf);const firstSelf=(d.players?.self||[])[0];if(marked){const prof=profiles.find(x=>x.id===pl.profileId);if(!prof?.isSelf)return;}else if(!firstSelf||pl.id!==firstSelf.id)return;}else if(scopeProfileId!=='pair'&&pl.profileId!==scopeProfileId)return;if(!shotMap[sh])shotMap[sh]={total:0,w:0,e:0};shotMap[sh].total++;if(p.outcome?.type==='winner')shotMap[sh].w++;if(p.outcome?.type==='error')shotMap[sh].e++;});
  const playerMap={};
  all.forEach(({p,d})=>{
    const out=p.outcome;if(!out?.playerId)return;
    const pl=[...(d.players?.self||[]),...(d.players?.opponent||[])].find(x=>x.id===out.playerId);
    if(!pl||pl.side!=='self')return;
    const key=pl.profileId;if(!key)return;
    playerMap[key]||={profileId:key,name:(pl.name||'保存選手').trim(),w:0,e:0,records:0};
    playerMap[key].records++;
    if(out.type==='winner')playerMap[key].w++;if(out.type==='error')playerMap[key].e++;
  });
  const reflections=matches.filter(d=>d.reflection&&(d.reflection.noticed||d.reflection.checkNext||d.reflection.tryNext));

  // 選択した選手の「そのカウントで次の1点を取った率」。率だけで誤解しないよう母数も保持する。
  const countMap={};
  matches.forEach(d=>{
    const players=[...(d.players?.self||[]),...(d.players?.opponent||[])];
    let targetSide=null;
    if(scopeProfileId==='self'){
      const profiles=getPlayerProfiles();const me=players.find(pl=>pl.side==='self' && profiles.find(pr=>pr.id===pl.profileId)?.isSelf)||players.find(pl=>pl.side==='self');
      if(me)targetSide=me.side;
    }else{
      const selected=players.find(pl=>pl.profileId===scopeProfileId);
      if(selected)targetSide=selected.side;
    }
    if(!targetSide)return;
    const prior=[];
    (d.points||[]).forEach(pt=>{
      const before=new SoftTennisMatchEngine(d.format||7,prior).getState();
      if(before.matchComplete){prior.push(pt.winner);return;}
      const gameKey=`${before.games.self}-${before.games.opponent}`;
      const pointKey=`${before.points.self}-${before.points.opponent}`;
      const key=`${gameKey}|${pointKey}|${before.isFinalGame?'final':'normal'}`;
      countMap[key]||={gameSelf:before.games.self,gameOpponent:before.games.opponent,pointSelf:before.points.self,pointOpponent:before.points.opponent,isFinal:before.isFinalGame,total:0,wins:0,service:0,receive:0,first:0,second:0};
      countMap[key].total++;
      if(pt.winner===targetSide)countMap[key].wins++;
      const srv=pt.service||{}; const serverId=srv.serverId||srv.server?.id||srv.server;
      const serverSide=srv.serverSide||srv.servingSide||(players.some(pl=>pl.side==='self'&&pl.id===serverId)?'self':players.some(pl=>pl.side==='opponent'&&pl.id===serverId)?'opponent':null);
      if(serverSide===targetSide)countMap[key].service++; else if(serverSide)countMap[key].receive++;
      if(pt.serveAttempt==='first')countMap[key].first++; else if(pt.serveAttempt==='second')countMap[key].second++;
      prior.push(pt.winner);
    });
  });
  const countStats=Object.values(countMap).map(v=>({...v,rate:v.total?v.wins/v.total*100:0})).sort((a,b)=>a.gameSelf-b.gameSelf||a.gameOpponent-b.gameOpponent||a.pointSelf-b.pointSelf||a.pointOpponent-b.pointOpponent);
  return {archive,matches,all,selfPts,serviceSelf,selfServeWins,first,second,firstWins,secondWins,wins,losses,shotMap,playerMap,reflections,countStats};
}
function renderArchiveOverview(scopeProfileId="self"){
  if(!el.archiveOverview)return;
  const a=archiveAggregate(scopeProfileId);
  if(!a.matches.length){el.archiveOverview.innerHTML='';return;}
  const rate=(n,d)=>d?formatPercent(n/d*100):'—';
  const shots=ARCHIVE_SHOT_TYPES.map(name=>[name,a.shotMap[name]||{total:0,w:0,e:0}]);
  const terminalTotal=shots.reduce((sum,[,v])=>sum+v.total,0);
  const profileLookup=Object.fromEntries(getPlayerProfiles().map(p=>[p.id,p]));
  const players=Object.values(a.playerMap).map(v=>({...v,name:profileLookup[v.profileId]?.name||v.name,school:profileLookup[v.profileId]?.school||'',position:profileLookup[v.profileId]?.position||''})).sort((x,y)=>(y.w+y.e)-(x.w+x.e)).slice(0,6);
  const archiveAll=getArchive().map(x=>x.data||{}).filter(d=>(d.points||[]).length);
  const years=[...new Set(archiveAll.map(d=>(d.matchDate||'').slice(0,4)).filter(Boolean))].sort().reverse();
  const tournaments=[...new Set(archiveAll.map(d=>d.tournamentName||'大会名未入力'))].sort();
  const filterBar=`<div class="archive-view-filters"><label>年<select id="archiveYearFilter"><option value="all">全期間</option>${years.map(y=>`<option value="${esc(y)}" ${archiveViewFilters.year===y?'selected':''}>${esc(y)}年</option>`).join('')}</select></label><label>大会<select id="archiveTournamentFilter"><option value="all">全大会</option>${tournaments.map(t=>`<option value="${esc(t)}" ${archiveViewFilters.tournament===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label></div>`;
  el.archiveOverview.innerHTML=`<div class="archive-overview-head"><div><span>保存した試合をまとめて見る</span><h3>総合データ</h3></div><small>${a.matches.length}試合・この端末内</small></div>${filterBar}<div class="archive-result-tabs"><button type="button" data-archive-filter="all" class="active">すべて</button><button type="button" data-archive-filter="win">勝利</button><button type="button" data-archive-filter="loss">敗戦</button></div>
    <div class="archive-total-kpis"><article><span>保存試合</span><strong>${a.matches.length}試合</strong><small>${a.wins}勝 ${a.losses}敗・完了 ${a.wins+a.losses}</small></article><article><span>総ポイント取得率</span><strong>${rate(a.selfPts,a.all.length)}</strong><small>${a.selfPts}/${a.all.length}pt</small></article><article><span>サーブ時得点率</span><strong>${rate(a.selfServeWins,a.serviceSelf.length)}</strong><small>1st時 ${rate(a.firstWins,a.first.length)} / 2nd時 ${rate(a.secondWins,a.second.length)}</small></article></div>
    <div class="archive-aggregate-block shot-outcome-summary"><div class="archive-aggregate-head"><div><h4>終了ショット別データ</h4><p>ポイントを終えたショットを、使った回数と結果で比較。</p></div><label>選手<select id="archiveScopeSelect"><option value="self" ${scopeProfileId==='self'?'selected':''}>自分</option>${getPlayerProfiles().filter(p=>!p.isSelf&&Object.keys(a.playerMap).includes(p.id)).map(p=>`<option value="${p.id}" ${scopeProfileId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label></div><div class="archive-shot-table"><div class="archive-shot-head"><span>ショット</span><span>使用</span><span>得点</span><span>得点率</span><span>失点</span><span>失点率</span></div>${shots.map(([name,v])=>{const usage=terminalTotal?Math.round(v.total/terminalTotal*100):0;const win=v.total?v.w/v.total*100:0;const loss=v.total?v.e/v.total*100:0;return `<div class="archive-shot-row-v3 ${v.total?'used':'unused'}"><strong>${esc(name)}</strong><span><b>${v.total}</b><small>${formatPercent(usage)}</small></span><span><b>${v.w}</b></span><span class="archive-rate ${v.total&&win>=70?'high-win':''}"><b>${v.total?formatPercent(win):'—'}</b><small>${v.w}/${v.total}pt</small></span><span><b>${v.e}</b></span><span class="archive-rate ${v.total&&loss>=70?'high-loss':''}"><b>${v.total?formatPercent(loss):'—'}</b><small>${v.e}/${v.total}pt</small></span></div>`}).join('')}</div></div>
    <div class="archive-aggregate-block count-rate-summary"><div class="archive-aggregate-head"><div><h4>カウント別得点率</h4><p>そのカウントから次の1点を取った割合。必ず取得数 / 母数も表示します。</p></div><span class="count-scope-note">${scopeProfileId==='self'?'自分':'選択選手'}の過去試合</span></div>${a.countStats.length?(()=>{const groups={};a.countStats.forEach(v=>{const k=`${v.gameSelf}-${v.gameOpponent}`;(groups[k]??=[]).push(v)});const keys=Object.keys(groups);return `<div class="count-rate-guide"><b>ゲームカウントを選んで確認</b><span>まず状況を絞り、ポイントカウントごとの得点率と母数を見ます。</span></div><div class="count-game-groups">${keys.map((k,idx)=>{const vals=groups[k];const total=vals.reduce((n,v)=>n+v.total,0),wins=vals.reduce((n,v)=>n+v.wins,0),rate=total?wins/total*100:0;return `<details class="count-game-group" ${idx===0?'open':''}><summary><span><small>GAME</small><strong>${k}</strong></span><span class="count-group-rate"><b>${formatPercent(rate)}</b><small>${wins}/${total}pt</small></span><em>ポイント別を見る</em></summary><div class="count-point-list">${vals.map(v=>`<article class="count-point-row ${v.total>=3&&v.rate>=70?'is-high':''} ${v.total>=3&&v.rate<=30?'is-low':''} ${v.total<3?'is-small-sample':''}"><div><small>${v.isFinal?'FINAL':'POINT'}</small><strong>${v.pointSelf}-${v.pointOpponent}</strong></div><div class="count-rate-value"><b>${formatPercent(v.rate)}</b><span>${v.wins}/${v.total}pt</span></div><div class="count-context"><span>サービス ${v.service}pt</span><span>レシーブ ${v.receive}pt</span><span>1st IN ${v.first+v.second?formatPercent(v.first/(v.first+v.second)*100):'—'}</span></div>${v.total<3?'<small class="sample-note">参考値</small>':''}</article>`).join('')}</div></details>`}).join('')}</div><p class="count-rate-caution">母数が2pt以下の数値は「参考値」として弱く表示しています。得点率だけでなく、必ず取得数 / 母数も一緒に確認してください。</p>`})():'<p class="field-note">この選手で集計できるカウントデータがありません。</p>'}</div>
    ${a.reflections.length?`<details class="archive-reflections"><summary>過去の振り返りを並べて見る <b>${a.reflections.length}試合</b></summary><div>${a.reflections.slice(0,12).map(d=>`<article><strong>${esc(d.tournamentName||'大会名未入力')}${d.matchLabel?`・${esc(d.matchLabel)}`:''}</strong>${d.reflection.noticed?`<p><b>気づき</b>${esc(d.reflection.noticed)}</p>`:''}${d.reflection.checkNext?`<p><b>次も確認</b>${esc(d.reflection.checkNext)}</p>`:''}${d.reflection.tryNext?`<p><b>次に試す</b>${esc(d.reflection.tryNext)}</p>`:''}</article>`).join('')}</div></details>`:''}`;
  const scopeSelect=el.archiveOverview.querySelector('#archiveScopeSelect');if(scopeSelect)scopeSelect.onchange=()=>renderArchiveOverview(scopeSelect.value);
  const yf=el.archiveOverview.querySelector('#archiveYearFilter'),tf=el.archiveOverview.querySelector('#archiveTournamentFilter');
  if(yf)yf.onchange=()=>{archiveViewFilters.year=yf.value;renderArchiveOverview(scopeProfileId)};
  if(tf)tf.onchange=()=>{archiveViewFilters.tournament=tf.value;renderArchiveOverview(scopeProfileId)};
}

function renderArchiveTagSearch(){
 const input=document.querySelector('#archiveTagSearch'),host=document.querySelector('#archiveTagResults');if(!input||!host)return;
 const run=()=>{const q=input.value.trim().toLowerCase();if(!q){host.innerHTML='';return;}const hits=[];getArchive().forEach(item=>{const d=item.data||{};const tags=Object.fromEntries((d.tags||[]).map(t=>[t.id,t.name]));(d.points||[]).forEach((pt,i)=>{const names=(pt.tagIds||[]).map(id=>tags[id]).filter(Boolean);if(names.some(n=>n.toLowerCase().includes(q)))hits.push({item,pt,i,names});});});host.innerHTML=hits.length?`<div class="archive-tag-hits">${hits.slice(0,40).map((h,i)=>`<button type="button" data-hit="${i}"><b>${h.names.map(n=>'#'+esc(n)).join(' ')}</b><span>${esc(h.item.data?.tournamentName||'大会名未入力')}・Point ${h.i+1}</span><small>${formatTime(h.pt.startTimestamp??h.pt.timestamp??0)} から確認</small></button>`).join('')}</div>`:'<p class="field-note">該当するタグ付きプレーはありません。</p>';host.querySelectorAll('[data-hit]').forEach(b=>b.onclick=()=>{const h=hits[Number(b.dataset.hit)];el.pastMatchesDialog.close();restoreArchivedMatch(h.item);setTimeout(()=>openReviewPoint(h.pt.id),120);});};
 input.oninput=run;run();
}

function renderHistory(){
  const archive=getArchive();
  renderSavedPlayersPanel();
  renderArchiveOverview();
  renderArchiveTagSearch();
  if(el.historyCount)el.historyCount.textContent=archive.length;
  el.emptyHistory.hidden=archive.length>0;
  el.historyList.innerHTML=archive.map((item,index)=>{
    const d=item.data||{}; const pts=d.points||[];
    const self=pts.filter(p=>p.winner==='self').length, opp=pts.length-self;
    const analysisDate=new Date(item.savedAt||Date.now()).toLocaleString('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}); const matchDate=d.matchDate?new Date(d.matchDate+'T00:00:00').toLocaleDateString('ja-JP'):'大会日未入力';
    const video=d.videoSource?.type==='youtube'?`YouTube · ${d.videoSource.videoId||''}`:`端末動画 · ${d.videoSource?.fileName||'動画'}`;
    const players=[...(d.players?.self||[])].map(p=>p.name).join(' / ')||'自分ペア';
    const opponents=[...(d.players?.opponent||[])].map(p=>p.name).join(' / ')||'相手ペア';
    const tournament=d.tournamentName||'大会名未入力';
    const matchLabel=d.matchLabel||'';
    const matchEngine=new SoftTennisMatchEngine(d.format||7,pts.map(p=>p.winner));const ms=matchEngine.getState();const gameScore=`${ms.games.self} - ${ms.games.opponent}`;const resultLabel=item.complete?(ms.winner==='self'?'勝利':'敗戦'):'途中保存';
    return `<article class="archive-card ${resultLabel==='勝利'?'is-win':resultLabel==='敗戦'?'is-loss':'is-progress'}" data-result="${resultLabel==='勝利'?'win':resultLabel==='敗戦'?'loss':'progress'}" data-index="${index}">
      <div class="archive-head"><div><span>大会日 ${matchDate}</span><h3>${esc(tournament)}</h3><small>${matchLabel?esc(matchLabel)+' ・ ':''}${esc(players)} vs ${esc(opponents)}</small></div><strong>${d.format||7}G</strong></div>
      <p class="archive-analysis-date">分析更新 ${analysisDate} ・ ${esc(video)}</p>
      <div class="archive-result-line"><strong>${resultLabel}</strong><span class="archive-game-score">GAME ${gameScore}</span><small>POINT ${self} - ${opp}</small></div>
      <div class="archive-kpis"><span>取得 <b>${self}</b></span><span>失点 <b>${opp}</b></span><span>総ポイント <b>${pts.length}</b></span></div>
      <div class="archive-actions"><button class="archive-open" type="button">分析を見る</button><button class="archive-delete" type="button">削除</button></div>
    </article>`;
  }).join('');
  el.archiveOverview?.querySelectorAll('[data-archive-filter]').forEach(btn=>btn.onclick=()=>{
    el.archiveOverview.querySelectorAll('[data-archive-filter]').forEach(x=>x.classList.toggle('active',x===btn));
    const f=btn.dataset.archiveFilter; $$('.archive-card').forEach(c=>c.hidden=f!=='all'&&c.dataset.result!==f);
  });
  $$('.archive-card').forEach(card=>{
    const index=Number(card.dataset.index);
    card.querySelector('.archive-open').onclick=()=>{el.pastMatchesDialog.close();restoreArchivedMatch(getArchive()[index]);};
    card.querySelector('.archive-delete').onclick=()=>{
      if(!confirm('この試合の保存データを削除しますか？'))return;
      const a=getArchive();a.splice(index,1);localStorage.setItem(ARCHIVE_KEY,JSON.stringify(a));renderHistory();
    };
  });
}

if(el.pastMatchesBtn)el.pastMatchesBtn.onclick=()=>{renderHistory();el.pastMatchesDialog.showModal();};
el.playersBtn?.addEventListener('click',()=>{renderPlayersManagerPanel();el.playersDialog.showModal();});
el.closePlayersBtn?.addEventListener('click',()=>el.playersDialog.close());
el.createProfileBtn?.addEventListener('click',()=>{const name=el.newProfileName.value.trim();if(!name){showToast('選手名を入力してください');return;}const profiles=getPlayerProfiles();profiles.push({id:uid(),name,school:el.newProfileSchool.value.trim(),position:el.newProfilePosition.value,grade:'',handedness:'',styleTags:[],notes:'',isSelf:false,isFavorite:false,createdAt:new Date().toISOString()});setPlayerProfiles(profiles);el.newProfileName.value='';el.newProfileSchool.value='';el.newProfilePosition.value='';renderSavedPlayerSelectors();renderPlayersManagerPanel();showToast('選手を登録しました');});
if(el.closePastMatchesBtn)el.closePastMatchesBtn.onclick=()=>el.pastMatchesDialog.close();
document.querySelector('#resetTestDataBtn')?.addEventListener('click',()=>{
  if(!confirm('保存した試合・現在の試合・タグをリセットします。保存選手は残します。よろしいですか？'))return;
  localStorage.removeItem(ARCHIVE_KEY);localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SETUP_DRAFT_KEY);
  renderHistory();showToast('テストデータをリセットしました');
});

if(el.closePlayerDetailBtn)el.closePlayerDetailBtn.onclick=()=>el.playerDetailDialog.close();
if(el.saveState)el.saveState.onclick=()=>{
  if(!state.points.length){showToast('1ポイント以上入力してから保存してください');return;}
  save();
  archiveCurrentMatch(true);
  el.saveState.textContent='保存済み ✓';
  setTimeout(()=>{el.saveState.textContent='この端末に保存';},1800);
  showToast(engine.getState().matchComplete?'試合を保存しました':'途中経過を保存しました');
};

function pointGameContext(target){
  const games=buildGameSegments();
  const g=games.find(x=>x.pointIds.includes(target.id));
  if(!g)return {gameNo:1,beforeSelf:0,beforeOpponent:0,label:'GAME 1'};
  let a=0,b=0;
  for(const id of g.pointIds){
    if(id===target.id)break;
    const pt=state.points.find(x=>x.id===id);
    if(pt?.winner==='self')a++; else if(pt)b++;
  }
  return {gameNo:g.gameNo,beforeSelf:a,beforeOpponent:b,label:g.isFinal?'FINAL':`GAME ${g.gameNo}`};
}
function serviceContext(p){
  const srv=p.service||{};
  const side=srv.serverSide||playerById(srv.serverId||srv.server?.id||srv.server)?.side;
  const server=playerById(srv.serverId||srv.server?.id||srv.server);
  return {side,serverName:server?.name||'',label:side==='self'?'自分たちサービス':side==='opponent'?'相手サービス':'サービス不明'};
}
function renderAnalysisPointFlow(){
  if(!state.points.length)return '';
  const selfNames=(state.players?.self||[]).map(p=>p.name).join('・')||'自分ペア';
  const oppNames=(state.players?.opponent||[]).map(p=>p.name).join('・')||'相手ペア';
  const games=buildGameSegments();
  const blocks=games.map(g=>{
    const pts=state.points.filter(p=>g.pointIds.includes(p.id));let gs=0,go=0;
    const rows=pts.map(p=>{
      if(p.winner==='self')gs++;else go++;
      const shot=esc(p.outcome?.shotType||'未分類');
      return `<button class="flow-rally-row ${p.winner}" type="button" data-id="${p.id}">
        <span class="flow-reason self-reason">${p.winner==='self'?shot:''}</span>
        <span class="flow-score"><b class="self-dot">${p.winner==='self'?'●':''}</b><strong>${gs}</strong><i>-</i><strong>${go}</strong><b class="opp-dot">${p.winner==='opponent'?'●':''}</b></span>
        <span class="flow-reason opponent-reason">${p.winner==='opponent'?shot:''}</span>
      </button>`;
    }).join('');
    const first=pts[0],svc=first?serviceContext(first):{side:null};
    const sr=svc.side==='self'?'自分たちサービス':svc.side==='opponent'?'相手サービス':'サービス不明';
    return `<section class="flow-game-block rally-flow"><header><div><strong>${g.isFinal?'FINAL':`GAME ${g.gameNo}`}</strong><small>${sr}</small></div><span>${g.self} - ${g.opponent}</span></header>${rows}</section>`;
  }).join('');
  return `<section class="analysis-section point-flow-section"><div class="analysis-title"><div><span>試合の流れ</span><h3>ポイントの流れ</h3></div><small>得点側に●・横に終了ショット</small></div><div class="flow-sides"><strong>${esc(selfNames)}</strong><span>vs</span><strong>${esc(oppNames)}</strong></div><div class="flow-list game-separated">${blocks}</div></section>`;
}
function renderAttentionFacts(summary){
  const facts=[];const selfPlayers=summary.players.filter(p=>p.side==='self');
  const topError=[...selfPlayers].sort((a,b)=>b.errors-a.errors)[0], topWinner=[...selfPlayers].sort((a,b)=>b.winners-a.winners)[0];
  const totalErrors=selfPlayers.reduce((n,p)=>n+p.errors,0), totalWinners=selfPlayers.reduce((n,p)=>n+p.winners,0);
  if(topError?.errors){const share=totalErrors?Math.round(topError.errors/totalErrors*100):0;facts.push({k:'ミスが目立つ',n:topError.name,v:`${topError.errors}ポイント`,why:`チームのミスの${share}%・選手別最多`,f:'player-error:'+topError.id});}
  if(topWinner?.winners){const share=totalWinners?Math.round(topWinner.winners/totalWinners*100):0;facts.push({k:'決定打が目立つ',n:topWinner.name,v:`${topWinner.winners}ポイント`,why:`チームの決定打の${share}%・選手別最多`,f:'player-winner:'+topWinner.id});}
  return `<section class="analysis-section attention-section"><div class="analysis-title"><div><span>見返す候補</span><h3>この試合で目立った数字</h3></div><button class="attention-review-all" type="button" data-open-review>プレー確認へ →</button></div><div class="attention-grid compact">${facts.length?facts.map(x=>`<article class="attention-card clearer"><div class="attention-main"><em>${x.k}</em><span>${esc(x.n)}</span><strong>${x.v}</strong></div><div class="attention-why"><b>なぜ目立つ？</b><p>${esc(x.why)}</p></div><button type="button" data-filter="${x.f}" data-label="${esc(x.n)}">この数字のプレーを見る →</button></article>`).join(''):'<div class="attention-empty">比較できるデータが増えると表示します。</div>'}</div></section>`;
}
function renderStats(){
  if(!state.points.length){
    el.statsGrid.innerHTML='<div class="empty-state"><h3>まだ分析データがありません</h3><p>ポイントを記録すると、ここに試合の傾向がまとまります。</p></div>';
    return;
  }
  const summary=summarizeMatch(state.points,state.players||{self:[],opponent:[]});
  const pt=v=>formatPercent(v);
  const metric=(value,label,filter,sub='',bar=null)=>`<button class="analysis-metric" type="button" data-filter="${esc(filter)}" data-label="${esc(label)}"><span>${esc(label)}</span><strong>${value}</strong>${bar!==null?`<em><b style="width:${Math.max(0,Math.min(100,Number(bar)||0))}%"></b></em>`:''}${sub?`<small>${sub}</small>`:''}<i>プレーを見る →</i></button>`;
  const selfB=summary.breakdown.self, oppB=summary.breakdown.opponent;
  const selfS=summary.serve.self, oppS=summary.serve.opponent;
  const quality=summary.totalPoints?summary.classified/summary.totalPoints*100:0;

  const overviewRows=[
    ['自分たちのポイント率',summary.selfPointRate,'winner:self',`${summary.selfPoints} / ${summary.totalPoints}pt`],
    ['自分たちが決めた割合',selfB.winnerRate,'side-winner:self',`${selfB.winners}pt`],
    ['相手ミスで取った割合',selfB.opponentErrorRate,'benefit-error:self',`${selfB.opponentErrors}pt`],
    ['自分たちのミスによる失点',oppB.opponentErrorRate,'benefit-error:opponent',`${oppB.opponentErrors}pt`]
  ];
  const overviewChart=overviewRows.map(([label,val,filter,sub])=>`<button class="overview-bar-row" type="button" data-filter="${filter}" data-label="${label}">
    <div><span>${label}</span><strong>${pt(val)}</strong></div><i><b style="width:${Math.max(0,Math.min(100,val))}%"></b></i><small>${sub}・プレーを見る →</small>
  </button>`).join('');

  const players=summary.players.map(p=>`
    <article class="player-analysis-card">
      <div class="player-analysis-head"><div><span>${p.side==='self'?'自分ペア':'相手ペア'}・${esc(p.position||'')}</span><h3>${esc(p.name)}</h3></div><b>${p.servicePoints} serve pt</b></div>
      <div class="player-analysis-grid">
        ${metric(String(p.winners),'得点',`player-winner:${p.id}`,`${pt(p.winnerShareOfTeamPoints)} / ペア得点内`)}
        ${metric(String(p.errors),'ミス',`player-error:${p.id}`,`${pt(p.errorShareOfTeamLostPoints)} / ペア失点内`)}
        ${metric(pt(p.servicePointWinRate),'サーブ時得点率',`server-win:${p.id}`,'',p.servicePointWinRate)}
        ${metric(pt(p.firstInRate),'1st成功率',`player-first:${p.id}`,'',p.firstInRate)}
        ${metric(pt(p.firstPointWinRate),'1st時得点率',`player-first-win:${p.id}`,'',p.firstPointWinRate)}
        ${metric(pt(p.secondPointWinRate),'2nd時得点率',`player-second-win:${p.id}`,'',p.secondPointWinRate)}
      </div>
    </article>`).join('');

  const tagCards=state.tags.map(t=>{
    const pts=state.points.filter(p=>p.tagIds?.includes(t.id));
    if(!pts.length)return '';
    const self=pts.filter(p=>p.winner==='self').length;
    const rate=pts.length?self/pts.length*100:0;
    return `<button class="tag-analysis-card" type="button" data-filter="tag:${t.id}" data-label="#${esc(t.name)}">
      <span>#${esc(t.name)}</span><strong>${pts.length}<small>pt</small></strong>
      <div><b>自分得点率 ${pt(rate)}</b><i>プレーを見る →</i></div>
    </button>`;
  }).join('');

  const shotTypes=['フォア','バック','フォアロブ','バックロブ','フォア中ロブ','バック中ロブ','フォアトップ打ち','バックトップ打ち','ツイスト','フォア後ツイスト','バック後ツイスト','フォアボレー','バックボレー','フォアローボレー','バックローボレー','フォアハイボレー','バックハイボレー','スマッシュ','サーブ','レシーブ','ネット','チップ','その他','ロブ','中ロブ','トップ打ち','ボレー'];
  const shotCards=shotTypes.map(name=>{
    const pts=state.points.filter(p=>p.outcome?.shotType===name); if(!pts.length)return '';
    const self=pts.filter(p=>p.winner==='self').length;
    return `<button class="shot-analysis-card" type="button" data-filter="shot:${name}" data-label="${name}">
      <span>${name}</span><strong>${pts.length}<small>pt</small></strong><small>自分得点率 ${pt(self/pts.length*100)}</small><i>プレーを見る →</i>
    </button>`;
  }).join('');


  const serveTable=`<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>サーブ指標</th><th>自分たち</th><th>相手</th></tr></thead><tbody>
    <tr><td>サーブ時得点率</td><td>${pt(selfS.pointWinRate)}</td><td>${pt(oppS.pointWinRate)}</td></tr>
    <tr><td>1st成功率</td><td>${pt(selfS.firstInRate)}</td><td>${pt(oppS.firstInRate)}</td></tr>
    <tr><td>1st時得点率</td><td>${pt(selfS.firstPointWinRate)}</td><td>${pt(oppS.firstPointWinRate)}</td></tr>
    <tr><td>2nd時得点率</td><td>${pt(selfS.secondPointWinRate)}</td><td>${pt(oppS.secondPointWinRate)}</td></tr>
  </tbody></table></div>`;
  const playerTable=`<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>選手</th><th>得点</th><th>ミス</th><th>サーブ時得点率</th><th>1st成功率</th></tr></thead><tbody>${summary.players.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.winners}</td><td>${p.errors}</td><td>${pt(p.servicePointWinRate)}</td><td>${pt(p.firstInRate)}</td></tr>`).join('')}</tbody></table></div>`;
  const shotRows=shotTypes.map(name=>{const pts=state.points.filter(p=>p.outcome?.shotType===name);if(!pts.length)return '';const wins=pts.filter(p=>p.winner==='self').length;const errors=pts.filter(p=>p.outcome?.type==='error').length;return `<tr><td>${name}</td><td>${pts.length}</td><td>${pt(wins/pts.length*100)}</td><td>${errors}</td></tr>`}).join('');
  const shotTable=shotRows?`<div class="analysis-table-wrap"><table class="analysis-data-table"><thead><tr><th>ショット</th><th>記録数</th><th>自分得点率</th><th>ミス記録</th></tr></thead><tbody>${shotRows}</tbody></table></div>`:'';

  const donut=(value,label,a,b)=>`<div class="mini-donut" style="--p:${Math.max(0,Math.min(100,Number(value)||0))}"><div><strong>${pt(value)}</strong><span>${label}</span></div><small>${a} / ${b}</small></div>`;
  const overviewVisual=`<div class="mobile-overview-kpis"><button data-filter="winner:self" data-label="取得ポイント"><span>ポイント率</span><strong>${pt(summary.selfPointRate)}</strong><small>${summary.selfPoints}/${summary.totalPoints}pt</small></button><button data-filter="side-winner:self" data-label="決定打"><span>決定打</span><strong>${selfB.winners}</strong><small>自分たち</small></button><button data-filter="benefit-error:opponent" data-label="自分たちのミス"><span>自分ミス</span><strong>${oppB.opponentErrors}</strong><small>失点</small></button></div><div class="reason-compare"><article><h4>得点の内訳</h4><div class="reason-split"><button data-filter="side-winner:self" data-label="決定打"><strong>${selfB.winners}</strong><span>決定打</span></button><button data-filter="benefit-error:self" data-label="相手ミス"><strong>${selfB.opponentErrors}</strong><span>相手ミス</span></button></div></article><article class="lost"><h4>失点の内訳</h4><div class="reason-split"><button data-filter="side-winner:opponent" data-label="相手決定打"><strong>${oppB.winners}</strong><span>相手決定打</span></button><button data-filter="benefit-error:opponent" data-label="自分ミス"><strong>${oppB.opponentErrors}</strong><span>自分ミス</span></button></div></article></div>`;
  const serveVisual=`<div class="serve-dashboard serve-dashboard-v2"><div class="serve-side-summary self-side"><span>自分たちのサービス</span><strong>${selfS.total?pt(selfS.pointWinRate):'—'}</strong><small>得点率</small></div><div class="serve-detail-list serve-detail-v2">${[['1st成功',selfS.firstInRate,oppS.firstInRate,selfS.total,oppS.total],['1st時得点',selfS.firstPointWinRate,oppS.firstPointWinRate,selfS.firstCount,oppS.firstCount],['2nd時得点',selfS.secondPointWinRate,oppS.secondPointWinRate,selfS.secondCount,oppS.secondCount]].map(([l,a,b,ca,cb])=>`<div class="serve-metric-row"><b>${l}</b><span class="metric-self"><em>自分</em><strong>${ca?pt(a):'—'}</strong></span><i>VS</i><span class="metric-opp"><em>相手</em><strong>${cb?pt(b):'—'}</strong></span></div>`).join('')}</div><div class="serve-side-summary opponent-side"><span>相手のサービス</span><strong>${oppS.total?pt(oppS.pointWinRate):'—'}</strong><small>得点率</small></div></div>`;
  const playerVisual=`<div class="player-compare-grid">${summary.players.map(p=>{const pp=state.points.filter(x=>x.outcome?.playerId===p.id);const top=(type)=>{const c={};pp.filter(x=>x.outcome?.type===type).forEach(x=>{const s=x.outcome?.shotType||'未分類';c[s]=(c[s]||0)+1});return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'};const impact=p.winners-p.errors;return `<button type="button" class="player-compare-card player-insight-card ${p.side}" data-player-open="${p.id}"><header><div><strong>${esc(p.name)}${p.isSelf?'<span class="profile-badge">自分</span>':''}${p.isFavorite?'<span class="profile-badge">注目</span>':''}</strong><small>${p.side==='self'?'自分':'相手'}・${esc(p.position||'')}</small></div><span>${impact>=0?'+':''}${impact}<small>決定打−ミス</small></span></header><div class="player-score-pair"><div><em>決定打</em><b>${p.winners}</b></div><div><em>ミス</em><b>${p.errors}</b></div></div><div class="player-key-facts"><span>サーブ <b>${p.servicePoints?pt(p.servicePointWinRate):'—'}</b></span><span>1st <b>${p.servicePoints?pt(p.firstInRate):'—'}</b></span><span>決定ショット <b>${esc(top('winner'))}</b></span><span>ミスショット <b>${esc(top('error'))}</b></span></div><footer><span>この選手の映像・ショット・コート分析</span><b>詳しく見る →</b></footer></button>`}).join('')}</div>`;
  const shotVisual=shotRows?`<div class="shot-visual-list">${shotTypes.map(name=>{const pts=state.points.filter(p=>p.outcome?.shotType===name);if(!pts.length)return '';const self=pts.filter(p=>p.winner==='self').length;const rate=self/pts.length*100;return `<button type="button" data-filter="shot:${name}" data-label="${name}"><span>${name}<small>${pts.length}pt</small></span><i><b style="width:${rate}%"></b></i><strong>${pt(rate)}</strong></button>`}).join('')}</div>`:''; 
  el.statsGrid.innerHTML=`
    <section class="analysis-section overview-section">
      <div class="analysis-title"><div><span>まず見る</span><h3>試合の数字と見返す候補</h3></div><small>各カードを押すと該当プレー一覧へ</small></div>
      ${overviewVisual}
    </section>
    ${renderAttentionFacts(summary)}
    ${renderAnalysisPointFlow()}

    <section class="analysis-section serve-section-visible"><div class="analysis-title"><div><span>サーブ分析</span><h3>サービスゲームを比較</h3></div><small>得点率と1st/2nd</small></div>${serveVisual}</section>
    <section class="analysis-section player-section-visible"><div class="analysis-title"><div><span>選手別分析</span><h3>4選手の特徴</h3></div><small>選手を押すと詳細へ</small></div>${playerVisual}</section>`;

  el.statsGrid.onclick=e=>{
    const reviewCta=e.target.closest('[data-open-review]');if(reviewCta){showAllPointReview();return;}
    const player=e.target.closest('[data-player-open]');
    if(player){openPlayerDetail(player.dataset.playerOpen);return;}
    const flow=e.target.closest('.flow-point-row,.flow-rally-row');
    if(flow){jumpToPoint(state.points.find(p=>p.id===flow.dataset.id));return;}
    const target=e.target.closest('[data-filter]');
    if(target){showDrilldown(target.dataset.filter,target.dataset.label||target.textContent.trim());}
  };
}
function pct(v){ return formatPercent(v); }

function matchesFilter(p,filter){
  const [kind,...rest]=String(filter||'').split(':'); const value=rest.join(':');
  const srv=p.service||{}; const out=p.outcome||{}; const serverId=srv.serverId||srv.server?.id||srv.server;
  const serverSide=srv.serverSide || playerById(serverId)?.side;
  if(kind==='winner')return p.winner===value;
  if(kind==='side-winner')return p.winner===value && out.type==='winner' && playerById(out.playerId)?.side===value;
  if(kind==='benefit-error')return p.winner===value && out.type==='error';
  if(kind==='service-side')return serverSide===value;
  if(kind==='serve-first')return serverSide===value && p.serveAttempt==='first';
  if(kind==='serve-first-win')return serverSide===value && p.serveAttempt==='first' && p.winner===value;
  if(kind==='serve-second-win')return serverSide===value && p.serveAttempt==='second' && p.winner===value;
  if(kind==='player-winner')return out.type==='winner' && out.playerId===value;
  if(kind==='player-error')return out.type==='error' && out.playerId===value;
  if(kind==='server')return serverId===value;
  if(kind==='server-win')return serverId===value && p.winner===playerById(value)?.side;
  if(kind==='player-first')return serverId===value && p.serveAttempt==='first';
  if(kind==='player-first-win')return serverId===value && p.serveAttempt==='first' && p.winner===playerById(value)?.side;
  if(kind==='player-second-win')return serverId===value && p.serveAttempt==='second' && p.winner===playerById(value)?.side;
  if(kind==='tag')return p.tagIds?.includes(value);
  if(kind==='tag-self')return p.tagIds?.includes(value) && p.winner==='self';
  if(kind==='tag-opponent')return p.tagIds?.includes(value) && p.winner==='opponent';
  if(kind==='tag-winner')return p.tagIds?.includes(value) && out.type==='winner';
  if(kind==='tag-error')return p.tagIds?.includes(value) && out.type==='error';
  if(kind==='shot')return out.shotType===value;
  return false;
}
function jumpToPoint(p){
  reviewingPoint=true;
  const fallback=Math.max(0,(Number(p.timestamp)||0)-12);
  const t=Math.max(0,Number.isFinite(Number(p.startTimestamp))?Number(p.startTimestamp):fallback);
  if(sourceType==='youtube' && ytPlayer?.seekTo){ ytPlayer.seekTo(t,true); ytPlayer.playVideo?.(); }
  else if(el.localPlayer && el.localPlayer.src){ el.localPlayer.currentTime=t; el.localPlayer.play?.(); }
  else if(sourceType==='local'&&!state.videoSource?.file){showToast('元の端末動画を選び直すと、このポイントから見直せます');return;}
  else { showToast('この試合の動画本体は保存していません'); return; }
  showToast(`Point ${p.sequence} の開始位置へ移動しました`);
}
function pointDetailText(p){
  const out=p.outcome; let reason='詳細未分類';
  if(out?.playerId){const pl=playerById(out.playerId); reason=`${pl?.name||''}（${pl?.position||''}） ${out.type==='winner'?'得点':'ミス'}`;}
  const tags=(p.tagIds||[]).map(id=>state.tags.find(t=>t.id===id)?.name).filter(Boolean);
  const detail=p.detail||{}; return `${reason}${out?.shotType?` / ${out.shotType}`:''}${detail.shotSubtype?`・${detail.shotSubtype}`:''}${detail.hitPoint?` / 打:${classifyCourtPoint(detail.hitPoint)}`:''}${detail.directionPoint?` / 向:${classifyCourtPoint(detail.directionPoint)}`:''}${detail.landingPoint?` / 落:${classifyCourtPoint(detail.landingPoint)}`:''}${tags.length?` / #${tags.join(' #')}`:''}`;
}
function detailOptionsForShot(shot){
  if(shot==='ボレー')return ['通常ボレー','ローボレー','ハイボレー'];
  return [];
}
function classifyCourtPoint(point){
  if(!point)return '';
  if(point.net)return 'ネット';
  const x=Number(point.x), y=Number(point.y);
  // 描画エリア内で実コートは x:15-85%, y:8-92%。その外はコート外。
  if(x<15)return 'コート外・左';
  if(x>85)return 'コート外・右';
  if(y<8)return 'コート外・相手奥';
  if(y>92)return 'コート外・自分奥';
  const side=y<50?'相手側':'自分側';
  const depth=y<25?'奥':y<43?'サービスライン付近':y<57?'ネット付近':y<75?'サービスライン付近':'奥';
  const lane=x<38?'左':x>62?'右':'中央';
  return `${side}・${depth}・${lane}`;
}
function courtPointMarker(point,kind,label=''){
  if(!point)return '';
  return `<span class="court-marker ${kind}" style="left:${point.x}%;top:${point.y}%">${label?`<b>${esc(label)}</b>`:''}</span>`;
}
function courtPickerMarkup(kind,point){
  const title=kind==='hit'?'打った位置':'落ちた位置';
  const description=kind==='hit'
    ? 'ショットした位置をタップ。コート外から打った場合も周辺エリアを選べます。'
    : 'ボールが落ちた位置をタップ。ネットミスなら中央のネット線をタップできます。';
  return `<div class="court-picker" data-kind="${kind}">
    <div class="court-picker-head"><span>${title}</span><button type="button" class="clear-court-point" data-kind="${kind}">クリア</button></div>
    <p>${description}</p>
    <div class="tennis-court-picker" data-court-kind="${kind}">
      <div class="court-side-name opponent-side-name">相手側</div><div class="court-side-name self-side-name">自分たち側</div>
      <div class="outside-label top">OUT</div><div class="outside-label left">OUT</div><div class="outside-label right">OUT</div><div class="outside-label bottom">OUT</div>
      <div class="court-lines">
        <i class="baseline top"></i><i class="baseline bottom"></i><i class="sideline left"></i><i class="sideline right"></i>
        <i class="singles left"></i><i class="singles right"></i><i class="net"></i>
        <i class="service top"></i><i class="service bottom"></i><i class="center top"></i><i class="center bottom"></i>
      </div>
      ${courtPointMarker(point,kind)}
    </div>
    <div class="court-current">${point?(point.net?'現在：ネット':'現在：'+classifyCourtPoint(point)):'未設定'}</div>
  </div>`;
}
function playerPositionPickerMarkup(detail){
  const positions=detail.playerPositions||{};
  const markers=[
    ['selfFront','自前','self-player front-player'],['selfBack','自後','self-player back-player'],
    ['opponentFront','相前','opponent-player front-player'],['opponentBack','相後','opponent-player back-player']
  ].map(([key,label,cls])=>courtPointMarker(positions[key],cls,label)).join('');
  return `<div class="court-picker player-position-picker">
    <div class="court-picker-head"><span>① 選手の立ち位置</span></div>
    <p>最初に陣形を記録します。前衛は三角、後衛は四角で表示します。</p>
    <div class="position-person-buttons">
      <button type="button" data-position-person="selfBack"><i class="marker-icon square self"></i>自分・後衛</button>
      <button type="button" data-position-person="selfFront"><i class="marker-icon triangle self"></i>自分・前衛</button>
      <button type="button" data-position-person="opponentBack"><i class="marker-icon square opponent"></i>相手・後衛</button>
      <button type="button" data-position-person="opponentFront"><i class="marker-icon triangle opponent"></i>相手・前衛</button>
    </div>
    <div class="tennis-court-picker position-court" data-position-court>
      <div class="court-side-name opponent-side-name">相手側</div><div class="court-side-name self-side-name">自分たち側</div>
      <div class="outside-label top">OUT</div><div class="outside-label left">OUT</div><div class="outside-label right">OUT</div><div class="outside-label bottom">OUT</div>
      <div class="court-lines"><i class="baseline top"></i><i class="baseline bottom"></i><i class="sideline left"></i><i class="sideline right"></i><i class="singles left"></i><i class="singles right"></i><i class="net"></i><i class="service top"></i><i class="service bottom"></i><i class="center top"></i><i class="center bottom"></i></div>
      ${markers}
    </div>
    <div class="position-help">三角＝前衛 / 四角＝後衛　青＝自分 / 赤＝相手</div>
  </div>`;
}
function playerKeyLabel(key){
  return ({selfBack:'自分後衛',selfFront:'自分前衛',opponentBack:'相手後衛',opponentFront:'相手前衛'})[key]||key;
}
function playerKeyShort(key){
  return ({selfBack:'自後',selfFront:'自前',opponentBack:'相後',opponentFront:'相前'})[key]||key;
}
function playerKeyForId(playerId){
  const pl=playerById(playerId); if(!pl)return null;
  const isFront=String(pl.position||'').includes('前衛');
  const isBack=String(pl.position||'').includes('後衛');
  if(pl.side==='self')return isFront?'selfFront':isBack?'selfBack':null;
  if(pl.side==='opponent')return isFront?'opponentFront':isBack?'opponentBack':null;
  return null;
}
function playerRallySpatialRecords(playerId){
  const key=playerKeyForId(playerId);
  if(!key)return {hits:[],landings:[],formations:[]};
  const hits=[],landings=[],formations=[];
  state.points.forEach(pt=>{
    const steps=pt.detail?.rallySteps||[];
    const matchingHits=steps.filter(step=>step.kind==='hit'&&step.playerKey===key&&step.point);
    matchingHits.forEach((step,idx)=>{
      hits.push({...pt,id:`${pt.id}-hit-${idx}`,detail:{...(pt.detail||{}),hitPoint:{...step.point}}});
    });
    const landingIndex=steps.findIndex(step=>step.kind==='landing'&&step.point);
    if(landingIndex>=0){
      const lastHit=[...steps.slice(0,landingIndex)].reverse().find(step=>step.kind==='hit');
      if(lastHit?.playerKey===key){
        landings.push({...pt,id:`${pt.id}-landing`,detail:{...(pt.detail||{}),landingPoint:{...steps[landingIndex].point}}});
      }
    }
    if(matchingHits.length && pt.detail?.playerPositions){
      formations.push(pt);
    }
  });
  return {hits,landings,formations};
}
function currentRallyPositions(detail){
  const pos=JSON.parse(JSON.stringify(detail.playerPositions||{}));
  (detail.rallySteps||[]).forEach(step=>{
    if(step.kind==='move'&&step.playerKey&&step.point)pos[step.playerKey]=step.point;
  });
  return pos;
}
function syncLegacyTrajectory(detail){
  const steps=detail.rallySteps||[];
  const hits=steps.filter(x=>x.kind==='hit');
  const dirs=steps.filter(x=>x.kind==='direction');
  const landing=[...steps].reverse().find(x=>x.kind==='landing');
  detail.hitPoint=hits[0]?.point||null;
  detail.directionPoint=dirs[0]?.point||null;
  detail.landingPoint=landing?.point||null;
}
function trajectoryPickerMarkup(detail){
  detail.rallySteps ||= [];
  const steps=detail.rallySteps, positions=currentRallyPositions(detail);
  const lastBall=[...steps].reverse().find(x=>['hit','direction','landing'].includes(x.kind));
  const afterHit=lastBall?.kind==='hit', afterDirection=lastBall?.kind==='direction', landed=lastBall?.kind==='landing';
  let instruction='① 打った選手をタップ';
  if(afterHit)instruction='② 「ボール軌道」→方向をタップ。移動がある時は「選手を移動」を先に。';
  else if(afterDirection)instruction='③ 次の打者をタップ。移動があれば先に「選手を移動」。';
  else if(landed)instruction='ラリー記録完了';

  const markers=[['selfBack','自後','self-player back-player'],['selfFront','自前','self-player front-player'],['opponentBack','相後','opponent-player back-player'],['opponentFront','相前','opponent-player front-player']]
    .map(([k,l,c])=>positions[k]?`<button type="button" class="court-marker rally-player ${c}" data-rally-player="${k}" style="left:${positions[k].x}%;top:${positions[k].y}%"><b>${l}</b></button>`:'').join('');
  const pointMarkers=steps.map((x,i)=>x.point&&x.kind==='direction'?courtPointMarker(x.point,'direction',String(i+1)):x.point&&x.kind==='landing'?courtPointMarker(x.point,'landing','落'):'').join('');
  const ballSegments=[];for(let i=0;i<steps.length;i++){if(steps[i].kind!=='hit'||!steps[i].point)continue;const next=steps.slice(i+1).find(x=>(x.kind==='direction'||x.kind==='landing')&&x.point);if(!next)continue;const prevDirection=[...steps.slice(0,i)].reverse().find(x=>x.kind==='direction'&&x.point);const from=prevDirection?.point||steps[i].point;ballSegments.push({from,to:next.point});}
  const ballLines=ballSegments.length?`<svg class="direction-line-svg rally-lines ball-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${ballSegments.map(x=>`<line x1="${x.from.x}" y1="${x.from.y}" x2="${x.to.x}" y2="${x.to.y}" />`).join('')}</svg>`:'';
  const replay=JSON.parse(JSON.stringify(detail.playerPositions||{})),moves=[];
  steps.forEach(x=>{if(x.kind==='move'&&x.playerKey&&x.point){if(replay[x.playerKey])moves.push({from:replay[x.playerKey],to:x.point});replay[x.playerKey]=x.point;}});
  const moveLines=moves.length?`<svg class="direction-line-svg player-movement-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${moves.map(x=>`<line x1="${x.from.x}" y1="${x.from.y}" x2="${x.to.x}" y2="${x.to.y}" />`).join('')}</svg>`:'';
  const timeline=steps.length?steps.map((x,i)=>`<span class="${x.kind==='move'?'move':x.kind==='landing'?'landing':''}"><b>${i+1}</b>${x.kind==='hit'?`${playerKeyShort(x.playerKey)}が打つ`:x.kind==='direction'?'方向':x.kind==='move'?`${playerKeyShort(x.playerKey)}移動`:x.point?.net?'ネット':'落下'}</span>`).join(''):'<small>まだラリー入力はありません</small>';

  return `<div class="court-picker trajectory-picker simplified-rally">
    <div class="court-picker-head"><span>② ラリーを入力</span></div>
    <div class="trajectory-step active-step"><span>${instruction}</span></div>
    <div class="rally-mode-actions compact"><button type="button" data-rally-mode="move">↔ 選手を移動</button><button type="button" data-rally-mode="ball">↗ ボール軌道</button></div>
    <div class="trajectory-legend"><span class="ball">実線＝ボール</span><span class="move">破線＝選手移動</span></div>
    <div class="tennis-court-picker trajectory-court ${afterHit?'ball-input-mode':''}" data-trajectory-court>
      <div class="court-side-name opponent-side-name">相手側</div><div class="court-side-name self-side-name">自分たち側</div>
      <div class="outside-label top">OUT</div><div class="outside-label left">OUT</div><div class="outside-label right">OUT</div><div class="outside-label bottom">OUT</div>
      <div class="court-lines"><i class="baseline top"></i><i class="baseline bottom"></i><i class="sideline left"></i><i class="sideline right"></i><i class="singles left"></i><i class="singles right"></i><i class="net"></i><i class="service top"></i><i class="service bottom"></i><i class="center top"></i><i class="center bottom"></i></div>
      ${markers}${pointMarkers}${ballLines}${moveLines}
    </div>
    ${afterDirection?`<div class="rally-next-choice"><button type="button" class="finish-at-direction">● ここで落ちた</button><button type="button" class="change-landing">落下位置を変更</button><small>続く場合は、次に打った選手をコート上でタップ</small></div>`:''}
    <div class="rally-utility-row">
      <button type="button" class="undo-rally-step" ${steps.length?'':'disabled'}>↶ 1つ戻す</button>
      <button type="button" class="clear-trajectory" ${steps.length?'':'disabled'}>最初から</button>
    </div>
    <div class="rally-timeline">${timeline}</div>
  </div>`;
}
function reviewEditorMarkup(p){
  const current=new Set(p.tagIds||[]);
  const tags=state.tags.map(t=>`<button type="button" class="review-tag ${current.has(t.id)?'selected':''}" data-tag="${t.id}">#${esc(t.name)}</button>`).join('');
  const currentShot=p.outcome?.shotType||'';
  const rb=(shot,label)=>`<button type="button" class="review-shot ${currentShot===shot?'selected':''}" data-shot="${esc(shot)}">${label}</button>`;
  const shotButtons=`
    <div class="review-shot-group"><span>ストローク</span><div class="review-shot-matrix">
      <div><b>通常</b>${rb('フォア','フォア')}${rb('バック','バック')}</div>
      <div><b>ロブ</b>${rb('フォアロブ','フォア')}${rb('バックロブ','バック')}</div>
      <div><b>中ロブ</b>${rb('フォア中ロブ','フォア')}${rb('バック中ロブ','バック')}</div>
      <div><b>トップ打ち</b>${rb('フォアトップ打ち','フォア')}${rb('バックトップ打ち','バック')}</div>
      <div><b>ツイスト</b>${rb('フォア後ツイスト','フォア')}${rb('バック後ツイスト','バック')}</div>
    </div></div>
    <div class="review-shot-group"><span>ネットプレー</span><div class="review-shot-matrix">
      <div><b>ボレー</b>${rb('フォアボレー','フォア')}${rb('バックボレー','バック')}</div>
      <div><b>ローボレー</b>${rb('フォアローボレー','フォア')}${rb('バックローボレー','バック')}</div>
      <div><b>ハイボレー</b>${rb('フォアハイボレー','フォア')}${rb('バックハイボレー','バック')}</div>
      <div class="single"><b>スマッシュ</b>${rb('スマッシュ','スマッシュ')}</div>
    </div></div>
    <div class="review-shot-group"><span>サーブ・レシーブ</span><div>${rb('サーブ','サーブ')}${rb('レシーブ','レシーブ')}</div></div>
    <div class="review-shot-group"><span>その他</span><div>${rb('その他','その他')}</div></div>`;
  const detail=p.detail||{};
  const detailOpts=detailOptionsForShot(currentShot);
  const subtypeButtons=detailOpts.length
    ? detailOpts.map(x=>`<button type="button" class="review-subtype ${detail.shotSubtype===x?'selected':''}" data-subtype="${esc(x)}">${x}</button>`).join('')
    : '';
  return `<div class="review-editor">
    <details class="review-edit-block review-shot-change"><summary><span>ショット</span><strong>${esc(currentShot||"未設定")}</strong><small>変更</small></summary><div class="review-shot-list grouped">${shotButtons}</div></details>
    ${subtypeButtons?`<div class="review-edit-block volley-subtype-block"><span>ボレーの高さ</span><small>フォア/バックを選んだあと、高さを選択</small><div class="review-subtype-list">${subtypeButtons}</div></div>`:''}
    <details class="advanced-play-review">
      <summary><div><span>詳細分析</span><strong>陣形・ラリー・選手移動</strong></div><small>必要なプレーだけ入力</small></summary>
      <div class="review-edit-block court-detail-block">
        <p>気になったポイントだけ、陣形やラリー全体を詳しく記録します。</p>
        ${playerPositionPickerMarkup(detail)}
        ${trajectoryPickerMarkup(detail)}
      </div>
    </details>
    <div class="review-edit-block review-tag-block"><span>自由タグ <small>複数選択・再タップで解除</small></span><input class="review-tag-search" type="search" placeholder="タグを検索"><div class="review-tag-list">${tags}<button type="button" class="review-new-tag">＋新しいタグ</button><button type="button" class="review-manage-tags">タグを削除・整理</button></div><div class="review-inline-tag" hidden><input maxlength="30" placeholder="タグ名"><button type="button">追加</button><small class="review-tag-status"></small></div></div>
    <label class="review-note"><span>自分用メモ <small class="note-save-status">自動保存</small></span><textarea rows="3" maxlength="300" placeholder="例：相手前衛が中央に寄った時に逆を狙った">${esc(p.note||'')}</textarea></label>
  </div>`;
}
function refreshPointTags(pointId,container){
  const p=state.points.find(x=>x.id===pointId); if(!p||!container)return;
  p.detail ||= {};
  const keepAdvancedOpen=container.querySelector('.advanced-play-review')?.open||false;
  container.innerHTML=reviewEditorMarkup(p);
  if(keepAdvancedOpen){const d=container.querySelector('.advanced-play-review');if(d)d.open=true;}
  container.querySelectorAll('.review-tag').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const id=btn.dataset.tag;
    p.tagIds=p.tagIds||[];
    p.tagIds=p.tagIds.includes(id)?p.tagIds.filter(x=>x!==id):[...p.tagIds,id];
    save();if(engine.getState().matchComplete)archiveCurrentMatch();renderStats();renderResult();refreshPointTags(pointId,container);
    showToast('タグを更新しました');
  });
  const tagSearch=container.querySelector('.review-tag-search');
  if(tagSearch)tagSearch.oninput=()=>{const q=tagSearch.value.trim().toLowerCase();container.querySelectorAll('.review-tag').forEach(b=>{const t=(b.textContent||'').toLowerCase();b.hidden=!!q&&!t.includes(q);});};
  container.querySelector('.review-manage-tags')?.addEventListener('click',e=>{e.stopPropagation();renderTagManager();el.tagDialog.showModal();});
  container.querySelectorAll('.review-shot').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    if(!p.outcome)p.outcome={type:null,playerId:null,shotType:null};
    const next=btn.dataset.shot||null;
    if(p.outcome.shotType!==next)p.detail.shotSubtype=null;
    p.outcome.shotType=next;
    save();if(engine.getState().matchComplete)archiveCurrentMatch();renderStats();renderResult();refreshPointTags(pointId,container);
    showToast('ショットを更新しました');
  });
  container.querySelectorAll('[data-review-net-side]').forEach(btn=>btn.onclick=e=>{
    if(btn.dataset.reviewNetType)return;
    e.stopPropagation();
    const side=btn.dataset.reviewNetSide;
    if(!p.outcome)p.outcome={type:null,playerId:null,shotType:null};
    p.outcome.shotType=`${side}ボレー`;
    p.detail.shotSubtype=null;
    save();if(engine.getState().matchComplete)archiveCurrentMatch();renderStats();renderResult();refreshPointTags(pointId,container);
    showToast(`${side} → ボレー種類を選択できます`);
  });
  container.querySelectorAll('[data-review-net-type]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    if(!p.outcome)p.outcome={type:null,playerId:null,shotType:null};
    p.outcome.shotType=`${btn.dataset.reviewNetSide}${btn.dataset.reviewNetType}`;
    p.detail.shotSubtype=null;
    save();if(engine.getState().matchComplete)archiveCurrentMatch();renderStats();renderResult();refreshPointTags(pointId,container);
    showToast('ネットプレーを更新しました');
  });
  container.querySelectorAll('.review-subtype').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    p.detail.shotSubtype=p.detail.shotSubtype===btn.dataset.subtype?null:btn.dataset.subtype;
    save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
    showToast('ショット詳細を更新しました');
  });
  let selectedPositionPerson=null;
  container.querySelectorAll('[data-position-person]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation(); selectedPositionPerson=btn.dataset.positionPerson;
    container.querySelectorAll('[data-position-person]').forEach(x=>x.classList.toggle('selected',x===btn));
  });
  const positionCourt=container.querySelector('[data-position-court]');
  if(positionCourt)positionCourt.onclick=e=>{
    if(!selectedPositionPerson){showToast('先に選手を選択してください');return;}
    const rect=positionCourt.getBoundingClientRect();
    const x=Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100));
    const y=Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100));
    p.detail.playerPositions ||= {};
    p.detail.playerPositions[selectedPositionPerson]={x:Number(x.toFixed(2)),y:Number(y.toFixed(2))};
    save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
    showToast('選手の立ち位置を更新しました');
  };
  let rallyMode=null, moveSelectedPlayer=null;
  const finishHere=container.querySelector('.finish-at-direction');
  if(finishHere)finishHere.onclick=e=>{
    e.stopPropagation();
    p.detail.rallySteps ||= [];
    const dir=[...p.detail.rallySteps].reverse().find(x=>x.kind==='direction'&&x.point);
    if(!dir)return;
    p.detail.rallySteps.push({kind:'landing',point:{...dir.point}});
    syncLegacyTrajectory(p.detail);save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
    showToast('直前の方向を落下地点として確定しました');
  };
  const changeLanding=container.querySelector('.change-landing');
  if(changeLanding)changeLanding.onclick=e=>{
    e.stopPropagation();rallyMode={type:'landing'};
    showToast('実際に落ちた位置をコートで1回タップ');
  };
  container.querySelectorAll('[data-rally-mode]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const mode=btn.dataset.rallyMode;
    rallyMode={type:mode}; moveSelectedPlayer=null;
    container.querySelectorAll('[data-rally-mode]').forEach(x=>x.classList.toggle('active',x===btn));
    showToast(mode==='move'?'移動する選手をタップしてください':'ボールが飛んだ方向をコートでタップしてください');
  });
  container.querySelectorAll('[data-rally-player]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const key=btn.dataset.rallyPlayer;
    p.detail.rallySteps ||= [];
    const steps=p.detail.rallySteps,lastBall=[...steps].reverse().find(x=>['hit','direction','landing'].includes(x.kind));
    if(rallyMode?.type==='move'){
      moveSelectedPlayer=key;btn.classList.add('move-selected');
      showToast(`${playerKeyLabel(key)}の移動先をタップ`);return;
    }
    if(lastBall?.kind==='hit'){showToast('先に「ボール軌道」を押して方向を入力してください');return;}
    if(lastBall?.kind==='landing'){showToast('記録済みです');return;}
    const pos=currentRallyPositions(p.detail)[key];if(!pos)return;
    steps.push({kind:'hit',playerKey:key,point:{x:pos.x,y:pos.y}});
    syncLegacyTrajectory(p.detail);save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
    showToast('ボールが飛んだ方向をタップ');
  });
  const trajectoryCourt=container.querySelector('[data-trajectory-court]');
  if(trajectoryCourt)trajectoryCourt.onclick=e=>{
    const rect=trajectoryCourt.getBoundingClientRect();
    const point={x:Number((Math.max(0,Math.min(100,(e.clientX-rect.left)/rect.width*100))).toFixed(2)),y:Number((Math.max(0,Math.min(100,(e.clientY-rect.top)/rect.height*100))).toFixed(2))};
    p.detail.rallySteps ||= [];const steps=p.detail.rallySteps;
    if(rallyMode?.type==='move'){
      if(!moveSelectedPlayer){showToast('先に動かしたい選手をタップ');return;}
      steps.push({kind:'move',playerKey:moveSelectedPlayer,point});rallyMode=null;moveSelectedPlayer=null;
      syncLegacyTrajectory(p.detail);save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);showToast('選手位置を更新しました。移動後の位置から軌道を入力できます');return;
    }
    if(rallyMode?.type==='landing'){
      const isNet=Math.abs(point.y-50)<=3&&point.x>=13&&point.x<=87;
      steps.push({kind:'landing',point:isNet?{...point,y:50,net:true}:point});rallyMode=null;syncLegacyTrajectory(p.detail);
      save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);showToast('落下地点を記録しました');return;
    }
    const lastBall=[...steps].reverse().find(x=>['hit','direction','landing'].includes(x.kind));
    if(lastBall?.kind==='hit'){
      if(rallyMode?.type!=='ball'){showToast('「ボール軌道を入力」を押してから方向をタップしてください');return;}
      steps.push({kind:'direction',point});syncLegacyTrajectory(p.detail);save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
      showToast('次の選手をタップ。ここで終わるなら「ここで落ちた」');return;
    }
    showToast('先に打った選手をタップしてください');
  };
  const undoRally=container.querySelector('.undo-rally-step');
  if(undoRally)undoRally.onclick=e=>{
    e.stopPropagation();
    p.detail.rallySteps ||= [];
    p.detail.rallySteps.pop();
    syncLegacyTrajectory(p.detail);
    save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
    showToast('一つ前の入力に戻しました');
  };
  const clearTrajectory=container.querySelector('.clear-trajectory');
  if(clearTrajectory)clearTrajectory.onclick=e=>{
    e.stopPropagation();
    p.detail.rallySteps=[];
    p.detail.hitPoint=null;p.detail.directionPoint=null;p.detail.landingPoint=null;
    save();if(engine.getState().matchComplete)archiveCurrentMatch();refreshPointTags(pointId,container);
    showToast('ラリー入力を最初からに戻しました');
  };
  const textarea=container.querySelector('textarea');
  if(textarea)textarea.oninput=()=>{p.note=textarea.value;save();if(engine.getState().matchComplete)archiveCurrentMatch();const st=container.querySelector('.note-save-status');if(st){st.textContent='保存済み ✓';clearTimeout(textarea._statusTimer);textarea._statusTimer=setTimeout(()=>st.textContent='自動保存',1400);}};
  const add=container.querySelector('.review-new-tag');
  if(add)add.onclick=e=>{e.stopPropagation();const box=container.querySelector('.review-inline-tag');if(box){box.hidden=!box.hidden;if(!box.hidden)box.querySelector('input')?.focus();}};
  const inlineBox=container.querySelector('.review-inline-tag');
  if(inlineBox){const input=inlineBox.querySelector('input'),btn=inlineBox.querySelector('button'),status=inlineBox.querySelector('.review-tag-status');let pendingName='';const commit=()=>{const name=input.value.trim();if(!name){status.textContent='タグ名を入力';pendingName='';return;}const existing=state.tags.find(x=>x.name.trim().toLowerCase()===name.toLowerCase());if(existing){status.textContent='同名タグがあります。既存タグを選択します';p.tagIds=p.tagIds||[];if(!p.tagIds.includes(existing.id))p.tagIds.push(existing.id);save();refreshPointTags(pointId,container);return;}if(pendingName!==name){pendingName=name;status.textContent=`「${name}」で追加します。修正するなら文字を直し、もう一度「追加」`;btn.textContent='追加を確定';return;}let t=state.tags.find(x=>x.name===name);if(!t){t={id:uid(),name,createdAt:new Date().toISOString()};state.tags.push(t);}p.tagIds=p.tagIds||[];if(!p.tagIds.includes(t.id))p.tagIds.push(t.id);save();if(engine.getState().matchComplete)archiveCurrentMatch();showToast(`#${name} を追加しました。ほかのポイントでも選べます`);const activeFilter=el.resultDrilldown.querySelector('[data-review-filter].active')?.dataset.reviewFilter||'all';showAllPointReview(activeFilter);};btn.onclick=e=>{e.stopPropagation();commit();};input.oninput=()=>{if(pendingName!==input.value.trim()){pendingName='';btn.textContent='追加';status.textContent='入力後に確認して追加できます';}};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commit();}};}
}
function showDrilldown(filter,label){
  const pts=state.points.filter(p=>matchesFilter(p,filter));
  showCustomPointList(`${label}`,pts);
}
function renderMomentumChart(){
  if(!state.points.length)return '';
  let diff=0; const values=[0];
  state.points.forEach(p=>{diff+=p.winner==='self'?1:-1;values.push(diff)});
  const W=920,H=360,padL=70,padR=70,padT=38,padB=48;
  const min=Math.min(...values,0),max=Math.max(...values,0); const range=Math.max(2,max-min);
  const x=i=>padL+(W-padL-padR)*(i/Math.max(1,values.length-1));
  const y=v=>padT+(H-padT-padB)*(1-(v-min)/range);
  const pts=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
  const zeroY=y(0);
  const circles=state.points.map((p,i)=>`<circle class="chart-point" data-id="${p.id}" cx="${x(i+1)}" cy="${y(values[i+1])}" r="6"><title>Point ${p.sequence} / ${p.winner==='self'?'自分たち得点':'相手得点'} / ${formatTime(p.timestamp)}</title></circle>`).join('');
  const gameLines=[];
  state.points.forEach((p,i)=>{
    const prev=i?state.points[i-1]:null;
    if(i>0 && prev && (p.gameScore?.self!==prev.gameScore?.self || p.gameScore?.opponent!==prev.gameScore?.opponent)){
      gameLines.push(`<line x1="${x(i)}" y1="${padT}" x2="${x(i)}" y2="${H-padB}" class="game-line"/>`);
    }
  });
  const ticks=[];
  for(let v=Math.floor(min);v<=Math.ceil(max);v++){
    if(v===0)continue;
    ticks.push(`<line x1="${padL}" y1="${y(v)}" x2="${W-padR}" y2="${y(v)}" class="grid-line"/><text x="${padL-8}" y="${y(v)+4}" text-anchor="end" class="axis-label">${v>0?'+':''}${v}</text>`);
  }
  return `<section class="chart-card chart-card-large"><div class="chart-head"><div><span>ポイント推移</span><h3>試合の流れ</h3></div><small>●を押すと該当動画へ</small></div>
  <div class="chart-legend"><span>上：自分たち優勢</span><span>下：相手優勢</span></div>
  <div class="momentum-chart-wrap"><svg class="momentum-chart large" viewBox="0 0 ${W} ${H}" role="img" aria-label="ポイントごとの累積得失点差">
    ${ticks.join('')}<line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" class="zero-line"/>${gameLines.join('')}
    <polyline points="${pts}" class="momentum-line"/>${circles}
    <text x="${W/2}" y="${H-12}" text-anchor="middle" class="axis-caption">ポイント経過 →</text>
  </svg></div></section>`;
}
function renderOutcomeChart(){
  const classified=state.points.filter(p=>p.outcome);
  const cats=[
    ['自分が決めた',classified.filter(p=>p.outcome?.type==='winner'&&p.winner==='self').length,'side-winner:self','good'],
    ['相手ミス',classified.filter(p=>p.outcome?.type==='error'&&p.winner==='self').length,'benefit-error:self','good'],
    ['相手が決めた',classified.filter(p=>p.outcome?.type==='winner'&&p.winner==='opponent').length,'side-winner:opponent','bad'],
    ['自分ミス',classified.filter(p=>p.outcome?.type==='error'&&p.winner==='opponent').length,'benefit-error:opponent','bad']
  ];
  const total=Math.max(1,cats.reduce((a,x)=>a+x[1],0));
  const max=Math.max(1,...cats.map(x=>x[1]));
  return `<section class="chart-card outcome-visual"><div class="chart-head"><div><span>得点内訳</span><h3>ポイントの決まり方</h3></div><small>棒を押すと該当ポイントへ</small></div>
    <div class="outcome-layout">
      <div class="outcome-summary-ring"><div class="ring-center"><strong>${classified.length}</strong><span>分類済みpt</span></div></div>
      <div class="bar-chart visual-bars">${cats.map(([name,val,filter,tone])=>{
        const pct=val/total*100;
        return `<button class="bar-row ${tone}" type="button" data-filter="${filter}" data-label="${name}">
          <span>${name}</span><i><b style="width:${val/max*100}%"></b></i><strong>${val}<small>${pct.toFixed(1)}%</small></strong>
        </button>`}).join('')}</div>
    </div>
  </section>`;
}

function buildGameSegments(){
  const groups=[]; let previousGames=0;
  state.points.forEach((p,i)=>{
    const gameNo=previousGames+1;
    let g=groups.find(x=>x.gameNo===gameNo);
    if(!g){g={gameNo,self:0,opponent:0,pointIds:[],isFinal:!!p.isFinalGame};groups.push(g);}
    g[p.winner]++; g.pointIds.push(p.id); g.isFinal ||= !!p.isFinalGame;
    previousGames=(p.gameScore?.self||0)+(p.gameScore?.opponent||0);
  });
  return groups;
}
function renderGameBreakdown(){
  const games=buildGameSegments(); if(!games.length)return '';
  const cells=games.map(g=>{
    const selfWon=g.self>g.opponent,oppWon=g.opponent>g.self;
    const first=state.points.find(p=>g.pointIds.includes(p.id)); const svc=first?serviceContext(first):{side:null};
    const sr=svc.side==='self'?'自分たちサービス':svc.side==='opponent'?'相手サービス':'サービス不明';
    return `<button type="button" class="game-flow-cell vertical" data-game="${g.gameNo}"><span>${g.isFinal?'FINAL':`GAME ${g.gameNo}`}<small>${sr}</small></span><div><b class="${selfWon?'winner':''}">${g.self}</b><i>–</i><b class="${oppWon?'winner':''}">${g.opponent}</b></div><strong>${selfWon?'○':oppWon?'●':'—'}</strong><em>見直す →</em></button>`;
  }).join('');
  return `<section class="chart-card game-flow-card"><div class="chart-head"><div><span>試合の流れ</span><h3>ゲームごとの推移</h3></div><small>上から順に確認</small></div>
    <div class="game-flow-track vertical-track">${cells}</div>
  </section>`;
}
function showGameDrilldown(gameNo){
  const g=buildGameSegments().find(x=>x.gameNo===Number(gameNo));
  if(!g)return;
  const ids=new Set(g.pointIds);
  const pts=state.points.filter(p=>ids.has(p.id));
  showCustomPointList(`${g.isFinal?'FINAL':`GAME ${g.gameNo}`}：${g.self}-${g.opponent}`,pts);
}
function showAllPointReview(filter='all'){
  if(!state.points.length)return;
  const pts=filter==='self'?state.points.filter(p=>p.winner==='self'):filter==='opponent'?state.points.filter(p=>p.winner==='opponent'):filter==='important'?state.points.filter(p=>p.important):state.points;
  showCustomPointList('全ポイント',pts,{reviewFilter:filter,baseReview:true});
}
function showCustomPointList(label,pts,options={}){
  if(!el.resultDrilldown)return;
  el.reviewTab.hidden=false;
  showPanel('review');
  el.resultDrilldown.hidden=false;
  const returnPlayerId=options.returnPlayerId||null;
  const reviewFilter=options.reviewFilter||'all';
  const baseReview=!!options.baseReview;
  el.resultDrilldown.dataset.returnPlayerId=returnPlayerId||'';
  el.resultDrilldown.innerHTML=`<div class="drill-head"><div><span>見直す</span><h3>${esc(label)} <b>${pts.length}件</b></h3><p>動画を見ながら、その場で詳細分析を追加できます。</p></div><div class="drill-head-actions">${returnPlayerId?`<button type="button" class="drill-back-player">← 選手分析に戻る</button>`:''}${!baseReview?`<button type="button" class="drill-close">全ポイントへ戻る</button>`:''}</div></div>
    ${baseReview?`<div class="review-hub"><div><span>REVIEW</span><h4>見直したいプレーを選ぶ</h4><p>重要ポイントやタグから絞り込み、動画の該当場面へ戻れます。</p></div><label class="review-search">タグ・ショット検索<input type="search" data-review-search placeholder="例：ロブ、レシーブ"></label></div><div class="review-filter-tabs four"><button data-review-filter="all" class="${reviewFilter==='all'?'active':''}">すべて</button><button data-review-filter="important" class="${reviewFilter==='important'?'active':''}">★ 重要</button><button data-review-filter="self" class="${reviewFilter==='self'?'active':''}">得点</button><button data-review-filter="opponent" class="${reviewFilter==='opponent'?'active':''}">失点</button></div>`:''}
    <div class="drill-list">${pts.length?pts.map(p=>pointReviewCard(p)).join(''):'<p class="analysis-empty">該当ポイントはありません。</p>'}</div>`;
  wireReviewCards();
}
function pointReviewCard(p){
  const out=p.outcome; const player=out?.playerId?playerById(out.playerId):null;
  const reason=player?`${player.name}（${player.position||''}） ${out.type==='winner'?'得点':'ミス'}`:'詳細未分類';
  const tags=(p.tagIds||[]).map(id=>state.tags.find(t=>t.id===id)?.name).filter(Boolean);
  const ctx=pointGameContext(p),svc=serviceContext(p);
  return `<article class="drill-point-card" data-id="${p.id}">
    <div class="review-card-top">
      <span class="review-point-no">${ctx.label}　${ctx.beforeSelf}-${ctx.beforeOpponent}</span>
      <span class="review-time">${formatTime(p.startTimestamp??p.timestamp)}</span><button type="button" class="review-important ${p.important?'active':''}" aria-label="重要ポイント" title="重要ポイント">${p.important?'★':'☆'}</button>
      <strong class="${p.winner==='self'?'self-win':'opp-win'}">${p.winner==='self'?'自分たち得点':'相手得点'}</strong>
    </div>
    <div class="review-context"><span>${svc.label}${svc.serverName?`・${esc(svc.serverName)}`:''}</span><small>Point ${p.sequence}</small></div>
    <div class="review-reason">${esc(reason)}</div>
    <div class="review-play-actions"><button class="review-prev" type="button">← 前</button><button class="review-video-btn primary-review-action" type="button">▶ このプレーを見る</button><button class="review-next" type="button">次 →</button></div>
    <div class="review-meta">${out?.shotType?`<span>${esc(out.shotType)}</span>`:''}${tags.map(t=>`<span>#${esc(t)}</span>`).join('')}${!out?.shotType&&!tags.length?'<span>タグなし</span>':''}</div>
    <div class="review-tags-host"></div>
  </article>`;
}
function wireReviewCards(){
  el.resultDrilldown.querySelectorAll('[data-review-filter]').forEach(b=>b.onclick=()=>showAllPointReview(b.dataset.reviewFilter));
  const reviewSearch=el.resultDrilldown.querySelector('[data-review-search]'); if(reviewSearch) reviewSearch.oninput=()=>{const q=reviewSearch.value.trim().toLowerCase();el.resultDrilldown.querySelectorAll('.drill-point-card').forEach(card=>{const p=state.points.find(x=>x.id===card.dataset.id);const names=(p?.tagIds||[]).map(id=>state.tags.find(t=>t.id===id)?.name||'');const hay=[p?.outcome?.shotType||'',...names].join(' ').toLowerCase();card.hidden=!!q&&!hay.includes(q);});};
  el.resultDrilldown.querySelector('.drill-back-player')?.addEventListener('click',()=>{
    const playerId=el.resultDrilldown.dataset.returnPlayerId;
    if(playerId)openPlayerDetail(playerId);
  });
  el.resultDrilldown.querySelector('.drill-close')?.addEventListener('click',()=>{showAllPointReview();});
  el.resultDrilldown.querySelectorAll('.drill-point-card').forEach(card=>{
    const p=state.points.find(x=>x.id===card.dataset.id);
    card.querySelector('.review-video-btn').onclick=()=>jumpToPoint(p);
    const visibleCards=()=>[...el.resultDrilldown.querySelectorAll('.drill-point-card')].filter(x=>!x.hidden);
    card.querySelector('.review-prev')?.addEventListener('click',()=>{const a=visibleCards(),i=a.indexOf(card);if(i>0)a[i-1].querySelector('.review-video-btn')?.click();});
    card.querySelector('.review-next')?.addEventListener('click',()=>{const a=visibleCards(),i=a.indexOf(card);if(i>=0&&i<a.length-1)a[i+1].querySelector('.review-video-btn')?.click();});
    card.querySelector('.review-important')?.addEventListener('click',()=>{p.important=!p.important;save();showAllPointReview(p.important?'important':'all');showToast(p.important?'重要ポイントに追加しました':'重要ポイントを解除しました');});
    refreshPointTags(p.id,card.querySelector('.review-tags-host'));
  });
}

function renderPlayerComparison(summary){
  return `<section class="chart-card player-comparison-card"><div class="chart-head"><div><span>選手別</span><h3>個人データ</h3></div><small>選手を押すと専用画面で詳しく確認</small></div>
    <div class="player-comparison-table"><div class="pc-head"><span>選手</span><span>得点</span><span>ミス</span><span>サーブ得点率</span><span></span></div>
      ${summary.players.map(p=>`<button class="pc-row" type="button" data-player="${p.id}"><span><b>${esc(p.name)}</b><small>${p.side==='self'?'自分':'相手'}・${esc(p.position||'')}</small></span><strong>${p.winners}</strong><strong>${p.errors}</strong><strong>${pct(p.servicePointWinRate)}</strong><i>詳細 →</i></button>`).join('')}
    </div>
  </section>`;
}
function zoneHeatmapCells(points,key,tone='hit'){const relevant=points.filter(p=>p.detail?.[key]&&!classifyCourtPoint(p.detail[key]).startsWith('コート外')&&!p.detail[key].net),counts=Array(9).fill(0);relevant.forEach(p=>{const q=p.detail[key],col=Math.min(2,Math.max(0,Math.floor(((q.x-15)/70)*3))),row=Math.min(2,Math.max(0,Math.floor(((q.y-8)/84)*3)));counts[row*3+col]++;});const max=Math.max(1,...counts);return counts.map((c,i)=>`<div class="court-heat-cell ${tone} level-${c?Math.max(1,Math.ceil(c/max*5)):0}"><strong>${c}回</strong><span>${relevant.length?pct(c/relevant.length*100):'0.0%'}</span></div>`).join('');}
function heatmapCourt(points,key,title,tone='hit'){const all=points.filter(p=>p.detail?.[key]),inside=all.filter(p=>!classifyCourtPoint(p.detail[key]).startsWith('コート外')&&!p.detail[key].net),outs=all.filter(p=>classifyCourtPoint(p.detail[key]).startsWith('コート外')),nets=all.filter(p=>p.detail[key].net);if(!all.length)return `<section class="heatmap-card"><div class="heatmap-head"><h4>${title}</h4><span>データなし</span></div><p>位置を入力するとコート上に表示します。</p></section>`;return `<section class="heatmap-card zoned-heatmap-card"><div class="heatmap-head"><h4>${title}</h4><span>${all.length}プレー</span></div><div class="heatmap-court zoned-heatmap"><div class="court-side-name opponent-side-name">相手側</div><div class="court-side-name self-side-name">自分たち側</div><div class="court-lines"><i class="baseline top"></i><i class="baseline bottom"></i><i class="sideline left"></i><i class="sideline right"></i><i class="singles left"></i><i class="singles right"></i><i class="net"></i><i class="service top"></i><i class="service bottom"></i><i class="center top"></i><i class="center bottom"></i></div><div class="court-heat-grid">${zoneHeatmapCells(inside,key,tone)}</div></div><div class="court-result-chips"><span>コート内 <b>${inside.length}</b></span><span class="out">アウト <b>${outs.length}</b></span>${nets.length?`<span>ネット <b>${nets.length}</b></span>`:''}</div></section>`;}

function formationPlayCards(points){
  const detailed=points.filter(p=>p.detail?.playerPositions && Object.keys(p.detail.playerPositions).length);
  if(!detailed.length)return `<section class="formation-play-section"><p class="analysis-empty">陣形を入力したプレーはまだありません。</p></section>`;
  return `<section class="formation-play-section">
    <div class="formation-play-list">${detailed.slice(0,8).map(p=>{
      const pos=p.detail.playerPositions||{};
      const markers=[
        ['selfFront','自前','self front'],['selfBack','自後','self back'],
        ['opponentFront','相前','opponent front'],['opponentBack','相後','opponent back']
      ].map(([k,label,cls])=>pos[k]?`<span class="formation-dot ${cls}" style="left:${pos[k].x}%;top:${pos[k].y}%"><b>${label}</b></span>`:'').join('');
      const ctx=pointGameContext(p);
      return `<button type="button" class="formation-play-card" data-formation-point="${p.id}">
        <div class="formation-card-head"><strong>${ctx.label} ${ctx.beforeSelf}-${ctx.beforeOpponent}</strong><span>${p.winner==='self'?'得点':'失点'}</span></div>
        <div class="heatmap-court formation-single-map">
          <div class="court-side-name opponent-side-name">相手側</div><div class="court-side-name self-side-name">自分たち側</div>
          <div class="court-lines"><i class="baseline top"></i><i class="baseline bottom"></i><i class="sideline left"></i><i class="sideline right"></i><i class="singles left"></i><i class="singles right"></i><i class="net"></i><i class="service top"></i><i class="service bottom"></i><i class="center top"></i><i class="center bottom"></i></div>${markers}
        </div>
        <small>このプレーを見る →</small>
      </button>`;
    }).join('')}</div>
  </section>`;
}
function formationHeatmap(points){
  return formationPlayCards(points);
}
function aggregateLocation(points,key){
  const map={};
  points.forEach(pt=>{
    const point=pt.detail?.[key]; if(!point)return;
    const zone=classifyCourtPoint(point);
    map[zone] ||= {total:0,winners:0,errors:0};
    map[zone].total++;
    if(pt.outcome?.type==='winner')map[zone].winners++;
    if(pt.outcome?.type==='error')map[zone].errors++;
  });
  return map;
}
function locationRows(map){
  return Object.entries(map).sort((a,b)=>b[1].total-a[1].total).map(([zone,v])=>{
    const errRate=v.total?v.errors/v.total*100:0;
    return `<tr><th>${esc(zone)}</th><td>${v.total}</td><td>${v.winners}</td><td>${v.errors}</td><td>${pct(errRate)}</td></tr>`;
  }).join('');
}
function openPlayerDetail(playerId){
  const summary=summarizeMatch(state.points,state.players||{self:[],opponent:[]});
  const p=summary.players.find(x=>x.id===playerId); if(!p)return;
  const raw=playerById(playerId); const side=raw?.side||p.side;
  const relevant=state.points.filter(pt=>pt.outcome?.playerId===playerId || (pt.service?.serverId||pt.service?.server?.id||pt.service?.server)===playerId);
  const outcomePoints=state.points.filter(pt=>pt.outcome?.playerId===playerId);
  const shotMap={}, shotResultMap={}, subtypeMap={};
  outcomePoints.forEach(pt=>{
    if(pt.outcome?.shotType){shotMap[pt.outcome.shotType]=(shotMap[pt.outcome.shotType]||0)+1;shotResultMap[pt.outcome.shotType] ||= {winner:0,error:0};if(pt.outcome?.type==='winner')shotResultMap[pt.outcome.shotType].winner++;if(pt.outcome?.type==='error')shotResultMap[pt.outcome.shotType].error++;}
    if(pt.detail?.shotSubtype)subtypeMap[pt.detail.shotSubtype]=(subtypeMap[pt.detail.shotSubtype]||0)+1;
  });
  const spatial=playerRallySpatialRecords(playerId);
  const hitSpatialPoints=spatial.hits;
  const landingSpatialPoints=spatial.landings;
  const formationSpatialPoints=spatial.formations;
  const hitMap=aggregateLocation(hitSpatialPoints,'hitPoint');
  const landMap=aggregateLocation(landingSpatialPoints,'landingPoint');
  const hitRows=locationRows(hitMap), landRows=locationRows(landMap);
  const patternRows='';

  const detailed=outcomePoints.filter(pt=>pt.detail?.shotSubtype||pt.detail?.hitPoint||pt.detail?.landingPoint||pt.note).length;
  const detailRate=outcomePoints.length?detailed/outcomePoints.length*100:0;

  el.playerDetailTitle.textContent=p.name;
  el.playerDetailSubtitle.textContent=`${side==='self'?'自分ペア':'相手ペア'}・${p.position||''}`;
  el.playerDetailBody.innerHTML=`
    <section class="pd-kpis">
      <article><span>得点</span><strong>${p.winners}</strong></article>
      <article><span>ミス</span><strong>${p.errors}</strong></article>
      <article><span>サーブ時得点率</span><strong>${pct(p.servicePointWinRate)}</strong></article>
      <article><span>1st成功率</span><strong>${pct(p.firstInRate)}</strong></article>
      <article><span>1st時得点率</span><strong>${pct(p.firstPointWinRate)}</strong></article>
      <article><span>2nd時得点率</span><strong>${pct(p.secondPointWinRate)}</strong></article>
    </section>

    <section class="pd-section pd-detail-progress emphasized">
      <div><span>詳細分析したプレー</span><strong>${detailed}件</strong></div>
      <i><b style="width:${detailRate}%"></b></i>
      <small>この選手について後から振り返ったプレーを優先して確認できます。</small>
    </section>

    <section class="pd-section">
      <h3>ショット別の得点・ミス</h3>
      ${Object.keys(shotResultMap).length?`<div class="pd-shot-results">${Object.entries(shotResultMap).map(([k,v])=>{const total=v.winner+v.error;const wr=total?Math.round(v.winner/total*100):0;return `<article><div class="pd-shot-name"><strong>${esc(k)}</strong><small>${total}記録</small></div><div class="pd-shot-score"><span class="win"><b>${v.winner}</b><small>得点</small></span><span class="loss"><b>${v.error}</b><small>ミス</small></span><span class="rate ${wr>=70?'hot':''}"><b>${wr}%</b><small>得点率</small></span></div></article>`}).join('')}</div>`:'<p>ショットデータはまだありません。</p>'}
    </section>

    <section class="pd-section court-analysis-section">
      <div class="pd-section-head"><h3>コート分析</h3><small>ラリー記録でこの選手が打った位置を集計</small></div>
      <div class="court-analysis-tabs">
        <button type="button" class="active" data-court-tab="hit">打った位置</button>
        <button type="button" data-court-tab="landing">落下地点</button>
        <button type="button" data-court-tab="formation">陣形</button>
      </div>
      <div class="court-tab-panel active" data-court-panel="hit">${heatmapCourt(hitSpatialPoints,'hitPoint','打った位置')}</div>
      <div class="court-tab-panel" data-court-panel="landing">${heatmapCourt(landingSpatialPoints,'landingPoint','落下位置','landing')}</div>
      <div class="court-tab-panel" data-court-panel="formation"><div class="formation-result-tabs"><button type="button" class="active" data-formation-filter="all">すべて</button><button type="button" data-formation-filter="self">得点時</button><button type="button" data-formation-filter="opponent">失点時</button></div><div class="formation-filter-host">${formationPlayCards(formationSpatialPoints)}</div></div>
    </section>

    <section class="pd-section">
      <h3>打った位置</h3>
      <p class="pd-help">ラリー記録内でこの選手が実際に「打った選手」として選ばれた位置だけを集計します。</p>
      ${hitRows?`<div class="pd-zone-table"><table><thead><tr><th>位置</th><th>回数</th><th>得点</th><th>ミス</th><th>ミス割合</th></tr></thead><tbody>${hitRows}</tbody></table></div>`:'<p>打点位置データはまだありません。</p>'}
    </section>

    <section class="pd-section">
      <h3>落ちた位置</h3>
      <p class="pd-help">この選手が最後に打ち、そのラリーが終了した落下地点だけを集計します。</p>
      ${landRows?`<div class="pd-zone-table"><table><thead><tr><th>位置</th><th>回数</th><th>得点</th><th>ミス</th><th>ミス割合</th></tr></thead><tbody>${landRows}</tbody></table></div>`:'<p>落下位置データはまだありません。</p>'}
    </section>



    <section class="pd-section">
      <h3>振り返ったプレー</h3>
      <p class="pd-help">メモや詳細分析を残したプレーを、動画と一緒に見返します。</p>
      <details class="pd-reviewed-plays"><summary>振り返ったプレーを表示 <b>${relevant.length}件</b></summary><div class="pd-point-list note-list compact-note-list">${relevant.length?relevant.slice(0,20).map(pt=>{
        const detail=pt.detail||{};
        const labels=[pt.outcome?.shotType,detail.shotSubtype,detail.hitPoint?`打:${classifyCourtPoint(detail.hitPoint)}`:null,detail.landingPoint?`落:${classifyCourtPoint(detail.landingPoint)}`:null].filter(Boolean).join('・');
        return `<button type="button" data-id="${pt.id}"><span>Point ${pt.sequence}<small>${formatTime(pt.timestamp)}</small></span><strong>${pt.outcome?.playerId===playerId?(pt.outcome.type==='winner'?'得点':'ミス'):'サーブ'}${labels?`・${esc(labels)}`:''}</strong><em>${esc(pt.note||'メモなし')}</em></button>`;
      }).join(''):'<p>関連プレーはありません。</p>'}</div></details>
    </section>`;
  el.playerDetailBody.querySelectorAll('[data-court-tab]').forEach(btn=>btn.onclick=()=>{
    el.playerDetailBody.querySelectorAll('[data-court-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    el.playerDetailBody.querySelectorAll('[data-court-panel]').forEach(x=>x.classList.toggle('active',x.dataset.courtPanel===btn.dataset.courtTab));
  });
  el.playerDetailBody.querySelectorAll('[data-formation-filter]').forEach(btn=>btn.onclick=()=>{
    el.playerDetailBody.querySelectorAll('[data-formation-filter]').forEach(x=>x.classList.toggle('active',x===btn));
    const filtered=btn.dataset.formationFilter==='all'?formationSpatialPoints:formationSpatialPoints.filter(pt=>pt.winner===btn.dataset.formationFilter);
    const host=el.playerDetailBody.querySelector('.formation-filter-host');if(host)host.innerHTML=formationPlayCards(filtered);
    host?.querySelectorAll('[data-formation-point]').forEach(card=>card.onclick=()=>{const pt=state.points.find(x=>x.id===card.dataset.formationPoint);if(!pt)return;el.playerDetailDialog.close();showCustomPointList(`${p.name}・${pointGameContext(pt).label}`,[pt],{returnPlayerId:playerId});jumpToPoint(pt);});
  });
  el.playerDetailBody.querySelectorAll('[data-formation-point]').forEach(btn=>btn.onclick=()=>{
    const pt=state.points.find(x=>x.id===btn.dataset.formationPoint);
    if(!pt)return;
    el.playerDetailDialog.close();
    showCustomPointList(`${p.name}・${pointGameContext(pt).label}`,[pt],{returnPlayerId:playerId});
    jumpToPoint(pt);
  });
  el.playerDetailBody.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{
    const pt=state.points.find(x=>x.id===b.dataset.id);
    el.playerDetailDialog.close();
    showCustomPointList(`${p.name}・Point ${pt.sequence}`,[pt],{returnPlayerId:playerId});
    jumpToPoint(pt);
  });
  el.playerDetailDialog.showModal();
}
function renderCourtDistributionSummary(){
  const detailed=state.points.filter(p=>p.detail?.hitPoint||p.detail?.landingPoint||p.detail?.playerPositions);
  return `<section class="result-section court-distribution-summary">
    <div class="result-section-head"><div><span>コート分布</span><h3>どこで打ち、どこで終わったか</h3></div><small>${detailed.length}プレー位置入力済み</small></div>
    <div class="heatmap-grid">
      ${heatmapCourt(state.points,'hitPoint','打った位置')}
      ${heatmapCourt(state.points,'landingPoint','落下位置','landing')}
      ${formationHeatmap(state.points)}
    </div>
  </section>`;
}
function renderLocationPatternSummary(){
  const pts=state.points.filter(p=>p.detail?.hitPoint&&p.detail?.landingPoint&&p.outcome);
  if(!pts.length)return `<section class="result-section"><div class="result-section-head"><div><span>位置分析</span><h3>打点 → 落下位置</h3></div></div><p class="analysis-empty">プレー確認で「打った位置」と「落ちた位置」を入力すると、ここに得点・ミスパターンが表示されます。</p></section>`;
  const patterns={};
  pts.forEach(p=>{
    const label=`${classifyCourtPoint(p.detail.hitPoint)} → ${classifyCourtPoint(p.detail.landingPoint)}`;
    patterns[label] ||= {total:0,winners:0,errors:0};
    patterns[label].total++;
    if(p.outcome.type==='winner')patterns[label].winners++;
    if(p.outcome.type==='error')patterns[label].errors++;
  });
  const rows=Object.entries(patterns).sort((a,b)=>b[1].total-a[1].total).slice(0,10).map(([label,v])=>{
    const win=v.total?v.winners/v.total*100:0,err=v.total?v.errors/v.total*100:0;
    return `<tr><th>${esc(label)}</th><td>${v.total}</td><td>${pct(win)}</td><td>${pct(err)}</td></tr>`;
  }).join('');
  return `<section class="result-section location-pattern-summary"><div class="result-section-head"><div><span>位置分析</span><h3>打った場所 → 落ちた場所</h3></div><small>${pts.length}プレー入力済み</small></div>
    <p class="pd-help">記録された組み合わせの傾向。数字から因果関係は断定しません。</p>
    <div class="pd-zone-table pattern-table"><table><thead><tr><th>パターン</th><th>回数</th><th>得点率</th><th>ミス率</th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}
function reflectionMarkup(){
  const r=state.reflection||{};
  return `<section class="result-section reflection-section"><div class="result-section-head"><div><span>次につなげる</span><h3>この試合の振り返り</h3></div><small>自動保存</small></div>
    <label><span>この試合で気づいたこと</span><textarea data-reflection="noticed" rows="2" placeholder="動画や数字を見て気づいた事実">${esc(r.noticed||'')}</textarea></label>
    <label><span>次の試合でも確認したいこと</span><textarea data-reflection="checkNext" rows="2" placeholder="次も見たいポイント">${esc(r.checkNext||'')}</textarea></label>
    <label><span>次に試したいこと</span><textarea data-reflection="tryNext" rows="2" placeholder="次の試合・練習で試すこと">${esc(r.tryNext||'')}</textarea></label><div class="reflection-save-row"><button type="button" data-reflection-save>振り返りを保存</button><span data-reflection-status>入力内容は自動保存中</span></div>
  </section>`;
}
function renderReflectionPanel(){
  if(!el.reflectionSummary)return;
  if(!state.points.length){el.reflectionSummary.innerHTML='<div class="empty-state"><h3>まだ振り返れるプレーがありません</h3><p>ポイントを入力すると振り返りを残せます。</p></div>';return;}
  const reviewed=state.points.filter(p=>p.note||p.detail?.rallySteps?.length||p.tagIds?.length);
  const s=summarizeMatch(state.points,state.players||{self:[],opponent:[]});const selfB=s.breakdown.self,oppB=s.breakdown.opponent;
  const cue=reviewed.length?`${reviewed.length}プレーを確認済み`:`まず気になったプレーを1つ確認`;
  el.reflectionSummary.innerHTML=`<section class="reflection-hero minimal"><span>振り返り</span><h2>この試合を振り返る</h2><p>${cue}</p></section><section class="reflection-context-strip"><div><b>${s.selfPoints}<i>–</i>${s.opponentPoints}</b><span>取得 – 失点</span></div><div><b>${selfB.winners}</b><span>決定打</span></div><div><b>${oppB.opponentErrors}</b><span>自分ミス</span></div><button type="button" data-reflection-review>映像を確認 →</button></section><section class="reflection-prompt"><strong>何が起きていた？</strong><small>数字と映像を根拠に、自分の言葉で残します。</small></section>${reflectionMarkup()}<p class="reflection-save-note simple">保存後は「過去試合」の振り返りから見返せます。</p>`;
  el.reflectionSummary.querySelector('[data-reflection-review]')?.addEventListener('click',()=>showAllPointReview());
  el.reflectionSummary.querySelectorAll('[data-reflection]').forEach(t=>t.oninput=()=>{state.reflection ||= {};state.reflection[t.dataset.reflection]=t.value;save();const st=el.reflectionSummary.querySelector('[data-reflection-status]');if(st)st.textContent='入力内容は自動保存中';}); el.reflectionSummary.querySelector('[data-reflection-save]')?.addEventListener('click',()=>{save();archiveCurrentMatch(true);const st=el.reflectionSummary.querySelector('[data-reflection-status]');if(st)st.textContent='保存しました ✓';showToast('振り返りを保存しました');});
}
function renderResult(){
  const m=engine.getState();
  el.resultTab.hidden=!m.matchComplete;
  if(!state.points.length){el.resultSummary.innerHTML='';return;}
  const summary=summarizeMatch(state.points,state.players||{self:[],opponent:[]});
  const classifiedRate=summary.totalPoints?summary.classified/summary.totalPoints*100:0;

  const playerCards=summary.players.map(p=>`<article class="result-player-card">
    <header><div><span>${p.side==='self'?'自分ペア':'相手ペア'}・${esc(p.position||'')}</span><h3>${esc(p.name)}</h3></div></header>
    <div class="result-player-stats">
      <button data-filter="player-winner:${p.id}" data-label="${esc(p.name)} 得点"><span>得点</span><strong>${p.winners}</strong></button>
      <button data-filter="player-error:${p.id}" data-label="${esc(p.name)} ミス"><span>ミス</span><strong>${p.errors}</strong></button>
      <button data-filter="server-win:${p.id}" data-label="${esc(p.name)} サーブ時得点"><span>サーブ時得点率</span><strong>${pct(p.servicePointWinRate)}</strong></button>
      <button data-filter="player-first:${p.id}" data-label="${esc(p.name)} 1st成功"><span>1st成功率</span><strong>${pct(p.firstInRate)}</strong></button>
    </div>
  </article>`).join('');

  const tagCards=state.tags.map(t=>{
    const pts=state.points.filter(p=>p.tagIds?.includes(t.id)); if(!pts.length)return '';
    const self=pts.filter(p=>p.winner==='self').length;
    return `<button class="result-tag-card" data-filter="tag:${t.id}" data-label="#${esc(t.name)}" type="button"><span>#${esc(t.name)}</span><strong>${pts.length}pt</strong><small>自分得点率 ${pct(self/pts.length*100)}</small><i>動画で確認 →</i></button>`;
  }).join('');

  el.resultSummary.innerHTML=`
    <section class="result-hero redesigned">
      <div><span>MATCH SUMMARY</span><h2>${summary.selfPoints}<i>-</i>${summary.opponentPoints}</h2><p>自分たちのポイント率 <strong>${pct(summary.selfPointRate)}</strong></p></div>
      <div class="result-share-bar"><i class="self" style="width:${summary.selfPointRate}%"></i><i class="opp" style="width:${summary.opponentPointRate}%"></i></div>
      <small>全${summary.totalPoints}ポイント ・ 詳細記録率 ${pct(classifiedRate)}</small>
    </section>

    ${renderGameBreakdown()}
    ${renderOutcomeChart()}
    <section class="result-main-player-section">
      <div class="result-section-head"><div><span>メイン分析</span><h3>選手別の詳細</h3></div><small>選手を選んで詳しく振り返る</small></div>
      ${renderPlayerComparison(summary)}
    </section>


    <section class="result-section"><div class="result-section-head"><div><span>自由タグ</span><h3>自分で残した傾向</h3></div><small>タグを押すと該当動画へ</small></div><div class="result-tag-grid">${tagCards||'<p class="analysis-empty">タグ付きポイントはありません。</p>'}</div></section>
    ${reflectionMarkup()}

    <p class="result-note">表示している割合は固定ボタンで入力した事実の集計です。自由タグは因果関係を示すものではなく、ユーザー自身が分類したポイントの傾向確認に使います。</p>`;

  el.resultSummary.querySelectorAll('.chart-point').forEach(c=>c.onclick=()=>jumpToPoint(state.points.find(p=>p.id===c.dataset.id)));
  el.resultSummary.querySelectorAll('.bar-row,[data-filter]').forEach(b=>{
    if(!b.dataset.filter)return;
    b.onclick=()=>showDrilldown(b.dataset.filter,b.dataset.label||b.textContent.trim());
  });
  el.resultSummary.querySelectorAll('.game-flow-cell').forEach(b=>b.onclick=()=>showGameDrilldown(b.dataset.game));
  el.resultSummary.querySelectorAll('.pc-row').forEach(b=>b.onclick=()=>openPlayerDetail(b.dataset.player));
  el.resultSummary.querySelectorAll('[data-reflection]').forEach(t=>t.oninput=()=>{
    state.reflection ||= {};
    state.reflection[t.dataset.reflection]=t.value;
    save();if(engine.getState().matchComplete)archiveCurrentMatch();
  });
}
function showPanel(name){
  if(name==='input')reviewingPoint=false;
  if(el.workspace)el.workspace.dataset.panel=name;
  $$('[data-panel]').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));
  el.inputPanel.hidden=name!=='input';if(el.historyPanel)el.historyPanel.hidden=true;el.statsPanel.hidden=name!=='stats';el.reviewPanel.hidden=name!=='review';if(el.reflectionPanel)el.reflectionPanel.hidden=name!=='reflection';if(el.resultPanel)el.resultPanel.hidden=true;
  if(name==='stats')renderStats();if(name==='reflection')renderReflectionPanel();
}
function render(){
  syncMobileOutcomeLabels();renderScore();renderService();renderOutcomeButtons();renderServeAttempt();renderTags();renderHistory();renderStats();renderReflectionPanel();if(el.reviewTab)el.reviewTab.hidden=!state.points.length;if(el.reflectionTab)el.reflectionTab.hidden=!state.points.length;}

$$('[data-panel]').forEach(b=>b.onclick=()=>{if(b.dataset.panel==='review'&&state.points.length)showAllPointReview();else showPanel(b.dataset.panel);});
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||el.tagDialog.open)return;if(e.key.toLowerCase()==='z')undo();});
el.newMatchBtn.onclick=()=>{if(state.points.length&&!confirm('現在のポイント履歴を終了して新しい試合を始めますか？'))return;localStorage.removeItem(STORAGE_KEY);location.reload();};
el.switchLocalBtn.onclick=()=>{localStorage.removeItem(STORAGE_KEY);state={format:state.format||7,videoSource:null,points:[],tags:state.tags||[],selectedTagIds:[],players:state.players||null,startServiceSide:state.startServiceSide||'self',serviceSettings:{},finalServiceSettings:null};engine=new SoftTennisMatchEngine(state.format);el.workspace.hidden=true;el.setupScreen.hidden=false;setSource('local');hideVideoError();};
window.addEventListener('beforeunload',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);});

// 動画ファイル本体は復元・保存しない。YouTube分析だけはブラウザ保存から再開できる。
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved?.videoSource?.type==='youtube'&&saved.points?.length){state={...saved,players:saved.players||{self:[{id:'self1',side:'self',name:'自分A',position:'後衛'},{id:'self2',side:'self',name:'自分B',position:'前衛'}],opponent:[{id:'opponent1',side:'opponent',name:'相手A',position:'後衛'},{id:'opponent2',side:'opponent',name:'相手B',position:'前衛'}]},startServiceSide:saved.startServiceSide||'self',serviceSettings:saved.serviceSettings||{},finalServiceSettings:saved.finalServiceSettings||null};sourceType='youtube';engine=new SoftTennisMatchEngine(state.format,state.points.map(p=>p.winner));el.setupScreen.hidden=true;el.workspace.hidden=false;el.formatBadge.textContent=`${state.format} GAME MATCH`;el.videoName.textContent=`YouTube · ${state.videoSource.videoId}`;initVideo();render();}}catch{}

// PC / スマホで保存選手セレクトの案内文を最適化
function updateSavedPlayerPlaceholder(){
  const label=window.matchMedia('(max-width:700px)').matches?'保存選手':'登録選手から選択';
  ['savedSelfPlayer1','savedSelfPlayer2','savedOpponentPlayer1','savedOpponentPlayer2'].forEach(id=>{const s=document.getElementById(id);if(s&&s.options[0]&&s.options[0].value==='')s.options[0].textContent=label;});
}
updateSavedPlayerPlaceholder();window.addEventListener('resize',updateSavedPlayerPlaceholder);
