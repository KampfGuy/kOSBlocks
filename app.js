// ===== kOSBlocks app =====
const $=s=>document.querySelector(s);
CodeMirror.defineSimpleMode('kerboscript',{start:[
 {regex:/\/\/.*/,token:'comment'},{regex:/"(?:[^"\\]|\\.)*"/,token:'string'},
 {regex:/\b(?:set|to|lock|unlock|local|global|parameter|declare|function|return|if|else|until|from|step|do|when|then|on|off|wait|print|at|stage|clearscreen|preserve|break|and|or|not|is|true|false|runpath|runoncepath|switch|copypath|lazyglobal|for|in)\b/i,token:'keyword'},
 {regex:/\b(?:heading|sqrt|abs|min|max|round|floor|ceiling|sin|cos|tan|arctan|arctan2|ln|hudtext|latlng|constant|ship|body|eta|alt|prograde|retrograde|srfprograde|srfretrograde|up|north|time|stage)\b/i,token:'builtin'},
 {regex:/\b(?:altitude|apoapsis|periapsis|verticalspeed|groundspeed|maxthrust|latitude|longitude|throttle|steering|sas|rcs|gear|brakes|lights|legs|abort|ag\d+)\b/i,token:'atom'},
 {regex:/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i,token:'number'},{regex:/[{}()]/,token:'bracket'},{regex:/[-+*\/^<>=:.,]/,token:'operator'}],meta:{lineComment:'//'}});

const ws=Blockly.inject('blocklyDiv',{toolbox:TOOLBOX,theme:Blockly.Theme.defineTheme('kosdark',{base:Blockly.Themes.Classic,componentStyles:{workspaceBackgroundColour:'#0b1122',toolboxBackgroundColour:'#0f1730',toolboxForegroundColour:'#dce6ff',flyoutBackgroundColour:'#16203a',flyoutOpacity:0.95,scrollbarColour:'#2f4478',insertionMarkerColour:'#fff'}}),renderer:'zelos',grid:{spacing:24,length:2,colour:'#1b2747',snap:true},zoom:{controls:true,wheel:false,pinch:true,startScale:0.75,maxScale:2,minScale:0.3,scaleSpeed:1.15},move:{scrollbars:true,drag:true,wheel:true},trashcan:true,sounds:false});
const cm=CodeMirror($('#codeWrap'),{mode:'kerboscript',theme:'material-darker',lineNumbers:true,readOnly:true,indentUnit:2});
let linked=true, pureCode=false, suppress=false;

function regen(){ if(!linked||pureCode) return; const code=KOS.workspaceToCode(ws); $('#livePreview').textContent=code; suppress=true; cm.setValue(code); suppress=false; lint(); refreshTune(); }
// Regenerate code at most once per frame and never in the middle of a drag (heavy DOM work during a
// drag can make Blockly drags stutter/fail on slower machines).
let regenTimer=null;
function scheduleRegen(){ clearTimeout(regenTimer); regenTimer=setTimeout(()=>{ if(ws.isDragging&&ws.isDragging()){scheduleRegen();return;} regen(); },120); }
ws.addChangeListener(e=>{ if(e.isUiEvent||e.type===Blockly.Events.VIEWPORT_CHANGE) return; scheduleRegen(); checkConds(); });
// warn on condition sockets holding a bare number/variable instead of a comparison
function checkConds(){ if(ws.isDragging&&ws.isDragging()) return;
  ws.getAllBlocks(false).forEach(b=>{ const inp={kos_wait_until:'C',kos_until:'C',kos_if:'C',kos_ifelse:'C',kos_when:'C'}[b.type]; if(!inp) return;
    const c=b.getInputTargetBlock(inp); let w=null;
    if(!c) w='Add a condition, e.g. the "ALTITUDE < 1000" block from Basics.';
    else { const chk=c.outputConnection&&c.outputConnection.getCheck(); if(!chk||chk.indexOf('Boolean')<0) w='WAIT UNTIL / IF / UNTIL need a comparison like ALTITUDE < 1000 – not a bare number or variable.'; }
    b.setWarningText(w); }); }
