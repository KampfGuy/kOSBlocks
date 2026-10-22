// ===== kOSBlocks app =====
const $=s=>document.querySelector(s);
CodeMirror.defineSimpleMode('kerboscript',{start:[
 {regex:/\/\/.*/,token:'comment'},{regex:/"(?:[^"\\]|\\.)*"/,token:'string'},
 {regex:/\b(?:set|to|lock|unlock|local|global|parameter|declare|function|return|if|else|until|from|step|do|when|then|on|off|wait|print|at|stage|clearscreen|preserve|break|and|or|not|is|true|false|runpath|runoncepath|switch|copypath|lazyglobal|for|in)\b/i,token:'keyword'},
 {regex:/\b(?:heading|sqrt|abs|min|max|round|floor|ceiling|sin|cos|tan|arctan|arctan2|ln|hudtext|latlng|constant|ship|body|eta|alt|prograde|retrograde|srfprograde|srfretrograde|up|north|time|stage)\b/i,token:'builtin'},
 {regex:/\b(?:altitude|apoapsis|periapsis|verticalspeed|groundspeed|maxthrust|latitude|longitude|throttle|steering|sas|rcs|gear|brakes|lights|legs|abort|ag\d+)\b/i,token:'atom'},
 {regex:/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i,token:'number'},{regex:/[{}()]/,token:'bracket'},{regex:/[-+*\/^<>=:.,]/,token:'operator'}],meta:{lineComment:'//'}});

const ws=Blockly.inject('blocklyDiv',{toolbox:TOOLBOX,theme:Blockly.Theme.defineTheme('kosdark',{base:Blockly.Themes.Classic,componentStyles:{workspaceBackgroundColour:'#0b1122',toolboxBackgroundColour:'#0f1730',toolboxForegroundColour:'#dce6ff',flyoutBackgroundColour:'#16203a',flyoutOpacity:0.95,scrollbarColour:'#2f4478',insertionMarkerColour:'#fff'}}),renderer:'zelos',grid:{spacing:24,length:2,colour:'#1b2747',snap:true},zoom:{controls:true,wheel:true,startScale:0.8},trashcan:true});
const cm=CodeMirror($('#codeWrap'),{mode:'kerboscript',theme:'material-darker',lineNumbers:true,readOnly:true,indentUnit:2});
let linked=true, pureCode=false, suppress=false;

function regen(){ if(!linked||pureCode) return; const code=KOS.workspaceToCode(ws); $('#livePreview').textContent=code; suppress=true; cm.setValue(code); suppress=false; lint(); refreshTune(); }
ws.addChangeListener(e=>{ if(e.isUiEvent) return; regen(); });
function getCode(){return cm.getValue();}
function setCode(t){ // writing text implies unlinking from blocks
  if(linked&&!pureCode){ setLinked(false); }
  suppress=true; cm.setValue(t); suppress=false; $('#livePreview').textContent=t; lint(); refreshTune(); }
cm.on('change',()=>{ if(suppress) return; lint(); refreshTune(); $('#livePreview').textContent=cm.getValue(); });

function setLinked(v){ linked=v; $('#editSelf').checked=!v; cm.setOption('readOnly',v&&!pureCode);
  $('#linkState').textContent=pureCode?'pure code mode':(v?'linked to blocks':'unlinked – blocks ignored'); $('#linkState').classList.toggle('warn',!v||pureCode); if(v) regen(); }
$('#editSelf').onchange=e=>{ if(!e.target.checked){ if(!confirm('Switching back to blocks will REGENERATE the code from blocks and discard your text edits. Continue?')){e.target.checked=true;return;} } setLinked(!e.target.checked); };
function setMode(m){ pureCode=m==='code'; $('#mode').value=m; document.querySelector('[data-tab=blocks]').style.display=pureCode?'none':'';
  $('#editSelf').disabled=pureCode; if(pureCode){ linked=false; cm.setOption('readOnly',false); showTab('code'); } else { if(getCode().trim()&&!confirm('Return to Blocks mode? Code will be regenerated from blocks (text edits lost).')){ $('#mode').value='code'; pureCode=true; return;} linked=true; } setLinked(linked); }
