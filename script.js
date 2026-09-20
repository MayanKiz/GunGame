/* GUN GAME — a neon shooting range where every hit levels your weapon.
   Your cursor is the crosshair; a gun turret at the bottom of the range rotates
   to aim wherever you point. Click (or hold, for auto weapons) to fire: muzzle
   flash, recoil kick, a tracer to the impact, a spinning shell, and — on a hit —
   the target shatters. Land enough hits and you climb the classic Gun Game
   ladder: pistol → dual → SMG → shotgun → rifle → sniper → LMG → gold → knife.
   Keep a combo streak alive for a score multiplier. Clear the knife to win.

   Everything is drawn on ONE <canvas>; the HUD is DOM. Manual by default; a
   ?record self-play hook aims and fires for the capture rig. */

const canvas   = document.getElementById('c');
const hitEl    = document.getElementById('hit');
const muteBtn  = document.getElementById('mute');
const wordmark = document.getElementById('wordmark');
const hintEl   = document.getElementById('hint');
const scoreEl  = document.getElementById('score');
const accEl    = document.getElementById('acc');
const comboEl  = document.getElementById('combo');
const comboMult= document.getElementById('comboMult');
const wpanel   = document.getElementById('weaponPanel');
const wlvlEl   = document.getElementById('wlvl');
const wnameEl  = document.getElementById('wname');
const wpipsEl  = document.getElementById('wpips');
const wammoEl  = document.getElementById('wammo');
const wmagEl   = document.getElementById('wmag');
const bannerEl = document.getElementById('banner');

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RECORD = new URLSearchParams(location.search).has('record');
const ctx = canvas.getContext('2d');

// recording event log (fed to the offline audio synth so SFX land on the frame)
let recEvents=[], recT0=0, recDoneT=0;
function recLog(k){ if(RECORD) recEvents.push({t:performance.now()-recT0, k, w:wIdx}); }
const TAU = Math.PI*2;
const rand = (a=1,b) => b===undefined ? Math.random()*a : a+Math.random()*(b-a);
const clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp = (a,b,t) => a+(b-a)*t;

/* ---------- weapon ladder ---------- */
const WEAPONS = [
  { name:'PISTOL',  shape:'pistol',  acc:'#22e0ff', auto:false, rof:.18, mag:7,  reload:.8,  pellets:1, spread:.010, recoil:11, shake:2, len:62,  flash:15, req:3,  sd:.14, f0:1900, f1:320, thump:120, sg:.5 },
  { name:'DUAL 9MM',shape:'dual',    acc:'#7cf6ff', auto:false, rof:.12, mag:14, reload:1.0, pellets:1, spread:.014, recoil:9,  shake:2, len:60,  flash:15, req:4,  sd:.12, f0:1900, f1:340, thump:120, sg:.45 },
  { name:'SMG',     shape:'smg',     acc:'#8dff5a', auto:true,  rof:.06, mag:25, reload:1.2, pellets:1, spread:.024, recoil:6,  shake:2, len:96,  flash:14, req:6,  sd:.07, f0:2200, f1:520, thump:90,  sg:.32 },
  { name:'SHOTGUN', shape:'shotgun', acc:'#ffb020', auto:false, rof:.55, mag:6,  reload:1.5, pellets:8, spread:.065, recoil:24, shake:7, len:128, flash:28, req:3,  sd:.34, f0:1300, f1:130, thump:78,  sg:.7 },
  { name:'RIFLE',   shape:'rifle',   acc:'#c9ffb0', auto:true,  rof:.09, mag:30, reload:1.3, pellets:1, spread:.016, recoil:9,  shake:3, len:126, flash:18, req:6,  sd:.10, f0:2500, f1:560, thump:150, sg:.4 },
  { name:'SNIPER',  shape:'sniper',  acc:'#ff6bd0', auto:false, rof:.95, mag:5,  reload:1.2, pellets:1, spread:.0,   recoil:30, shake:9, len:172, flash:32, req:3,  sd:.48, f0:3000, f1:150, thump:88,  sg:.78, beam:true },
  { name:'LMG',     shape:'lmg',     acc:'#ffe08a', auto:true,  rof:.05, mag:60, reload:2.2, pellets:1, spread:.034, recoil:7,  shake:4, len:140, flash:20, req:9,  sd:.085,f0:1700, f1:420, thump:100, sg:.42 },
  { name:'GOLD GUN',shape:'gold',    acc:'#ffd54a', auto:false, rof:.28, mag:5,  reload:.9,  pellets:1, spread:.0,   recoil:17, shake:5, len:64,  flash:24, req:3,  sd:.16, f0:2600, f1:680, thump:300, sg:.5, oneshot:true },
  { name:'KNIFE',   shape:'knife',   acc:'#ff3b3b', auto:false, rof:.32, mag:0,  reload:0,   pellets:0, spread:0,    recoil:0,  shake:3, len:74,  flash:0,  req:2,  sd:.16, f0:4200, f1:1300,thump:0,   sg:.3, melee:true },
];

/* ============================================================ STATE */
let W=0, H=0, dpr=1, GS=1;
let tNow=0, last=0, raf=0;
const cross = { x:0, y:0 };            // crosshair (screen px)
const pivot = { x:0, y:0 };            // gun turret base
let aimAng=-Math.PI/2, dir={x:0,y:-1}, muzzle={x:0,y:0};

let wIdx=0, hitsThisWeapon=0, ammo=WEAPONS[0].mag;
let reloading=false, reloadEnd=0, lastFire=-1, triggerDown=false;
let recoil=0, gunDip=0, shake=0;
let score=0, shots=0, hitShots=0, streak=0, comboTimer=0, bestStreak=0;
let started=false, won=false, winAt=-1, autoLevel=false;   // one gun — hits don't swap weapons
let spawnTimer=0.5, reveal=0;

const targets=[], tracers=[], flashes=[], shells=[], debris=[], pops=[], shocks=[], slashes=[], confetti=[];