// keep Blockly's cached size in sync with its container (tab switches, header wrap, window resize, panel toggle)
const resizeBlockly=()=>{ if($('#tab-blocks').classList.contains('active')) Blockly.svgResize(ws); };
window.addEventListener('resize',resizeBlockly); if(window.ResizeObserver) new ResizeObserver(resizeBlockly).observe($('#blocklyDiv'));
// live preview: hidden by default, toggle remembers choice
function setPreview(on){ $('#tab-blocks').classList.toggle('preview-on',on); $('#togglePreview').textContent=on?'Hide code ▸':'◂ Show code'; localStorage.setItem('kosblocks.preview',on?'1':'0'); setTimeout(resizeBlockly,0); }
$('#togglePreview').onclick=()=>setPreview(!$('#tab-blocks').classList.contains('preview-on'));
setPreview(localStorage.getItem('kosblocks.preview')==='1');
$('#relink').onclick=()=>{ if(pureCode) setMode('blocks'); else if(confirm('Re-link: code will be regenerated from blocks (text edits lost). Continue?')) setLinked(true); };
function updateBanner(){ $('#unlinkedBanner').style.display=(!linked||pureCode)?'':'none'; }
function getCode(){return cm.getValue();}
function setCode(t){ // writing text implies unlinking from blocks
  if(linked&&!pureCode){ setLinked(false); }
  suppress=true; cm.setValue(t); suppress=false; $('#livePreview').textContent=t; lint(); refreshTune(); }
cm.on('change',()=>{ if(suppress) return; lint(); refreshTune(); $('#livePreview').textContent=cm.getValue(); });

function setLinked(v){ linked=v; $('#editSelf').checked=!v; cm.setOption('readOnly',v&&!pureCode);
  $('#linkState').textContent=pureCode?'pure code mode':(v?'linked to blocks':'unlinked – blocks ignored'); $('#linkState').classList.toggle('warn',!v||pureCode); if(v) regen(); updateBanner(); }
$('#editSelf').onchange=e=>{ if(!e.target.checked){ if(!confirm('Switching back to blocks will REGENERATE the code from blocks and discard your text edits. Continue?')){e.target.checked=true;return;} } setLinked(!e.target.checked); };
function setMode(m){ pureCode=m==='code'; $('#mode').value=m; document.querySelector('[data-tab=blocks]').style.display=pureCode?'none':'';
  $('#editSelf').disabled=pureCode; if(pureCode){ linked=false; cm.setOption('readOnly',false); showTab('code'); } else { if(getCode().trim()&&!confirm('Return to Blocks mode? Code will be regenerated from blocks (text edits lost).')){ $('#mode').value='code'; pureCode=true; return;} linked=true; } setLinked(linked); }
$('#mode').onchange=e=>setMode(e.target.value);

function showTab(t){ document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t)); document.querySelectorAll('.tab').forEach(s=>s.classList.toggle('active',s.id==='tab-'+t));
  if(t==='blocks') setTimeout(()=>Blockly.svgResize(ws),0); if(t==='code') cm.refresh(); if(t==='python') pyEd.refresh(); if(t==='tune') refreshTune(); }
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

