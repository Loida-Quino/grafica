import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

/* ============================================================ 0. WEBGL CHECK ============================================================ */
function hasWebGL(){ try{ const c=document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl')||c.getContext('experimental-webgl'))); }catch(e){ return false; } }
if(!hasWebGL()){
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('webgl-fallback').classList.add('show');
  document.getElementById('wf-accesible').addEventListener('click', ()=> document.getElementById('accessible-view').classList.add('show'));
  document.getElementById('accessible-close').addEventListener('click', ()=> document.getElementById('accessible-view').classList.remove('show'));
  throw new Error('WebGL no disponible');
}

/* ============================================================ 1. ESTADO GLOBAL ============================================================ */
const MODE = { INTRO:'intro', ORBIT:'orbit', WALK:'walk', FLYING:'flying', INSPECT:'inspect' };
let mode = MODE.INTRO;
let dayMode = true;
let audioOn = false;
let firstWalk = true;
let firstOrbitTip = true;

// Punto de aparición (se actualiza con el empty "spawn_start" del GLB al cargar la plaza).
// Se usa ÚNICAMENTE para el modo caminar: es donde aparece el personaje cada vez que se
// entra a ese modo. El recorrido en órbita usa su propio encuadre fijo, independiente de esto.
let spawnPoint = new THREE.Vector3(0, 2, 0);

/* ====================== 2. ESCENA / CÁMARA / RENDERER ============================================================ */
const canvas = document.getElementById('app-canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fd3eb, 55, 165);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 2000);
camera.position.set(0, 30, 46);

const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

/* Cielo */
const sky = new Sky();
sky.scale.setScalar(2000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 3.2; skyU.rayleigh.value = 1.6; skyU.mieCoefficient.value = 0.0045; skyU.mieDirectionalG.value = 0.82;
const sunPos = new THREE.Vector3();
function setSun(elevationDeg, azimuthDeg){
  sunPos.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90-elevationDeg), THREE.MathUtils.degToRad(azimuthDeg));
  skyU.sunPosition.value.copy(sunPos);
  sun.position.copy(sunPos).multiplyScalar(120);
}

/* Nubes: sprites suaves, pocas, bien distribuidas — cielo diurno cinematográfico */
const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
const cloudTex = (()=>{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,0.95)'); g.addColorStop(0.5,'rgba(255,255,255,0.38)'); g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
})();
for(let i=0;i<14;i++){
  const puff = new THREE.Group();
  const blobs = 3 + Math.floor(Math.random()*3);
  for(let b=0;b<blobs;b++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map:cloudTex, transparent:true, opacity:0.5, depthWrite:false }));
    const sc = 24 + Math.random()*18;
    s.scale.set(sc, sc*0.52, 1);
    s.position.set((Math.random()-0.5)*32, (Math.random()-0.5)*4, (Math.random()-0.5)*10);
    puff.add(s);
  }
  const ang = (i/14)*Math.PI*2 + Math.random()*0.3;
  const rad = 130 + Math.random()*90;
  puff.position.set(Math.cos(ang)*rad, 58+Math.random()*28, Math.sin(ang)*rad);
  puff.userData.speed = 0.35 + Math.random()*0.35;
  cloudGroup.add(puff);
}

/* Luces día */
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0xb98a5a, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d6, 3.0);
sun.castShadow = true; sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera, {near:1, far:220, left:-45, right:45, top:45, bottom:-45});
sun.shadow.bias = -0.0004;
scene.add(sun);
const ambient = new THREE.AmbientLight(0xffffff, 0.25); scene.add(ambient);
setSun(48,135);

/* Luces nocturnas (focos estratégicos, pocas, no cientos) */
const nightLights = new THREE.Group(); scene.add(nightLights);
const moonLight = new THREE.DirectionalLight(0x9fb6ff, 0);
scene.add(moonLight);

/* Luna visible: disco + halo suave, siempre en el punto opuesto al sol de noche */
const moonGroup = new THREE.Group();
const moonPos = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90-42), THREE.MathUtils.degToRad(-55)).multiplyScalar(650);
moonGroup.position.copy(moonPos);
const moonDisc = new THREE.Mesh(
  new THREE.SphereGeometry(9, 24, 24),
  new THREE.MeshBasicMaterial({ color:0xeef3ff, transparent:true, opacity:0 })
);
moonGroup.add(moonDisc);
const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
  color:0xbcd0ff, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending
}));
moonHalo.scale.set(46,46,1);
moonGroup.add(moonHalo);
scene.add(moonGroup);
moonLight.position.copy(moonPos);
moonLight.target.position.set(0,0,0);
scene.add(moonLight.target);

/* Campo de estrellas discreto — pocas, elegantes, solo visibles de noche */
const starCount = 340;
const starPositions = new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){
  const r = 900;
  const theta = Math.random()*Math.PI*2;
  const phi = Math.acos(THREE.MathUtils.lerp(0.05, 0.92, Math.random())); // evita el horizonte bajo
  starPositions[i*3] = r*Math.sin(phi)*Math.cos(theta);
  starPositions[i*3+1] = Math.abs(r*Math.cos(phi));
  starPositions[i*3+2] = r*Math.sin(phi)*Math.sin(theta);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions,3));
const starMat = new THREE.PointsMaterial({ color:0xffffff, size:1.6, sizeAttenuation:false, transparent:true, opacity:0, depthWrite:false });
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

/* Suelo de respaldo */
const floor = new THREE.Mesh(new THREE.CircleGeometry(60,48), new THREE.MeshStandardMaterial({color:0xb7b4ad, roughness:.95}));
floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);

/* ============================================================ 3. ORBIT CONTROLS ============================================================ */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
orbit.enableDamping = true; orbit.dampingFactor = 0.12;
orbit.rotateSpeed = 1.55;
orbit.zoomSpeed = 1.35;
orbit.panSpeed = 1.2;
orbit.minDistance = 4; orbit.maxDistance = 80;
orbit.maxPolarAngle = Math.PI/2.08;
orbit.target.set(0,2,0);

/* Desplazamiento libre con WASD mientras se orbita: traslada cámara + objetivo juntos */
const ORBIT_LIMIT = 30;
const ORBIT_SPEED = 11, ORBIT_RUN = 20;
const _ofwd = new THREE.Vector3(), _oright = new THREE.Vector3(), _oup = new THREE.Vector3(0,1,0);
function updateOrbitPan(dt){
  if(mode!==MODE.ORBIT) return;
  _ofwd.subVectors(orbit.target, camera.position); _ofwd.y = 0;
  if(_ofwd.lengthSq() < 1e-6) _ofwd.set(0,0,-1); else _ofwd.normalize();
  _oright.crossVectors(_ofwd, _oup).normalize();

  let ix=0, iz=0;
  if(keys['KeyW']){ ix+=_ofwd.x; iz+=_ofwd.z; }
  if(keys['KeyS']){ ix-=_ofwd.x; iz-=_ofwd.z; }
  if(keys['KeyA']){ ix-=_oright.x; iz-=_oright.z; }
  if(keys['KeyD']){ ix+=_oright.x; iz+=_oright.z; }
  if(ix===0 && iz===0) return;

  const len = Math.hypot(ix,iz);
  ix/=len; iz/=len;
  const speed = (keys['ShiftLeft']||keys['ShiftRight']) ? ORBIT_RUN : ORBIT_SPEED;
  let nx = orbit.target.x + ix*speed*dt;
  let nz = orbit.target.z + iz*speed*dt;
  nx = THREE.MathUtils.clamp(nx, -ORBIT_LIMIT, ORBIT_LIMIT);
  nz = THREE.MathUtils.clamp(nz, -ORBIT_LIMIT, ORBIT_LIMIT);
  const dx = nx - orbit.target.x, dz = nz - orbit.target.z;
  orbit.target.x = nx; orbit.target.z = nz;
  camera.position.x += dx; camera.position.z += dz;
}

/* ============================================================ 4. CARGA ÚNICA DEL GLB ============================================================ */
const loFill = document.getElementById('lo-fill'), loPct = document.getElementById('lo-pct');
const loaderEl = document.getElementById('loader'), loErr = document.getElementById('lo-err');

const draco = new DRACOLoader();
draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);

const MONUMENT_NAMES = ['estatua_fermin_lopez','estatua_fermin_lopez1','estatua_juan_lechin','estatua_pantaleon_dalence','estatua_simon_bolivar','estatua_simon_bolivar1','monumento_casco_minero'];
const interactables = {}; // name -> {object, title}
const colliders = []; // {center:Vector3, radius} — colisión "circular" (monumentos)
const boxColliders = []; // Box3[] — colisión rígida (piso / piso1): el personaje no puede atravesarlos
let plazaRoot = null;