/* ============================================================ GLOW SPRITES */
const glowCache = new Map();
function glowSprite(color){
  if(glowCache.has(color)) return glowCache.get(color);
  const s=96, cv=document.createElement('canvas'); cv.width=cv.height=s;
  const g=cv.getContext('2d'); const grad=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  grad.addColorStop(0,color); grad.addColorStop(.28, color.replace('rgb','rgba').replace(')',',.5)'));
  grad.addColorStop(1,'rgba(0,0,0,0)');
  // color may be hex; normalise to rgba stops
  g.clearRect(0,0,s,s);
  const gg=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  const [r,gr,b]=hexToRgb(color);
  gg.addColorStop(0,`rgba(${r},${gr},${b},1)`);
  gg.addColorStop(.3,`rgba(${r},${gr},${b},.45)`);
  gg.addColorStop(1,`rgba(${r},${gr},${b},0)`);
  g.fillStyle=gg; g.fillRect(0,0,s,s);
  glowCache.set(color,cv); return cv;
}
function hexToRgb(h){
  if(h[0]!=='#') { const m=h.match(/\d+/g); return m?[+m[0],+m[1],+m[2]]:[255,255,255]; }
  const n=parseInt(h.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255];
}
function glow(color,x,y,r,a){ if(a<=0) return; ctx.globalAlpha=a; ctx.drawImage(glowSprite(color),x-r,y-r,r*2,r*2); }

/* ============================================================ HUD */
function buildPips(){
  const w=WEAPONS[wIdx]; wpipsEl.innerHTML='';
  for(let i=0;i<w.req;i++){ const s=document.createElement('span'); if(i<hitsThisWeapon) s.className='on'; wpipsEl.appendChild(s); }
}
function setWeaponPanel(swap){
  const w=WEAPONS[wIdx];
  wpanel.style.setProperty('--acc', w.acc);
  document.documentElement.style.setProperty('--acc', w.acc);
  wlvlEl.textContent=(wIdx+1)+'/'+WEAPONS.length;
  wnameEl.textContent=w.name;
  wnameEl.style.color=w.acc;
  buildPips();
  wmagEl.textContent=w.melee?'∞':w.mag;
  wammoEl.textContent=w.melee?'∞':ammo;
  if(swap){ wpanel.classList.remove('swap'); void wpanel.offsetWidth; wpanel.classList.add('swap'); }
}
function refreshHud(){
  scoreEl.textContent=score.toLocaleString('en-US');
  accEl.textContent=(shots?Math.round(hitShots/shots*100):100)+'%';
  wammoEl.textContent=WEAPONS[wIdx].melee?'∞':ammo;
  wpanel.classList.toggle('reloading', reloading);
}
function multFor(s){ return s>=18?5 : s>=12?4 : s>=7?3 : s>=3?2 : 1; }
function updateCombo(pop){
  const m=multFor(streak);
  comboMult.textContent='x'+m;
  comboEl.classList.toggle('on', streak>=3);
  if(pop){ comboEl.classList.remove('pop'); void comboEl.offsetWidth; comboEl.classList.add('pop'); }
}
function banner(text, sub, cls){
  bannerEl.innerHTML = text + (sub?`<small>${sub}</small>`:'');
  bannerEl.style.color = cls==='win' ? '#ffd54a' : WEAPONS[wIdx].acc;
  bannerEl.className='banner '+(cls||'');
  void bannerEl.offsetWidth; bannerEl.classList.add('show');
}

/* ============================================================ AIM */
const GUNMUL=1.9;                              // viewmodel is drawn larger than gameplay scale
function aim(dt=1){
  pivot.x=W*0.5; pivot.y=H*0.9;               // turret base sits on-screen, near the bottom
  const up=-Math.PI/2;
  const want=Math.atan2(cross.y-pivot.y, cross.x-pivot.x);
  // point the barrel AT the crosshair (clamped to a wide upward arc so it stays framed &
  // never dips below ~horizontal) — the gun tracks where you're actually aiming
  const target = clamp(want, up-1.15, up+1.15);
  aimAng += (target - aimAng) * (1 - Math.exp(-24*dt));   // slight weight, snappy follow
  dir.x=Math.cos(aimAng); dir.y=Math.sin(aimAng);
  const len=WEAPONS[wIdx].len*GS*GUNMUL;
  muzzle.x=pivot.x+dir.x*(len-recoil);
  muzzle.y=pivot.y+dir.y*(len-recoil);
}

/* ============================================================ FIRE */
function startReload(){
  const w=WEAPONS[wIdx];
  if(w.melee || reloading || ammo>=w.mag) return;
  reloading=true; reloadEnd=tNow+w.reload; audio.reloadStart();
}
function fire(){
  const w=WEAPONS[wIdx];
  if(reloading) return;
  if(tNow-lastFire < w.rof) return;
  if(!w.melee && ammo<=0){ startReload(); audio.empty(); return; }
  lastFire=tNow;

  if(w.melee){ meleeSlash(); return; }

  ammo--; shots++;
  recoil=Math.min(recoil+w.recoil, 46);
  gunDip=Math.min(gunDip+w.recoil*0.5, 26);
  shake=Math.min(shake+w.shake, 14);
  spawnFlash(w);
  ejectShell(w);
  audio.shot(w); recLog('shot');

  const dist=Math.hypot(cross.x-muzzle.x, cross.y-muzzle.y);
  const scatter=w.spread*dist + recoil*0.55;
  let anyHit=false;
  for(let i=0;i<w.pellets;i++){
    const ang=rand(TAU), rr=Math.sqrt(Math.random())*scatter;
    const ix=cross.x+Math.cos(ang)*rr, iy=cross.y+Math.sin(ang)*rr;
    spawnTracer(muzzle.x,muzzle.y, ix,iy, w);
    const hit=hitTest(ix,iy);
    if(hit){ anyHit=true; killTarget(hit, ix, iy); }
    else spawnSpark(ix,iy,'#5b6b86',4);      // impact puff on a miss
  }
  if(anyHit) hitShots++;
  else breakStreakSoft();
  if(ammo<=0) startReload();
  refreshHud();
}
function meleeSlash(){
  shots++;
  const reach=90*GS;
  slashes.push({x:cross.x,y:cross.y,ang:rand(TAU),age:0});
  shake=Math.min(shake+3,14);
  audio.shot(WEAPONS[wIdx]); recLog('melee');
  // hit the nearest target within reach
  let best=null,bd=reach;
  for(const t of targets){ if(t.dead) continue; const d=Math.hypot(t.x-cross.x,t.y-cross.y); if(d<bd){bd=d;best=t;} }
  if(best){ hitShots++; killTarget(best,best.x,best.y); }
  refreshHud();
}
function hitTest(x,y){
  let best=null, bd=1e9;
  for(const t of targets){ if(t.dead) continue; const d=Math.hypot(t.x-x,t.y-y); if(d<t.r && d<bd){ bd=d; best=t; } }
  return best;
}

