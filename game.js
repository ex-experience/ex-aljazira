import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const qs = s => document.querySelector(s);
const intro = qs('#intro'), startBtn = qs('#start'), pauseEl = qs('#pause');
const posEl=qs('#pos'), biomeEl=qs('#biome'), hotbar=qs('#hotbar'), objective=qs('#objective');

const SEED = 2030;
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
let gameActive = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db7c1);
scene.fog = new THREE.FogExp2(0xc7b890, 0.0028);

const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 850);
camera.rotation.order = 'YXZ';
camera.position.set(0, 18, 0);

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.35 : 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.domElement.style.touchAction='none';
document.body.prepend(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xcfe4ff,0x8c6843,2.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0ae,3.1);
sun.position.set(-90,120,55); sun.castShadow=true;
sun.shadow.mapSize.set(IS_TOUCH?1024:2048,IS_TOUCH?1024:2048);
sun.shadow.camera.left=-120;sun.shadow.camera.right=120;sun.shadow.camera.top=120;sun.shadow.camera.bottom=-120;
scene.add(sun);

const controls = new PointerLockControls(camera, renderer.domElement);

startBtn.onclick=()=>{
  intro.style.display='none';
  gameActive=true;
  if(!IS_TOUCH) controls.lock();
};
renderer.domElement.addEventListener('click',()=>{
  if(!IS_TOUCH && gameActive && !paused && !controls.isLocked) controls.lock();
});

const WORLD = 76;
const HALF = WORLD>>1;
const noise = new ImprovedNoise();

const blockDefs = [
  {id:0,name:'حجر الحجاز',c:0x86756a},
  {id:1,name:'رمل',c:0xd8b574},
  {id:2,name:'صخر أسود',c:0x2c2b2a},
  {id:3,name:'تربة واحة',c:0x7a5c38},
  {id:4,name:'خشب نخيل',c:0x795536},
  {id:5,name:'جص بلدي',c:0xd5c5a7},
  {id:6,name:'حجر مرجاني',c:0xb29b84}
];
let selected=1;
blockDefs.forEach((b,i)=>{
  const s=document.createElement('div');s.className='slot'+(i===selected?' sel':'');
  s.innerHTML=`<div class="cube" style="background:#${b.c.toString(16).padStart(6,'0')}"></div>${i+1} ${b.name}`;
  const choose=(e)=>{e.preventDefault();e.stopPropagation();select(i)};
  s.addEventListener('pointerdown',choose,{passive:false});
  hotbar.appendChild(s);
});
function select(i){selected=i;[...hotbar.children].forEach((e,j)=>e.classList.toggle('sel',j===i));}

const boxGeo = new THREE.BoxGeometry(1,1,1);
const mats = blockDefs.map(b=>new THREE.MeshStandardMaterial({color:b.c,roughness:.92,metalness:0}));
const groups = blockDefs.map((b,i)=> {
  const mesh=new THREE.InstancedMesh(boxGeo,mats[i],28000);
  mesh.castShadow=i!==1 && !IS_TOUCH;
  mesh.receiveShadow=true; mesh.count=0; scene.add(mesh);
  return {mesh,count:0,positions:new Map()};
});

const occupied = new Map();
const key=(x,y,z)=>`${x}|${y}|${z}`;
const dummy = new THREE.Object3D();