// ---- Linter ----
function lint(){ const lines=getCode().split('\n'), w=[]; let depth=0, par=0;
  lines.forEach((raw,i)=>{ let l=raw.replace(/\/\/.*$/,'').replace(/"(?:[^"\\]|\\.)*"/g,'""').trim(); if(!l) return;
    for(const ch of l){ if(ch==='{')depth++; if(ch==='}'){depth--; if(depth<0){w.push(`Line ${i+1}: unexpected "}"`);depth=0;}} if(ch==='(')par++; if(ch===')')par--; }
    const wu=l.match(/^WAIT\s+UNTIL\s+(.+?)\s*\.$/i);
    if(wu && !/[<>=]|\b(AND|OR|NOT|TRUE|FALSE)\b|\(/i.test(wu[1])) w.push(`Line ${i+1}: WAIT UNTIL needs a comparison like ALTITUDE < 1000 (found "${wu[1]}")`);
    if(par!==0){w.push(`Line ${i+1}: unbalanced parentheses`);par=0;}
    if(!/[.{}]$/.test(l) && !/^@/.test(l) && !/^(else)$/i.test(l)) w.push(`Line ${i+1}: statement may be missing a period "." → ${l.slice(0,60)}`);
    if(/^(if|until|when|for)\b/i.test(l)&&!/[{]/.test(l)&&!/[{]/.test((lines[i+1]||''))) w.push(`Line ${i+1}: ${l.split(' ')[0].toUpperCase()} without "{" block`);
  });
  if(depth>0) w.push(`End of file: ${depth} unclosed "{"`);
  $('#lint').innerHTML=w.length?w.map(x=>`<div class="w">⚠ ${x}</div>`).join(''):'<div class="ok">✔ No lint warnings</div>'; return w; }

// ---- Tuning ----
const TMPL_MAP={targetAlt:['tmpl_launch','ALT'],launchHeading:['tmpl_launch','HDG'],turnStart:['tmpl_launch','T0'],turnEnd:['tmpl_launch','T1'],landMargin:['tmpl_land','M'],padLat:['tmpl_boostback','LAT'],padLng:['tmpl_boostback','LNG']};
const SETRE=/^SET\s+([A-Za-z_]\w*)\s+TO\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\.\s*$/i;
function findTunables(){ const out=[]; getCode().split('\n').forEach(l=>{const m=l.match(SETRE); if(m&&!out.find(o=>o.name===m[1])) out.push({name:m[1],value:parseFloat(m[2])});}); return out; }
function setVar(name,value){ value=Number(value);
  if(linked&&!pureCode){ let done=false;
    ws.getAllBlocks(false).forEach(b=>{ if(b.type==='kos_set'&&b.getFieldValue('V')===name){const c=b.getInputTargetBlock('X'); if(c&&c.type==='kos_num'){c.setFieldValue(value,'N');done=true;}}
      const t=TMPL_MAP[name]; if(t&&b.type===t[0]){b.setFieldValue(value,t[1]);done=true;} });
    if(done) return true; }
  let hit=false; const re=new RegExp('^(SET\\s+'+name+'\\s+TO\\s+)(-?[\\d.e+-]+)(\\s*\\.\\s*)$','im');
  const t=getCode().replace(re,(m,a,b,c)=>{hit=true;return a+value+c;}); if(hit){ if(linked&&!pureCode) setLinked(false); suppress=true; cm.setValue(t); suppress=false; $('#livePreview').textContent=t; lint(); } return hit; }
let tuneSig='';
function refreshTune(){ const t=findTunables(), sig=t.map(x=>x.name).join(','); const box=$('#tuneList');
  if(sig===tuneSig&&box.children.length){ t.forEach(x=>{const n=box.querySelector(`[data-n="${x.name}"]`); if(n&&document.activeElement!==n) n.value=x.value; const r=box.querySelector(`[data-r="${x.name}"]`); if(r&&document.activeElement!==r) r.value=x.value;}); return; }
  tuneSig=sig; if(!t.length){box.innerHTML='<p class="hint">No top-level <code>SET name TO number.</code> lines found.</p>';return;}
  box.innerHTML=t.map(x=>{const m=Math.max(10,Math.abs(x.value)*2);return `<div class="tune"><b>${x.name}</b><input type="range" data-r="${x.name}" min="${x.value<0?-m:0}" max="${m}" step="${Math.abs(x.value)<10&&x.value%1?0.0001:1}" value="${x.value}"><input type="number" data-n="${x.name}" value="${x.value}" step="any"></div>`}).join('');
  box.querySelectorAll('input').forEach(i=>i.oninput=()=>{const n=i.dataset.r||i.dataset.n; setVar(n,i.value); const o=box.querySelector(i.dataset.r?`[data-n="${n}"]`:`[data-r="${n}"]`); if(o) o.value=i.value;}); }

// ---- Save/Load ----
const KEY='kosblocks.projects';
const projects=()=>JSON.parse(localStorage.getItem(KEY)||'{}');
function refreshLoad(){ const p=projects(); $('#loadSel').innerHTML='<option value="">📂 Load…</option>'+Object.keys(p).map(k=>`<option>${k}</option>`).join(''); }
$('#saveBtn').onclick=()=>{ const p=projects(); p[$('#projName').value||'untitled']={vessel,ws:Blockly.serialization.workspaces.save(ws),code:getCode(),linked,pureCode,saved:Date.now()}; localStorage.setItem(KEY,JSON.stringify(p)); refreshLoad(); flash('Saved'); };
$('#loadSel').onchange=e=>{ const d=projects()[e.target.value]; if(!d) return; $('#projName').value=e.target.value; loadProject(d); e.target.value=''; };
$('#delBtn').onclick=()=>{ const n=$('#projName').value,p=projects(); if(p[n]&&confirm('Delete project '+n+'?')){delete p[n];localStorage.setItem(KEY,JSON.stringify(p));refreshLoad();} };
function loadProject(d){ if(d.vessel){vessel=d.vessel;saveVessel();renderVessel();} ws.clear(); if(d.ws) Blockly.serialization.workspaces.load(d.ws,ws); setMode(d.pureCode?'code':'blocks'); if(!d.linked||d.pureCode){ setLinked(false); suppress=true; cm.setValue(d.code||''); suppress=false; lint(); refreshTune(); } }
function flash(m){ const s=$('#linkState'),o=s.textContent; s.textContent=m; setTimeout(()=>s.textContent=o,1200); }

// ---- Import / export ----
function download(name,text,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain'})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
$('#exportKs').onclick=()=>{ let n=($('#fileName').value||'boot_launch').trim().replace(/[^\w.-]/g,'_'); if(!/\.ks$/i.test(n)) n+='.ks'; const w=lint(); if(w.length&&!confirm(w.length+' lint warning(s). Export anyway?')) return; download(n,getCode()); };
$('#importKs').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const t=await f.text(); if(!pureCode) setLinked(false); suppress=true; cm.setValue(t); suppress=false; lint(); refreshTune(); $('#fileName').value=f.name; showTab('code'); e.target.value=''; };
$('#exportJson').onclick=()=>download(($('#projName').value||'project')+'.blocks.json',JSON.stringify(Blockly.serialization.workspaces.save(ws),null,1),'application/json');
$('#importJson').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ ws.clear(); Blockly.serialization.workspaces.load(JSON.parse(await f.text()),ws); setMode('blocks'); setLinked(true); showTab('blocks'); }catch(err){alert('Invalid workspace JSON: '+err.message);} e.target.value=''; };
$('#copyBtn').onclick=()=>navigator.clipboard&&navigator.clipboard.writeText(getCode()).then(()=>flash('Copied'));