/* ============================================================ SCORING / PROGRESS */
function killTarget(t, hx, hy){
  t.dead=true;
  let pts, label, prog=1;
  if(t.type==='gold'){ pts=100; label='GOLD!'; prog=2; }
  else if(t.type==='drone'){ pts=20; label='HIT'; }
  else { // bullseye ring scoring
    const d=Math.hypot(hx-t.x,hy-t.y)/t.r;
    if(d<0.3){ pts=50; label='BULLSEYE'; } else if(d<0.62){ pts=25; label='GREAT'; } else { pts=10; label='HIT'; }
  }
  streak++; bestStreak=Math.max(bestStreak,streak); comboTimer=2.4;
  const mult=multFor(streak);
  score+=pts*mult;
  updateCombo(true);
  spawnDebris(t); shocks.push({x:t.x,y:t.y,r:t.r*0.6,max:t.r*3.4,age:0,life:.5,col:t.col});
  pops.push({x:t.x,y:t.y-t.r,txt:(mult>1?label+'  x'+mult:label),sub:'+'+(pts*mult),age:0,col:t.col});
  audio.hit(pts>=50?1.5:pts>=25?1.2:1); recLog('hit');

  hitsThisWeapon+=prog; buildPips();
  if(autoLevel && hitsThisWeapon>=WEAPONS[wIdx].req) levelUp();
  refreshHud();
}
function breakStreakSoft(){ /* a plain miss doesn't reset instantly — the combo timer does */ }
function levelUp(){
  wIdx++; hitsThisWeapon=0;
  if(wIdx>=WEAPONS.length){ win(); return; }
  const w=WEAPONS[wIdx];
  ammo=w.mag; reloading=false;
  setWeaponPanel(true);
  banner('LEVEL&nbsp;UP', '', '');            // no weapon name — the gun + pips carry it
  audio.levelup(); recLog('lvl');
  burst(muzzle.x,muzzle.y, w.acc, 26);
}
function win(){
  won=true; winAt=tNow; wIdx=WEAPONS.length-1;
  hitsThisWeapon=WEAPONS[wIdx].req; setWeaponPanel(false);   // panel matches the final (knife)
  banner('GUN&nbsp;GAME!', 'LADDER CLEARED · '+score.toLocaleString('en-US')+' PTS', 'win');
  audio.win(); recLog('win');
  for(let i=0;i<90;i++) confetti.push({x:rand(W),y:rand(-H*0.2,0),vx:rand(-40,40),vy:rand(60,220),
    r:rand(3,7),col:['#22e0ff','#ff2d95','#ffd54a','#8dff5a'][i%4],sp:rand(-8,8),a:rand(TAU),age:0});
}
function resetLadder(){ wIdx=0; hitsThisWeapon=0; ammo=WEAPONS[0].mag; reloading=false; won=false; setWeaponPanel(true); }

/* ============================================================ TARGETS */
function startGame(){
  if(started) return; started=true;
  wordmark.classList.add('is-gone'); hideHint();
}
function spawnTarget(){
  const roll=Math.random();
  const yTop=H*0.13, yBot=H*0.60;
  if(roll<0.14){ // gold — rare, small, drifts across
    const fromL=Math.random()<0.5;
    targets.push({type:'gold', x:fromL?-40:W+40, y:rand(yTop,yBot*0.8), r:22*GS,
      vx:(fromL?1:-1)*rand(90,140), vy:rand(-8,8), col:'#ffd54a', life:9, age:0, in:0, dead:false});
  } else if(roll<0.45){ // drone — crosses horizontally
    const fromL=Math.random()<0.5;
    targets.push({type:'drone', x:fromL?-40:W+40, y:rand(yTop,yBot), r:rand(20,26)*GS,
      vx:(fromL?1:-1)*rand(70,120), vy:0, bob:rand(TAU), col:'#ff2d95', life:11, age:0, in:0, dead:false});
  } else { // bullseye — pops up, lingers, drifts slowly
    targets.push({type:'bull', x:rand(W*0.14,W*0.86), y:rand(yTop,yBot), r:rand(28,46)*GS,
      vx:rand(-22,22), vy:rand(-14,6), col:'#22e0ff', life:rand(3.2,4.4), age:0, in:0, dead:false});
  }
}
function updateTargets(dt){
  const speedUp=1+wIdx*0.06;
  for(let i=targets.length-1;i>=0;i--){
    const t=targets[i];
    t.age+=dt; t.in=Math.min(1,t.in+dt*6);
    t.x+=t.vx*dt*speedUp; t.y+=t.vy*dt;
    if(t.type==='drone') t.y += Math.sin(tNow*3+t.bob)*18*dt;
    const life=t.type==='bull'?t.life:t.life;
    const out = t.type==='bull' ? Math.max(0,1-(t.age-life)/0.35) : 1;
    t.scale = t.in * (t.type==='bull'? (t.age>life?out:1) : 1);
    if(t.dead){ targets.splice(i,1); continue; }
    if(t.type==='bull' && t.age>life+0.36){ targets.splice(i,1); continue; }
    if((t.type!=='bull') && (t.x< -70 || t.x>W+70)) targets.splice(i,1);
  }
}

