import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

const qs = s => document.querySelector(s);
const intro = qs('#intro'), startBtn = qs('#start'), pauseEl = qs('#pause');
const posEl=qs('#pos'), biomeEl=qs('#biome'), hotbar=qs('#hotbar'), objective=qs('#objective');

const SEED = 2030;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db7c1);
scene.fog = new THREE.FogExp2(0xc7b890, 0.0028);

const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 850);
camera.position.set(0, 18, 0);

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
document.body.prepend(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xcfe4ff,0x8c6843,2.0); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0ae,3.1);
sun.position.set(-90,120,55); sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-120;sun.shadow.camera.right=120;sun.shadow.camera.top=120;sun.shadow.camera.bottom=-120;
scene.add(sun);

const controls = new PointerLockControls(camera, renderer.domElement);
startBtn.onclick=()=>{intro.style.display='none'; controls.lock();};
renderer.domElement.addEventListener('click',()=>{ if(intro.style.display==='none' && !paused) controls.lock(); });

const BLOCK = 1;
const WORLD = 76;
const HALF = WORLD>>1;
const MAX_H=26;
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
  s.onclick=()=>select(i); hotbar.appendChild(s);
});
function select(i){selected=i;[...hotbar.children].forEach((e,j)=>e.classList.toggle('sel',j===i));}

const boxGeo = new THREE.BoxGeometry(1,1,1);
const mats = blockDefs.map(b=>new THREE.MeshStandardMaterial({color:b.c,roughness:.92,metalness:0}));
const groups = blockDefs.map((b,i)=> {
  const mesh=new THREE.InstancedMesh(boxGeo,mats[i],28000);
  mesh.castShadow=i!==1; mesh.receiveShadow=true; mesh.count=0; scene.add(mesh);
  return {mesh,count:0, free:[], positions:new Map()};
});

const occupied = new Map();
const key=(x,y,z)=>`${x}|${y}|${z}`;
const dummy = new THREE.Object3D();

function biomeAt(x,z){
  const d=Math.hypot(x*0.78,z*0.78);
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
  const k=key(x,y,z); if(occupied.has(k)) return;
  const g=groups[type], idx=g.count++;
  dummy.position.set(x,y,z); dummy.updateMatrix(); g.mesh.setMatrixAt(idx,dummy.matrix); g.mesh.count=g.count; g.mesh.instanceMatrix.needsUpdate=true;
  g.positions.set(idx,{x,y,z,type}); occupied.set(k,{type,idx});
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
  // Al-Balad inspired compact settlement: original architecture, not copied game assets
  for(let i=0;i<18;i++){
    const x=-8+(i%6)*4, z=8+Math.floor(i/6)*5;
    house(x,heightAt(x,z)+1,z,2+(i%3),i%2?5:6);
  }
  // Tuwaiq escarpment line
  for(let z=-20;z<22;z+=2) for(let y=6;y<13;y++) addBlock(16,y,z,0);
}
function house(x,y,z,floors,type){
  const w=3,d=3,h=floors*3;
  for(let yy=0;yy<h;yy++) for(let xx=0;xx<w;xx++) for(let zz=0;zz<d;zz++){
    const wall=xx===0||xx===w-1||zz===0||zz===d-1;
    if(wall || yy===h-1) addBlock(x+xx,y+yy,z+zz,type);
  }
  // roshan-like wooden protrusions, original voxel interpretation
  if(floors>1){
    for(let yy=3;yy<h-1;yy+=3) for(let xx=0;xx<w;xx++) addBlock(x+xx,y+yy,z-1,4);
  }
}
function palm(x,y,z){
  for(let i=0;i<5;i++) addBlock(x,y+i,z,4);
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) if(Math.abs(dx)+Math.abs(dz)<=3) addBlock(x+dx,y+5,z+dz,3);
}
buildWorld();

const waterMat=new THREE.MeshPhysicalMaterial({color:0x1b7e96,transparent:true,opacity:.64,roughness:.18,metalness:.05});
const water=new THREE.Mesh(new THREE.PlaneGeometry(90,45),waterMat);
water.rotation.x=-Math.PI/2;water.position.set(-35,2,-47);scene.add(water);

// Saudi-inspired points of discovery
const beaconMat=new THREE.MeshBasicMaterial({color:0x69f0c8});
const beaconGeo=new THREE.CylinderGeometry(.13,.13,8,10);
[['AL-BALAD',-5,10],['TUWAIQ',16,0],['OASIS',2,-28],['HARRAT',0,30]].forEach(([name,x,z])=>{
 const h=heightAt(x,z);const b=new THREE.Mesh(beaconGeo,beaconMat);b.position.set(x,h+5,z);scene.add(b);
});