// ---- Simulation + Python (Pyodide) ----
const PRESETS={
 orbital:{name:'Kerbal X-lite',stages:[{name:'Booster',wet:18,dry:2.5,thrust_vac:330,thrust_sl:300,isp_vac:310,isp_sl:270,cda:4},{name:'Upper',wet:6,dry:1.5,thrust_vac:60,thrust_sl:15,isp_vac:345,isp_sl:85,cda:0.6},{name:'Capsule',kind:'decoupler',wet:1.2,dry:1.2,thrust_vac:0,thrust_sl:0,isp_vac:0,isp_sl:0,cda:1.2},{name:'Parachute',kind:'chute',wet:0.1,dry:0.1,thrust_vac:0,thrust_sl:0,isp_vac:0,isp_sl:0,cda:700}],start:{mode:'pad',alt:0,vx:0,vy:0,active:false},rotation:true,turn_rate:12,tmax:1800,dt:0.05,coast_after_end:true},
 lander:{name:'Lander',stages:[{name:'Lander',wet:4,dry:2,thrust_vac:60,thrust_sl:55,isp_vac:320,isp_sl:280,cda:1}],start:{mode:'air',alt:8000,vx:0,vy:-150,active:true},rotation:true,turn_rate:20,tmax:900,dt:0.05,coast_after_end:true},
 booster:{name:'Booster',stages:[{name:'Booster',wet:10,dry:3,thrust_vac:330,thrust_sl:300,isp_vac:310,isp_sl:270,cda:4}],start:{mode:'air',alt:35000,vx:900,vy:400,active:true},rotation:true,turn_rate:15,tmax:900,dt:0.05,coast_after_end:true}};