/* ============================================================ PARTICLES */
function spawnFlash(w){ flashes.push({x:muzzle.x,y:muzzle.y,ang:aimAng,size:w.flash*GS*rand(.85,1.2),age:0,col:w.acc}); }
function spawnTracer(x0,y0,x1,y1,w){ tracers.push({x0,y0,x1,y1,age:0,life:w.beam?.18:.12,col:w.acc,beam:!!w.beam}); }
function ejectShell(w){
  if(w.melee) return;
  const side={x:-dir.y,y:dir.x};
  shells.push({x:muzzle.x-dir.x*w.len*GS*0.4, y:muzzle.y-dir.y*w.len*GS*0.4,
    "Sample Message",
    rot:rand(TAU), vr:rand(-14,14), age:0, col:w.shape==='gold'?'#ffd54a':'#caa24a'});
}
function spawnDebris(t){
  const n=t.type==='gold'?18:12;
  for(let i=0;i<n;i++){ const a=rand(TAU), s=rand(60,260);
    debris.push({x:t.x,y:t.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,r:rand(2,5),age:0,life:rand(.5,.9),col:t.col}); }
}
function spawnSpark(x,y,col,n){ for(let i=0;i<n;i++){ const a=rand(TAU),s=rand(30,120);
  debris.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rand(1,2.4),age:0,life:rand(.2,.4),col}); } }
function burst(x,y,col,n){ for(let i=0;i<n;i++){ const a=rand(TAU),s=rand(80,340);
  debris.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,r:rand(2,5),age:0,life:rand(.5,1),col}); } }
function updateParticles(dt){
  for(let i=tracers.length-1;i>=0;i--){ if((tracers[i].age+=dt)>=tracers[i].life) tracers.splice(i,1); }
  for(let i=flashes.length-1;i>=0;i--){ if((flashes[i].age+=dt)>=.06) flashes.splice(i,1); }
  for(let i=slashes.length-1;i>=0;i--){ if((slashes[i].age+=dt)>=.22) slashes.splice(i,1); }
  for(let i=shells.length-1;i>=0;i--){ const s=shells[i]; s.age+=dt; s.vy+=620*dt; s.x+=s.vx*dt; s.y+=s.vy*dt; s.rot+=s.vr*dt;
    if(s.y>H*0.9){ s.y=H*0.9; s.vy*=-0.32; s.vx*=0.6; } if(s.age>1.5) shells.splice(i,1); }
  for(let i=debris.length-1;i>=0;i--){ const d=debris[i]; d.age+=dt; d.vy+=520*dt; d.vx*=Math.exp(-2*dt); d.x+=d.vx*dt; d.y+=d.vy*dt;
    if(d.age>=d.life) debris.splice(i,1); }
  for(let i=pops.length-1;i>=0;i--){ const p=pops[i]; p.age+=dt; p.y-=34*dt; if(p.age>=1) pops.splice(i,1); }
  for(let i=shocks.length-1;i>=0;i--){ const s=shocks[i]; s.age+=dt; s.r=lerp(s.r,s.max,Math.min(1,dt*8)); if(s.age>=s.life) shocks.splice(i,1); }
  for(let i=confetti.length-1;i>=0;i--){ const c=confetti[i]; c.age+=dt; c.vy+=120*dt; c.x+=c.vx*dt+Math.sin(c.age*4+c.sp)*20*dt; c.y+=c.vy*dt; c.a+=c.sp*dt;
    if(c.y>H+30) confetti.splice(i,1); }
}

/* ============================================================ UPDATE */
function update(dt){
  tNow+=dt; reveal=Math.min(1,reveal+dt*2.2);
  recoil*=Math.exp(-9*dt); gunDip*=Math.exp(-7*dt); shake*=Math.exp(-10*dt);
  if(reloading && tNow>=reloadEnd){ reloading=false; ammo=WEAPONS[wIdx].mag; audio.reloadDone(); refreshHud(); }
  if(triggerDown && WEAPONS[wIdx].auto && started && !won) fire();

  aim(dt);
  if(started && !won){
    spawnTimer-=dt;
    const cap = 5 + Math.min(3, wIdx*0.4);
    if(spawnTimer<=0 && targets.length<cap){ spawnTarget(); spawnTimer=rand(0.42,0.9)/(1+wIdx*0.05); }
  }
  if(comboTimer>0){ comboTimer-=dt; if(comboTimer<=0 && streak>0){ streak=0; updateCombo(false); if(!won) audio.comboLost(); } }
  if(won && tNow-winAt>4.2) resetLadder();

  updateTargets(dt);
  updateParticles(dt);
}

/* ============================================================ DRAW */
function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  // screen shake
  const sx=(Math.random()*2-1)*shake, sy=(Math.random()*2-1)*shake;
  ctx.save(); ctx.translate(sx,sy);

  drawRange();
  ctx.globalCompositeOperation='lighter';
  drawTargets();
  drawShocks();
  drawParticles();
  drawTracers();
  drawFlashes();
  ctx.globalCompositeOperation='source-over';
  drawShells();
  drawMount();
  drawGun();
  ctx.globalCompositeOperation='lighter';
  drawSlashes();
  drawPops();
  drawConfetti();
  drawCrosshair();
  ctx.restore();

  // vignette + reveal
  ctx.globalCompositeOperation='source-over';
  const vg=ctx.createRadialGradient(W/2,H*0.42,Math.min(W,H)*0.25, W/2,H*0.5,Math.max(W,H)*0.72);
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.55)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
  if(reveal<1){ ctx.fillStyle=`rgba(7,8,13,${1-reveal})`; ctx.fillRect(0,0,W,H); }
}