gltfLoader.load('./proyecto_plaza.glb', (gltf)=>{
  plazaRoot = gltf.scene;
  plazaRoot.traverse(o=>{
    if(o.isMesh){
      o.castShadow=true; o.receiveShadow=true;
      const m = o.material;
      if(m && m.isMeshStandardMaterial){
        if(m.roughness===undefined || m.roughness>0.96) m.roughness = 0.9;
        m.envMapIntensity = 1.15;
      }
    }
  });
  scene.add(plazaRoot);
  floor.visible = false;

  MONUMENT_NAMES.forEach(name=>{
    const obj = plazaRoot.getObjectByName(name);
    if(obj){
      interactables[name] = { object:obj, title: monumentInfo[name]?.title || name };
      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      colliders.push({ center, radius: Math.max(size.x,size.z)*0.45 + 0.45 });
      console.log('✓ '+name+' encontrada');
      if(dayMode===false){} // noop
    } else {
      console.warn('WARNING: no se encontró el nodo "'+name+'" en el GLB.');
    }
  });

  // ---- Colisión rígida: "piso" / "piso1" — el personaje no puede atravesarlos ----
  ['piso','piso1'].forEach(name=>{
    const obj = plazaRoot.getObjectByName(name);
    if(obj){
      const box = new THREE.Box3().setFromObject(obj);
      boxColliders.push(box);
      console.log('✓ colisión registrada para "'+name+'"');
    } else {
      console.warn('WARNING: no se encontró el nodo "'+name+'" para colisión.');
    }
  });

  // ---- Punto de aparición: empty "spawn_start" ----
  const spawnEmpty = plazaRoot.getObjectByName('spawn_start');
  if(spawnEmpty){
    spawnEmpty.getWorldPosition(spawnPoint);
    playerPos.set(spawnPoint.x, 0, spawnPoint.z);
    if(character) character.position.set(spawnPoint.x, 0, spawnPoint.z);
  } else {
    console.warn('WARNING: no se encontró el empty "spawn_start" en el GLB. Se usa (0,2,0) por defecto.');
  }

  // ---- Banderas: efecto de viento (ver sección 4c) ----
  // Tus banderas son grupos "ban_bolivia", "ban_huanuni", "ban_oruro", "ban_wipala" que
  // contienen el mesh real adentro (con nombres genéricos como "Plane.048" o "bandera_oruro").
  plazaRoot.traverse(o=>{
    if(FLAG_NAME_PATTERN.test(o.name)){
      let flagMesh = o.isMesh ? o : null;
      if(!flagMesh) o.traverse(child=>{ if(!flagMesh && child.isMesh) flagMesh = child; });
      if(flagMesh){
        setupFlag(flagMesh);
        console.log('✓ bandera con viento: '+o.name+' -> '+flagMesh.name);
      } else {
        console.warn('WARNING: "'+o.name+'" coincide con el patrón de banderas pero no tiene ningún mesh adentro.');
      }
    }
  });
  if(flagMeshes.length===0){
    console.warn('No se encontró ninguna bandera con el patrón /^ban_/i. Ajusta FLAG_NAME_PATTERN en el script con el nombre real de tus objetos.');
  }

  buildHotspots();
  buildNightLights();
  onLoadComplete();
}, (xhr)=>{
  if(xhr.total){ const pct = Math.min(100, Math.round((xhr.loaded/xhr.total)*100)); loFill.style.width=pct+'%'; loPct.textContent=pct+'%'; }
}, (err)=>{ console.error('Error cargando proyecto_plaza.glb', err); loErr.style.display='block'; });

function onLoadComplete(){ setTimeout(()=>{ loaderEl.classList.add('hidden'); startIntro(); }, 200); }

/* ============================================================ 4b. PERSONAJE (SOLO VISIBLE EN MODO CAMINAR) ============================================================ */
// Ajusta esta ruta al nombre real de tu archivo si es distinto.
const CHARACTER_GLB_PATH = './personaje.glb';
// Si tu modelo no "mira" hacia +Z de fábrica, corrige aquí la rotación base (en radianes).
// Ejemplos: Math.PI si mira hacia -Z, Math.PI/2 o -Math.PI/2 si mira hacia +X/-X.
const CHARACTER_YAW_OFFSET = 0;

let character = null;
let characterMixer = null;
let walkAction = null;

function isDescendantOf(obj, root){
  let o = obj;
  while(o){ if(o===root) return true; o = o.parent; }
  return false;
}

const characterLoader = new GLTFLoader();
characterLoader.setDRACOLoader(draco);
characterLoader.load(CHARACTER_GLB_PATH, (gltf)=>{
  character = gltf.scene;
  character.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  character.visible = false; // solo se muestra al entrar en modo caminar
  character.position.set(spawnPoint.x, 0, spawnPoint.z);
  character.rotation.y = CHARACTER_YAW_OFFSET;
  scene.add(character);

  if(gltf.animations && gltf.animations.length){
    characterMixer = new THREE.AnimationMixer(character);
    // Si el archivo trae varios clips, se prioriza uno con "walk"/"camin" en el nombre; si solo hay uno (tu caso), se usa ese.
    const walkClip = gltf.animations.find(a=> /walk|camin/i.test(a.name)) || gltf.animations[0];
    walkAction = characterMixer.clipAction(walkClip);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
    walkAction.play();
    // Nota: el mixer solo se actualiza (avanza) cuando el personaje realmente se mueve (ver updateWalk),
    // así la animación queda "congelada" mientras no se presiona W/A/S/D.
  } else {
    console.warn('El personaje.glb no trae animaciones incluidas.');
  }
}, undefined, (err)=> console.warn('No se pudo cargar '+CHARACTER_GLB_PATH+' (verifica que esté en la misma carpeta del proyecto).', err));

/* ============================================================ 4c. BANDERAS — efecto de viento (deformación de vértices) ============================================================ */
// Tus banderas son los grupos "ban_bolivia", "ban_huanuni", "ban_oruro", "ban_wipala" (según tu outliner).
// Si agregas más banderas y las nombras distinto, ajusta este patrón.
const FLAG_NAME_PATTERN = /^ban_/i;

const flagMeshes = []; // datos por bandera: geometría base + ejes detectados
const AXIS_IDX = { x:0, y:1, z:2 };
const WIND_SPEED = 2.4;      // velocidad de la ondulación
const WIND_FREQ = 3.2;       // qué tan "arrugada"/ondulada se ve a lo largo del asta a la punta
const WIND_AMPLITUDE = 0.16; // qué tanto se infla la tela (ajusta según la escala real de tus banderas)

function setupFlag(mesh){
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const size = { x: box.max.x-box.min.x, y: box.max.y-box.min.y, z: box.max.z-box.min.z };

  // El eje más delgado de la bandera = dirección "normal" del paño (hacia donde se infla con el viento).
  // El eje más largo = el que se aleja del asta (donde ondea más). El restante = alto de la bandera.
  const axes = ['x','y','z'].sort((a,b)=> size[a]-size[b]);
  const normalAxis = axes[0], heightAxis = axes[1], flapAxis = axes[2];

  const posAttr = geo.attributes.position;
  const basePositions = Float32Array.from(posAttr.array); // copia de las posiciones originales (sin deformar)
  geo.setAttribute('position', new THREE.BufferAttribute(posAttr.array.slice(), 3).setUsage(THREE.DynamicDrawUsage));

  const flapMin = box.min[flapAxis], flapMax = box.max[flapAxis];
  // Se asume que el asta está en el extremo del eje "flapAxis" más cercano al origen local del mesh (0).
  // Si tu bandera ondea "al revés" (se mueve más cerca del asta que en la punta), invierte esta condición.
  const attachEdge = Math.abs(flapMin) < Math.abs(flapMax) ? flapMin : flapMax;
  const otherEdge = attachEdge===flapMin ? flapMax : flapMin;

  flagMeshes.push({ mesh, basePositions, normalAxis, flapAxis, heightAxis, attachEdge, otherEdge, phase: Math.random()*10 });
}