let velocity=new THREE.Vector3(), direction=new THREE.Vector3();
let canJump=false, paused=false, collected=0, placed=0;
const keys={};
addEventListener('keydown',e=>{
 keys[e.code]=true;
 if(/^Digit[1-7]$/.test(e.code))select(parseInt(e.code.slice(5))-1);
 if(e.code==='KeyP'){paused=!paused;pauseEl.style.display=paused?'flex':'none'; if(paused)controls.unlock();}
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
renderer.domElement.addEventListener('mousedown',e=>{
 if(!controls.isLocked||paused) return;
 const h=pick(); if(!h)return;
 if(e.button===0){
  if(removeBlock(h.p.x,h.p.y,h.p.z)){collected++; updateMission();}
 } else if(e.button===2){
  const n=h.face.normal.clone();
  const nx=h.p.x+Math.round(n.x),ny=h.p.y+Math.round(n.y),nz=h.p.z+Math.round(n.z);
  const pp=camera.position;
  if(Math.abs(pp.x-nx)>.8||Math.abs(pp.y-ny)>1.8||Math.abs(pp.z-nz)>.8){addBlock(nx,ny,nz,selected);placed++;updateMission();}
 }
});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());

function updateMission(){
 if(collected<12) objective.innerHTML=`<b>FOUNDING MISSION // 001</b><div>اجمع الحجر: ${collected}/12</div>`;
 else if(placed<8) objective.innerHTML=`<b>FOUNDING MISSION // 002</b><div>ابنِ علامة من 8 كتل على الأقل: ${placed}/8</div>`;
 else objective.innerHTML=`<b>THE KINGDOM IS YOURS.</b><div>العالم مفتوح. استكشف الحجاز، نجد، الحرات، الواحة والربع الخالي.</div>`;
}

function groundHeight(x,z){
 return heightAt(Math.round(x),Math.round(z))+1.72;
}
camera.position.set(0,groundHeight(0,0)+1,0);

const clock=new THREE.Clock();
let day=0.18;
function animate(){
 requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.04);
 if(!paused){
   day=(day+dt*.0025)%1;
   const ang=day*Math.PI*2-Math.PI*.1;
   sun.position.set(Math.cos(ang)*120,Math.sin(ang)*110,45);
   sun.intensity=Math.max(.15,Math.sin(ang)*3.0);
   const daylight=Math.max(.08,Math.sin(ang)*.75+.28);
   hemi.intensity=.45+daylight*1.65;
   const sky=new THREE.Color().setHSL(.56-daylight*.035,.28+.14*daylight,.11+.58*daylight);
   scene.background.copy(sky); scene.fog.color.copy(sky);

   if(controls.isLocked){
     velocity.x-=velocity.x*10*dt; velocity.z-=velocity.z*10*dt;
     velocity.y-=24*dt;
     direction.z=Number(keys.KeyW||keys.ArrowUp)-Number(keys.KeyS||keys.ArrowDown);
     direction.x=Number(keys.KeyD||keys.ArrowRight)-Number(keys.KeyA||keys.ArrowLeft);
     direction.normalize();
     const sprint=keys.ShiftLeft||keys.ShiftRight;
     const speed=sprint?8.5:5.1;
     if(direction.z)velocity.z-=direction.z*speed*8*dt;
     if(direction.x)velocity.x-=direction.x*speed*8*dt;
     controls.moveRight(-velocity.x*dt);
     controls.moveForward(-velocity.z*dt);
     camera.position.y+=velocity.y*dt;
     const gy=groundHeight(camera.position.x,camera.position.z);
     if(camera.position.y<gy){camera.position.y=gy;velocity.y=0;canJump=true;}
     if(keys.Space&&canJump){velocity.y=9.3;canJump=false;keys.Space=false;}
   }
   const x=camera.position.x,z=camera.position.z;
   posEl.textContent=`${x.toFixed(1)},${camera.position.y.toFixed(1)},${z.toFixed(1)}`;
   biomeEl.textContent=biomeAt(x,z);
 }
 renderer.render(scene,camera);
}
animate();

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

// Minimal touch movement
let moveVec={x:0,y:0}, lookLast=null;
function pad(el, cb){
 let id=null,start=null;
 el.addEventListener('pointerdown',e=>{id=e.pointerId;start={x:e.clientX,y:e.clientY};el.setPointerCapture(id)});
 el.addEventListener('pointermove',e=>{if(e.pointerId!==id||!start)return;cb((e.clientX-start.x)/50,(e.clientY-start.y)/50,e)});
 el.addEventListener('pointerup',e=>{if(e.pointerId===id){id=null;start=null;cb(0,0,e)}});
}
if(matchMedia('(max-width:820px)').matches){
 qs('#intro .fine').textContent='استخدم دوائر اللمس للحركة والنظر، والأزرار للقفز والكسر والبناء.';
 pad(qs('#movePad'),(x,y)=>{keys.KeyW=y<-.25;keys.KeyS=y>.25;keys.KeyA=x<-.25;keys.KeyD=x>.25});
 pad(qs('#lookPad'),(x,y,e)=>{
   if(!controls.isLocked) controls.lock();
   camera.rotation.y-=x*.018; camera.rotation.x=Math.max(-1.4,Math.min(1.4,camera.rotation.x-y*.012));
 });
 qs('#jumpBtn').onclick=()=>{keys.Space=true};
 qs('#breakBtn').onclick=()=>{const h=pick();if(h&&removeBlock(h.p.x,h.p.y,h.p.z)){collected++;updateMission()}};
 qs('#placeBtn').onclick=()=>{const h=pick();if(h){const n=h.face.normal;addBlock(h.p.x+Math.round(n.x),h.p.y+Math.round(n.y),h.p.z+Math.round(n.z),selected);placed++;updateMission()}};
}
