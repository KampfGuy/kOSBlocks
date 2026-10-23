// ===== kOS block definitions + kerboscript generator =====
const C={flight:210,tele:160,logic:290,math:230,vars:330,out:20,func:260,tmpl:45};
const V=(n,check)=>({type:'input_value',name:n,check:check||null});
const S=n=>({type:'input_statement',name:n});
const D=[];
function def(type,msg,args,opt){D.push(Object.assign({type,message0:msg,args0:args||[],inputsInline:true},opt));}
const ST=c=>({previousStatement:null,nextStatement:null,colour:c});
const EX=(c,o)=>({output:o===undefined?null:o,colour:c});
// Flight
def('kos_steer_heading','lock steering to heading %1 pitch %2',[V('DIR','Number'),V('PITCH','Number')],ST(C.flight));
def('kos_steer_dir','lock steering to %1',[{type:'field_dropdown',name:'D',options:[['PROGRADE','PROGRADE'],['RETROGRADE','RETROGRADE'],['SRFPROGRADE','SRFPROGRADE'],['SRFRETROGRADE','SRFRETROGRADE'],['UP','UP'],['NORMAL','SHIP:NORTH'],['custom expr…','X']]}],ST(C.flight));
def('kos_lock_throttle','lock throttle to %1',[V('T')],ST(C.flight));
def('kos_unlock','unlock %1',[{type:'field_dropdown',name:'W',options:[['steering','STEERING'],['throttle','THROTTLE'],['all','ALL']]}],ST(C.flight));
def('kos_stage','STAGE',[],ST(C.flight));
def('kos_toggle','%1 %2',[{type:'field_dropdown',name:'W',options:['SAS','RCS','GEAR','BRAKES','LIGHTS','LEGS','PANELS','ABORT','AG1','AG2','AG3','AG4','AG5','AG6','AG7','AG8','AG9','AG10'].map(x=>[x,x])},{type:'field_dropdown',name:'S',options:[['ON','ON'],['OFF','OFF']]}],ST(C.flight));
def('kos_wait','wait %1 seconds',[V('S','Number')],ST(C.flight));
def('kos_wait_until','wait until %1',[V('C','Boolean')],ST(C.flight));
def('kos_mainthrottle_zero','set pilot main throttle to 0',[],ST(C.flight));
def('kos_stage_wait','STAGE then wait %1 s',[V('S','Number')],ST(C.flight));
def('kos_autostage','auto-stage when %1',[{type:'field_dropdown',name:'W',options:[['thrust drops to 0','THRUST'],['stage liquid fuel empty','FUEL']]}],ST(C.flight));
// Telemetry
const TELE=[['ALTITUDE','ALTITUDE'],['APOAPSIS','APOAPSIS'],['PERIAPSIS','PERIAPSIS'],['surface speed','SHIP:VELOCITY:SURFACE:MAG'],['orbital speed','SHIP:VELOCITY:ORBIT:MAG'],['VERTICALSPEED','VERTICALSPEED'],['GROUNDSPEED','GROUNDSPEED'],['SHIP:MASS','SHIP:MASS'],['MAXTHRUST','MAXTHRUST'],['LATITUDE','LATITUDE'],['LONGITUDE','LONGITUDE'],['ETA:APOAPSIS','ETA:APOAPSIS'],['ETA:PERIAPSIS','ETA:PERIAPSIS'],['STAGE:LIQUIDFUEL','STAGE:LIQUIDFUEL'],['STAGE:OXIDIZER','STAGE:OXIDIZER'],['SOLIDFUEL','STAGE:SOLIDFUEL'],['radar altitude','ALT:RADAR'],['THROTTLE','THROTTLE'],['TIME:SECONDS','TIME:SECONDS'],['BODY:MU','BODY:MU'],['BODY:RADIUS','BODY:RADIUS']];
def('kos_tele','%1',[{type:'field_dropdown',name:'T',options:TELE}],EX(C.tele,'Number'));
def('kos_twr','current TWR',[],EX(C.tele,'Number'));
// Logic / loops
def('kos_if','if %1 then %2',[V('C','Boolean'),S('DO')],ST(C.logic));
def('kos_ifelse','if %1 then %2 else %3',[V('C','Boolean'),S('DO'),S('ELSE')],Object.assign(ST(C.logic),{inputsInline:false}));
def('kos_until','until %1 repeat %2',[V('C','Boolean'),S('DO')],ST(C.logic));
def('kos_from','from %1 = %2 until %1 > %3 step %4 %5',[{type:'field_input',name:'V',text:'i'},V('A','Number'),V('B','Number'),V('STEP','Number'),S('DO')],ST(C.logic));
def('kos_when','when %1 then (trigger) %2 keep listening %3',[V('C','Boolean'),S('DO'),{type:'field_checkbox',name:'P',checked:false}],ST(C.logic));
def('kos_break','BREAK',[],ST(C.logic));
def('kos_compare','%1 %2 %3',[V('A'),{type:'field_dropdown',name:'OP',options:[['<','<'],['>','>'],['<=','<='],['>=','>='],['=','='],['≠','<>']]},V('B')],EX(C.logic,'Boolean'));
def('kos_andor','%1 %2 %3',[V('A','Boolean'),{type:'field_dropdown',name:'OP',options:[['and','AND'],['or','OR']]},V('B','Boolean')],EX(C.logic,'Boolean'));
def('kos_not','not %1',[V('A','Boolean')],EX(C.logic,'Boolean'));
def('kos_bool','%1',[{type:'field_dropdown',name:'B',options:[['TRUE','TRUE'],['FALSE','FALSE']]}],EX(C.logic,'Boolean'));
// Math
def('kos_num','%1',[{type:'field_number',name:'N',value:0}],EX(C.math,'Number'));
def('kos_arith','%1 %2 %3',[V('A'),{type:'field_dropdown',name:'OP',options:[['+','+'],['-','-'],['×','*'],['÷','/'],['^','^']]},V('B')],EX(C.math,'Number'));
def('kos_func1','%1 ( %2 )',[{type:'field_dropdown',name:'F',options:['SQRT','ABS','ROUND','FLOOR','CEILING','SIN','COS','TAN','ARCTAN','LN'].map(x=>[x,x])},V('A')],EX(C.math,'Number'));
def('kos_minmax','%1 ( %2 , %3 )',[{type:'field_dropdown',name:'F',options:[['MIN','MIN'],['MAX','MAX'],['ARCTAN2','ARCTAN2']]},V('A'),V('B')],EX(C.math,'Number'));
def('kos_const','CONSTANT:%1',[{type:'field_dropdown',name:'K',options:[['g0','g0'],['PI','PI'],['E','E'],['G','G']]}],EX(C.math,'Number'));
def('kos_raw_expr','expr %1',[{type:'field_input',name:'E',text:'SHIP:ORBIT:ECCENTRICITY'}],EX(C.math));
// Variables
def('kos_set','%1 %2 to %3',[{type:'field_dropdown',name:'K',options:[['SET','SET'],['LOCK','LOCK'],['LOCAL','LOCAL']]},{type:'field_input',name:'V',text:'targetAlt'},V('X')],ST(C.vars));
def('kos_get','%1',[{type:'field_input',name:'V',text:'targetAlt'}],EX(C.vars));
def('kos_raw_stmt','kerboscript %1',[{type:'field_input',name:'E',text:'SET SHIP:NAME TO "Rocket".'}],ST(C.vars));
// Output
def('kos_print','print %1',[V('X')],ST(C.out));
def('kos_printat','print %1 at col %2 row %3',[V('X'),V('C','Number'),V('R','Number')],ST(C.out));
def('kos_text','" %1 "',[{type:'field_input',name:'T',text:'Liftoff!'}],EX(C.out,'String'));
def('kos_join','%1 + %2',[V('A'),V('B')],EX(C.out,'String'));
def('kos_clear','CLEARSCREEN',[],ST(C.out));
def('kos_hud','HUD text %1 for %2 s size %3',[V('X'),V('D','Number'),V('S','Number')],ST(C.out));
// Functions
def('kos_func_def','function %1 with params %2 %3',[{type:'field_input',name:'N',text:'myFunc'},{type:'field_input',name:'P',text:'a, b'},S('DO')],{colour:C.func});
def('kos_return','return %1',[V('X')],Object.assign(ST(C.func),{nextStatement:undefined}));
def('kos_call','call %1 ( %2 )',[{type:'field_input',name:'N',text:'myFunc'},{type:'field_input',name:'A',text:'1, 2'}],ST(C.func));
def('kos_call_expr','%1 ( %2 )',[{type:'field_input',name:'N',text:'myFunc'},{type:'field_input',name:'A',text:'1, 2'}],EX(C.func));
// Templates
const N=(n,v)=>({type:'field_number',name:n,value:v});
def('tmpl_launch','🚀 Gravity-turn launch to orbit: target Ap %1 m, heading %2°, turn start %3 m, turn end %4 m',[N('ALT',80000),N('HDG',90),N('T0',1000),N('T1',45000)],Object.assign(ST(C.tmpl),{inputsInline:false}));
def('tmpl_circ','🔵 Circularize at apoapsis',[],ST(C.tmpl));
def('tmpl_land','🪂 Suicide-burn landing: margin %1 m',[N('M',10)],ST(C.tmpl));
def('tmpl_boostback','↩ Booster boostback to pad: LAT %1 LNG %2',[N('LAT',-0.0972),N('LNG',-74.5577)],ST(C.tmpl));
Blockly.defineBlocksWithJsonArray(D);