function updateFlags(t){
  flagMeshes.forEach(f=>{
    const { mesh, basePositions, normalAxis, flapAxis, heightAxis, attachEdge, otherEdge, phase } = f;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const ni = AXIS_IDX[normalAxis], fi = AXIS_IDX[flapAxis], hi = AXIS_IDX[heightAxis];
    const span = (otherEdge-attachEdge) || 1;

    for(let i=0;i<pos.count;i++){
      const bx = basePositions[i*3], by = basePositions[i*3+1], bz = basePositions[i*3+2];
      const comp = [bx,by,bz];
      const flapVal = comp[fi], heightVal = comp[hi];
      let tt = (flapVal-attachEdge)/span; tt = THREE.MathUtils.clamp(tt,0,1);
      // Cerca del asta (tt≈0) casi no se mueve; en la punta (tt≈1) ondea mucho más.
      const wave = Math.sin(t*WIND_SPEED + phase + tt*WIND_FREQ*Math.PI + heightVal*0.8);
      const amp = WIND_AMPLITUDE * Math.pow(tt, 1.3);
      comp[ni] += wave*amp;
      pos.setXYZ(i, comp[0], comp[1], comp[2]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
}

/* ============================================================ 5. FOCOS NOCTURNOS ESTRATÉGICOS ============================================================ */
function buildNightLights(){
  // Un foco por monumento (museo nocturno)
  Object.entries(interactables).forEach(([name, {object}])=>{
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    const spot = new THREE.SpotLight(0xffe3ad, 0, 22, Math.PI/6, 0.5, 1.4);
    spot.position.set(center.x + size.x*0.9 + 1.5, center.y + size.y + 2.5, center.z + size.z*0.9 + 1.5);
    spot.target.position.copy(center);
    spot.castShadow = false;
    nightLights.add(spot, spot.target);

    // Protagonismo extra para el casco minero: foco frontal + lateral suave,
    // para que sea el punto visual más atractivo de la plaza de noche.
    if(name==='monumento_casco_minero'){
      const front = new THREE.SpotLight(0xffedc4, 0, 26, Math.PI/5, 0.45, 1.3);
      front.position.set(center.x, center.y + size.y*0.55, center.z + size.z*1.1 + 3);
      front.target.position.copy(center);
      front.castShadow = false;
      nightLights.add(front, front.target);

      const rim = new THREE.PointLight(0xa9c8ff, 0, 14, 2);
      rim.position.set(center.x - size.x*0.8, center.y + size.y*0.7, center.z - size.z*0.8);
      nightLights.add(rim);
    }
  });
  // Luces cálidas discretas de camino (pocas, no cientos)
  const pathPositions = [ [10,0,10], [-10,0,10], [10,0,-10], [-10,0,-10] ];
  pathPositions.forEach(p=>{
    const pl = new THREE.PointLight(0xffb066, 0, 9, 2);
    pl.position.set(p[0], 1.6, p[2]);
    nightLights.add(pl);
  });
}

/* ============================================================ 6. CONTENIDO HISTÓRICO POR MONUMENTO ============================================================ */
const monumentInfo = {
  monumento_casco_minero:{ eyebrow:'El casco minero con la Virgen del Rosario', title:'Casco Minero',
    body:`<p>El elemento central de la plaza es un gran casco minero monumental que simboliza el trabajo, el esfuerzo y la identidad de Huanuni. Su estructura protege el espacio público como una metáfora del resguardo que la minería ha brindado históricamente a la comunidad.</p>
    <p>En su parte superior destaca la imagen de la Virgen del Rosario, expresión de la fe que acompaña a los trabajadores en cada jornada bajo tierra, integrando los colores y símbolos característicos del distrito minero.</p>` },
  estatua_simon_bolivar:{ eyebrow:'Libertador de América · 1783–1830', title:'Simón Bolívar',
    body:`<p>Simón Bolívar fue uno de los principales líderes de la independencia sudamericana. Nacido en Caracas, encabezó campañas militares que contribuyeron a la liberación de Venezuela, Colombia, Ecuador, Perú y el Alto Perú del dominio español.</p>
    <p>En 1825, tras la independencia del Alto Perú, el nuevo Estado adoptó el nombre de Bolivia en su honor. El busto lo representa con uniforme militar, charreteras y adornos de laurel.</p>` },
  estatua_simon_bolivar1:{ eyebrow:'Libertador de América · 1783–1830', title:'Simón Bolívar',
    body:`<p>Simón Bolívar fue uno de los principales líderes de la independencia sudamericana. Nacido en Caracas, encabezó campañas militares que contribuyeron a la liberación de Venezuela, Colombia, Ecuador, Perú y el Alto Perú del dominio español.</p>
    <p>En 1825, tras la independencia del Alto Perú, el nuevo Estado adoptó el nombre de Bolivia en su honor. El busto lo representa con uniforme militar, charreteras y adornos de laurel.</p>` },
    estatua_fermin_lopez:{ eyebrow:'Pionero de la minería de Huanuni · 1863–1934', title:'Fermín López Téllez',
    body:`<p>Fermín López Téllez fue un destacado dirigente minero de Huanuni, reconocido por su compromiso con la defensa de los derechos de los trabajadores y su liderazgo dentro del movimiento sindical.</p>
    <p>El busto instalado en la plaza que lleva su nombre constituye un homenaje a su legado y al aporte de los trabajadores mineros en la historia del municipio.</p>` },
    estatua_fermin_lopez1:{ eyebrow:'Pionero de la minería de Huanuni · 1863–1934', title:'Fermín López Téllez',
    body:`<p>Fermín López Téllez fue un destacado dirigente minero de Huanuni, reconocido por su compromiso con la defensa de los derechos de los trabajadores y su liderazgo dentro del movimiento sindical.</p>
    <p>El busto instalado en la plaza que lleva su nombre constituye un homenaje a su legado y al aporte de los trabajadores mineros en la historia del municipio.</p>` },
  
    estatua_pantaleon_dalence:{ eyebrow:'Padre de la Justicia Boliviana · 1815–1892', title:'Pantaleón Dalence Jiménez',
    body:`<p>Jurista y estadista boliviano nacido en Oruro. Se desempeñó como Presidente de la Corte Suprema de Justicia, Ministro de Hacienda y Prefecto de varios departamentos, reconocido como el Padre de la Justicia Boliviana.</p>
    <p>La provincia cuya capital es Huanuni lleva su nombre en reconocimiento a su aporte a la historia nacional.</p>` },
  estatua_juan_lechin:{ eyebrow:'Líder sindical · Secretario ejecutivo de la COB y la FSTMB', title:'Juan Lechín Oquendo',
    body:`<p>Durante más de cuatro décadas fue la voz más influyente del sindicalismo minero boliviano, como Secretario Ejecutivo de la Central Obrera Boliviana (COB) y de la Federación Sindical de Trabajadores Mineros de Bolivia (FSTMB).</p>
    <div class="p-quote">"El fusil es la única garantía de libertad y la revolución permanente."<cite>Juan Lechín Oquendo — placa conmemorativa, Huanuni, diciembre de 2003</cite></div>
    <p>El monumento fue develado en Huanuni por dirigentes de la FSTMB: Hebert Choque T. (secretario general), Nelson Guevara A. (secretario permanente) y Leonidas Granadino V. (secretario de organización).</p>` }
};

/* ===== CONFIGURACIÓN DE MONUMENTOS (EXCLUSIVA del VISOR de inspección) =====
   No afecta la posición/escala/rotación del monumento dentro de la plaza.
   Editar aquí para ajustar cada pieza individualmente. */
const INSPECTION_CONFIG = {
  estatua_fermin_lopez:      { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  estatua_fermin_lopez1:      { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  estatua_juan_lechin:       { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1,    cameraHeightOffset:0 },
  estatua_pantaleon_dalence: { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1,    cameraHeightOffset:0 },
  estatua_simon_bolivar:     { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  estatua_simon_bolivar1:     { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  monumento_casco_minero:    { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:0.85, cameraDistanceMultiplier:1.15, cameraHeightOffset:0.1 }
};

/* ============================================================ 7. INTRO CINEMATOGRÁFICA ============================================================ */
let introClock = new THREE.Clock(false);
const INTRO_DURATION = 3.4;
let introCurve=null, introLookCurve=null;
function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
function buildIntroCurve(){
  introCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,34,50), new THREE.Vector3(22,18,20), new THREE.Vector3(12,8,-9),
    new THREE.Vector3(-14,6,-12), new THREE.Vector3(-8,6,10), new THREE.Vector3(0,8,18)
  ]);
  introLookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,2,0), new THREE.Vector3(2,2,0), new THREE.Vector3(0,2,-2),
    new THREE.Vector3(-2,2,0), new THREE.Vector3(0,2,2), new THREE.Vector3(0,2,0)
  ]);
}
function startIntro(){
  buildIntroCurve(); mode = MODE.INTRO; orbit.enabled=false; introClock.start();
  document.getElementById('intro-hint').classList.add('show');
}
function updateIntro(){
  const t = Math.min(introClock.getElapsedTime()/INTRO_DURATION, 1);
  const et = easeInOutCubic(t);
  camera.position.copy(introCurve.getPointAt(et));
  camera.lookAt(introLookCurve.getPointAt(et));
  if(t>=1) finishIntro();
}
function finishIntro(){
  mode = MODE.ORBIT; orbit.enabled = true; orbit.target.set(0,2,0);
  camera.position.set(0,9,20); orbit.update();
  document.getElementById('hud').classList.add('show');
  document.getElementById('intro-hint').classList.remove('show');
  if(firstOrbitTip){
    firstOrbitTip = false;
    const tip = document.getElementById('orbit-tip');
    tip.classList.add('show');
    setTimeout(()=> tip.classList.remove('show'), 4200);
  }
  showWelcomeText();
}
canvas.addEventListener('pointerdown', ()=>{ if(mode===MODE.INTRO) finishIntro(); });

/* ============================================================ 7b. TEXTO DE BIENVENIDA 3D ============================================================ */
let welcomeFont = null;
new FontLoader().load(
  'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
  (font)=>{ welcomeFont = font; },
  undefined,
  (err)=> console.warn('No se pudo cargar la fuente para el texto de bienvenida', err)
);

let welcomeGroup = null;
let welcomeRAF = null;

function buildWelcomeTextMesh(text, size, color){
  const geo = new TextGeometry(text, {
    font: welcomeFont,
    size,
    height: size*0.14,
    curveSegments: 6,
    bevelEnabled: true,
    bevelThickness: size*0.02,
    bevelSize: size*0.012,
    bevelSegments: 2
  });
  geo.computeBoundingBox();
  const w = geo.boundingBox.max.x - geo.boundingBox.min.x;
  geo.translate(-w/2, 0, 0);
  const mat = new THREE.MeshStandardMaterial({
    color, metalness:0.35, roughness:0.32,
    emissive:color, emissiveIntensity:0.35,
    transparent:true, opacity:0
  });
  return new THREE.Mesh(geo, mat);
}

function showWelcomeText(){
  // Si la fuente todavía no cargó (conexión lenta), reintenta en breve.
  if(!welcomeFont){ setTimeout(showWelcomeText, 150); return; }
  if(welcomeGroup) return; // ya se está mostrando

  welcomeGroup = new THREE.Group();
  const title = buildWelcomeTextMesh('BIENVENIDO AL RECORRIDO 3D', 1, 0xffcc66);
  const subtitle = buildWelcomeTextMesh('Plaza Principal Fermin Lopez - Huanuni', 0.5, 0xff4a76a8);
  title.position.y = 1;
  subtitle.position.y = 0;
  welcomeGroup.add(title, subtitle);
  // Se ubica flotando frente a la cámara inicial de órbita (0,9,20) mirando a (0,2,0)
  welcomeGroup.position.set(0, 6.2, 8);
  welcomeGroup.userData.meshes = [title, subtitle];
  scene.add(welcomeGroup);

  const t0 = performance.now();
  const FADE_IN = 900, HOLD = 2800, FADE_OUT = 900;

  function step(){
    if(!welcomeGroup) return;
    const el = performance.now() - t0;
    let opacity = 0, scale = 1;
    if(el < FADE_IN){
      const p = el/FADE_IN;
      opacity = p; scale = THREE.MathUtils.lerp(0.7, 1, easeInOutCubic(p));
    } else if(el < FADE_IN+HOLD){
      opacity = 1; scale = 1;
    } else if(el < FADE_IN+HOLD+FADE_OUT){
      const p = (el-FADE_IN-HOLD)/FADE_OUT;
      opacity = 1-p; scale = THREE.MathUtils.lerp(1, 1.08, p);
    } else {
      disposeWelcomeText();
      return;
    }
    welcomeGroup.scale.setScalar(scale);
    welcomeGroup.userData.meshes.forEach(m=> m.material.opacity = opacity);
    welcomeRAF = requestAnimationFrame(step);
  }
  step();
}

function disposeWelcomeText(){
  if(welcomeRAF){ cancelAnimationFrame(welcomeRAF); welcomeRAF=null; }
  if(!welcomeGroup) return;
  welcomeGroup.userData.meshes.forEach(m=>{ m.geometry.dispose(); m.material.dispose(); });
  scene.remove(welcomeGroup);
  welcomeGroup = null;
}

/* ============================================================ 8. DÍA / NOCHE ============================================================ */
const btnDayNight = document.getElementById('btn-daynight');
function setDayNight(isDay){
  dayMode = isDay;
  btnDayNight.textContent = isDay ? '☀' : '☾';
  btnDayNight.setAttribute('aria-label', isDay ? 'Cambiar a modo noche' : 'Cambiar a modo día');
  const targets = {
    turbidity: isDay?2.6:0.42, rayleigh: isDay?1.9:0.28, elevation: isDay?48:-6,
    hemi: isDay?1.1:0.24, sunI: isDay?3.35:0.06, ambI: isDay?0.32:0.16, exposure: isDay?1.15:0.78,
    spot: isDay?0:1.8, pathL: isDay?0:0.95, moon: isDay?0:0.4, moonOpacity: isDay?0:0.95,
    haloOpacity: isDay?0:0.5, starOpacity: isDay?0:0.85, sunSpriteOpacity: isDay?0.9:0, cloudOpacity: isDay?0.5:0.12
  };
  const start = { turbidity:skyU.turbidity.value, rayleigh:skyU.rayleigh.value, hemi:hemi.intensity, sunI:sun.intensity,
    ambI:ambient.intensity, exposure:renderer.toneMappingExposure, starOpacity:starMat.opacity,
    moonOpacity:moonDisc.material.opacity, haloOpacity:moonHalo.material.opacity,
    cloudOpacity: cloudGroup.children[0]?.children[0]?.material.opacity || 0.5 };
  const t0 = performance.now(), dur=2600; // transición cinematográfica ~2.6s
  const spots = nightLights.children.filter(c=>c.isSpotLight);
  const points = nightLights.children.filter(c=>c.isPointLight);
  const startSpot = spots[0]?.intensity||0, startPath = points[0]?.intensity||0, startMoon = moonLight.intensity;
  function step(){
    const p = Math.min((performance.now()-t0)/dur, 1);
    const ep = easeInOutCubic(p);
    skyU.turbidity.value = THREE.MathUtils.lerp(start.turbidity, targets.turbidity, ep);
    skyU.rayleigh.value = THREE.MathUtils.lerp(start.rayleigh, targets.rayleigh, ep);
    hemi.intensity = THREE.MathUtils.lerp(start.hemi, targets.hemi, ep);
    sun.intensity = THREE.MathUtils.lerp(start.sunI, targets.sunI, ep);
    ambient.intensity = THREE.MathUtils.lerp(start.ambI, targets.ambI, ep);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(start.exposure, targets.exposure, ep);
    moonLight.intensity = THREE.MathUtils.lerp(startMoon, targets.moon, ep);
    starMat.opacity = THREE.MathUtils.lerp(start.starOpacity, targets.starOpacity, ep);
    moonDisc.material.opacity = THREE.MathUtils.lerp(start.moonOpacity, targets.moonOpacity, ep);
    moonHalo.material.opacity = THREE.MathUtils.lerp(start.haloOpacity, targets.haloOpacity, ep);
    const co = THREE.MathUtils.lerp(start.cloudOpacity, targets.cloudOpacity, ep);
    cloudGroup.children.forEach(puff=> puff.children.forEach(s=> s.material.opacity = co));
    setSun(THREE.MathUtils.lerp(isDay?20:48, targets.elevation, ep), 135);
    spots.forEach(s=> s.intensity = THREE.MathUtils.lerp(startSpot, targets.spot, ep));
    points.forEach(pt=> pt.intensity = THREE.MathUtils.lerp(startPath, targets.pathL, ep));
    if(p<1) requestAnimationFrame(step);
  }
  step();
}
btnDayNight.addEventListener('click', ()=> setDayNight(!dayMode));

/* ============================================================ 9. RAYCASTING ROBUSTO — findInteractiveRoot ============================================================ */
function findInteractiveRoot(object){
  let o = object;
  while(o){
    if(o.name && interactables[o.name]) return o.name;
    o = o.parent;
  }
  return null;
}
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
const emissiveCache = new Map();
function applyHover(mesh, on){
  if(!mesh || !mesh.material || !mesh.material.emissive) return;
  if(on){
    if(!emissiveCache.has(mesh)) emissiveCache.set(mesh, mesh.material.emissive.getHex());
    mesh.material.emissive.setHex(0x5a4415); mesh.material.emissiveIntensity = 0.9;
  } else if(emissiveCache.has(mesh)){
    mesh.material.emissive.setHex(emissiveCache.get(mesh)); mesh.material.emissiveIntensity = 0.0;
  }
}
function raycastFromScreen(nx, ny){
  pointer.set(nx, ny);
  raycaster.setFromCamera(pointer, camera);
  const hits = [];
  // Se excluye al personaje del raycast para que no bloquee la selección de monumentos en 3ª persona.
  scene.traverse(o=>{ if(o.isMesh && !(character && isDescendantOf(o, character))) hits.push(o); });
  const inter = raycaster.intersectObjects(hits, false);
  for(const h of inter){
    const name = findInteractiveRoot(h.object);
    if(name) return { name, mesh:h.object };
  }
  return null;
}
canvas.addEventListener('pointermove', (e)=>{
  if(mode!==MODE.ORBIT) return;
  const nx = (e.clientX/window.innerWidth)*2-1, ny = -(e.clientY/window.innerHeight)*2+1;
  const hit = raycastFromScreen(nx, ny);
  if(hit){
    if(hovered!==hit.mesh){ if(hovered) applyHover(hovered,false); hovered=hit.mesh; applyHover(hovered,true); }
    canvas.style.cursor='pointer';
  } else { if(hovered){ applyHover(hovered,false); hovered=null; } canvas.style.cursor='default'; }
});
canvas.addEventListener('click', (e)=>{
  if(mode!==MODE.ORBIT) return;
  const nx = (e.clientX/window.innerWidth)*2-1, ny = -(e.clientY/window.innerHeight)*2+1;
  const hit = raycastFromScreen(nx, ny);
  if(hit) openInspection(hit.name);
});

/* ============================================================ 10. SISTEMA DE INSPECCIÓN — cámara automática vía Box3 ============================================================ */
let savedCamera = null;
function calculateInspectionCamera(object){
  const box = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3(); box.getCenter(center);
  const size = new THREE.Vector3(); box.getSize(size);
  const plazaCenter = new THREE.Vector3(0,0,0);
  let dir = new THREE.Vector3().subVectors(center, plazaCenter); dir.y = 0;
  if(dir.lengthSq() < 0.02) dir.set(0,0,1);
  dir.normalize();
  const horizontal = Math.max(size.x, size.z);
  const distance = Math.max(4.5, horizontal*1.7 + size.y*0.55);
  const camPos = center.clone().add(dir.multiplyScalar(distance));
  camPos.y = box.min.y + size.y*0.38;
  const lookAt = new THREE.Vector3(center.x, box.min.y + size.y*0.55, center.z);
  return { camPos, lookAt, center, size };
}

function flyCameraTo(targetPos, targetLook, duration, onDone){
  const startPos = camera.position.clone();
  const startLook = mode===MODE.WALK ? getWalkLookPoint() : orbit.target.clone();
  const t0 = performance.now();
  function step(){
    const p = Math.min((performance.now()-t0)/(duration*1000), 1);
    const ep = easeInOutCubic(p);
    camera.position.lerpVectors(startPos, targetPos, ep);
    const look = new THREE.Vector3().lerpVectors(startLook, targetLook, ep);
    camera.lookAt(look);
    if(p<1) requestAnimationFrame(step); else onDone && onDone();
  }
  step();
}
function getWalkLookPoint(){
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  return camera.position.clone().add(dir.multiplyScalar(8));
}

function openInspection(name){
  const entry = interactables[name];
  const info = monumentInfo[name];
  if(!entry || !info) return;

  savedCamera = { mode, position: camera.position.clone(),
    target: mode===MODE.ORBIT ? orbit.target.clone() : getWalkLookPoint(),
    yaw, pitch, playerPos: playerPos.clone() };

  const prevMode = mode;
  mode = MODE.FLYING;
  orbit.enabled = false;
  if(document.pointerLockElement) document.exitPointerLock();

  const { camPos, lookAt } = calculateInspectionCamera(entry.object);
  flyCameraTo(camPos, lookAt, 1.6, ()=>{
    mode = MODE.INSPECT;
    openPanel(name, info, entry.object);
  });
}

function closeInspection(){
  disposeViewer();
  panelOverlay.classList.remove('open');
  if(!savedCamera){ mode = MODE.ORBIT; orbit.enabled = true; return; }
  mode = MODE.FLYING;
  const restoreMode = savedCamera.mode;
  const targetPos = restoreMode===MODE.ORBIT ? savedCamera.position : new THREE.Vector3(savedCamera.playerPos.x, PLAYER_HEIGHT, savedCamera.playerPos.z);
  const targetLook = savedCamera.target;
  flyCameraTo(targetPos, targetLook, 1.3, ()=>{
    if(restoreMode===MODE.ORBIT){
      mode = MODE.ORBIT; orbit.enabled = true; orbit.target.copy(savedCamera.target); orbit.update();
    } else {
      mode = MODE.WALK; yaw = savedCamera.yaw; pitch = savedCamera.pitch;
      playerPos.copy(savedCamera.playerPos);
      targetCharacterYaw = characterYaw; // evita que el personaje "gire de golpe" al retomar
    }
    savedCamera = null;
  });
}

/* ============================================================ 11. PANEL + VISOR 3D INDEPENDIENTE (con INSPECTION_CONFIG) ============================================================ */
const panelOverlay = document.getElementById('panel-overlay');
const panelEyebrow = document.getElementById('panel-eyebrow');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
let lastFocusedEl = null;

let viewerScene, viewerCamera, viewerRenderer, viewerModel, viewerRotating=true;
let viewerDragging=false, viewerLastX=0, viewerLastY=0, viewerYaw=0, viewerDist=0, viewerRO=null;
let currentInspectName = null;

function openPanel(name, info, sourceObject){
  currentInspectName = name;
  panelEyebrow.textContent = info.eyebrow;
  panelTitle.textContent = info.title;
  panelBody.innerHTML = info.body;
  lastFocusedEl = document.activeElement;
  panelOverlay.classList.add('open');
  document.getElementById('panel-close').focus();
  playSwoosh();
  buildViewer(sourceObject);
}

function buildViewer(sourceObject){
  const canvasEl = document.getElementById('viewer-canvas');
  const box0 = canvasEl.getBoundingClientRect();
  viewerScene = new THREE.Scene();
  viewerCamera = new THREE.PerspectiveCamera(40, Math.max(1,box0.width)/Math.max(1,box0.height), 0.05, 200);
  viewerRenderer = new THREE.WebGLRenderer({ canvas:canvasEl, antialias:true, alpha:true });
  viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  viewerRenderer.setSize(box0.width, box0.height, false);
  viewerRenderer.outputColorSpace = THREE.SRGBColorSpace;
  viewerRenderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Vitrina: suelo circular (pedestal) + iluminación de estudio key/fill/rim
  const floorViewer = new THREE.Mesh(new THREE.CircleGeometry(3,40), new THREE.MeshStandardMaterial({color:0x11151f, roughness:0.9, metalness:0.1}));
  floorViewer.rotation.x = -Math.PI/2; floorViewer.position.y = 0; floorViewer.receiveShadow = true;
  viewerScene.add(floorViewer);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.15,0.12,40), new THREE.MeshStandardMaterial({color:0x1c2233, roughness:0.6, metalness:0.25}));
  pedestal.position.y = 0.06; viewerScene.add(pedestal);

  const key = new THREE.DirectionalLight(0xfff2d8, 2.4); key.position.set(2.2,3,2.6); viewerScene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7); fill.position.set(-2.5,1.2,-1.5); viewerScene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.1); rim.position.set(-1,2.5,-3); viewerScene.add(rim);
  viewerScene.add(new THREE.AmbientLight(0xffffff, 0.25));

  // Clonar jerarquía existente — NO recargar el GLB
  viewerModel = sourceObject.clone(true);
  viewerModel.traverse(o=>{ if(o.isMesh){ o.castShadow=false; o.receiveShadow=false; if(o.material) o.material = o.material.clone(); } });

  // ----- Escala automática + configuración manual por monumento (INSPECTION_CONFIG) -----
  const cfg = INSPECTION_CONFIG[currentInspectName] || { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1, cameraDistanceMultiplier:1, cameraHeightOffset:0 };

  const box = new THREE.Box3().setFromObject(viewerModel);
  const center = new THREE.Vector3(); box.getCenter(center);
  const size = new THREE.Vector3(); box.getSize(size);
  viewerModel.position.sub(center); // 1-6: bounding box -> centrar en origen

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 2.1;
  const autoScale = targetSize / maxDim;              // escala automática inteligente
  const finalScale = autoScale * cfg.scaleMultiplier;  // auto-scale × ajuste manual
  viewerModel.scale.setScalar(finalScale);

  viewerModel.rotation.set(cfg.rotation.x, cfg.rotation.y, cfg.rotation.z);
  viewerModel.position.x += cfg.position.x;
  viewerModel.position.z += cfg.position.z;

  // Centrado + apoyo sobre el pedestal tras aplicar escala/rotación
  const box2 = new THREE.Box3().setFromObject(viewerModel);
  viewerModel.position.y += -box2.min.y + 0.12 + cfg.position.y;

  const group = new THREE.Group(); group.add(viewerModel);
  viewerScene.add(group);
  viewerModel.userData._group = group;

  // Cámara adaptativa: distancia/altura calculadas + multiplicadores del monumento
  viewerDist = targetSize * 1.9 * cfg.cameraDistanceMultiplier;
  viewerYaw = 0.6;
  const camY = targetSize*0.55 + cfg.cameraHeightOffset;
  viewerCamera.position.set(Math.sin(viewerYaw)*viewerDist, camY, Math.cos(viewerYaw)*viewerDist);
  viewerCamera.lookAt(0, targetSize*0.3 + cfg.cameraHeightOffset, 0);

  viewerRotating = true;
  document.getElementById('viewer-pause').textContent = '⏸';

  viewerRO = new ResizeObserver(()=>{
    const b = canvasEl.getBoundingClientRect();
    if(b.width<2||b.height<2) return;
    viewerCamera.aspect = b.width/b.height; viewerCamera.updateProjectionMatrix();
    viewerRenderer.setSize(b.width, b.height, false);
  });
  viewerRO.observe(canvasEl);

  animateViewer();
}