function biomeAt(x,z){
  const n=noise.noise(x*.018,0,z*.018);
  if(x < -18 && z > 5) return 'HIJAZ';
  if(x > 18 && z < -8) return 'RUB_AL_KHALI';
  if(z > 24) return 'HARRAT';
  if(Math.abs(x)<10 && z<-22) return 'OASIS';
  return n>.42?'TUWAIQ':'NAJD';
}
function heightAt(x,z){
  const b=biomeAt(x,z);
  const n1=noise.noise((x+SEED)*.028,0,(z-SEED)*.028);
  const n2=noise.noise((x-SEED)*.075,4,(z+SEED)*.075);
  if(b==='HIJAZ') return Math.max(3, Math.floor(8 + Math.abs(n1)*12 + n2*4));
  if(b==='RUB_AL_KHALI') return Math.max(2, Math.floor(4 + Math.sin(x*.18+z*.11)*2 + n1*3));
  if(b==='HARRAT') return Math.max(4, Math.floor(7 + n1*5));
  if(b==='OASIS') return Math.max(2, Math.floor(3+n1*1.5));
  if(b==='TUWAIQ') return Math.max(3, Math.floor(6+n1*3 + (x>0?2:0)));
  return Math.max(3, Math.floor(5+n1*2+n2));
}
function topType(x,z,y){
  const b=biomeAt(x,z);
  if(b==='RUB_AL_KHALI') return 1;
  if(b==='HARRAT') return 2;
  if(b==='OASIS') return 3;
  if(b==='HIJAZ') return y>12?0:6;
  return 0;
}
function addBlock(x,y,z,type){
  const k=key(x,y,z); if(occupied.has(k)) return false;
  const g=groups[type], idx=g.count++;
  dummy.position.set(x,y,z); dummy.updateMatrix();
  g.mesh.setMatrixAt(idx,dummy.matrix); g.mesh.count=g.count; g.mesh.instanceMatrix.needsUpdate=true;
  g.positions.set(idx,{x,y,z,type}); occupied.set(k,{type,idx});
  return true;
}
function removeBlock(x,y,z){
  const k=key(x,y,z), item=occupied.get(k); if(!item) return false;
  const g=groups[item.type], last=g.count-1;
  if(item.idx!==last){
    const moved=g.positions.get(last);
    dummy.position.set(moved.x,moved.y,moved.z); dummy.updateMatrix();
    g.mesh.setMatrixAt(item.idx,dummy.matrix);
    g.positions.set(item.idx,moved);
    occupied.set(key(moved.x,moved.y,moved.z),{type:item.type,idx:item.idx});
  }
  g.positions.delete(last); g.count--; g.mesh.count=g.count; g.mesh.instanceMatrix.needsUpdate=true; occupied.delete(k);
  return true;
}
function buildWorld(){
  for(let x=-HALF;x<HALF;x++) for(let z=-HALF;z<HALF;z++){
    const h=heightAt(x,z), t=topType(x,z,h);
    const depth = Math.max(0,h-3);
    for(let y=depth;y<=h;y++) addBlock(x,y,z,y===h?t:(t===1?1:0));
    if(biomeAt(x,z)==='OASIS' && Math.random()<.045) palm(x,h+1,z);
  }
  for(let i=0;i<18;i++){
    const x=-8+(i%6)*4, z=8+Math.floor(i/6)*5;
    house(x,heightAt(x,z)+1,z,2+(i%3),i%2?5:6);
  }
  for(let z=-20;z<22;z+=2) for(let y=6;y<13;y++) addBlock(16,y,z,0);
}
function house(x,y,z,floors,type){
  const w=3,d=3,h=floors*3;
  for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++) for(let zz=0;zz<d;zz++){
    const wall=xx===0||xx===w-1||zz===0||zz===d-1;
    if(wall || yy===h-1) addBlock(x+xx,y+yy,z+zz,type);
  }
  if(floors>1) for(let yy=3;yy<h-1;yy+=3) for(let xx=0;xx<w;xx++) addBlock(x+xx,y+yy,z-1,4);
}
function palm(x,y,z){
  for(let i=0;i<5;i++) addBlock(x,y+i,z,4);
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) if(Math.abs(dx)+Math.abs(dz)<=3) addBlock(x+dx,y+5,z+dz,3);
}
buildWorld();

const waterMat=new THREE.MeshPhysicalMaterial({color:0x1b7e96,transparent:true,opacity:.64,roughness:.18,metalness:.05});
const water=new THREE.Mesh(new THREE.PlaneGeometry(90,45),waterMat);
water.rotation.x=-Math.PI/2;water.position.set(-35,2,-47);scene.add(water);

const beaconMat=new THREE.MeshBasicMaterial({color:0x69f0c8});
const beaconGeo=new THREE.CylinderGeometry(.13,.13,8,10);
[['AL-BALAD',-5,10],['TUWAIQ',16,0],['OASIS',2,-28],['HARRAT',0,30]].forEach(([name,x,z])=>{
 const h=heightAt(x,z),b=new THREE.Mesh(beaconGeo,beaconMat);b.position.set(x,h+5,z);scene.add(b);
});

let velocityY=0, canJump=false, paused=false, collected=0, placed=0;
const keys={};
let moveInput={x:0,y:0};
let touchYaw=0, touchPitch=0;
let playerGround=0;

addEventListener('keydown',e=>{
 keys[e.code]=true;
 if(/^Digit[1-7]$/.test(e.code))select(parseInt(e.code.slice(5))-1);
 if(e.code==='KeyP'){
   paused=!paused; pauseEl.style.display=paused?'flex':'none';
   if(paused && !IS_TOUCH) controls.unlock();
   if(!paused && !IS_TOUCH && gameActive) controls.lock();
 }
});
addEventListener('keyup',e=>keys[e.code]=false);