let vessel=JSON.parse(localStorage.getItem('kosblocks.vessel4')||'null')||JSON.parse(JSON.stringify(PRESETS.orbital));
const SCOLS=[['name','name'],['kind','type'],['wet','wet t'],['dry','dry t'],['thrust_vac','F vac'],['thrust_sl','F sl'],['isp_vac','Isp vac'],['isp_sl','Isp sl'],['cda','Cd·A']];
function renderVessel(){ $('#vName').value=vessel.name||'';
  $('#stageTbl').innerHTML='<tr><th>#</th>'+SCOLS.map(c=>`<th>${c[1]}</th>`).join('')+'<th></th></tr>'+vessel.stages.map((s,i)=>`<tr><td>${i+1}</td>`+SCOLS.map(c=>c[0]==='kind'?`<td><select data-i="${i}" data-k="kind">${['engine','decoupler','chute'].map(k=>`<option ${(s.kind||(s.thrust_vac>0?'engine':'decoupler'))===k?'selected':''}>${k}</option>`).join('')}</select></td>`:`<td><input data-i="${i}" data-k="${c[0]}" ${c[0]==='name'?'':'type="number" step="any"'} value="${s[c[0]]??0}"></td>`).join('')+`<td><button data-del="${i}">✕</button></td></tr>`).join('');
  const st=vessel.start; $('#sMode').value=st.mode; $('#sAlt').value=st.alt; $('#sVx').value=st.vx; $('#sVy').value=st.vy; $('#sActive').checked=!!st.active;
  $('#oRot').checked=vessel.rotation!==false; $('#oTurn').value=vessel.turn_rate; $('#oTmax').value=vessel.tmax; $('#oDt').value=vessel.dt; $('#oCoast').checked=vessel.coast_after_end!==false;
  $('#stageTbl').querySelectorAll('input,select').forEach(inp=>inp.onchange=()=>{const s=vessel.stages[inp.dataset.i]; s[inp.dataset.k]=(inp.dataset.k==='name'||inp.dataset.k==='kind')?inp.value:parseFloat(inp.value)||0; saveVessel();});
  $('#stageTbl').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(vessel.stages.length>1){vessel.stages.splice(+b.dataset.del,1);saveVessel();renderVessel();} }); }
function readOpts(){ vessel.name=$('#vName').value; Object.assign(vessel.start,{mode:$('#sMode').value,alt:+$('#sAlt').value||0,vx:+$('#sVx').value||0,vy:+$('#sVy').value||0,active:$('#sActive').checked});
  Object.assign(vessel,{rotation:$('#oRot').checked,turn_rate:+$('#oTurn').value||10,tmax:+$('#oTmax').value||1800,dt:Math.min(0.5,Math.max(0.01,+$('#oDt').value||0.05)),coast_after_end:$('#oCoast').checked}); saveVessel(); }
function saveVessel(){ localStorage.setItem('kosblocks.vessel4',JSON.stringify(vessel)); }
['#vName','#sMode','#sAlt','#sVx','#sVy','#sActive','#oRot','#oTurn','#oTmax','#oDt','#oCoast'].forEach(s=>$(s).onchange=readOpts);
$('#addStage').onclick=()=>{ vessel.stages.push({name:'Stage '+(vessel.stages.length+1),wet:4,dry:1,thrust_vac:60,thrust_sl:15,isp_vac:345,isp_sl:85,cda:0.5}); saveVessel(); renderVessel(); };
$('#preset').onchange=e=>{ if(PRESETS[e.target.value]){ vessel=JSON.parse(JSON.stringify(PRESETS[e.target.value])); saveVessel(); renderVessel(); } e.target.value=''; };
renderVessel();