function drawRange(){
  // dark base + horizon glow
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0a0e1a'); g.addColorStop(0.55,'#080a12'); g.addColorStop(1,'#05060b');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  const horizon=H*0.66;
  const hg=ctx.createRadialGradient(W/2,horizon,0,W/2,horizon,W*0.7);
  hg.addColorStop(0,'rgba(34,224,255,.10)'); hg.addColorStop(1,'rgba(34,224,255,0)');
  ctx.globalCompositeOperation='lighter'; ctx.fillStyle=hg; ctx.fillRect(0,0,W,H);
  // perspective floor grid receding to the horizon
  const vx=W/2;
  ctx.strokeStyle='rgba(34,224,255,.12)'; ctx.lineWidth=1;
  ctx.beginPath();
  for(let i=-10;i<=10;i++){ const fx=vx+i*(W*0.09); ctx.moveTo(vx+i*8, horizon); ctx.lineTo(fx*1.6-vx*0.6, H+20); }
  for(let j=1;j<=10;j++){ const t=j/10; const y=lerp(horizon,H+20,t*t); ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  // faint back-wall light bars
  ctx.globalCompositeOperation='lighter';
  for(let i=0;i<4;i++){ const x=W*(0.2+i*0.2); glow('#1b2b52',x,horizon-40,120,.25); }
  ctx.globalCompositeOperation='source-over';
}

function drawTargets(){
  for(const t of targets){
    const s=t.scale||1; if(s<=0.02) continue;
    const r=t.r*s;
    glow(t.col,t.x,t.y,r*2.1,.4*reveal);
    if(t.type==='bull'){
      // concentric rings
      ctx.globalCompositeOperation='lighter';
      ringStroke(t.x,t.y,r,t.col,3); ringStroke(t.x,t.y,r*0.62,t.col,2.4);
      ctx.globalAlpha=.9*reveal; ctx.fillStyle=t.col;
      ctx.beginPath(); ctx.arc(t.x,t.y,r*0.28,0,TAU); ctx.fill();
    } else if(t.type==='drone'){
      ctx.globalAlpha=.85*reveal; ctx.strokeStyle=t.col; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.arc(t.x,t.y,r*0.7,0,TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(t.x-r,t.y); ctx.lineTo(t.x+r,t.y); ctx.moveTo(t.x,t.y-r*0.7); ctx.lineTo(t.x,t.y+r*0.7); ctx.stroke();
      ctx.fillStyle=t.col; ctx.globalAlpha=.9*reveal; ctx.beginPath(); ctx.arc(t.x,t.y,r*0.2,0,TAU); ctx.fill();
    } else { // gold diamond
      ctx.save(); ctx.translate(t.x,t.y); ctx.rotate(Math.PI/4);
      ctx.globalAlpha=.95*reveal; ctx.strokeStyle=t.col; ctx.lineWidth=3; ctx.strokeRect(-r*0.55,-r*0.55,r*1.1,r*1.1);
      ctx.fillStyle=t.col; ctx.globalAlpha=.5*reveal; ctx.fillRect(-r*0.3,-r*0.3,r*0.6,r*0.6); ctx.restore();
    }
  }
  ctx.globalAlpha=1;
}
function ringStroke(x,y,r,col,w){ ctx.globalAlpha=.9; ctx.strokeStyle=col; ctx.lineWidth=w; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.stroke(); }

function drawShocks(){ for(const s of shocks){ const k=1-s.age/s.life; ctx.globalAlpha=k*.6; ctx.strokeStyle=s.col; ctx.lineWidth=2+k*3; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,TAU); ctx.stroke(); } ctx.globalAlpha=1; }
function drawParticles(){
  for(const d of debris){ const k=1-d.age/d.life; glow(d.col,d.x,d.y,d.r*2.2,k*.8); }
  ctx.globalAlpha=1;
}
function drawTracers(){
  // a short bright bullet-streak that shoots muzzle -> impact (not a persistent laser beam),
  // then an impact flash where it lands.
  for(const t of tracers){
    const p = t.age/t.life;
    const dx = t.x1-t.x0, dy = t.y1-t.y0;
    const headF = Math.min(1, p/0.5);                 // reaches the impact by half-life
    const tailF = Math.max(0, headF - (t.beam?0.55:0.24));
    const hx = t.x0+dx*headF, hy = t.y0+dy*headF;
    const tx = t.x0+dx*tailF, ty = t.y0+dy*tailF;
    const a = (1-p) * (t.beam?1:0.95);
    if(headF < 1){                                     // the round in flight
      ctx.globalAlpha=a; ctx.strokeStyle=t.col; ctx.lineWidth=t.beam?3.4:2;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(hx,hy); ctx.stroke();
      ctx.globalAlpha=a*0.4; ctx.lineWidth=t.beam?9:5;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(hx,hy); ctx.stroke();
      glow(t.col, hx, hy, t.beam?13:8, a);             // bright bullet head
    } else {
      glow('#fff3c8', t.x1, t.y1, t.beam?20:13, (1-p)*0.95);   // impact flash
      glow(t.col,    t.x1, t.y1, t.beam?30:20, (1-p)*0.5);
    }
  }
  ctx.globalAlpha=1;
}
function drawFlashes(){
  for(const f of flashes){ const k=1-f.age/.06;
    glow('#fff3c8',f.x,f.y,f.size*1.6*(0.6+k*0.6),k*.95);
    glow(f.col,f.x,f.y,f.size*2.4*(0.6+k*0.6),k*.7);
    // star spikes along the barrel
    ctx.globalAlpha=k*.9; ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    for(let a=0;a<4;a++){ const an=f.ang+a*Math.PI/2+ .3; const L=f.size*(a%2?1.1:1.8)*(0.5+k);
      ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(f.x+Math.cos(an)*L, f.y+Math.sin(an)*L); ctx.stroke(); }
  }
  ctx.globalAlpha=1;
}
function drawShells(){
  for(const s of shells){ const k=Math.min(1,(1.5-s.age)/0.4);
    ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.rot); ctx.globalAlpha=k;
    ctx.fillStyle=s.col; ctx.fillRect(-3,-1.6,6,3.2); ctx.fillStyle='rgba(255,255,255,.5)'; ctx.fillRect(-3,-1.6,1.5,3.2); ctx.restore(); }
  ctx.globalAlpha=1;
}
function drawPops(){
  for(const p of pops){ const k=1-p.age; ctx.globalAlpha=k;
    ctx.textAlign='center'; ctx.fillStyle=p.col;
    ctx.font='700 '+(15*GS)+'px "Space Grotesk", sans-serif';
    ctx.fillText(p.txt,p.x,p.y);
    ctx.fillStyle='#fff'; ctx.font='700 '+(13*GS)+'px ui-monospace, monospace';
    ctx.fillText(p.sub,p.x,p.y+16*GS);
  }
  ctx.globalAlpha=1; ctx.textAlign='left';
}
function drawSlashes(){
  for(const s of slashes){ const k=1-s.age/.22; ctx.globalAlpha=k; ctx.strokeStyle='#fff'; ctx.lineWidth=3;
    const r=90*GS*(s.age/.22);
    ctx.beginPath(); ctx.arc(s.x,s.y,r,s.ang,s.ang+1.6); ctx.stroke();
    glow('#ff3b3b',s.x,s.y,20,k*.6);
  }
  ctx.globalAlpha=1;
}
function drawConfetti(){
  for(const c of confetti){ ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(c.a); ctx.globalAlpha=1;
    ctx.fillStyle=c.col; ctx.fillRect(-c.r,-c.r*0.5,c.r*2,c.r); ctx.restore(); }
  ctx.globalAlpha=1;
}
function drawCrosshair(){
  const w=WEAPONS[wIdx], bloom=recoil*0.7;
  const over=hitTest(cross.x,cross.y);
  const col= over ? '#ff3b3b' : w.acc;
  const gap=8+bloom, len=10;
  ctx.globalAlpha=reveal; ctx.strokeStyle=col; ctx.lineWidth=2;
  for(let a=0;a<4;a++){ const an=a*Math.PI/2; const dx=Math.cos(an),dy=Math.sin(an);
    ctx.beginPath(); ctx.moveTo(cross.x+dx*gap,cross.y+dy*gap); ctx.lineTo(cross.x+dx*(gap+len),cross.y+dy*(gap+len)); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cross.x,cross.y, gap+len+4, 0, TAU); ctx.globalAlpha=reveal*(over?.6:.28); ctx.lineWidth=1.4; ctx.stroke();
  ctx.globalAlpha=reveal; ctx.fillStyle=col; ctx.beginPath(); ctx.arc(cross.x,cross.y,1.6,0,TAU); ctx.fill();
  glow(col,cross.x,cross.y,over?26:16, over?.5:.28);
  ctx.globalAlpha=1;
}