const raycaster=new THREE.Raycaster();
raycaster.far=6;
function pick(){
 raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
 let best=null;
 for(let t=0;t<groups.length;t++){
  const hits=raycaster.intersectObject(groups[t].mesh,false);
  if(hits.length && (!best||hits[0].distance<best.distance)){
    const p=groups[t].positions.get(hits[0].instanceId);
    if(p) best={...hits[0],p};
  }
 }
 return best;
}
function breakTarget(){
 const h=pick(); if(h&&removeBlock(h.p.x,h.p.y,h.p.z)){collected++;updateMission();return true} return false;
}
function placeTarget(){
 const h=pick(); if(!h)return false;
 const n=h.face.normal.clone();
 const nx=h.p.x+Math.round(n.x),ny=h.p.y+Math.round(n.y),nz=h.p.z+Math.round(n.z);
 const pp=camera.position;
 if(Math.abs(pp.x-nx)<.75 && Math.abs(pp.z-nz)<.75 && Math.abs((pp.y-1)-ny)<1.8) return false;
 if(addBlock(nx,ny,nz,selected)){placed++;updateMission();return true}
 return false;
}
renderer.domElement.addEventListener('mousedown',e=>{
 if(IS_TOUCH || !controls.isLocked || paused) return;
 if(e.button===0) breakTarget(); else if(e.button===2) placeTarget();
});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());

function updateMission(){
 if(collected<12) objective.innerHTML=`<b>FOUNDING MISSION // 001</b><div>اجمع الحجر: ${collected}/12</div>`;
 else if(placed<8) objective.innerHTML=`<b>FOUNDING MISSION // 002</b><div>ابنِ علامة من 8 كتل على الأقل: ${placed}/8</div>`;
 else objective.innerHTML=`<b>THE KINGDOM IS YOURS.</b><div>العالم مفتوح. استكشف الحجاز، نجد، الحرات، الواحة والربع الخالي.</div>`;
}

// ---------- Better voxel collision / ground ----------
const EYE_HEIGHT=1.62, PLAYER_RADIUS=.28, STEP=.55;
function blockExistsAtWorld(x,y,z){
 return occupied.has(key(Math.round(x),Math.round(y),Math.round(z)));
}
function highestSurfaceBelow(x,z,maxFoot){
 const gx=Math.round(x), gz=Math.round(z);
 let best=-Infinity;
 const ceiling=Math.min(45,Math.floor(maxFoot+STEP));
 for(let y=ceiling;y>=-2;y--){
   if(occupied.has(key(gx,y,gz))){
     best=y+.5; break;
   }
 }
 if(best===-Infinity) best=heightAt(gx,gz)+.5;
 return best;
}
function collidesBody(x,footY,z){
 const samples=[
   [x-PLAYER_RADIUS,z-PLAYER_RADIUS],[x+PLAYER_RADIUS,z-PLAYER_RADIUS],
   [x-PLAYER_RADIUS,z+PLAYER_RADIUS],[x+PLAYER_RADIUS,z+PLAYER_RADIUS]
 ];
 for(const [sx,sz] of samples){
   for(const by of [footY+.22, footY+.9, footY+1.48]){
     if(blockExistsAtWorld(sx,by,sz)) return true;
   }
 }
 return false;
}
function tryHorizontalMove(dx,dz){
 const footY=camera.position.y-EYE_HEIGHT;
 const nx=camera.position.x+dx, nz=camera.position.z+dz;
 // X and Z separately = much less "sticky" against walls.
 const testX=camera.position.x+dx;
 if(!collidesBody(testX,footY,camera.position.z)) camera.position.x=testX;
 const testZ=camera.position.z+dz;
 if(!collidesBody(camera.position.x,footY,testZ)) camera.position.z=testZ;
}
function snapOrFall(dt){
 let foot=camera.position.y-EYE_HEIGHT;
 const ground=highestSurfaceBelow(camera.position.x,camera.position.z,foot+.7);
 playerGround=ground;
 velocityY-=24*dt;
 foot += velocityY*dt;
 if(foot<=ground){
   foot=ground; velocityY=0; canJump=true;
 } else canJump=false;
 camera.position.y=foot+EYE_HEIGHT;
}

const startSurface=highestSurfaceBelow(0,0,100);
camera.position.set(0,startSurface+EYE_HEIGHT,0);
touchYaw=camera.rotation.y; touchPitch=camera.rotation.x;