$('#mode').onchange=e=>setMode(e.target.value);

function showTab(t){ document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t)); document.querySelectorAll('.tab').forEach(s=>s.classList.toggle('active',s.id==='tab-'+t));
  if(t==='blocks') Blockly.svgResize(ws); if(t==='code') cm.refresh(); if(t==='python') pyEd.refresh(); if(t==='tune') refreshTune(); }
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

// ---- Linter ----
function lint(){ const lines=getCode().split('\n'), w=[]; let depth=0, par=0;
  lines.forEach((raw,i)=>{ let l=raw.replace(/\/\/.*$/,'').replace(/"(?:[^"\\]|\\.)*"/g,'""').trim(); if(!l) return;
    for(const ch of l){ if(ch==='{')depth++; if(ch==='}'){depth--; if(depth<0){w.push(`Line ${i+1}: unexpected "}"`);depth=0;}} if(ch==='(')par++; if(ch===')')par--; }
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
$('#saveBtn').onclick=()=>{ const p=projects(); p[$('#projName').value||'untitled']={ws:Blockly.serialization.workspaces.save(ws),code:getCode(),linked,pureCode,saved:Date.now()}; localStorage.setItem(KEY,JSON.stringify(p)); refreshLoad(); flash('Saved'); };
$('#loadSel').onchange=e=>{ const d=projects()[e.target.value]; if(!d) return; $('#projName').value=e.target.value; loadProject(d); e.target.value=''; };
$('#delBtn').onclick=()=>{ const n=$('#projName').value,p=projects(); if(p[n]&&confirm('Delete project '+n+'?')){delete p[n];localStorage.setItem(KEY,JSON.stringify(p));refreshLoad();} };
function loadProject(d){ ws.clear(); if(d.ws) Blockly.serialization.workspaces.load(d.ws,ws); setMode(d.pureCode?'code':'blocks'); if(!d.linked||d.pureCode){ setLinked(false); suppress=true; cm.setValue(d.code||''); suppress=false; lint(); refreshTune(); } }
function flash(m){ const s=$('#linkState'),o=s.textContent; s.textContent=m; setTimeout(()=>s.textContent=o,1200); }

// ---- Import / export ----
function download(name,text,type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain'})); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }
$('#exportKs').onclick=()=>{ let n=($('#fileName').value||'boot_launch').trim().replace(/[^\w.-]/g,'_'); if(!/\.ks$/i.test(n)) n+='.ks'; const w=lint(); if(w.length&&!confirm(w.length+' lint warning(s). Export anyway?')) return; download(n,getCode()); };
$('#importKs').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const t=await f.text(); if(!pureCode) setLinked(false); suppress=true; cm.setValue(t); suppress=false; lint(); refreshTune(); $('#fileName').value=f.name; showTab('code'); e.target.value=''; };
$('#exportJson').onclick=()=>download(($('#projName').value||'project')+'.blocks.json',JSON.stringify(Blockly.serialization.workspaces.save(ws),null,1),'application/json');
$('#importJson').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ ws.clear(); Blockly.serialization.workspaces.load(JSON.parse(await f.text()),ws); setMode('blocks'); setLinked(true); showTab('blocks'); }catch(err){alert('Invalid workspace JSON: '+err.message);} e.target.value=''; };
$('#copyBtn').onclick=()=>navigator.clipboard&&navigator.clipboard.writeText(getCode()).then(()=>flash('Copied'));