/* ---------- gun viewmodel ---------- */
function drawMount(){
  const cx=pivot.x, cy=pivot.y+gunDip*0.4;
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#0a0e17';
  ctx.beginPath();
  ctx.moveTo(cx-150*GS, H+12); ctx.lineTo(cx-52*GS, cy+4);
  ctx.lineTo(cx+52*GS, cy+4); ctx.lineTo(cx+150*GS, H+12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(34,224,255,.4)'; ctx.lineWidth=2; ctx.shadowColor='#22e0ff'; ctx.shadowBlur=10;
  ctx.beginPath(); ctx.moveTo(cx-52*GS,cy+4); ctx.lineTo(cx+52*GS,cy+4); ctx.stroke(); ctx.shadowBlur=0;
}
function drawGun(){
  const w=WEAPONS[wIdx];
  ctx.save();
  ctx.translate(pivot.x - dir.x*recoil, pivot.y - dir.y*recoil + gunDip*0.4);
  ctx.rotate(aimAng);          // gun drawn along +X, muzzle to the right
  ctx.scale(GS*GUNMUL,GS*GUNMUL);
  const rl = reloading ? Math.sin(clamp((tNow-(reloadEnd-w.reload))/Math.max(w.reload,.001),0,1)*Math.PI) : 0;
  ctx.translate(-rl*10, rl*6);
  neon(w.acc);
  const dark='#0c1018';
  if(w.shape==='knife'){
    ctx.fillStyle=dark; ctx.strokeStyle=w.acc;
    ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(46,-8); ctx.lineTo(70,0); ctx.lineTo(46,8); ctx.lineTo(0,3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle='#fff'; ctx.globalAlpha=.5; ctx.beginPath(); ctx.moveTo(6,-1); ctx.lineTo(60,-2); ctx.stroke(); ctx.globalAlpha=1;
    ctx.restore(); return;
  }
  const draw1=(ox,oy)=>{ ctx.save(); ctx.translate(ox,oy); gunBody(w,dark); ctx.restore(); };
  if(w.shape==='dual'){ draw1(0,-7); draw1(-8,9); } else draw1(0,0);
  ctx.restore();
}
function gunBody(w,dark){
  ctx.fillStyle=dark; ctx.strokeStyle=w.acc; ctx.lineWidth=2.2;
  const rect=(x,y,ww,hh)=>{ ctx.beginPath(); ctx.rect(x,y,ww,hh); ctx.fill(); ctx.stroke(); };
  switch(w.shape){
    case 'pistol': case 'gold':
      rect(2,-8,44,11);              // slide
      rect(6,2,14,20);              // grip
      rect(44,-6,10,7);             // muzzle
      break;
    case 'smg':
      rect(2,-7,80,12); rect(20,4,12,20); rect(70,-5,20,8);
      ctx.beginPath(); ctx.moveTo(-16,-4); ctx.lineTo(2,-2); ctx.lineTo(2,4); ctx.lineTo(-16,3); ctx.closePath(); ctx.fill(); ctx.stroke(); // stock
      break;
    case 'shotgun':
      rect(2,-9,110,8); rect(2,1,110,8);   // double barrel
      rect(18,9,16,16); ctx.beginPath(); ctx.moveTo(-18,-6); ctx.lineTo(2,-3); ctx.lineTo(2,7); ctx.lineTo(-18,6); ctx.closePath(); ctx.fill(); ctx.stroke();
      rect(108,-9,16,18);
      break;
    case 'rifle':
      rect(2,-7,96,12); rect(26,4,13,22); rect(84,-5,32,8);
      ctx.beginPath(); ctx.moveTo(-20,-5); ctx.lineTo(2,-2); ctx.lineTo(2,5); ctx.lineTo(-20,4); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'sniper':
      rect(2,-6,150,10); rect(30,3,12,20); rect(120,-4,44,7);
      rect(40,-20,44,10); ctx.beginPath(); ctx.arc(50,-15,4,0,TAU); ctx.arc(74,-15,4,0,TAU); ctx.fill(); // scope
      ctx.beginPath(); ctx.moveTo(-24,-4); ctx.lineTo(2,-2); ctx.lineTo(2,5); ctx.lineTo(-24,4); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
    case 'lmg':
      rect(2,-9,118,15); rect(24,6,26,26); rect(104,-6,34,9);
      ctx.beginPath(); ctx.arc(37,20,15,0,TAU); ctx.fill(); ctx.stroke();   // drum mag
      ctx.beginPath(); ctx.moveTo(-22,-6); ctx.lineTo(2,-3); ctx.lineTo(2,7); ctx.lineTo(-22,6); ctx.closePath(); ctx.fill(); ctx.stroke();
      break;
  }
}
function neon(col){ ctx.lineJoin='round'; ctx.shadowColor=col; ctx.shadowBlur=10; }

/* ============================================================ AUDIO */
const audio=(()=>{
  let ac=null,master=null,muted=false,ready=false;
  function ensure(){ if(ready||muted) return; ac=new (window.AudioContext||window.webkitAudioContext)(); master=ac.createGain(); master.gain.value=.9; master.connect(ac.destination); ready=true; }
  function tone(f,dur,g,type='sine',slide){ if(!ready||muted) return; const o=ac.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,ac.currentTime); if(slide) o.frequency.exponentialRampToValueAtTime(slide,ac.currentTime+dur); const gg=ac.createGain(); gg.gain.setValueAtTime(0,ac.currentTime); gg.gain.linearRampToValueAtTime(g,ac.currentTime+.006); gg.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur); o.connect(gg).connect(master); o.start(); o.stop(ac.currentTime+dur+.02); }
  function noise(dur,f0,f1,q,g,type='lowpass'){ if(!ready||muted) return; const n=Math.max(1,Math.floor(ac.sampleRate*dur)); const buf=ac.createBuffer(1,n,ac.sampleRate); const d=buf.getChannelData(0); for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n); const src=ac.createBufferSource(); src.buffer=buf; const f=ac.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(f0,ac.currentTime); if(f1) f.frequency.exponentialRampToValueAtTime(Math.max(60,f1),ac.currentTime+dur); f.Q.value=q; const gg=ac.createGain(); gg.gain.value=g; src.connect(f).connect(gg).connect(master); src.start(); }
  return {
    unlock(){ if(!muted){ ensure(); if(ac&&ac.state==='suspended') ac.resume(); } },
    toggle(){ muted=!muted; if(muted){ if(master) master.gain.value=0; } else { ensure(); if(master) master.gain.value=.9; } return muted; },
    shot(w){
      if(!ready||muted) return;
      if(w.melee){ noise(.16,5200,1500,3,.34,'highpass'); return; }
      noise(0.008, 7000, 3000, 0.7, w.sg);                  // sharp CRACK transient (the snap)
      noise(w.sd, w.f0, w.f1, 1, w.sg*0.95);                // body
      if(w.thump){ tone(w.thump, Math.min(.32,w.sd*1.7), .6, 'sine', w.thump*0.5);
                   tone(w.thump*0.6, Math.min(.16,w.sd), .32, 'sine', w.thump*0.4); }  // thump + sub
      if(w.oneshot) tone(780,.42,.12,'sine',390);
    },
    empty(){ tone(1800,.03,.08,'square'); },
    reloadStart(){ tone(280,.05,.16,'square'); setTimeout(()=>tone(200,.05,.14,'square'),90); },
    reloadDone(){ tone(420,.05,.2,'square'); setTimeout(()=>tone(620,.06,.18,'square'),70); },
    hit(k){ tone(700*k,.1,.16,'triangle',900*k); },
    levelup(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,.22,.16,'triangle'),i*70)); },
    comboLost(){ tone(300,.14,.1,'sine',150); },
    win(){ [523,659,784,1047,1319,1047,1319,1568].forEach((f,i)=>setTimeout(()=>tone(f,.3,.16,'triangle'),i*110)); },
  };
})();