function animateViewer(){
  if(!viewerRenderer) return;
  requestAnimationFrame(animateViewer);
  if(viewerModel && viewerRotating){ viewerModel.userData._group.rotation.y += 0.0042; }
  viewerRenderer.render(viewerScene, viewerCamera);
}

function disposeViewer(){
  if(viewerRO){ viewerRO.disconnect(); viewerRO=null; }
  if(viewerScene){
    viewerScene.traverse(o=>{
      if(o.isMesh){
        o.geometry && o.geometry.dispose && o.geometry.dispose();
        const mats = Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=> m && m.dispose && m.dispose());
      }
    });
  }
  if(viewerRenderer){ viewerRenderer.dispose(); viewerRenderer=null; }
  viewerScene = null; viewerCamera = null; viewerModel = null; currentInspectName = null;
}

/* Controles del visor: drag=rotar, scroll=zoom, pausa (reanuda rotación automática al soltar) */
const viewerCanvasEl = document.getElementById('viewer-canvas');
let viewerResumeTimer = null;
viewerCanvasEl.addEventListener('pointerdown', (e)=>{ viewerDragging=true; viewerLastX=e.clientX; viewerLastY=e.clientY; viewerRotating=false; clearTimeout(viewerResumeTimer); });
window.addEventListener('pointerup', ()=>{
  if(!viewerDragging) return;
  viewerDragging=false;
  viewerResumeTimer = setTimeout(()=>{ if(document.getElementById('viewer-pause').textContent==='⏸') viewerRotating = true; }, 1400);
});
window.addEventListener('pointermove', (e)=>{
  if(!viewerDragging || !viewerModel) return;
  const dx = e.clientX - viewerLastX; viewerLastX = e.clientX; viewerLastY = e.clientY;
  viewerModel.userData._group.rotation.y += dx*0.01;
});
viewerCanvasEl.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if(!viewerCamera) return;
  viewerDist = THREE.MathUtils.clamp(viewerDist + e.deltaY*0.002, 1.2, 6);
  const dir = viewerCamera.position.clone().normalize();
  viewerCamera.position.copy(dir.multiplyScalar(viewerDist));
}, { passive:false });
document.getElementById('viewer-pause').addEventListener('click', ()=>{
  viewerRotating = !viewerRotating;
  document.getElementById('viewer-pause').textContent = viewerRotating ? '⏸' : '▶';
});