// ---------- Generator ----------
const KOS={};
const IND='  ';
function val(b,n,d){const c=b.getInputTargetBlock(n);return c?expr(c):(d===undefined?'0':d);}
function f(b,n){return b.getFieldValue(n);}
function body(b,n){const c=b.getInputTargetBlock(n);return c?chain(c).replace(/^(?=.)/gm,IND):'';}
function chain(b){let s='';while(b){if(!b.isEnabled||b.isEnabled())s+=stmt(b);b=b.getNextBlock();}return s;}
function paren(s){return /^[\w:."()]+$/.test(s)?s:'('+s+')';}
function expr(b){const g=EXPR[b.type];return g?g(b):'0';}
function stmt(b){const g=STMT[b.type];return g?g(b):'';}
const EXPR={
 kos_tele:b=>f(b,'T'), kos_twr:()=>'(MAXTHRUST / (SHIP:MASS * CONSTANT:g0))',
 kos_compare:b=>paren(val(b,'A'))+' '+f(b,'OP')+' '+paren(val(b,'B')),
 kos_andor:b=>'('+val(b,'A','TRUE')+') '+f(b,'OP')+' ('+val(b,'B','TRUE')+')',
 kos_not:b=>'NOT ('+val(b,'A','TRUE')+')', kos_bool:b=>f(b,'B'),
 kos_num:b=>String(f(b,'N')), kos_arith:b=>'('+val(b,'A')+' '+f(b,'OP')+' '+val(b,'B')+')',
 kos_func1:b=>f(b,'F')+'('+val(b,'A')+')', kos_minmax:b=>f(b,'F')+'('+val(b,'A')+', '+val(b,'B')+')',
 kos_const:b=>'CONSTANT:'+f(b,'K'), kos_raw_expr:b=>f(b,'E'), kos_get:b=>f(b,'V'),
 kos_text:b=>'"'+f(b,'T').replace(/"/g,"'")+'"', kos_join:b=>val(b,'A','""')+' + '+val(b,'B','""'),
 kos_call_expr:b=>f(b,'N')+'('+f(b,'A')+')',
};
const STMT={
 kos_steer_heading:b=>`LOCK STEERING TO HEADING(${val(b,'DIR','90')}, ${val(b,'PITCH','90')}).\n`,
 kos_steer_dir:b=>`LOCK STEERING TO ${f(b,'D')==='X'?'UP':f(b,'D')}.\n`,
 kos_lock_throttle:b=>`LOCK THROTTLE TO ${val(b,'T','1')}.\n`, kos_unlock:b=>`UNLOCK ${f(b,'W')}.\n`,
 kos_stage:()=>'STAGE.\n',
 kos_stage_wait:b=>`STAGE.\nWAIT ${val(b,'S','1')}.\n`,
 kos_autostage:b=>`WHEN ${f(b,'W')==='FUEL'?'STAGE:LIQUIDFUEL < 0.1':'MAXTHRUST = 0'} AND SHIP:STATUS <> "PRELAUNCH" THEN {\n${IND}PRINT "Auto-staging".\n${IND}STAGE.\n${IND}WAIT 0.5.\n${IND}IF SHIP:STAGENUM > 0 { PRESERVE. }\n}\n`, kos_toggle:b=>`${f(b,'W')} ${f(b,'S')}.\n`,
 kos_wait:b=>`WAIT ${val(b,'S','1')}.\n`, kos_wait_until:b=>`WAIT UNTIL ${val(b,'C','TRUE')}.\n`,
 kos_mainthrottle_zero:()=>'SET SHIP:CONTROL:PILOTMAINTHROTTLE TO 0.\n',
 kos_if:b=>`IF ${val(b,'C','TRUE')} {\n${body(b,'DO')}}\n`,
 kos_ifelse:b=>`IF ${val(b,'C','TRUE')} {\n${body(b,'DO')}} ELSE {\n${body(b,'ELSE')}}\n`,
 kos_until:b=>`UNTIL ${val(b,'C','FALSE')} {\n${body(b,'DO')}${IND}WAIT 0.\n}\n`,
 kos_from:b=>{const v=f(b,'V');return `FROM {LOCAL ${v} IS ${val(b,'A')}.} UNTIL ${v} > ${val(b,'B','10')} STEP {SET ${v} TO ${v} + ${val(b,'STEP','1')}.} DO {\n${body(b,'DO')}}\n`;},
 kos_when:b=>`WHEN ${val(b,'C','TRUE')} THEN {\n${body(b,'DO')}${f(b,'P')==='TRUE'?IND+'PRESERVE.\n':''}}\n`,
 kos_break:()=>'BREAK.\n',
 kos_set:b=>{const k=f(b,'K'),x=val(b,'X');return k==='LOCAL'?`LOCAL ${f(b,'V')} IS ${x}.\n`:`${k} ${f(b,'V')} TO ${x}.\n`;},
 kos_raw_stmt:b=>{let e=f(b,'E').trim();return e+(/[.}]$/.test(e)?'':'.')+'\n';},
 kos_print:b=>`PRINT ${val(b,'X','""')}.\n`, kos_printat:b=>`PRINT ${val(b,'X','""')} AT(${val(b,'C')}, ${val(b,'R')}).\n`,
 kos_clear:()=>'CLEARSCREEN.\n', kos_hud:b=>`HUDTEXT(${val(b,'X','""')}, ${val(b,'D','5')}, 2, ${val(b,'S','30')}, YELLOW, FALSE).\n`,
 kos_func_def:b=>{const p=f(b,'P').split(',').map(s=>s.trim()).filter(Boolean);return `DECLARE FUNCTION ${f(b,'N')} {\n${p.length?IND+'PARAMETER '+p.join(', ')+'.\n':''}${body(b,'DO')}}\n`;},
 kos_return:b=>`RETURN ${val(b,'X')}.\n`, kos_call:b=>`${f(b,'N')}(${f(b,'A')}).\n`,
 tmpl_launch:b=>`// ===== Gravity turn launch =====
SET targetAlt TO ${f(b,'ALT')}.
SET launchHeading TO ${f(b,'HDG')}.
SET turnStart TO ${f(b,'T0')}.
SET turnEnd TO ${f(b,'T1')}.
CLEARSCREEN.
PRINT "Launching to " + targetAlt + " m".
SAS OFF.
LOCK THROTTLE TO 1.
LOCK STEERING TO HEADING(launchHeading, 90).
STAGE.
WHEN MAXTHRUST = 0 THEN {
  PRINT "Staging".
  STAGE.
  WAIT 0.5.
  IF SHIP:STAGENUM > 0 { PRESERVE. }
}
WAIT UNTIL ALTITUDE > turnStart.
UNTIL APOAPSIS > targetAlt {
  LOCAL frac IS MIN(1, MAX(0, (ALTITUDE - turnStart) / (turnEnd - turnStart))).
  LOCK STEERING TO HEADING(launchHeading, 90 - 90 * SQRT(frac)).
  PRINT "Ap: " + ROUND(APOAPSIS) + "   " AT(0, 5).
  WAIT 0.
}
LOCK THROTTLE TO 0.
LOCK STEERING TO PROGRADE.
WAIT UNTIL ALTITUDE > 70000.
`,
 tmpl_circ:()=>`// ===== Circularize at apoapsis =====
LOCAL mu IS BODY:MU.
LOCAL rAp IS BODY:RADIUS + APOAPSIS.
LOCAL vAp IS SQRT(mu * (2 / rAp - 1 / SHIP:ORBIT:SEMIMAJORAXIS)).
LOCAL vCirc IS SQRT(mu / rAp).
LOCAL dv IS vCirc - vAp.
LOCAL acc IS MAXTHRUST / SHIP:MASS.
LOCAL burnTime IS dv / MAX(acc, 0.001).
PRINT "Circularize dv: " + ROUND(dv, 1) + " m/s, burn " + ROUND(burnTime, 1) + " s".
LOCK STEERING TO PROGRADE.
WAIT UNTIL ETA:APOAPSIS < burnTime / 2.
// burn horizontally (nulling vertical speed) until orbital speed = circular speed
LOCK vCirc2 TO SQRT(BODY:MU / (BODY:RADIUS + ALTITUDE)).
LOCK dvLeft TO vCirc2 - SHIP:VELOCITY:ORBIT:MAG.
LOCK STEERING TO HEADING(90, MIN(20, MAX(-20, -VERTICALSPEED * 0.5))).
LOCK THROTTLE TO MIN(1, MAX(0.05, dvLeft / MAX(MAXTHRUST / SHIP:MASS, 0.1))).
WAIT UNTIL dvLeft < 0.5.
LOCK THROTTLE TO 0.
UNLOCK STEERING.
UNLOCK THROTTLE.
SET SHIP:CONTROL:PILOTMAINTHROTTLE TO 0.
PRINT "Orbit: " + ROUND(APOAPSIS) + " x " + ROUND(PERIAPSIS).
`,
 tmpl_land:b=>`// ===== Suicide burn landing =====
SET landMargin TO ${f(b,'M')}.
LOCK g TO BODY:MU / (BODY:RADIUS + ALTITUDE) ^ 2.
LOCK maxDecel TO MAX(0.01, MAXTHRUST / SHIP:MASS - g).
LOCK stopDist TO SHIP:VELOCITY:SURFACE:MAG ^ 2 / (2 * maxDecel).
LOCK STEERING TO SRFRETROGRADE.
WHEN ALT:RADAR < 500 THEN { GEAR ON. }
WAIT UNTIL ALT:RADAR < stopDist + landMargin.
LOCK THROTTLE TO 1.
UNTIL VERTICALSPEED > -2 OR SHIP:STATUS = "LANDED" {
  LOCK THROTTLE TO MIN(1, stopDist / MAX(1, ALT:RADAR - landMargin)).
  WAIT 0.
}
LOCK STEERING TO UP.
LOCK THROTTLE TO (g * SHIP:MASS / MAX(MAXTHRUST, 0.01)) * (1 + (-2 - VERTICALSPEED) * 0.5).
WAIT UNTIL SHIP:STATUS = "LANDED".
LOCK THROTTLE TO 0.
UNLOCK STEERING.
UNLOCK THROTTLE.
SET SHIP:CONTROL:PILOTMAINTHROTTLE TO 0.
PRINT "Touchdown!".
`,
 tmpl_boostback:b=>`// ===== Booster boostback =====
SET padLat TO ${f(b,'LAT')}.
SET padLng TO ${f(b,'LNG')}.
LOCAL pad IS LATLNG(padLat, padLng).
LOCK THROTTLE TO 0.
RCS ON.
LOCK STEERING TO HEADING(pad:HEADING, 0).
WAIT 5.
LOCK THROTTLE TO 1.
// burn until the impact point is near the pad (needs Trajectories mod for precision)
UNTIL GROUNDSPEED < 20 AND ABS(pad:HEADING - SHIP:GEOPOSITION:HEADING) < 5 OR pad:DISTANCE < 2000 {
  LOCK STEERING TO HEADING(pad:HEADING, 0).
  WAIT 0.
}
LOCK THROTTLE TO 0.
BRAKES ON.
LOCK STEERING TO SRFRETROGRADE.
PRINT "Boostback complete. Distance to pad: " + ROUND(pad:DISTANCE) + " m".
`,
};
KOS.workspaceToCode=function(ws){
  const tops=ws.getTopBlocks(true);
  const fns=tops.filter(b=>b.type==='kos_func_def'), main=tops.filter(b=>b.type!=='kos_func_def');
  let out='// Generated by kOSBlocks\n';
  main.forEach(b=>{out+=chain(b)+'\n';});
  fns.forEach(b=>{out+=stmt(b)+'\n';});
  return out.replace(/\n{3,}/g,'\n\n');
};

const TOOLBOX={kind:'categoryToolbox',contents:[
{kind:'category',name:'⭐ Basics',colour:'#3fbf80',contents:[{kind:'label',text:'Waiting'},{kind:'block',type:'kos_wait',inputs:{S:{shadow:{type:'kos_num',fields:{N:1}}}}},{kind:'block',type:'kos_wait_until',inputs:{C:{block:{type:'kos_compare',fields:{OP:'>'},inputs:{A:{block:{type:'kos_tele',fields:{T:'ALTITUDE'}}},B:{shadow:{type:'kos_num',fields:{N:10000}}}}}}}},{kind:'label',text:'Staging'},{kind:'block',type:'kos_stage'},{kind:'block',type:'kos_stage_wait',inputs:{S:{shadow:{type:'kos_num',fields:{N:1}}}}},{kind:'block',type:'kos_autostage'},{kind:'block',type:'kos_autostage',fields:{W:'FUEL'}},{kind:'label',text:'Control'},{kind:'block',type:'kos_lock_throttle',inputs:{T:{shadow:{type:'kos_num',fields:{N:1}}}}},{kind:'block',type:'kos_steer_heading',inputs:{DIR:{shadow:{type:'kos_num',fields:{N:90}}},PITCH:{shadow:{type:'kos_num',fields:{N:90}}}}},{kind:'block',type:'kos_print',inputs:{X:{shadow:{type:'kos_text'}}}}]},
 {kind:'category',name:'Flight',colour:C.flight,contents:['kos_steer_heading','kos_steer_dir','kos_lock_throttle','kos_unlock','kos_stage','kos_stage_wait','kos_autostage','kos_toggle','kos_wait','kos_wait_until','kos_mainthrottle_zero'].map(t=>({kind:'block',type:t,inputs:t==='kos_steer_heading'?{DIR:{shadow:{type:'kos_num',fields:{N:90}}},PITCH:{shadow:{type:'kos_num',fields:{N:90}}}}:t==='kos_lock_throttle'?{T:{shadow:{type:'kos_num',fields:{N:1}}}}:(t==='kos_wait'||t==='kos_stage_wait')?{S:{shadow:{type:'kos_num',fields:{N:1}}}}:undefined}))},
 {kind:'category',name:'Telemetry',colour:C.tele,contents:[{kind:'block',type:'kos_tele'},{kind:'block',type:'kos_tele',fields:{T:'APOAPSIS'}},{kind:'block',type:'kos_tele',fields:{T:'SHIP:VELOCITY:SURFACE:MAG'}},{kind:'block',type:'kos_tele',fields:{T:'STAGE:LIQUIDFUEL'}},{kind:'block',type:'kos_twr'}]},
 {kind:'category',name:'Logic & Loops',colour:C.logic,contents:['kos_if','kos_ifelse','kos_until','kos_from','kos_when','kos_break','kos_compare','kos_andor','kos_not','kos_bool'].map(t=>({kind:'block',type:t}))},
 {kind:'category',name:'Math',colour:C.math,contents:['kos_num','kos_arith','kos_func1','kos_minmax','kos_const','kos_raw_expr'].map(t=>({kind:'block',type:t}))},
 {kind:'category',name:'Variables',colour:C.vars,contents:[{kind:'block',type:'kos_set',inputs:{X:{shadow:{type:'kos_num',fields:{N:80000}}}}},{kind:'block',type:'kos_get'},{kind:'block',type:'kos_raw_stmt'}]},
 {kind:'category',name:'Output',colour:C.out,contents:[{kind:'block',type:'kos_print',inputs:{X:{shadow:{type:'kos_text'}}}},{kind:'block',type:'kos_printat',inputs:{X:{shadow:{type:'kos_text'}},C:{shadow:{type:'kos_num',fields:{N:0}}},R:{shadow:{type:'kos_num',fields:{N:1}}}}},'kos_text','kos_join','kos_clear',{kind:'block',type:'kos_hud',inputs:{X:{shadow:{type:'kos_text'}},D:{shadow:{type:'kos_num',fields:{N:5}}},S:{shadow:{type:'kos_num',fields:{N:30}}}}}].map(t=>typeof t==='string'?{kind:'block',type:t}:t)},
 {kind:'category',name:'Functions',colour:C.func,contents:['kos_func_def','kos_return','kos_call','kos_call_expr'].map(t=>({kind:'block',type:t}))},
 {kind:'category',name:'Templates',colour:C.tmpl,contents:['tmpl_launch','tmpl_circ','tmpl_land','tmpl_boostback'].map(t=>({kind:'block',type:t}))},
]};
const DEFAULT_WS={blocks:{languageVersion:0,blocks:[{type:'kos_clear',x:30,y:30,next:{block:{type:'kos_print',inputs:{X:{shadow:{type:'kos_text',fields:{T:'kOSBlocks launch'}}}},next:{block:{type:'tmpl_launch',next:{block:{type:'tmpl_circ'}}}}}}}]}};