/* ============================================================ INPUT */
function setCross(e){ const b=canvas.getBoundingClientRect(); cross.x=e.clientX-b.left; cross.y=e.clientY-b.top; }
if(!REDUCE){
  window.addEventListener('pointermove',e=>{ if(muteBtn.contains(e.target)) return; setCross(e); }, {passive:true});
  window.addEventListener('pointerdown',e=>{ if(muteBtn.contains(e.target)) return; audio.unlock(); setCross(e); startGame(); triggerDown=true; if(!won) fire(); });
  window.addEventListener('pointerup',()=>{ triggerDown=false; });
  window.addEventListener('blur',()=>{ triggerDown=false; });
  hitEl.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){ e.preventDefault(); audio.unlock(); startGame(); if(!won) fire(); }
    else if(e.key==='r'||e.key==='R'){ startReload(); }
    else if(e.key.startsWith('Arrow')){ e.preventDefault(); const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key]; if(d){ cross.x=clamp(cross.x+d[0]*48,0,W); cross.y=clamp(cross.y+d[1]*48,0,H); } }
  });
  hitEl.addEventListener('keyup',e=>{ if(e.key==='Enter'||e.key===' ') triggerDown=false; });
}
muteBtn.addEventListener('click',()=>{ const m=audio.toggle(); muteBtn.setAttribute('aria-pressed',String(!m)); muteBtn.setAttribute('aria-label',m?'Sound off':'Sound on'); });