document.getElementById('panel-close').addEventListener('click', closeInspection);
panelOverlay.addEventListener('click', (e)=>{ if(e.target===panelOverlay) closeInspection(); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && panelOverlay.classList.contains('open')) closeInspection(); });

/* ============================================================ 12. HOTSPOTS 3D ============================================================ */
const hotspotLayer = document.getElementById('hotspot-layer');
const hotspotEls = {};
function buildHotspots(){
  Object.entries(interactables).forEach(([name, {title}])=>{
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.innerHTML = `<span class="hs-label">${title}</span><span class="hs-line"></span><span class="hs-dot"></span>`;
    el.addEventListener('click', ()=> openInspection(name));
    el.addEventListener('touchend', (e)=>{ e.preventDefault(); openInspection(name); }, {passive:false});
    hotspotLayer.appendChild(el);
    hotspotEls[name] = el;
  });
}
const _v = new THREE.Vector3();
function updateHotspots(){
  Object.entries(interactables).forEach(([name, {object}])=>{
    const el = hotspotEls[name]; if(!el) return;
    object.getWorldPosition(_v); _v.y += 2.2; _v.project(camera);
    const behind = _v.z > 1;
    el.style.left = ((_v.x*0.5+0.5)*window.innerWidth)+'px';
    el.style.top = ((-_v.y*0.5+0.5)*window.innerHeight)+'px';
    const visible = !behind && mode===MODE.ORBIT;
    el.style.opacity = visible ? '1' : '0';
    el.style.pointerEvents = visible ? 'auto' : 'none';
  });
}