// --- drawing
function drawChart(cv,xs,ys,title,color,unit){ const c=cv.getContext('2d'),W=cv.width,H=cv.height,L=46,B=20,T=18; c.clearRect(0,0,W,H);
  c.fillStyle='#9fb3e0';c.font='12px system-ui';c.fillText(title,L,13); if(!xs||xs.length<2) return;
  let x0=xs[0],x1=xs[xs.length-1]||1,y0=Math.min(...ys),y1=Math.max(...ys); if(y1-y0<1e-9){y1+=1;y0-=y0===0?0:1;} if(y0>0&&y0<(y1-y0)*0.5) y0=0;
  const X=x=>L+(x-x0)/(x1-x0||1)*(W-L-8), Y=y=>H-B-(y-y0)/(y1-y0)*(H-B-T);
  c.strokeStyle='#1b2747';c.fillStyle='#7080a8';c.font='10px monospace';
  for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4,yy=Y(v);c.beginPath();c.moveTo(L,yy);c.lineTo(W-8,yy);c.stroke();c.fillText(fmt(v),2,yy+3);}
  for(let i=0;i<=4;i++){const v=x0+(x1-x0)*i/4;c.fillText(Math.round(v)+'s',X(v)-10,H-5);}
  c.strokeStyle=color;c.lineWidth=1.6;c.beginPath();xs.forEach((x,i)=>i?c.lineTo(X(x),Y(ys[i])):c.moveTo(X(x),Y(ys[i])));c.stroke();c.lineWidth=1;
  c.fillStyle=color;c.fillText(unit,W-40,13); }
function fmt(v){const a=Math.abs(v);return a>=1e6?(v/1e6).toFixed(1)+'M':a>=1e4?(v/1e3).toFixed(0)+'k':a>=1000?(v/1e3).toFixed(1)+'k':a>=10?v.toFixed(0):v.toFixed(2);}
function drawTraj(cv,S){ const c=cv.getContext('2d'),W=cv.width,H=cv.height,R=600000,A=670000; c.clearRect(0,0,W,H);
  const px=S.y.map(Number), py=S.x.map(Number); // rotate so launch site is at top, east to the right
  let mnx=Math.min(...px),mxx=Math.max(...px),mny=Math.min(...py),mxy=Math.max(...py);
  if(Math.max(mxx-mnx,mxy-mny)>0.25*R){mnx=Math.min(mnx,-R);mxx=Math.max(mxx,R);mny=Math.min(mny,-R);mxy=Math.max(mxy,R);}
  let span=Math.max(mxx-mnx,mxy-mny,4000)*1.15, cx=(mnx+mxx)/2, cy=(mny+mxy)/2, k=Math.min(W,H)/span;
  const X=x=>W/2+(x-cx)*k, Y=y=>H/2-(y-cy)*k;
  c.fillStyle='#0d2a4a';c.beginPath();c.arc(X(0),Y(0),A*k,0,7);c.fill();
  c.fillStyle='#1f5a2e';c.beginPath();c.arc(X(0),Y(0),R*k,0,7);c.fill();
  c.strokeStyle='#ffd166';c.lineWidth=2;c.beginPath();px.forEach((x,i)=>i?c.lineTo(X(x),Y(py[i])):c.moveTo(X(x),Y(py[i])));c.stroke();c.lineWidth=1;
  c.fillStyle='#ff6b6b';c.beginPath();c.arc(X(px[px.length-1]),Y(py[py.length-1]),4,0,7);c.fill();
  c.fillStyle='#9fb3e0';c.font='11px system-ui';c.fillText('Trajectory, inertial frame (Kerbin green, atmosphere blue) – view '+fmt(span)+' m',6,H-6); }
function showSim(json){ const r=typeof json==='string'?JSON.parse(json):json, s=r.summary, S=r.series;
  $('#simSummary').innerHTML=`<div class="oc ${s.outcome}">${s.outcome}</div><div>${s.reason||''}</div><table>
  <tr><td>Sim time</td><td>${s.time} s</td><td>Max alt</td><td>${s.max_alt.toLocaleString()} m</td></tr>
  <tr><td>Apoapsis</td><td>${s.apoapsis.toLocaleString()} m</td><td>Periapsis</td><td>${s.periapsis.toLocaleString()} m</td></tr>
  <tr><td>Δv used</td><td>${s.dv_used} m/s</td><td>Fuel left</td><td>${s.fuel_left_t} t</td></tr>
  <tr><td>Max speed</td><td>${s.max_speed} m/s</td><td>Max Q</td><td>${s.max_q_kpa} kPa</td></tr>
  <tr><td>Final speed</td><td>${s.final_speed} m/s</td><td>Mass</td><td>${s.mass_t} t</td></tr></table>`;
  $('#simScreen').textContent=r.screen.join('\n').replace(/\s+$/,'');
  const L=r.log.map(([t,x])=>`[${t.toFixed(1).padStart(7)}s] ${x}`).concat(r.events.map(([t,x])=>`[${t.toFixed(1).padStart(7)}s] ★ ${x}`));
  L.sort(); $('#simLog').textContent=L.join('\n');
  $('#simWarn').innerHTML=(s.error?`<div>⛔ ${s.error}</div>`:'')+r.warnings.map(w=>`<div>⚠ ${w}</div>`).join('');
  drawTraj($('#trajCv'),S); drawChart($('#cAlt'),S.t,S.alt,'Altitude','#7fd1ff','m'); drawChart($('#cSpd'),S.t,S.speed,'Surface speed','#ffd166','m/s');
  drawChart($('#cThr'),S.t,S.throttle,'Throttle','#ff8fab','0–1'); drawChart($('#cMass'),S.t,S.mass,'Mass','#8ff0b0','t'); window.lastSim=r; }