// ---- Python (Pyodide) ----
const PY_DEFAULT=`# KSP helpers are preloaded: KERBIN_R, KERBIN_MU, G0, delta_v, twr, orbital_velocity,
# hohmann, burn_time, suicide_burn_altitude.  Use kos.get_code(), kos.set_code(s), kos.set_var(name, value)

alt = 80_000
print("Circular v @ 80 km:", round(orbital_velocity(alt), 1), "m/s")
print("Hohmann 80 km -> 250 km dv:", [round(x, 1) for x in hohmann(80_000, 250_000)])
print("Stage dv (isp 320, 12t -> 5t):", round(delta_v(320, 12, 5), 1), "m/s")
print("TWR (215 kN, 12 t):", round(twr(215, 12), 2))
print("Burn time 900 m/s, 215 kN, isp 320, 12 t:", round(burn_time(900, 215, 320, 12), 1), "s")
print("Suicide burn start (v=150 m/s, 60 kN, 4 t):", round(suicide_burn_altitude(150, 60, 4), 1), "m")

# Tune the kOS script from Python:
print("Tunables:", kos.get_vars())
kos.set_var("targetAlt", 85000)
print("Set targetAlt -> 85000")
`;
const PY_HELPERS=`
import math, re
KERBIN_R = 600000.0
KERBIN_MU = 3.5316e12
G0 = 9.80665
def orbital_velocity(alt, mu=KERBIN_MU, R=KERBIN_R):
    """Circular orbit speed (m/s) at altitude alt (m)."""
    return math.sqrt(mu / (R + alt))
def vis_viva(r, a, mu=KERBIN_MU):
    return math.sqrt(mu * (2 / r - 1 / a))
def delta_v(isp, m_wet, m_dry):
    """Tsiolkovsky rocket equation. masses in any consistent unit."""
    return isp * G0 * math.log(m_wet / m_dry)
def twr(thrust_kN, mass_t, g=G0):
    return thrust_kN / (mass_t * g)
def hohmann(alt1, alt2, mu=KERBIN_MU, R=KERBIN_R):
    """Returns (dv1, dv2, total) for circular alt1 -> circular alt2."""
    r1, r2 = R + alt1, R + alt2
    a = (r1 + r2) / 2
    dv1 = vis_viva(r1, a, mu) - math.sqrt(mu / r1)
    dv2 = math.sqrt(mu / r2) - vis_viva(r2, a, mu)
    return (dv1, dv2, abs(dv1) + abs(dv2))
def burn_time(dv, thrust_kN, isp, mass_t):
    """Burn duration (s) accounting for mass loss."""
    ve = isp * G0
    m0 = mass_t * 1000
    mdot = thrust_kN * 1000 / ve
    return m0 * (1 - math.exp(-dv / ve)) / mdot
def suicide_burn_altitude(v, thrust_kN, mass_t, g=G0):
    """Altitude (m) to start a full-throttle burn to stop from speed v (m/s)."""
    a = thrust_kN / mass_t - g
    if a <= 0: return float('inf')
    return v * v / (2 * a)
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
`;
const pyEd=CodeMirror($('#pyWrap'),{mode:'python',theme:'material-darker',lineNumbers:true,value:localStorage.getItem('kosblocks.py')||PY_DEFAULT,indentUnit:4});
pyEd.on('change',()=>localStorage.setItem('kosblocks.py',pyEd.getValue()));
$('#resetPy').onclick=()=>pyEd.setValue(PY_DEFAULT);
let pyodide=null;
async function ensurePy(){ if(pyodide) return pyodide; $('#pyStatus').textContent='Loading Pyodide…';
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';s.onload=res;s.onerror=()=>rej(new Error('Could not load Pyodide (offline?)'));document.head.appendChild(s);});
  pyodide=await loadPyodide(); pyodide.registerJsModule('_kosbridge',{getCode,setCode,setVar:(n,v)=>{const r=setVar(n,v);refreshTune();return r;}});
  pyodide.runPython('import _kosbridge as _js\n'+PY_HELPERS); $('#pyStatus').textContent='Pyodide ready'; return pyodide; }
$('#runPy').onclick=async()=>{ const out=$('#pyOut'); out.textContent='';
  try{ const py=await ensurePy(); py.setStdout({batched:s=>out.textContent+=s+'\n'}); py.setStderr({batched:s=>out.textContent+=s+'\n'});
    $('#pyStatus').textContent='Running…'; await py.runPythonAsync(pyEd.getValue()); $('#pyStatus').textContent='Done ✔'; }
  catch(e){ out.textContent+='\n'+e.message; $('#pyStatus').textContent='Error'; } };

// ---- boot ----
refreshLoad();
Blockly.serialization.workspaces.load(DEFAULT_WS,ws); regen();
window.kosApp={ws,cm,getCode,setCode,setVar,lint};