/* ============================================================ 13. MODO CAMINAR — personaje 3D, "peso", giro suave y colisiones ============================================================ */
const keys = {};
let yaw=0, pitch=0.12;
const PLAYER_HEIGHT = 1.7;
const LIMITE = 27;
const PLAYER_RADIUS = 0.4; // "grosor" del personaje para las colisiones
const playerPos = new THREE.Vector3(spawnPoint.x, 0, spawnPoint.z);
const velocity = new THREE.Vector2(0,0); // x,z en el plano
// Un poco menos de aceleración y algo más de fricción que antes = sensación de "peso" real,
// el personaje no arranca ni frena de golpe.
const ACCEL = 16, FRICTION = 12, MAX_WALK = 2.6, MAX_RUN = 4.8;

// Rotación visual del personaje: nunca es instantánea, siempre gira suavizado hacia targetCharacterYaw.
let characterYaw = 0, targetCharacterYaw = 0;
const TURN_SMOOTH = 9; // más bajo = giro más lento/suave, más alto = giro más rápido

// Cámara en 3ª persona: sigue al personaje detrás/arriba, orientada por "yaw" (mouse)
const CAM_DIST = 6.2, CAM_HEIGHT = 3.0;

window.addEventListener('keydown', e=>{ keys[e.code]=true; if(e.code==='Escape' && document.pointerLockElement) document.exitPointerLock(); });
window.addEventListener('keyup', e=> keys[e.code]=false);

document.addEventListener('pointerlockchange', ()=>{
  const locked = document.pointerLockElement === canvas;
  document.getElementById('crosshair').style.display = (locked && mode===MODE.WALK) ? 'block' : 'none';
});
document.addEventListener('mousemove', (e)=>{
  if(document.pointerLockElement !== canvas || mode!==MODE.WALK) return;
  yaw -= e.movementX*0.0022; pitch -= e.movementY*0.0022;
  pitch = THREE.MathUtils.clamp(pitch, -0.6, 1.0);
});

function resolveCollisions(nx, nz){
  for(const c of colliders){
    const dx = nx-c.center.x, dz = nz-c.center.z;
    const dist = Math.sqrt(dx*dx+dz*dz);
    const minDist = c.radius + PLAYER_RADIUS;
    if(dist < minDist){ const push = minDist/(dist||0.001); nx = c.center.x+dx*push; nz = c.center.z+dz*push; }
  }
  return [nx,nz];
}