/* ============================================================ RESIZE / BOOT */
function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);
  W=canvas.clientWidth||innerWidth; H=canvas.clientHeight||innerHeight;
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  GS=clamp(Math.min(W,H)/720,0.72,1.5);
  if(!cross.x){ cross.x=W*0.5; cross.y=H*0.4; }
}
addEventListener('resize',resize);

function frame(now){ const dt=Math.min(.05,(now-last)/1000)||.016; last=now; if(RECORD&&recPlay) drive(dt); update(dt); draw(); raf=requestAnimationFrame(frame); }

resize(); setWeaponPanel(false); refreshHud();
if(!REDUCE){ last=performance.now(); raf=requestAnimationFrame(frame); }
else {
  reveal=1; cross.x=W*0.62; cross.y=H*0.34; aim();
  targets.push({type:'bull',x:W*0.62,y:H*0.34,r:40*GS,vx:0,vy:0,col:'#22e0ff',age:0,in:1,scale:1,life:9,dead:false});
  targets.push({type:'drone',x:W*0.3,y:H*0.5,r:24*GS,vx:0,vy:0,bob:0,col:'#ff2d95',age:0,in:1,scale:1,life:9,dead:false});
  wordmark.classList.remove('is-gone'); hideHint(); draw();
}
function hideHint(){ hintEl.classList.add('is-gone'); }

/* ============================================================ RECORD HOOK
   ?record only; gated behind start() so capture begins after the pre-roll. A
   virtual crosshair hunts the nearest target and fires — climbing the ladder for
   a highlight reel. */
let recPlay=false, recAim={x:0,y:0}, recFireAt=0, recBurstEnd=0, recWob={x:0,y:0}, recTgt=null;
function rollWob(t){
  // decide hit-or-miss up front so accuracy stays consistently "human" (~65-70%), not RNG-swingy:
  // intended hits aim TIGHT (land inside even with the gun's spread); intended misses pull clearly wide.
  const miss = Math.random() < 0.26;
  const off = t.r * (miss ? (1.05 + Math.random()*0.55) : (0.02 + Math.random()*0.13));
  const a = Math.random()*TAU; recWob.x = Math.cos(a)*off; recWob.y = Math.sin(a)*off;
}
function drive(dt){
  if(!started){ startGame(); recAim.x=W*0.5; recAim.y=H*0.4; }
  // COMMIT to one target until it's killed or leaves — less churn means the crosshair
  // actually settles and fires (and a missed shot gets a natural follow-up at the same target).
  let tgt = (recTgt && targets.indexOf(recTgt)>=0 && recTgt.scale>0.5) ? recTgt : null;
  if(!tgt){
    let bd=1e9;
    for(const t of targets){ if(t.dead||t.scale<0.5) continue; const d=Math.hypot(t.x-recAim.x,t.y-recAim.y); if(d<bd){bd=d;tgt=t;} }
    recTgt=tgt; if(tgt) rollWob(tgt);
  }
  if(tgt){
    // track the target CENTRE (with a little lead for movers) so the crosshair reliably keeps up
    recAim.x += (tgt.x + tgt.vx*0.12 - recAim.x)*Math.min(1,dt*10);
    recAim.y += (tgt.y + tgt.vy*0.12 - recAim.y)*Math.min(1,dt*10);
  } else {
    recAim.x = W*0.5+Math.sin(tNow*1.0)*W*0.2; recAim.y = H*0.36+Math.cos(tNow*0.8)*H*0.1;
  }
  cross.x=recAim.x; cross.y=recAim.y;

  // deliberate SINGLE shots — fire on cadence when the reticle is on the target; the per-shot
  // wobble decides where THIS bullet goes (tight = hit, clearly wide = ~26% natural miss).
  triggerDown=false;
  if(!won && tgt && !reloading && tNow>=recFireAt){
    if(Math.hypot(tgt.x-recAim.x, tgt.y-recAim.y) < tgt.r*0.6){
      cross.x = recAim.x + recWob.x; cross.y = recAim.y + recWob.y;
      fire();
      cross.x = recAim.x; cross.y = recAim.y;                     // reticle stays tracking the target
      // slower, human cadence: a real gap between shots, with the odd longer pause to reacquire
      recFireAt = tNow + 0.85 + Math.random()*0.5 + (Math.random()<0.28 ? 0.45+Math.random()*0.7 : 0);
      rollWob(tgt);
    }
  }
}
if(RECORD){
  window.gungame={
    start(){ recPlay=true; recT0=performance.now(); recEvents=[]; audio.unlock(); startGame(); },
    fire:()=>fire(),
    aim:(u=.5,v=.4)=>{ cross.x=u*W; cross.y=v*H; },
    level:()=>levelUp(),                 // advances one rung; past knife → win()
    winNow:()=>win(),                    // jump straight to the win/confetti finale
    autolevel:(v)=>{ autoLevel=v; },     // rig disables natural progression to own the cadence
    mute:()=>audio.toggle(),
    state:()=>({weapon:WEAPONS[wIdx].name, lvl:wIdx+1, score, streak, ammo, targets:targets.length, won}),
    events:()=>recEvents.slice(),
    doneT:()=>recDoneT,
    finish:()=>{ recDoneT=performance.now()-recT0; },
    els:{hit:hitEl,mute:muteBtn},
  };
}