const PY_DEFAULT=`# --- kOS flight simulator API -------------------------------------------
#   sim.run(code=None, vessel=None, show=True, **opts)  -> result (r["outcome"], r["apoapsis"], ...)
#   sim.sweep(var, values, ...)   run once per value of a top-level 'SET var TO n.'
#   sim.code() / sim.vessel()     current script / vessel config (dicts are editable)
#   kos.get_code(), kos.set_code(s), kos.set_var(name, value)
# KSP math: KERBIN_R, KERBIN_MU, G0, delta_v, twr, orbital_velocity, hohmann, burn_time, suicide_burn_altitude

r = sim.run()                       # simulate the current script with the vessel panel config
print(r)

# Parameter sweep: which gravity-turn end altitude reaches orbit with the most fuel left?
results = sim.sweep("turnEnd", [25000, 35000, 45000, 55000, 65000])
orbits = [(v, res) for v, res in results if res["outcome"] == "ORBIT"]
if orbits:
    best_v, best = max(orbits, key=lambda vr: vr[1]["fuel_left_t"])
    print(f"Best turnEnd = {best_v}  (fuel left {best['fuel_left_t']} t)")
    kos.set_var("turnEnd", best_v)  # write it back into the blocks/code
    sim.run()                       # show the tuned flight

# What-if: heavier upper stage
v = sim.vessel(); v["stages"][-1]["wet"] += 2
print("Heavier upper stage:", sim.run(vessel=v, show=False))

print("Theory: circular speed @80 km =", round(orbital_velocity(80000), 1), "m/s,",
      "Hohmann 80->250 km =", round(hohmann(80000, 250000)[2], 1), "m/s")
`;
const PY_HELPERS=`
import math, re, json
import kossim
KERBIN_R = 600000.0
KERBIN_MU = 3.5316e12
G0 = 9.80665
def orbital_velocity(alt, mu=KERBIN_MU, R=KERBIN_R):
    return math.sqrt(mu / (R + alt))
def vis_viva(r, a, mu=KERBIN_MU):
    return math.sqrt(mu * (2 / r - 1 / a))
def delta_v(isp, m_wet, m_dry):
    return isp * G0 * math.log(m_wet / m_dry)
def twr(thrust_kN, mass_t, g=G0):
    return thrust_kN / (mass_t * g)
def hohmann(alt1, alt2, mu=KERBIN_MU, R=KERBIN_R):
    r1, r2 = R + alt1, R + alt2
    a = (r1 + r2) / 2
    dv1 = vis_viva(r1, a, mu) - math.sqrt(mu / r1)
    dv2 = math.sqrt(mu / r2) - vis_viva(r2, a, mu)
    return (dv1, dv2, abs(dv1) + abs(dv2))
def burn_time(dv, thrust_kN, isp, mass_t):
    ve = isp * G0
    return mass_t * 1000 * (1 - math.exp(-dv / ve)) / (thrust_kN * 1000 / ve)
def suicide_burn_altitude(v, thrust_kN, mass_t, g=G0):
    a = thrust_kN / mass_t - g
    return float('inf') if a <= 0 else v * v / (2 * a)
class _Kos:
    def get_code(self): return _js.getCode()
    def set_code(self, s): _js.setCode(str(s))
    def get_vars(self):
        return {m.group(1): float(m.group(2)) for m in re.finditer(r'^SET\\s+(\\w+)\\s+TO\\s+(-?[\\d.]+(?:e[+-]?\\d+)?)\\s*\\.\\s*$', self.get_code(), re.I | re.M)}
    def set_var(self, name, value):
        ok = _js.setVar(name, value)
        if not ok: print(f"[kos] no top-level 'SET {name} TO <number>.' found")
        return ok
kos = _Kos()
class _SimAPI:
    DEFAULT_VESSEL = kossim.DEFAULT_VESSEL
    def code(self): return _js.getCode()
    def vessel(self): return json.loads(_js.getVessel())
    def run(self, code=None, vessel=None, show=True, **opts):
        r = kossim.run(code if code is not None else self.code(), vessel or self.vessel(), **opts)
        if show: _js.showSim(r.to_json())
        return r
    def sweep(self, var, values, code=None, vessel=None, show=False, **opts):
        code = code if code is not None else self.code(); vessel = vessel or self.vessel()
        print(f"{var:>12} | {'outcome':<10} | {'Ap m':>9} | {'Pe m':>9} | {'dv m/s':>8} | {'fuel t':>6}")
        print("-" * 70)
        out = []
        for v in values:
            r = kossim.run(kossim.set_var_in_code(code, var, v), vessel, **opts)
            s = r.summary
            print(f"{v:>12} | {s['outcome']:<10} | {s['apoapsis']:>9} | {s['periapsis']:>9} | {s['dv_used']:>8} | {s['fuel_left_t']:>6}")
            out.append((v, r))
        return out
sim = _SimAPI()
`;
const pyEd=CodeMirror($('#pyWrap'),{mode:'python',theme:'material-darker',lineNumbers:true,value:localStorage.getItem('kosblocks.py2')||PY_DEFAULT,indentUnit:4});
pyEd.on('change',()=>localStorage.setItem('kosblocks.py2',pyEd.getValue()));
$('#resetPy').onclick=()=>pyEd.setValue(PY_DEFAULT);
let pyodide=null;
async function ensurePy(){ if(pyodide) return pyodide; $('#pyStatus').textContent='Loading Pyodide…';
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';s.onload=res;s.onerror=()=>rej(new Error('Could not load Pyodide (offline?)'));document.head.appendChild(s);});
  const py=await loadPyodide(); const src=await (await fetch('sim.py?v=4')).text(); py.FS.writeFile('/home/pyodide/kossim.py',src);
  py.registerJsModule('_kosbridge',{getCode,setCode,setVar:(n,v)=>{const r=setVar(n,v);refreshTune();regenNow();return r;},getVessel:()=>{readOpts();return JSON.stringify(vessel);},showSim});
  py.runPython('import sys\nsys.path.insert(0,"/home/pyodide")\nimport _kosbridge as _js\n'+PY_HELPERS); pyodide=py; $('#pyStatus').textContent='Pyodide ready'; return py; }