// Colisión rígida contra "piso"/"piso1": el personaje no puede atravesarlos (se comportan como muros/bordes).
function resolveBoxCollisions(nx, nz){
  for(const box of boxColliders){
    const closestX = THREE.MathUtils.clamp(nx, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(nz, box.min.z, box.max.z);
    const dx = nx-closestX, dz = nz-closestZ;
    const distSq = dx*dx+dz*dz;
    if(distSq < PLAYER_RADIUS*PLAYER_RADIUS){
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = PLAYER_RADIUS - dist;
      nx += (dx/dist)*push; nz += (dz/dist)*push;
    }
  }
  return [nx,nz];
}

function lerpAngle(a, b, t){
  let diff = ((b-a+Math.PI)%(Math.PI*2))-Math.PI;
  if(diff < -Math.PI) diff += Math.PI*2;
  return a + diff*t;
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(0,1,0);
function updateWalk(dt){
  _fwd.set(Math.sin(yaw),0,Math.cos(yaw)).normalize();
  _right.crossVectors(_fwd,_up).normalize();

  let ix=0, iz=0;
  const mobileActive = isMobileActive();
  if(!mobileActive){
    if(keys['KeyW']){ ix+=_fwd.x; iz+=_fwd.z; }
    if(keys['KeyS']){ ix-=_fwd.x; iz-=_fwd.z; }
    if(keys['KeyA']){ ix-=_right.x; iz-=_right.z; }
    if(keys['KeyD']){ ix+=_right.x; iz+=_right.z; }
  } else {
    ix = _fwd.x*(-mobileMove.y) + _right.x*(mobileMove.x);
    iz = _fwd.z*(-mobileMove.y) + _right.z*(mobileMove.x);
  }

  const running = keys['ShiftLeft']||keys['ShiftRight']||mobileRun;
  const maxSpeed = running ? MAX_RUN : MAX_WALK;
  const inputLen = Math.hypot(ix,iz);
  const isPressingMove = inputLen > 0.001;

  if(isPressingMove){
    const nix = ix/inputLen, niz = iz/inputLen;
    velocity.x += nix*ACCEL*dt; velocity.y += niz*ACCEL*dt;
    const sp = Math.hypot(velocity.x, velocity.y);
    if(sp>maxSpeed){ velocity.x = velocity.x/sp*maxSpeed; velocity.y = velocity.y/sp*maxSpeed; }
    // El personaje siempre gira hacia la dirección real en la que se mueve (no hacia donde mira la cámara),
    // así W/A/S/D producen el giro esperado sin sentirse invertido.
    targetCharacterYaw = Math.atan2(nix, niz);
  } else {
    const sp = Math.hypot(velocity.x, velocity.y);
    const drop = FRICTION*dt;
    const newSp = Math.max(0, sp-drop);
    if(sp>0.0001){ velocity.x = velocity.x/sp*newSp; velocity.y = velocity.y/sp*newSp; }
  }

  let nx = playerPos.x + velocity.x*dt;
  let nz = playerPos.z + velocity.y*dt;
  nx = THREE.MathUtils.clamp(nx, -LIMITE, LIMITE);
  nz = THREE.MathUtils.clamp(nz, -LIMITE, LIMITE);
  [nx,nz] = resolveCollisions(nx,nz);
  [nx,nz] = resolveBoxCollisions(nx,nz);
  playerPos.x = nx; playerPos.z = nz;

  // Giro suave (nunca brusco): el personaje interpola su rotación hacia targetCharacterYaw.
  const turnT = 1 - Math.exp(-TURN_SMOOTH*dt);
  characterYaw = lerpAngle(characterYaw, targetCharacterYaw, turnT);

  const speedNow = Math.hypot(velocity.x, velocity.y);
  const isMoving = speedNow > 0.05;

  if(character){
    character.visible = true;
    character.position.set(playerPos.x, 0, playerPos.z);
    character.rotation.y = characterYaw + CHARACTER_YAW_OFFSET;
  }
  // La animación de caminar SOLO avanza si el personaje realmente se está moviendo.
  // Si no se presiona ninguna tecla, no se llama a mixer.update() y la animación queda congelada.
  if(characterMixer && walkAction && isMoving){
    walkAction.timeScale = THREE.MathUtils.clamp(speedNow/MAX_WALK, 0.7, 1.9);
    characterMixer.update(dt);
  }

  // Cámara en 3ª persona: sigue detrás del personaje según "yaw" (mouse) y un poco de altura según "pitch".
  const camX = playerPos.x - Math.sin(yaw)*CAM_DIST;
  const camZ = playerPos.z - Math.cos(yaw)*CAM_DIST;
  const camY = PLAYER_HEIGHT + CAM_HEIGHT + pitch*3.2;
  camera.position.set(camX, camY, camZ);
  camera.lookAt(playerPos.x, PLAYER_HEIGHT + 0.9, playerPos.z);
}

/* Interacción en modo caminar: click / botón "Ver" apuntando al centro de pantalla */
function tryWalkInteract(){
  const hit = raycastFromScreen(0,0);
  if(hit){
    const from = new THREE.Vector3(playerPos.x, PLAYER_HEIGHT, playerPos.z);
    const dist = from.distanceTo(interactables[hit.name].object.getWorldPosition(new THREE.Vector3()));
    if(dist < 8) openInspection(hit.name);
  }
}
canvas.addEventListener('click', ()=>{ if(mode===MODE.WALK && document.pointerLockElement===canvas) tryWalkInteract(); });

/* ============================================================ 14. CONTROLES MÓVILES (joystick + mirar) ============================================================ */
let mobileMove = {x:0,y:0}, mobileRun=false;
function isMobileActive(){ return document.getElementById('mobile-controls').classList.contains('active'); }
const joystickZone = document.getElementById('joystick-zone');
const joystickThumb = document.getElementById('joystick-thumb');
let joyTouchId = null, joyCenter = {x:0,y:0};
joystickZone.addEventListener('touchstart', (e)=>{
  const t = e.changedTouches[0]; joyTouchId = t.identifier;
  const r = joystickZone.getBoundingClientRect(); joyCenter = {x:r.left+r.width/2, y:r.top+r.height/2};
  e.preventDefault();
}, {passive:false});
joystickZone.addEventListener('touchmove', (e)=>{
  for(const t of e.changedTouches){
    if(t.identifier!==joyTouchId) continue;
    let dx = t.clientX-joyCenter.x, dy = t.clientY-joyCenter.y;
    const max=44; const len=Math.hypot(dx,dy);
    if(len>max){ dx=dx/len*max; dy=dy/len*max; }
    joystickThumb.style.transform = `translate(${dx}px,${dy}px)`;
    mobileMove = { x: dx/max, y: dy/max };
  }
  e.preventDefault();
}, {passive:false});
function joyEnd(e){ joyTouchId=null; mobileMove={x:0,y:0}; joystickThumb.style.transform='translate(0,0)'; }
joystickZone.addEventListener('touchend', joyEnd);
joystickZone.addEventListener('touchcancel', joyEnd);

const lookZone = document.getElementById('look-zone');
let lookTouchId=null, lookLast={x:0,y:0};
lookZone.addEventListener('touchstart', (e)=>{ const t=e.changedTouches[0]; lookTouchId=t.identifier; lookLast={x:t.clientX,y:t.clientY}; });
lookZone.addEventListener('touchmove', (e)=>{
  for(const t of e.changedTouches){
    if(t.identifier!==lookTouchId) continue;
    const dx=t.clientX-lookLast.x, dy=t.clientY-lookLast.y; lookLast={x:t.clientX,y:t.clientY};
    yaw -= dx*0.0035; pitch -= dy*0.0035; pitch = THREE.MathUtils.clamp(pitch,-0.6,1.0);
  }
  e.preventDefault();
}, {passive:false});
lookZone.addEventListener('touchend', ()=> lookTouchId=null);

document.getElementById('mobile-interact').addEventListener('click', tryWalkInteract);
document.getElementById('mobile-exit-walk').addEventListener('click', ()=> setWalkMode(false));

/* ============================================================ 15. CAMBIO DE MODO ORBITAR / CAMINAR ============================================================ */
const modeBtn = document.getElementById('mode-btn'), modeBtnMobile = document.getElementById('mode-btn-mobile');
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints>0;

function setWalkMode(toWalk){
  if(toWalk){
    mode = MODE.WALK; orbit.enabled = false;
    // El personaje siempre aparece en el punto "spawn_start" al entrar al modo caminar.
    playerPos.set(spawnPoint.x, 0, spawnPoint.z);
    yaw = 0; pitch = 0.12; velocity.set(0,0);
    characterYaw = 0; targetCharacterYaw = 0;
    if(character){
      character.visible = true;
      character.position.set(playerPos.x, 0, playerPos.z);
      character.rotation.y = CHARACTER_YAW_OFFSET;
    }
    modeBtn.textContent = '♙ Caminar'; modeBtnMobile.textContent='◉ Orbitar (salir)';
    document.getElementById('mobile-controls').classList.toggle('active', isTouchDevice);
    if(!isTouchDevice) canvas.requestPointerLock();
    if(firstWalk){ firstWalk=false; document.getElementById('walk-tip').classList.add('show'); setTimeout(()=> document.getElementById('walk-tip').classList.remove('show'), 4200); }
    if(typeof announce==='function') announce('Modo caminar activado');
  } else {
    mode = MODE.ORBIT;
    if(document.pointerLockElement) document.exitPointerLock();
    if(character) character.visible = false;
    orbit.target.set(playerPos.x, 2, playerPos.z);
    camera.position.set(playerPos.x, 9, playerPos.z+10);
    orbit.enabled = true; orbit.update();
    modeBtn.textContent = '◉ Orbitar'; modeBtnMobile.textContent = 'Caminar';
    document.getElementById('mobile-controls').classList.remove('active');
    if(typeof announce==='function') announce('Modo órbita activado');
  }
}
modeBtn.addEventListener('click', ()=> setWalkMode(mode!==MODE.WALK));
modeBtnMobile.addEventListener('click', ()=> { setWalkMode(mode!==MODE.WALK); closeDrawer(); });

/* ============================================================ 16. HUD acciones + drawer móvil ============================================================ */
function handleAction(action){
  switch(action){
    case 'historia': openHistoria(); break;
    case 'audio': toggleAudio(); break;
    case 'daynight': setDayNight(!dayMode); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'recenter': recenterView(); break;
    case 'accesible': document.getElementById('accessible-view').classList.add('show'); break;
  }
}
document.querySelectorAll('#hud-links button[data-action="historia"], #mobile-drawer button[data-action]').forEach(btn=>{
  if(btn.dataset.action==='mode') return;
  btn.addEventListener('click', ()=> { handleAction(btn.dataset.action); closeDrawer(); });
});

const drawer = document.getElementById('mobile-drawer');
document.getElementById('hud-mobile-toggle').addEventListener('click', ()=>{ drawer.classList.add('open'); document.getElementById('hud-mobile-toggle').setAttribute('aria-expanded','true'); });
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
function closeDrawer(){ drawer.classList.remove('open'); document.getElementById('hud-mobile-toggle').setAttribute('aria-expanded','false'); }

/* ============================================================ 17. HISTORIA OVERLAY ============================================================ */
const historiaOverlay = document.getElementById('historia-overlay');
const timelineData = [
  {y:'1789', d:'Fundación del pueblo de Huanuni, ligado a las primeras explotaciones mineras en la zona.'},
  {y:'1825', d:'Tras la independencia, la minería cobra mayor relevancia y se impulsa la producción de estaño.'},
  {y:'1900', d:'Llegan empresas internacionales y se modernizan los métodos de extracción.'},
  {y:'1952', d:'Revolución Nacional y nacionalización de las minas; Huanuni se convierte en eje de la minería estatal.'},
  {y:'1985', d:'Crisis del estaño, pero la comunidad resiste y diversifica su economía.'},
  {y:'Actualidad', d:'Huanuni mantiene su identidad minera, con un creciente interés en su patrimonio cultural e histórico.'}
];
const curiososData = [
  {t:'🦙 El nombre', d:'"Huanuni" deriva del aymara "Wanuni", que significa "lugar de vicuñas".'},
  {t:'⛏️ El socavón más profundo', d:'La mina de Huanuni tiene más de 500 metros de profundidad.'},
  {t:'🏛️ Arquitectura minera', d:'Las casas de los barrios mineros conservan techos de calamina y fachadas de adobe.'},
  {t:'🎭 Fiesta del Rosario', d:'La festividad de la Virgen del Rosario congrega a miles de personas cada 7 de octubre.'},
  {t:'📜 La plaza', d:'Fue conocida originalmente como Plaza de la Recoba, un pequeño mercado de los primeros habitantes.'},
  {t:'🛤️ Tren minero', d:'Existía un ferrocarril que conectaba la mina con la ciudad de Oruro, hoy en desuso.'}
];
const galleryData = [
  {src:'./imagenes/foto_casco.jpg', alt:'Casco de la plaza'},
  {src:'./imagenes/simon1.jpg', alt:'Busto de Simón Bolívar'},
  {src:'./imagenes/dalence1.jpg', alt:'Estatua de Pantaleón Dalence Jiménez'},
  {src:'./imagenes/lechin.jpg', alt:'Estatua de Juan Lechín Oquendo'},
  {src:'./imagenes/placalechin.jpg', alt:'Placa de Juan Lechín Oquendo'},
  {src:'./imagenes/placapanta.jpg', alt:'Placa conmemorativa de Pantaleón Dalence'}
];
function buildHistoriaContent(){
  document.getElementById('h-timeline').innerHTML = timelineData.map(it=>`<div class="h-t-item"><div class="y">${it.y}</div><div class="d">${it.d}</div></div>`).join('');
  document.getElementById('h-curiosos').innerHTML = curiososData.map(c=>`<div class="h-card"><h5>${c.t}</h5><p>${c.d}</p></div>`).join('');
  document.getElementById('h-gallery').innerHTML = galleryData.map((g,i)=>`<figure data-i="${i}"><img src="${g.src}" alt="${g.alt}" loading="lazy"></figure>`).join('');
  document.querySelectorAll('#h-gallery figure').forEach(fig=> fig.addEventListener('click', ()=> openLightbox(galleryData[+fig.dataset.i])));
}
buildHistoriaContent();
const historiaIO = new IntersectionObserver(entries=> entries.forEach(en=>{ if(en.isIntersecting) en.target.classList.add('visible'); }), {threshold:.2});
let statsAnimated=false, historiaLastFocus=null;
function openHistoria(){
  historiaLastFocus = document.activeElement;
  historiaOverlay.classList.add('open');
  document.querySelectorAll('.h-t-item').forEach(it=> historiaIO.observe(it));
  if(!statsAnimated){
    statsAnimated = true;
    document.querySelectorAll('.h-stat .num').forEach(el=>{
      const target = parseInt(el.dataset.count,10); let cur=0; const step=Math.max(1, Math.ceil(target/50));
      const iv = setInterval(()=>{ cur+=step; if(cur>=target){cur=target; clearInterval(iv);} el.textContent=cur; }, 24);
    });
  }
  document.getElementById('historia-close').focus();
}
document.getElementById('historia-close').addEventListener('click', ()=>{ historiaOverlay.classList.remove('open'); if(historiaLastFocus) historiaLastFocus.focus(); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && historiaOverlay.classList.contains('open')){ historiaOverlay.classList.remove('open'); if(historiaLastFocus) historiaLastFocus.focus(); } });

/* ============================================================ 18. LIGHTBOX ============================================================ */
const lightbox = document.getElementById('lightbox'); const lbImg = document.getElementById('lb-img');
function openLightbox(item){ lbImg.src=item.src; lbImg.alt=item.alt; lightbox.classList.add('open'); }
document.getElementById('lb-close').addEventListener('click', ()=> lightbox.classList.remove('open'));
lightbox.addEventListener('click', (e)=>{ if(e.target===lightbox) lightbox.classList.remove('open'); });

/* ============================================================ 19. AUDIO — ambiente + swoosh, sin autoplay ============================================================ */
let audioCtx=null, ambientGain=null, ambientSource=null;
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
function toggleAudio(){
  ensureAudio(); audioOn=!audioOn;
  document.getElementById('btn-audio').textContent = audioOn?'🔊':'🔈';
  if(audioOn){ if(audioCtx.state==='suspended') audioCtx.resume(); startAmbient(); } else stopAmbient();
}
document.getElementById('btn-audio').addEventListener('click', toggleAudio);
function startAmbient(){
  if(ambientSource) return;
  const bufferSize = 2*audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const out = noiseBuffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) out[i] = (Math.random()*2-1)*0.35;
  ambientSource = audioCtx.createBufferSource(); ambientSource.buffer=noiseBuffer; ambientSource.loop=true;
  const filter = audioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=500;
  ambientGain = audioCtx.createGain(); ambientGain.gain.value=0.05;
  ambientSource.connect(filter).connect(ambientGain).connect(audioCtx.destination);
  ambientSource.start();
}
function stopAmbient(){ if(ambientSource){ ambientSource.stop(); ambientSource.disconnect(); ambientSource=null; } }
function playSwoosh(){
  if(!audioOn || !audioCtx) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(320, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime+0.35);
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime+0.05); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.4);
  o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.42);
}