const clock=new THREE.Clock();
let day=0.18;
function animate(){
 requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.035);
 if(!paused){
   day=(day+dt*.0025)%1;
   const ang=day*Math.PI*2-Math.PI*.1;
   sun.position.set(Math.cos(ang)*120,Math.sin(ang)*110,45);
   sun.intensity=Math.max(.15,Math.sin(ang)*3.0);
   const daylight=Math.max(.08,Math.sin(ang)*.75+.28);
   hemi.intensity=.45+daylight*1.65;
   const sky=new THREE.Color().setHSL(.56-daylight*.035,.28+.14*daylight,.11+.58*daylight);
   scene.background.copy(sky); scene.fog.color.copy(sky);

   const active = gameActive && (IS_TOUCH || controls.isLocked);
   if(active){
     let forward = Number(keys.KeyW||keys.ArrowUp)-Number(keys.KeyS||keys.ArrowDown);
     let side = Number(keys.KeyD||keys.ArrowRight)-Number(keys.KeyA||keys.ArrowLeft);
     if(IS_TOUCH){ forward = -moveInput.y; side = moveInput.x; }

     const len=Math.hypot(forward,side);
     if(len>1){forward/=len;side/=len}

     const sprint = IS_TOUCH ? len>.82 : (keys.ShiftLeft||keys.ShiftRight);
     const speed=sprint?6.9:4.45;

     const fwd=new THREE.Vector3();
     camera.getWorldDirection(fwd); fwd.y=0;
     if(fwd.lengthSq()<.001)fwd.set(0,0,-1); fwd.normalize();
     const right=new THREE.Vector3().crossVectors(fwd,new THREE.Vector3(0,1,0)).normalize();

     const dx=(fwd.x*forward + right.x*side)*speed*dt;
     const dz=(fwd.z*forward + right.z*side)*speed*dt;
     tryHorizontalMove(dx,dz);

     if(keys.Space && canJump){velocityY=8.4;canJump=false;keys.Space=false}
     snapOrFall(dt);
   }

   const x=camera.position.x,z=camera.position.z;
   posEl.textContent=`${x.toFixed(1)},${camera.position.y.toFixed(1)},${z.toFixed(1)}`;
   biomeEl.textContent=biomeAt(x,z);
 }
 renderer.render(scene,camera);
}
animate();

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

// ---------- iPhone / Android controls: no Pointer Lock dependency ----------
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function joystick(el, onMove){
 const knob=el.querySelector('.knob');
 let id=null, rect=null;
 const reset=()=>{id=null;rect=null;knob.style.transform='translate(-50%,-50%)';onMove(0,0)};
 const update=e=>{
   if(e.pointerId!==id||!rect)return;
   const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
   let dx=(e.clientX-cx)/(rect.width*.37), dy=(e.clientY-cy)/(rect.height*.37);
   const l=Math.hypot(dx,dy); if(l>1){dx/=l;dy/=l}
   knob.style.transform=`translate(calc(-50% + ${dx*30}px),calc(-50% + ${dy*30}px))`;
   onMove(dx,dy);
 };
 el.addEventListener('pointerdown',e=>{e.preventDefault();id=e.pointerId;rect=el.getBoundingClientRect();el.setPointerCapture(id);update(e)},{passive:false});
 el.addEventListener('pointermove',e=>{e.preventDefault();update(e)},{passive:false});
 el.addEventListener('pointerup',e=>{e.preventDefault();if(e.pointerId===id)reset()},{passive:false});
 el.addEventListener('pointercancel',reset);
}
function lookPad(el){
 const knob=el.querySelector('.knob');
 let id=null,last=null,rect=null;
 const reset=()=>{id=null;last=null;knob.style.transform='translate(-50%,-50%)'};
 el.addEventListener('pointerdown',e=>{
   e.preventDefault();id=e.pointerId;last={x:e.clientX,y:e.clientY};rect=el.getBoundingClientRect();el.setPointerCapture(id)
 },{passive:false});
 el.addEventListener('pointermove',e=>{
   if(e.pointerId!==id||!last)return;e.preventDefault();
   const dx=e.clientX-last.x,dy=e.clientY-last.y;last={x:e.clientX,y:e.clientY};
   touchYaw-=dx*.0065;touchPitch=clamp(touchPitch-dy*.0055,-1.42,1.42);
   camera.rotation.set(touchPitch,touchYaw,0,'YXZ');
   const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
   const kx=clamp((e.clientX-cx)*.32,-28,28),ky=clamp((e.clientY-cy)*.32,-28,28);
   knob.style.transform=`translate(calc(-50% + ${kx}px),calc(-50% + ${ky}px))`;
 },{passive:false});
 el.addEventListener('pointerup',e=>{e.preventDefault();if(e.pointerId===id)reset()},{passive:false});
 el.addEventListener('pointercancel',reset);
}

if(IS_TOUCH){
 qs('#mobile').style.display='block';
 qs('#intro .fine').textContent='الجوال: العصا اليسرى للحركة، اليمنى للنظر، ↑ للقفز، − للكسر، ＋ للبناء.';
 joystick(qs('#movePad'),(x,y)=>{moveInput.x=x;moveInput.y=y});
 lookPad(qs('#lookPad'));
 const hold=(el,fn)=>{
   el.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();fn()},{passive:false});
 };
 hold(qs('#jumpBtn'),()=>{ if(canJump){velocityY=8.4;canJump=false} });
 hold(qs('#breakBtn'),breakTarget);
 hold(qs('#placeBtn'),placeTarget);
 document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
}