function regenNow(){ if(linked&&!pureCode){ const code=KOS.workspaceToCode(ws); suppress=true; cm.setValue(code); suppress=false; $('#livePreview').textContent=code; lint(); } }
async function runPython(src,label){ const out=$('#pyOut');
  try{ const py=await ensurePy(); py.setStdout({batched:s=>out.textContent+=s+'\n'}); py.setStderr({batched:s=>out.textContent+=s+'\n'});
    $('#pyStatus').textContent=label+'…'; await new Promise(r=>setTimeout(r,30)); const t0=performance.now();
    await py.runPythonAsync(src); $('#pyStatus').textContent=`Done ✔ (${((performance.now()-t0)/1000).toFixed(1)} s)`; return true; }
  catch(e){ out.textContent+='\n'+e.message; $('#pyStatus').textContent='Error'; return false; } }
$('#runPy').onclick=()=>{ $('#pyOut').textContent=''; readOpts(); regenNow(); return runPython(pyEd.getValue(),'Running'); };
$('#simBtn').onclick=()=>{ readOpts(); regenNow(); $('#pyOut').textContent=''; return runPython('print(sim.run())','Simulating'); };

// ---- boot ----
refreshLoad();
Blockly.serialization.workspaces.load(DEFAULT_WS,ws); regen();
window.kosApp={ws,cm,getCode,setCode,setVar,lint,showSim,get vessel(){return vessel}};
