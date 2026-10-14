(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const archive=read('rally-note-match-archive-v1',[]),current=read('rally-note-poc-v1',null),profiles=read('rally-note-player-profiles-v1',[]);
const matches=[];
for(const x of archive){const m=x.data||x;if(m?.points?.length)matches.push(m)}
if(current?.points?.length&&!matches.some(m=>m.matchId&&m.matchId===current.matchId))matches.unshift(current);
const idOf=(m,i)=>String(m.matchId||m.id||`match-${i}`);
const people=new Map();
for(const m of matches)for(const pl of [...(m.players?.self||[]),...(m.players?.opponent||[])]){
 const key=pl.profileId?'profile:'+pl.profileId:`name:${pl.side}:${pl.name}`;
 if(!people.has(key))people.set(key,{key,name:pl.name||'名前未設定',profileId:pl.profileId,side:pl.side});
}
for(const pl of profiles){const key='profile:'+pl.id;if(!people.has(key))people.set(key,{key,name:pl.name||'名前未設定',profileId:pl.id})}
const playerSelect=$('player');playerSelect.innerHTML=[...people.values()].map(p=>`<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('');
const percent=(n,d)=>d?`${+(100*n/d).toFixed(1)}%`:'—';
const ratio=(n,d)=>d?100*n/d:null;
const category=s=>{s=String(s||'');for(const v of ['ハイボレー','ローボレー','ボレー','中ロブ','ロブ','スマッシュ','レシーブ','サーブ','ネット','チップ','フォア','バック'])if(s.includes(v))return v;return s||'未分類'};
function matchingPlayer(m,p){return [...(m.players?.self||[]),...(m.players?.opponent||[])].find(x=>p.profileId?x.profileId===p.profileId:(x.name===p.name&&x.side===p.side))}
function eligible(){const p=people.get(playerSelect.value);return p?matches.map((m,i)=>({m,id:idOf(m,i),pl:matchingPlayer(m,p)})).filter(x=>x.pl):[]}
let selected=new Set();let selectionKey='';
function updateMatches(){const options=eligible();const key=playerSelect.value;
 if(selectionKey!==key){selected=new Set(options.slice(0,1).map(x=>x.id));selectionKey=key}
 $('matchList').innerHTML=options.map(({m,id},i)=>`<label><input type="checkbox" data-match="${esc(id)}" ${selected.has(id)?'checked':''}><span>${esc(m.matchDate||m.createdAt?.slice(0,10)||'日付未設定')} ${esc(m.tournamentName||m.matchLabel||`試合${i+1}`)} (${m.points?.length||0}pt)</span></label>`).join('')||'<small>対象選手の試合がありません。</small>';
 $('matchList').querySelectorAll('input').forEach(c=>c.addEventListener('change',()=>{if(c.checked)selected.add(c.dataset.match);else selected.delete(c.dataset.match);render()}));render();}
function calc(){const p=people.get(playerSelect.value);const a={used:[],teamWon:0,teamLost:0,seen:0,decisive:0,errors:0,service:0,serviceWon:0,receive:0,receiveWon:0,first:0,second:0,df:0,net:0,netWins:0,shots:{}};
 for(const {m,id,pl} of eligible()){if(!selected.has(id))continue;a.used.push(m);const all=[...(m.players?.self||[]),...(m.players?.opponent||[])];
 for(const pt of m.points||[]){if(pt.winner!==pl.side&&pt.winner!==(pl.side==='self'?'opponent':'self'))continue;
 a.seen++;if(pt.winner===pl.side)a.teamWon++;else a.teamLost++;
 const o=pt.outcome;
 if(o?.playerId===pl.id){const sh=category(o.shotType);const v=a.shots[sh]??={w:0,e:0};if(o.type==='winner'){a.decisive++;v.w++}else if(o.type==='error'){a.errors++;v.e++}if(sh.includes('ボレー')||sh==='スマッシュ'){a.net++;if(o.type==='winner')a.netWins++}}
 const sv=pt.service||{},sid=(typeof sv.server==='object'?sv.server?.id:sv.server)||sv.serverId,side=sv.servingSide||sv.serverSide||all.find(x=>x.id===sid)?.side;
 if(side===pl.side){a.service++;if(pt.winner===pl.side)a.serviceWon++}else if(side){a.receive++;if(pt.winner===pl.side)a.receiveWon++}
 if(String(sid)===String(pl.id)){if(pt.serveAttempt==='first')a.first++;if(pt.serveAttempt==='second')a.second++;if(pt.doubleFault)a.df++}
 }}return a;}
function radar(values){const cx=160,cy=155,r=96,labels=['決定打割合','終端安定度','1st記録','レシーブ','ネット','チーム得点'];const xy=(i,v)=>{const t=-Math.PI/2+i*Math.PI/3;return `${cx+Math.cos(t)*r*v},${cy+Math.sin(t)*r*v}`};const points=v=>v.map((n,i)=>xy(i,n)).join(' ');return `<svg viewBox="0 0 320 320" id="radar" role="img" aria-label="記録から算出した6指標">${[.25,.5,.75,1].map(v=>`<polygon points="${points(Array(6).fill(v))}" fill="none" stroke="#dce8e2"/>`).join('')}<polygon points="${points(values.map(v=>v===null?0:v/100))}" fill="#63b39c66" stroke="#237b62" stroke-width="2"/>${labels.map((s,i)=>{const t=xy(i,1.24).split(',');return `<text x="${t[0]}" y="${t[1]}" text-anchor="middle" font-size="10" fill="#26493e">${s}</text>`}).join('')}</svg>`}
function render(){const p=people.get(playerSelect.value);if(!p){$('content').innerHTML='<p>選手データがありません。</p>';return}const a=calc();$('name').textContent=p.name+'｜個人レポート';$('date').textContent=new Date().toLocaleDateString('ja-JP');$('subtitle').textContent=`選択 ${a.used.length}試合・${a.seen}ポイント｜${p.name}選手の記録`;if(!a.used.length){$('content').innerHTML='<p class="empty">試合を1つ以上選択してください。</p>';return}
 const metrics=[['出場ペアの得点率',percent(a.teamWon,a.seen),`${a.teamWon}/${a.seen}pt`],['出場ペアの失点率',percent(a.teamLost,a.seen),`${a.teamLost}/${a.seen}pt`],['本人の決定打',a.decisive+'本','終端ショット'],['本人のミス',a.errors+'本','終端ショット'],['出場ペアのサービス得点率',percent(a.serviceWon,a.service),`${a.serviceWon}/${a.service}pt`],['出場ペアのレシーブ得点率',percent(a.receiveWon,a.receive),`${a.receiveWon}/${a.receive}pt`],['本人の1st記録割合',percent(a.first,a.first+a.second),`${a.first}/${a.first+a.second}件`],['本人のダブルフォルト',a.df+'件','明示記録・自動判定分']];
 const axes=[ratio(a.decisive,a.decisive+a.errors),ratio(a.decisive,a.decisive+a.errors),ratio(a.first,a.first+a.second),ratio(a.receiveWon,a.receive),ratio(a.netWins,a.net),ratio(a.teamWon,a.seen)];
 $('content').innerHTML=`<h2>主要データ</h2><div class="grid">${metrics.map(([k,v,n])=>`<div class="metric"><small>${esc(k)}</small><b>${esc(v)}</b><small>${esc(n)}</small></div>`).join('')}</div><h2>6項目の参考チャート</h2><div class="two">${radar(axes)}<div class="legend"><b>このチャートについて</b><p>選択した試合の記録を6項目で表示しています。能力の採点ではありません。</p><p>「終端安定度」は決定打÷（決定打＋ミス）の暫定値です。1stは成功率ではなく記録割合です。</p></div></div><h2>${esc(p.name)}選手の終了ショット</h2><table><thead><tr><th>ショット</th><th>決定打</th><th>ミス</th><th>決定割合</th></tr></thead><tbody>${Object.entries(a.shots).sort((x,y)=>y[1].w+y[1].e-x[1].w-x[1].e).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.w}</td><td>${v.e}</td><td>${percent(v.w,v.w+v.e)}</td></tr>`).join('')||'<tr><td colspan="4">記録なし</td></tr>'}</tbody></table><h2>数字の見方</h2><div class="note">・得点率と失点率は、${esc(p.name)}選手が出場した<strong>ペア全体</strong>の数字です。<br>・決定打、ミス、ショット別は<strong>${esc(p.name)}選手本人</strong>の記録だけです。<br>・1st記録割合はサーブ成功率ではありません。<br>・六角形は参考表示です。記録がない項目は評価できません。</div>`;
}
playerSelect.addEventListener('change',updateMatches);$('print').addEventListener('click',()=>window.print());updateMatches();
})();