/* ============================================================ 20. FULLSCREEN ============================================================ */
function toggleFullscreen(){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

/* ============================================================ 21. RESIZE ============================================================ */
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ============================================================ 22. LOOP PRINCIPAL ============================================================ */
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  if(document.hidden) return;
  const dt = Math.min(clock.getDelta(), 0.05);

  if(mode===MODE.INTRO && introCurve) updateIntro();
  else if(mode===MODE.ORBIT){ updateOrbitPan(dt); orbit.update(); }
  else if(mode===MODE.WALK) updateWalk(dt);

  updateHotspots();
  updateFlags(clock.elapsedTime); // ondulación de banderas por viento, siempre activa
  if(starMat.opacity>0.01) stars.rotation.y += dt*0.0025; // deriva estelar casi imperceptible
  cloudGroup.children.forEach(puff=>{ puff.position.x += puff.userData.speed*dt; if(puff.position.x>260) puff.position.x=-260; }); // deriva de nubes

  renderer.render(scene, camera);
}
animate();

/* ============================================================ 23. RECENTRAR CÁMARA ============================================================ */
const modeAnnouncer = document.getElementById('mode-announcer');
function announce(msg){ modeAnnouncer.textContent = msg; }

function recenterView(){
  if(mode===MODE.WALK){
    playerPos.set(spawnPoint.x, 0, spawnPoint.z); yaw = 0; pitch = 0.12; velocity.set(0,0);
    characterYaw = 0; targetCharacterYaw = 0;
    announce('Vista recentrada');
    return;
  }
  if(mode===MODE.ORBIT){
    orbit.target.set(0,2,0);
    flyCameraTo(new THREE.Vector3(0,9,20), new THREE.Vector3(0,2,0), 1.1, ()=>{ orbit.update(); });
    announce('Vista recentrada');
  }
}
document.getElementById('btn-recenter').addEventListener('click', recenterView);