import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

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
const MODE = { INTRO:'intro', ORBIT:'orbit', WALK:'walk', FLYING:'flying', INSPECT:'inspect', CINEMA:'cinema' };
let mode = MODE.INTRO;
let dayMode = true;
let audioOn = false;
let firstWalk = true;
let firstOrbitTip = true;

/* ---- Preferencias guardadas en el navegador (modo noche, volumen, si ya vio la escena de historia). Abre la página con ?reset para borrarlas ---- */
const PREF_KEY = 'plazaFermin.v1';
try{ if(new URLSearchParams(location.search).has('reset')) localStorage.removeItem(PREF_KEY); }catch(e){}
const prefs = (()=>{ try{ return JSON.parse(localStorage.getItem(PREF_KEY)||'{}') || {}; }catch(e){ return {}; } })();
function savePref(k, v){ prefs[k] = v; try{ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }catch(e){} }
let masterVol = (typeof prefs.vol==='number') ? Math.min(1, Math.max(0, prefs.vol)) : 1;

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
/*const sky = new Sky();
sky.scale.setScalar(2000);
scene.add(sky);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 3.2; skyU.rayleigh.value = 1.6; skyU.mieCoefficient.value = 0.0045; skyU.mieDirectionalG.value = 0.82;*/
/* Cielo plano de color sólido */
const SKY_COLOR_DAY = 0x1e88ff;    // el azul de tu imagen
const SKY_COLOR_NIGHT = 0x0b1633;  // azul oscuro para la noche
scene.background = new THREE.Color(SKY_COLOR_DAY);
const sunPos = new THREE.Vector3();
function setSun(elevationDeg, azimuthDeg){
  sunPos.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90-elevationDeg), THREE.MathUtils.degToRad(azimuthDeg));
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
const interactables = {}; // name -> {object, title, box, (focus, anchor, isFlag para banderas)}
const colliders = []; // {center:Vector3, radius} — colisión "circular" (monumentos)
const boxColliders = []; // Box3[] — colisión rígida (piso / piso1): el personaje no puede atravesarlos
let plazaRoot = null;

/* ---- Superficies caminables "COL_*": invisibles, el personaje sube por ellas ---- */
const COLLIDER_PATTERN = /^COL_/i;
const DEBUG_COLLIDERS = false;      // true = las muestra en rojo para revisarlas
const walkSurfaces = [];            // meshes COL_ usados para calcular la altura del suelo
const groundRay = new THREE.Raycaster();
const _gOrigin = new THREE.Vector3(), _gDown = new THREE.Vector3(0,-1,0);
const STEP_UP = 0.8;                // cuánto más alto que sus pies puede "detectar" una rampa
let groundY = 0;                    // altura actual del personaje

function getGroundHeight(x, z){
  if(!walkSurfaces.length) return 0;
  _gOrigin.set(x, groundY + STEP_UP, z);
  groundRay.set(_gOrigin, _gDown);
  groundRay.far = STEP_UP + 8;
  const hits = groundRay.intersectObjects(walkSurfaces, false);
  return hits.length ? Math.max(0, hits[0].point.y) : 0;
}

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
      interactables[name].box = box;   // caja para detectar el monumento en modo caminar
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      colliders.push({ center, radius: Math.max(size.x,size.z)*0.45 + 0.45 });
      console.log('✓ '+name+' encontrada');
    } else {
      console.warn('WARNING: no se encontró el nodo "'+name+'" en el GLB.');
    }
  });

// ---- Colisión rígida: piso y paredes — el personaje no puede atravesarlos ----
['piso','pared','pared1','pared2','pared3'].forEach(name=>{
  const obj = plazaRoot.getObjectByName(name);
  if(obj){
    const box = new THREE.Box3().setFromObject(obj);
    boxColliders.push(box);
    if(name!=='piso') obj.visible = false;   // <- oculta las paredes, el piso sigue visible
    console.log('✓ colisión registrada para "'+name+'"');
  } else {
    console.warn('WARNING: no se encontró el nodo "'+name+'" para colisión.');
  }
});

  // ---- Superficies COL_*: se usan para la altura del suelo y se ocultan ----
  plazaRoot.updateMatrixWorld(true);
  plazaRoot.traverse(o=>{
    if(!COLLIDER_PATTERN.test(o.name)) return;
    o.traverse(m=>{
      if(!m.isMesh || walkSurfaces.includes(m)) return;
      m.material = new THREE.MeshBasicMaterial({ color:0xff0000, wireframe:true, side:THREE.DoubleSide });
      m.castShadow = false; m.receiveShadow = false;
      m.visible = DEBUG_COLLIDERS;
      walkSurfaces.push(m);
    });
  });
  console.log('✓ '+walkSurfaces.length+' superficies COL_ registradas');

  // ---- Punto de aparición: empty "spawn_start" ----
  const spawnEmpty = plazaRoot.getObjectByName('spawn_start');
  if(spawnEmpty){
    spawnEmpty.getWorldPosition(spawnPoint);
    playerPos.set(spawnPoint.x, 0, spawnPoint.z);
    if(character) character.position.set(spawnPoint.x, 0, spawnPoint.z);
  } else {
    console.warn('WARNING: no se encontró el empty "spawn_start" en el GLB. Se usa (0,2,0) por defecto.');
  }

  // ---- Cubo "mostrar_historia": dispara la escena al terminar de subir las gradas (ver sección 19b) ----
  setupHistoryTrigger();

  // ---- Banderas: efecto de viento + interacción (ver sección 4c) ----
  // Tus banderas son grupos "ban_bolivia", "ban_huanuni", "ban_oruro", "ban_wipala" que
  // contienen el mesh real adentro (con nombres genéricos como "Plane.048" o "bandera_oruro").
  // Cada una se registra también en "interactables", igual que las estatuas.
  plazaRoot.traverse(o=>{
    if(!FLAG_NAME_PATTERN.test(o.name)) return;
    // ignora un ban_* que esté dentro de otro ban_*
    for(let p=o.parent; p; p=p.parent){ if(FLAG_NAME_PATTERN.test(p.name)) return; }

    let flagMesh = o.isMesh ? o : null;
    if(!flagMesh) o.traverse(child=>{ if(!flagMesh && child.isMesh) flagMesh = child; });
    if(flagMesh){
      setupFlag(flagMesh);
      registerFlagInteractable(o, flagMesh);
      console.log('✓ bandera interactiva: '+o.name+' -> '+flagMesh.name);
    } else {
      console.warn('WARNING: "'+o.name+'" coincide con el patrón de banderas pero no tiene ningún mesh adentro.');
    }
  });
  if(flagMeshes.length===0){
    console.warn('No se encontró ninguna bandera con el patrón /^ban_/i. Ajusta FLAG_NAME_PATTERN en el script con el nombre real de tus objetos.');
  }

  buildHotspots();
  buildNightLights();
   buildEmptyLights(); 
   setupWaterObjects(); 
  initNPCs();   // personas sentadas / caminando (sección 21b)
  initExtras(); // menú Ir a, palomas, sonido ambiente… (sección 21c)
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
  character.scale.setScalar(0.75);
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

/* ============================================================ 4c. BANDERAS — viento + interacción ============================================================ */
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
  // Doble cara: la tela se ve (y se puede clickear) desde ambos lados
  [].concat(mesh.material).forEach(m=>{ if(m) m.side = THREE.DoubleSide; });

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

/* ---- Interacción de banderas (misma mecánica que las estatuas) ---- */
const FLAG_INFO = {
  bolivia:{ eyebrow:'Símbolo patrio · Estado Plurinacional de Bolivia', title:'Bandera de Bolivia', label:'la bandera de Bolivia',
    body:`<p>El tricolor boliviano está formado por tres franjas horizontales: roja, amarilla y verde. Fue adoptado oficialmente en 1851.</p>
    <p>Tradicionalmente, el rojo representa la sangre derramada por los héroes de la patria, el amarillo las riquezas minerales y el verde la riqueza natural y la esperanza. En una plaza minera como esta, el amarillo tiene un significado especial.</p>` },
  wiphala:{ eyebrow:'Símbolo de los pueblos andinos', title:'Wiphala', label:'la Wiphala',
    body:`<p>La Wiphala es una bandera cuadrada de siete colores, dispuestos en 49 cuadros (7×7) que forman franjas en diagonal. Representa la unidad y la diversidad de los pueblos originarios andinos.</p>
    <p>La Constitución Política del Estado de 2009 la reconoce como uno de los símbolos del Estado Plurinacional de Bolivia.</p>` },
  huanuni:{ eyebrow:'Símbolo del municipio', title:'Bandera de Huanuni', label:'la bandera de Huanuni',
    body:`<p>Identifica al municipio de Huanuni, capital de la provincia Pantaleón Dalence del departamento de Oruro.</p>
    <p>Se iza en la plaza junto a los símbolos patrios como expresión de la identidad local y de la tradición minera del distrito.</p>` },
  oruro:{ eyebrow:'Símbolo departamental', title:'Bandera de Oruro', label:'la bandera de Oruro',
    body:`<p>Representa al departamento de Oruro, al que pertenece Huanuni. Oruro es conocida como la capital del folklore boliviano y su Carnaval fue proclamado por la UNESCO Obra Maestra del Patrimonio Oral e Intangible de la Humanidad en 2001.</p>` },
  _default:{ eyebrow:'Bandera', title:'Bandera', label:'la bandera',
    body:`<p>Bandera de la plaza.</p>` }
};
function flagInfoFor(name){
  const n = name.toLowerCase();
  const key = (n.includes('wipala')||n.includes('wiphala')) ? 'wiphala'
            : n.includes('bolivia') ? 'bolivia'
            : n.includes('huanuni') ? 'huanuni'
            : n.includes('oruro')   ? 'oruro' : '_default';
  return FLAG_INFO[key];
}

function registerFlagInteractable(obj, flagMesh){
  const info = flagInfoFor(obj.name);
  monumentInfo[obj.name] = info;                       // así openInspection() la encuentra
  const focusObj = flagMesh || obj;
  const box = new THREE.Box3().setFromObject(obj);      // caja para detección en modo caminar
  const fbox = new THREE.Box3().setFromObject(focusObj);
  const fc = new THREE.Vector3(); fbox.getCenter(fc);
  interactables[obj.name] = {
    object: obj,          // lo que se clona en el visor
    focus: focusObj,      // lo que enfoca la cámara (la tela, no el asta)
    title: info.title,
    box,
    anchor: new THREE.Vector3(fc.x, fbox.max.y + 0.6, fc.z), // dónde flota el hotspot
    isFlag: true
  };
}

/* ---- Agua animada: "agua" y "agua.001" ondulan con el tiempo ---- */
const WATER_NAME_PATTERN = /^agua/i;
const WATER_AMPLITUDE = 0.08;  // qué tan alto ondea (metros)
const WATER_FREQ = 1.6;         // qué tan juntas van las ondas
const WATER_SPEED = 1.1;        // velocidad de la animación
const waterUniforms = { uTime: { value: 0 } };

function setupWaterMaterial(mat){
  if(!mat || mat.userData._waterPatched) return;
  mat.userData._waterPatched = true;
  const prevOnBeforeCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader)=>{
    if(prevOnBeforeCompile) prevOnBeforeCompile(shader);
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float wA = sin(position.x*${WATER_FREQ.toFixed(2)} + uTime*${WATER_SPEED.toFixed(2)});
      float wB = sin(position.z*${(WATER_FREQ*1.3).toFixed(2)} - uTime*${(WATER_SPEED*0.8).toFixed(2)});
      transformed.y += (wA + wB) * ${WATER_AMPLITUDE.toFixed(3)};`
    );
  };
  mat.needsUpdate = true;
}

function setupWaterObjects(){
  if(!plazaRoot) return;
  let count = 0;
  plazaRoot.traverse(o=>{
    if(!WATER_NAME_PATTERN.test(o.name)) return;
    o.traverse(child=>{
      if(!child.isMesh) return;
      [].concat(child.material).forEach(setupWaterMaterial);
      count++;
    });
  });
  if(count===0) console.warn('No se encontró ningún objeto con el patrón /^agua/i.');
  else console.log('✓ '+count+' mesh(es) de agua animados');
}

/* ============================================================ 5. FOCOS NOCTURNOS ESTRATÉGICOS ============================================================ */
function buildNightLights(){
  // Un foco por monumento (museo nocturno)
  Object.entries(interactables).forEach(([name, {object, isFlag}])=>{
    if(isFlag) return; // las banderas no llevan foco propio
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

/* ---- Luces creadas desde empties "LIGHT_*" de Blender ---- */
const LIGHT_NAME_PATTERN = /^LIGHT_/i;
const LIGHT_COLOR = 0xfff0d0;       // color cálido
const LIGHT_INTENSITY = 1;        // fuerza de cada luz
const LIGHT_DISTANCE = 10;          // alcance base (m); se multiplica por la escala del empty
const LIGHT_DECAY = 2;
const LIGHT_ONLY_AT_NIGHT = false;   // true = solo de noche | false = siempre encendidas
const emptyLights = [];

function buildEmptyLights(){
  if(!plazaRoot) return;
  plazaRoot.updateMatrixWorld(true);
  plazaRoot.traverse(o=>{
    if(!LIGHT_NAME_PATTERN.test(o.name)) return;
    const pos = new THREE.Vector3(); o.getWorldPosition(pos);
    const sc = new THREE.Vector3(); o.getWorldScale(sc);
    const startIntensity = (LIGHT_ONLY_AT_NIGHT && dayMode) ? 0 : LIGHT_INTENSITY;
    const light = new THREE.PointLight(LIGHT_COLOR, startIntensity, LIGHT_DISTANCE * Math.max(sc.x, 0.001), LIGHT_DECAY);
    light.position.copy(pos);
    scene.add(light);
    emptyLights.push(light);
    console.log('✓ luz creada en empty: '+o.name);
  });
  if(emptyLights.length===0) console.warn('No se encontró ningún empty con el patrón /^LIGHT_/i.');
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
   Editar aquí para ajustar cada pieza individualmente.
   Las banderas usan valores por defecto; si una se ve muy pequeña en el visor, agrega aquí
   una entrada con su nombre (ej. ban_bolivia) y ajusta scaleMultiplier / cameraDistanceMultiplier. */
const INSPECTION_CONFIG = {
  estatua_fermin_lopez:      { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  estatua_fermin_lopez1:      { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  estatua_juan_lechin:       { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1,    cameraHeightOffset:0 },
  estatua_pantaleon_dalence: { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1,    cameraHeightOffset:0 },
  estatua_simon_bolivar:     { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  estatua_simon_bolivar1:     { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1,    cameraDistanceMultiplier:1.5,    cameraHeightOffset:0 },
  monumento_casco_minero:    { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:0.85, cameraDistanceMultiplier:1.15, cameraHeightOffset:0.1 },
  ban_bolivia: { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1, cameraDistanceMultiplier:1, cameraHeightOffset:0 },
ban_huanuni: { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1, cameraDistanceMultiplier:1, cameraHeightOffset:0 },
ban_oruro:   { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1, cameraDistanceMultiplier:1, cameraHeightOffset:0 },
ban_wipala:  { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scaleMultiplier:1, cameraDistanceMultiplier:1, cameraHeightOffset:0 },
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
  const start = { hemi:hemi.intensity, sunI:sun.intensity,
    ambI:ambient.intensity, exposure:renderer.toneMappingExposure, starOpacity:starMat.opacity,
    moonOpacity:moonDisc.material.opacity, haloOpacity:moonHalo.material.opacity,
    cloudOpacity: cloudGroup.children[0]?.children[0]?.material.opacity || 0.5 };
  const t0 = performance.now(), dur=2600; // transición cinematográfica ~2.6s
  const spots = nightLights.children.filter(c=>c.isSpotLight);
  const points = nightLights.children.filter(c=>c.isPointLight);
  const startSpot = spots[0]?.intensity||0, startPath = points[0]?.intensity||0, startMoon = moonLight.intensity;
  const startEmpty = emptyLights[0]?.intensity || 0;
const targetEmpty = (isDay && LIGHT_ONLY_AT_NIGHT) ? 0 : LIGHT_INTENSITY;
const startBg = scene.background.clone();
const targetBg = new THREE.Color(isDay ? SKY_COLOR_DAY : SKY_COLOR_NIGHT);
  function step(){
    const p = Math.min((performance.now()-t0)/dur, 1);
    const ep = easeInOutCubic(p);
    scene.background.lerpColors(startBg, targetBg, ep);
scene.fog.color.copy(scene.background);
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
    emptyLights.forEach(l=> l.intensity = THREE.MathUtils.lerp(startEmpty, targetEmpty, ep));
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
  // Se excluye al personaje y a los meshes ocultos (COL_*) para que no bloqueen la selección de monumentos.
  scene.traverse(o=>{ if(o.isMesh && o.visible && !o.userData.isNPC && !(character && isDescendantOf(o, character))) hits.push(o); });
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

  // Para banderas la cámara enfoca la tela (entry.focus); para estatuas, el objeto completo.
  const { camPos, lookAt } = calculateInspectionCamera(entry.focus || entry.object);
  flyCameraTo(camPos, lookAt, 1.6, ()=>{
    mode = MODE.INSPECT;
    openPanel(name, info, entry.object);
  });
}

function closeInspection(){
  narrationStop();
  disposeViewer();
  panelOverlay.classList.remove('open');
  if(!savedCamera){ mode = MODE.ORBIT; orbit.enabled = true; return; }
  mode = MODE.FLYING;
  const restoreMode = savedCamera.mode;
  const targetPos = restoreMode===MODE.ORBIT ? savedCamera.position : new THREE.Vector3(savedCamera.playerPos.x, groundY + PLAYER_HEIGHT, savedCamera.playerPos.z);
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
  extrasOnPanelOpen(name, info);
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

const isFlag = !!interactables[currentInspectName]?.isFlag;
if(isFlag){
  // conserva la orientación original de la bandera y le suma tu rotación
  viewerModel.rotation.x += cfg.rotation.x;
  viewerModel.rotation.y += cfg.rotation.y;
  viewerModel.rotation.z += cfg.rotation.z;
} else {
  viewerModel.rotation.set(cfg.rotation.x, cfg.rotation.y, cfg.rotation.z);
}

// Re-centrar en x/z después de rotar (solo banderas, para que giren sobre el pedestal)
if(isFlag){
  const bc = new THREE.Box3().setFromObject(viewerModel);
  const cc = new THREE.Vector3(); bc.getCenter(cc);
  viewerModel.position.x -= cc.x;
  viewerModel.position.z -= cc.z;
}
viewerModel.position.x += cfg.position.x;
viewerModel.position.z += cfg.position.z;

// Apoyo sobre el pedestal tras aplicar escala/rotación
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
  Object.entries(interactables).forEach(([name, {title, isFlag}])=>{
    const el = document.createElement('div');
    el.className = 'hotspot' + (isFlag ? ' hotspot-flag' : '');
    el.innerHTML = `<span class="hs-label">${title}</span><span class="hs-line"></span><span class="hs-dot"></span>`;
    el.addEventListener('click', ()=> openInspection(name));
    el.addEventListener('touchend', (e)=>{ e.preventDefault(); openInspection(name); }, {passive:false});
    hotspotLayer.appendChild(el);
    hotspotEls[name] = el;
  });
}
const _v = new THREE.Vector3();
function updateHotspots(){
  Object.entries(interactables).forEach(([name, entry])=>{
    const el = hotspotEls[name]; if(!el) return;
    // Banderas: el hotspot flota sobre la tela (anchor); estatuas: sobre su origen + 2.2
    if(entry.anchor) _v.copy(entry.anchor);
    else { entry.object.getWorldPosition(_v); _v.y += 2.2; }
    _v.project(camera);
    const behind = _v.z > 1;
    el.style.left = ((_v.x*0.5+0.5)*window.innerWidth)+'px';
    el.style.top = ((-_v.y*0.5+0.5)*window.innerHeight)+'px';
    const visible = !behind && mode===MODE.ORBIT;
    el.style.opacity = visible ? '1' : '0';
    el.style.pointerEvents = visible ? 'auto' : 'none';
  });
}

/* ============================================================ 13. MODO CAMINAR — personaje 3D, "peso", giro suave, colisiones y rampas ============================================================ */
const keys = {};
let yaw=0, pitch=0.12;
const PLAYER_HEIGHT = 1.7;
//const LIMITE = 40;
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
// Cámara en 3ª persona sobre el hombro (estilo God of War 2018)
const CAM_DIST = 2;        // qué tan cerca está la cámara del personaje
const CAM_HEIGHT = 0.01;     // altura relativa a la cabeza (más baja que antes)
const CAM_SHOULDER = 0.62;   // desplazamiento lateral hacia el hombro; negativo = hombro izquierdo
const CAM_LOOK_AHEAD = 1;  // qué tan lejos mira adelante del personaje

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
  [nx,nz] = resolveCollisions(nx,nz);
  [nx,nz] = resolveBoxCollisions(nx,nz);
  playerPos.x = nx; playerPos.z = nz;

  // Altura del suelo (rampas COL_), con suavizado
  const targetY = getGroundHeight(playerPos.x, playerPos.z);
  groundY += (targetY - groundY) * (1 - Math.exp(-14*dt));

  // Giro suave (nunca brusco): el personaje interpola su rotación hacia targetCharacterYaw.
  const turnT = 1 - Math.exp(-TURN_SMOOTH*dt);
  characterYaw = lerpAngle(characterYaw, targetCharacterYaw, turnT);

  const speedNow = Math.hypot(velocity.x, velocity.y);
  const isMoving = speedNow > 0.05;

  if(character){
    character.visible = true;
    character.position.set(playerPos.x, groundY, playerPos.z);
    character.rotation.y = characterYaw + CHARACTER_YAW_OFFSET;
  }
  // La animación de caminar SOLO avanza si el personaje realmente se está moviendo.
  // Si no se presiona ninguna tecla, no se llama a mixer.update() y la animación queda congelada.
  if(characterMixer && walkAction && isMoving){
    walkAction.timeScale = THREE.MathUtils.clamp(speedNow/MAX_WALK, 0.7, 1.9);
    characterMixer.update(dt);
  }

  // Cámara en 3ª persona: sigue detrás del personaje según "yaw" (mouse) y un poco de altura según "pitch".
    // Cámara sobre el hombro: se ubica detrás y a un lado del personaje (_fwd/_right ya calculados arriba)
    // Cámara sobre el hombro: posición fija respecto al personaje (solo yaw), pitch solo inclina la mirada
  const camX = playerPos.x - _fwd.x*CAM_DIST + _right.x*CAM_SHOULDER;
  const camZ = playerPos.z - _fwd.z*CAM_DIST + _right.z*CAM_SHOULDER;
  const camY = groundY + PLAYER_HEIGHT + CAM_HEIGHT;
  camera.position.set(camX, camY, camZ);

  // Dirección de mirada: combina yaw (izquierda/derecha) y pitch (arriba/abajo) en un solo vector,
  // así la cámara rota sobre sí misma en vez de trasladarse.
  const lookDirX = Math.sin(yaw) * Math.cos(pitch);
  const lookDirZ = Math.cos(yaw) * Math.cos(pitch);
  const lookDirY = Math.sin(pitch);

  const lookX = camX + lookDirX * CAM_LOOK_AHEAD - _right.x*CAM_SHOULDER*0.5;
  const lookZ = camZ + lookDirZ * CAM_LOOK_AHEAD - _right.z*CAM_SHOULDER*0.5;
  const lookY = camY + lookDirY * CAM_LOOK_AHEAD;
  camera.lookAt(lookX, lookY, lookZ);
}

/* ---- Detección de monumento / bandera al frente (modo caminar) ---- */
const INTERACT_DISTANCE = 4.5;   // qué tan cerca debes estar (en metros)
const INTERACT_MARGIN = 0.8;     // tolerancia al apuntar (más alto = más fácil)
const _ray = new THREE.Ray(), _rayOrigin = new THREE.Vector3(), _rayDir = new THREE.Vector3(), _expBox = new THREE.Box3(), _hitPt = new THREE.Vector3();
let walkTarget = null;

function findWalkTarget(){
  if(historySeen && zoneArmed && inHistoryZone()) return '__historia__';   // volver a ver la escena de historia
  _rayDir.set(Math.sin(yaw), 0, Math.cos(yaw)); // hacia donde apunta la cámara
  let best = null, bestDist = Infinity;
  for(const [name, entry] of Object.entries(interactables)){
    if(!entry.box) continue;
    _expBox.copy(entry.box).expandByScalar(INTERACT_MARGIN);
    _rayOrigin.set(playerPos.x, (entry.box.min.y+entry.box.max.y)/2, playerPos.z);
    _ray.set(_rayOrigin, _rayDir);
    if(_ray.intersectBox(_expBox, _hitPt)){
      const d = _rayOrigin.distanceTo(_hitPt);
      if(d <= INTERACT_DISTANCE && d < bestDist){ best = name; bestDist = d; }
    }
  }
  return best;
}

const interactPrompt = document.getElementById('interact-prompt');
const interactText = document.getElementById('interact-prompt-text');
const interactKey = document.getElementById('interact-key');
let lastPromptName = null;

function promptLabel(name){
  if(name==='monumento_casco_minero') return 'el casco minero';
  if(monumentInfo[name]?.label) return monumentInfo[name].label; // banderas
  return 'la estatua de ' + (monumentInfo[name]?.title || '');
}
function updateInteractPrompt(){
  walkTarget = (mode===MODE.WALK) ? findWalkTarget() : null;
  if(walkTarget){
    if(walkTarget !== lastPromptName){
      lastPromptName = walkTarget;
      interactKey.style.display = isTouchDevice ? 'none' : '';
      interactText.textContent = walkTarget==='__historia__'
        ? (isTouchDevice ? 'Toca «Ver» para revivir ' : 'Presiona E para revivir ') + 'la historia de Huanuni'
        : (isTouchDevice ? 'Toca «Ver» para inspeccionar ' : 'Presiona E para inspeccionar ') + promptLabel(walkTarget);
    }
    interactPrompt.classList.add('show');
  } else {
    lastPromptName = null;
    interactPrompt.classList.remove('show');
  }
}

function activateWalkTarget(name){ if(name==='__historia__') startCinema(); else openInspection(name); }
function tryWalkInteract(){ if(walkTarget) activateWalkTarget(walkTarget); }

window.addEventListener('keydown', (e)=>{
  if(e.code==='KeyE' && !e.repeat && mode===MODE.WALK && walkTarget) activateWalkTarget(walkTarget);
});

canvas.addEventListener('click', ()=>{
  if(mode!==MODE.WALK || isTouchDevice) return;
  if(document.pointerLockElement!==canvas) canvas.requestPointerLock(); // re-captura el mouse tras cerrar la inspección
  else tryWalkInteract();
});

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
  if(mode===MODE.CINEMA || extrasBusy()) return;   // durante la escena de historia / recorrido / vuelos no se cambia de modo
  if(toWalk){
    mode = MODE.WALK; orbit.enabled = false;
    // El personaje siempre aparece en el punto "spawn_start" al entrar al modo caminar.
    playerPos.set(spawnPoint.x, 0, spawnPoint.z);
    yaw = 0; pitch = 0.12; velocity.set(0,0);
    groundY = 0;
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
    case 'goto': toggleGoto(); break;
    case 'tour': startTour(); break;
    case 'photo': enterPhoto(); break;
    case 'creditos': document.getElementById('credits-view').classList.add('show'); break;
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
  {y:'Época colonial', d:'Se descubre la riqueza del cerro hoy llamado Posokoni, antes Guaricunca y luego Kcoya Orco, «cerro de las minas».'},
  {y:'1908–1910', d:'Simón I. Patiño compra las concesiones mineras de la región; los trabajadores de Huanuni resisten la explotación.'},
  {y:'1912', d:'Por ley del 15 de noviembre se crea el municipio de Huanuni, durante el gobierno de Eliodoro Villazón.'},
  {y:'1919', d:'Tras una asamblea y una huelga general, los mineros de Huanuni conquistan la jornada de ocho horas, la primera aplicada en las minas del país.'},
  {y:'1938', d:'Se funda el Sindicato Mixto de Trabajadores Mineros de Huanuni (15 de junio).'},
  {y:'1944', d:'El 11 de junio, en un congreso realizado en Huanuni, se funda la Federación Sindical de Trabajadores Mineros de Bolivia (FSTMB).'},
  {y:'1949', d:'Masacre de Huanuni (30 de mayo): caen y son detenidos numerosos dirigentes mineros.'},
  {y:'1952', d:'Nacionalización de las minas; Huanuni pasa a formar parte de la Corporación Minera de Bolivia (COMIBOL).'},
  {y:'1985', d:'La crisis del estaño obliga a cerrar minas en todo el país; Huanuni resiste y sigue trabajando.'},
  {y:'2006', d:'Tras el enfrentamiento por el cerro Posokoni, más de 3.000 mineros cooperativistas se incorporan a la empresa estatal y el Estado recupera la mina.'},
  {y:'2017', d:'Bajo la gestión del alcalde Felipe Martínez Mamani, el Gobierno Autónomo Municipal de Huanuni ejecuta el proyecto «Construcción Plaza Principal Fermín López», que remodela la plaza. Obra a cargo de la Consultoría y Construcciones COCONBE Becerra; ver la ficha técnica más abajo.'}
];
const curiososData = [
  {t:'⛰️ Un cerro, tres nombres', d:'Guaricunca, Kcoya Orco («cerro de las minas») y hoy Posokoni.'},
  {t:'⏱️ Pioneros de las ocho horas', d:'En 1919, los mineros de Huanuni fueron los primeros en Bolivia en lograr la jornada de ocho horas.'},
  {t:'✊ Cuna de la FSTMB', d:'La Federación Sindical de Trabajadores Mineros de Bolivia se fundó en Huanuni el 11 de junio de 1944.'},
  {t:'🏛️ Un sindicato histórico', d:'El Sindicato Mixto de Trabajadores Mineros de Huanuni fue fundado el 15 de junio de 1938.'},
  {t:'🗺️ Capital de Dalence', d:'Huanuni es la capital de la provincia Pantaleón Dalence, a unos 50 km de la ciudad de Oruro.'},
  {t:'🙏 Virgen del Rosario', d:'La Virgen que corona el casco minero de la plaza se celebra cada 7 de octubre.'}
];
const galleryData = [
  {src:'./imagenes/foto_casco.jpg', alt:'Casco de la plaza'},
  {src:'./imagenes/simon1.jpg', alt:'Busto de Simón Bolívar'},
  {src:'./imagenes/dalence1.jpg', alt:'Estatua de Pantaleón Dalence Jiménez'},
  {src:'./imagenes/lechin.jpg', alt:'Estatua de Juan Lechín Oquendo'},
  {src:'./imagenes/placalechin.jpg', alt:'Placa de Juan Lechín Oquendo'},
  {src:'./imagenes/placapanta.jpg', alt:'Placa conmemorativa de Pantaleón Dalence'},
  {src:'./imagenes/placa_plaza.png', alt:'Placa conmemorativa del proyecto Construcción Plaza Principal Fermín López, gestión 2017'}
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
(function(){
  const cv=document.getElementById('credits-view');
  document.getElementById('credits-close').addEventListener('click', ()=> cv.classList.remove('show'));
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && cv.classList.contains('show')) cv.classList.remove('show'); });
})();
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && historiaOverlay.classList.contains('open')){ historiaOverlay.classList.remove('open'); if(historiaLastFocus) historiaLastFocus.focus(); } });

/* ============================================================ 18. LIGHTBOX ============================================================ */
const lightbox = document.getElementById('lightbox'); const lbImg = document.getElementById('lb-img');
function openLightbox(item){ lbImg.src=item.src; lbImg.alt=item.alt; lightbox.classList.add('open'); }
document.getElementById('lb-close').addEventListener('click', ()=> lightbox.classList.remove('open'));
lightbox.addEventListener('click', (e)=>{ if(e.target===lightbox) lightbox.classList.remove('open'); });

/* ============================================================ 19. AUDIO — ambiente + swoosh, sin autoplay ============================================================ */
let audioCtx=null, ambientGain=null, ambientSource=null;
function ensureAudio(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }
/* --- Música de fondo (music.mp3) --- */
const bgMusic = new Audio('music.mp3');
bgMusic.loop = true; bgMusic.preload = 'auto'; bgMusic.volume = 0;
const MUSIC_VOL = 0.35;           // volumen final (0 a 1) — ajústalo a tu gusto
let musicFade = null, userMuted = !!prefs.muted;
function fadeMusic(target, ms=1200, onDone){
  target *= masterVol;   // respeta el control de volumen
  clearInterval(musicFade);
  const start = bgMusic.volume, t0 = performance.now();
  musicFade = setInterval(()=>{
    const k = Math.min(1,(performance.now()-t0)/ms);
    bgMusic.volume = Math.max(0, Math.min(1, start+(target-start)*k));
    if(k>=1){ clearInterval(musicFade); onDone && onDone(); }
  }, 40);
}
function setAudioUI(){
  const b = document.getElementById('btn-audio');
  b.textContent = audioOn ? '🔊' : '🔈';
  b.setAttribute('aria-label', audioOn ? 'Silenciar música' : 'Activar música');
}
function startMusic(){
  ensureAudio(); if(audioCtx.state==='suspended') audioCtx.resume();
  bgMusic.play().then(()=>fadeMusic(MUSIC_VOL)).catch(()=>{ audioOn=false; setAudioUI(); });
}
function stopMusic(){ fadeMusic(0, 600, ()=>bgMusic.pause()); }
function toggleAudio(){
  audioOn = !audioOn; userMuted = !audioOn; savePref('muted', userMuted); setAudioUI();
  if(audioOn) startMusic(); else stopMusic();
}
document.getElementById('btn-audio').addEventListener('click', toggleAudio);

/* Los navegadores bloquean el autoplay: la música arranca sola con el primer toque/clic/tecla */
function firstGesture(e){
  if(e.target.closest && e.target.closest('#btn-audio,[data-action="audio"]')) return; // lo maneja el botón
  removeGestureListeners();
  if(!userMuted && !audioOn){ audioOn = true; setAudioUI(); startMusic(); }
}
function removeGestureListeners(){
  ['pointerdown','keydown','touchstart'].forEach(ev=>window.removeEventListener(ev, firstGesture, true));
}
['pointerdown','keydown','touchstart'].forEach(ev=>window.addEventListener(ev, firstGesture, true));

/* Pausa al cambiar de pestaña */
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){ if(audioOn) bgMusic.pause(); }
  else if(audioOn){ bgMusic.play().catch(()=>{}); }
});
function playSwoosh(){
  if(!audioOn || !audioCtx) return;
  const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(320, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime+0.35);
  g.gain.setValueAtTime(0.0001, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime+0.05); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+0.4);
  o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.42);
}

/* ============================================================ 19b. ESCENA «MEMORIA DE HUANUNI» — se activa al terminar de subir las gradas ============================================================
   • Detecta al personaje dentro del cubo "mostrar_historia" del GLB (el cubo se oculta, solo se usa su volumen).
   • La 1ª vez se reproduce sola; después, al volver a la zona aparece "Presiona E para revivir la historia".
   • Cámara de cine alrededor del casco minero + capítulos con datos verificados + barras azul/amarillo.
   ============================================================ */
const HISTORY_TRIGGER_PATTERN = /mostrar_historia/i;  // nombre del cubo en Blender/GLB
const HISTORY_DEBUG = false;       // true = dibuja el volumen del cubo en magenta para revisar su posición
const CINE_AUTOPLAY = true;        // true = los capítulos avanzan solos · false = solo con clic / → / botones
const CINE_ORBIT_SWEEP = 1.25;     // cuánto gira la cámara alrededor del casco (radianes, 1.25 ≈ 72°)
const CINE_ORBIT_DIR = 1;          // 1 o -1: sentido del giro
const CINE_MUSIC_DUCK = 0.45;      // la música baja a este % mientras dura la escena

/* Capítulos — todos los datos salen de fuentes públicas (se citan abajo de cada capítulo) */
const CINE_CHAPTERS = [
  { type:'intro', eyebrow:'Provincia Pantaleón Dalence · Oruro · Bolivia', title:'HUANUNI',
    text:'A casi 4.000 metros de altura, al pie del cerro <b>Posokoni</b>, está el yacimiento de estaño más grande de Bolivia. Esta es su historia.',
    src:'Fuentes: Empresa Minera Huanuni · Eju.tv' },
  { year:'Época colonial', title:'El cerro de las minas',
    text:'El cerro hoy llamado <b>Posokoni</b> se conoció antes como Guaricunca y luego como Kcoya Orco, «cerro de las minas». Su riqueza se descubrió en tiempos de la Colonia.',
    src:'Fuente: Empresa Minera Huanuni (emhuanuni.gob.bo)' },
  { year:'1908 – 1910', title:'Los barones del estaño',
    text:'Simón I. Patiño compra las concesiones de la región y forma un poderoso grupo minero. Desde entonces, los trabajadores de Huanuni <b>resisten la explotación</b>.',
    src:'Fuente: Empresa Minera Huanuni (emhuanuni.gob.bo)' },
  { year:'1919', title:'Las ocho horas',
    text:'Tras una asamblea y una huelga general, los mineros de Huanuni conquistan la <b>jornada de ocho horas</b>, la primera aplicada en las minas de Bolivia.',
    src:'Fuentes: CEDLA · Vicepresidencia del Estado Plurinacional' },
  { year:'1944', title:'Nace la voz de los mineros',
    text:'El 11 de junio, en un congreso realizado en Huanuni, se funda la <b>FSTMB</b>. Juan Lechín, cuya estatua está en esta plaza, es elegido su Secretario Ejecutivo.',
    src:'Fuentes: Declaración Camaral N.º 424/2021-2022, Senado de Bolivia · Wikipedia' },
  { year:'1985', title:'Huanuni resiste',
    text:'La crisis del estaño obliga a cerrar minas y despedir a miles de mineros en todo el país. Huanuni, parte de COMIBOL desde 1952, <b>sigue trabajando</b>.',
    src:'Fuentes: Wikipedia (Huanuni · Corporación Minera de Bolivia)' },
  { year:'2006', title:'Un nuevo capítulo',
    text:'Tras el enfrentamiento de octubre por el cerro Posokoni, más de 3.000 mineros cooperativistas se incorporan a la empresa estatal. El Estado <b>recupera la mina</b>.',
    src:'Fuentes: Eju.tv · Colectivo CASA' },
  { year:'2017', title:'Una plaza para la memoria',
    text:'El Gobierno Autónomo Municipal de Huanuni remodela esta plaza. Aquí conviven <b>Bolívar, Dalence, Fermín López y Lechín</b>, junto al casco minero y la Virgen del Rosario.',
    src:'Fuente: placa conmemorativa de la plaza' },
  { type:'ficha', eyebrow:'Placa conmemorativa · Huanuni, Provincia Pantaleón Dalence · Gestión 2017', title:'Proyecto «Construcción Plaza Principal Fermín López»',
    text:'<div class="fi-head">Gobierno Autónomo Municipal de Huanuni</div><div class="fi-mayor"><b>H. Felipe Martínez Mamani</b><span>Honorable Alcalde Municipal de Huanuni</span></div><div class="fi-grid"><div class="fi-col"><h6>Concejo</h6><ul><li><b>Gabriel Vilcaez López</b><span>Presidente del Concejo</span></li><li><b>Elisa Misericordia Soria</b><span>Vicepresidenta</span></li><li><b>Carlos Tito Choque</b><span>Secretario</span></li><li><b>Teodoro Gutiérrez Martínez</b><span>Concejal</span></li><li><b>Walter Cerrogrande</b><span>Concejal</span></li><li><b>Emilio Choque Valdez</b><span>Concejal</span></li><li><b>Ing. César Lazarte Titichoca</b><span>Secretario técnico</span></li><li><b>Arq. Ernesto Callapa Rodríguez</b><span>Supervisor de obra</span></li></ul></div><div class="fi-col"><h6>Comité impulsor</h6><ul><li><b>Roberto Chávez S.</b><span>Presidente Junta Vecinal</span></li><li><b>Carlos Candia F.</b><span>Vicepresidente de zona</span></li><li><b>Alejandrina Jiménez de Romero</b><span>Secretaria de hacienda</span></li><li><b>Ing. Gonzalo Becerra Herrera</b><span>Dirección de obra</span></li><li><b>Arq. Víctor Roque Núñez</b><span>Diseño de obra</span></li></ul><h6>Empresa constructora</h6><div class="fi-emp">Consultoría y Construcciones COCONBE Becerra</div></div></div>',
    src:'Fuente: placa conmemorativa de la plaza · Gestión 2017' }
];
const CINE_N = CINE_CHAPTERS.length;
CINE_CHAPTERS.forEach(c=>{
  const words = c.text.replace(/<[^>]+>/g,'').split(/\s+/).length;
  c.dur = c.type==='intro' ? 6.5 : Math.max(6.5, 2.2 + words*0.22);   // segundos que dura cada capítulo
});

/* ---- Referencias al DOM ---- */
const cineEl = document.getElementById('cine'), cineStage = document.getElementById('cine-stage');
const cineEyebrow = document.getElementById('cine-eyebrow'), cineYear = document.getElementById('cine-year');
const cineTitle = document.getElementById('cine-title'), cineText = document.getElementById('cine-text');
const cineSource = document.getElementById('cine-source'), cineCount = document.getElementById('cine-count');
const cinePrev = document.getElementById('cine-prev'), cineNext = document.getElementById('cine-next');
const cineProgress = document.getElementById('cine-progress');
const dustCv = document.getElementById('cine-dust'), dctx = dustCv.getContext('2d');
const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const cineSegs = CINE_CHAPTERS.map((c,i)=>{
  const b = document.createElement('button');
  b.className = 'seg'; b.setAttribute('aria-label', 'Ir al capítulo '+(i+1)+': '+(c.year||'')+' '+c.title);
  b.innerHTML = '<span><i></i></span>';
  b.addEventListener('click', ()=> setChapter(i));
  cineProgress.appendChild(b);
  return b;
});

/* ---- Estado ---- */
let historyZone = null;            // Box3 del cubo "mostrar_historia"
let historySeen = !!prefs.cineSeen;           // ya se reprodujo una vez
let zoneArmed = true;              // evita mostrar el aviso de repetir justo al terminar
const cinema = {
  active:false, idx:-1, chapT:0, camP:0, t:0, swapTimer:null, yearRaf:null,
  startPos:new THREE.Vector3(), startLook:new THREE.Vector3(), center:new THREE.Vector3(),
  topY:3, midY:1.5, fov0:50, a0:0, R0:12, h0:4, hMax:9, rings:[], light:null
};
const blendOut = { on:false, t:0, pos:new THREE.Vector3(), quat:new THREE.Quaternion(), fovFrom:50 };
const _cDir = new THREE.Vector3(), _cPos = new THREE.Vector3(), _cLook = new THREE.Vector3(), _bQuat = new THREE.Quaternion();
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth01 = v => { v = clamp01(v); return v*v*(3-2*v); };

/* ---- Preparación al cargar el GLB: busca el cubo, lo oculta y deja listos los efectos ---- */
function setupHistoryTrigger(){
  plazaRoot.updateMatrixWorld(true);
  let node = null;
  plazaRoot.traverse(o=>{ if(!node && HISTORY_TRIGGER_PATTERN.test(o.name)) node = o; });
  if(node){
    historyZone = new THREE.Box3().setFromObject(node);   // se calcula ANTES de ocultarlo
    node.visible = false;                                  // el cubo no se ve en la escena
    console.log('✓ zona de historia: "'+node.name+'"');
  } else {
    // Respaldo (para probar con un GLB que aún no tiene el cubo): final de las gradas = borde alto de COL_arriba
    const ref = plazaRoot.getObjectByName('COL_arriba');
    if(ref){
      const b = new THREE.Box3().setFromObject(ref);
      historyZone = new THREE.Box3(new THREE.Vector3(b.min.x, b.max.y-1, b.max.z-2.2), new THREE.Vector3(b.max.x, b.max.y+3, b.max.z));
      console.warn('WARNING: no se encontró el nodo "mostrar_historia" en el GLB. Se usa una zona de respaldo al final de las gradas.');
    } else console.warn('WARNING: no se encontró "mostrar_historia" ni "COL_arriba": la escena de historia no se activará.');
  }
  if(HISTORY_DEBUG && historyZone) scene.add(new THREE.Box3Helper(historyZone, 0xff00ff));

  // Anillos de luz (se crean ahora, minúsculos, para que no haya tirón al activarse)
  for(let k=0;k<3;k++){
    const m = new THREE.MeshBasicMaterial({ color: k===1 ? 0x2f6bd6 : 0xffc400, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false, toneMapped:false });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.92,1,96), m);
    r.rotation.x = -Math.PI/2; r.scale.setScalar(0.0001); r.renderOrder = 20; r.frustumCulled = false;
    r.userData = { delay:k*0.3, life:2.4, age:99 };
    scene.add(r); cinema.rings.push(r);
  }
  // Luz cálida sobre el casco (intensidad 0 hasta que corre la escena)
  cinema.light = new THREE.PointLight(0xffd36b, 0, 0, 2);
  scene.add(cinema.light);
}

/* ---- ¿El personaje está dentro del cubo? ---- */
function inHistoryZone(){
  if(!historyZone) return false;
  const b = historyZone, r = PLAYER_RADIUS*0.5, py = groundY + 0.9;
  return playerPos.x>b.min.x-r && playerPos.x<b.max.x+r && playerPos.z>b.min.z-r && playerPos.z<b.max.z+r && py>b.min.y-1.6 && py<b.max.y+1.6;
}
function checkHistoryTrigger(){
  if(!historyZone || cinema.active) return;
  const inside = inHistoryZone();
  if(!inside){ zoneArmed = true; return; }
  if(!historySeen) startCinema();
}

/* ---- Inicio ---- */
function startCinema(){
  if(mode!==MODE.WALK || cinema.active) return;
  cinema.active = true; historySeen = true; savePref('cineSeen', true); zoneArmed = false;
  mode = MODE.CINEMA; velocity.set(0,0); blendOut.on = false;
  if(document.pointerLockElement) document.exitPointerLock();   // el cursor vuelve para poder tocar «Omitir»

  // Encuadre de partida y órbita alrededor del casco minero
  cinema.startPos.copy(camera.position);
  camera.getWorldDirection(_cDir); cinema.startLook.copy(camera.position).addScaledVector(_cDir, 6);
  cinema.fov0 = camera.fov;
  const casco = interactables['monumento_casco_minero'];
  if(casco && casco.box){
    casco.box.getCenter(cinema.center); cinema.topY = casco.box.max.y; cinema.midY = cinema.center.y;
  } else { cinema.center.set(0,2,0); cinema.topY = 4; cinema.midY = 2; }
  const dx = camera.position.x - cinema.center.x, dz = camera.position.z - cinema.center.z;
  cinema.a0 = Math.atan2(dz, dx);
  cinema.R0 = Math.max(Math.hypot(dx,dz), 9);
  cinema.h0 = camera.position.y;
  cinema.hMax = Math.max(cinema.h0 + 3.5, cinema.topY + 3.2);
  cinema.t = 0; cinema.camP = 0; cinema.idx = -1; cinema.chapT = 0;

  // Anillos de luz que nacen bajo los pies del personaje
  cinema.rings.forEach(r=>{ r.position.set(playerPos.x, groundY+0.08, playerPos.z); r.userData.age = 0; r.visible = true; });

  // Interfaz
  document.body.classList.add('cinema');
  cineEl.setAttribute('aria-hidden','false');
  cineEl.classList.remove('last'); cineEl.classList.add('on','flash');
  setTimeout(()=> cineEl.classList.remove('flash'), 1300);
  document.getElementById('cine-cta-hint').innerHTML = isTouchDevice
    ? 'Acércate a cada monumento y toca <kbd>Ver</kbd> para inspeccionarlo'
    : 'Acércate a cada monumento y presiona <kbd>E</kbd> para inspeccionarlo';
  resizeDust(); initDust();
  setChapter(0);
  if(audioOn) fadeMusic(MUSIC_VOL*CINE_MUSIC_DUCK, 1500);
  try{ document.getElementById('cine-skip').focus({preventScroll:true}); }catch(e){}
  announce && announce('Escena de historia iniciada. Puedes omitirla con Escape.');
}

/* ---- Capítulos ---- */
function setChapter(i){
  i = Math.max(0, Math.min(CINE_N-1, i));
  if(i===cinema.idx) return;
  const first = cinema.idx === -1;
  cinema.idx = i; cinema.chapT = 0;
  const c = CINE_CHAPTERS[i];

  cineSegs.forEach((s,j)=>{ s.querySelector('i').style.transform = j<i ? 'scaleX(1)' : 'scaleX(0)'; });
  cineCount.textContent = (i+1)+' / '+CINE_N;
  cineSource.textContent = c.src || '';
  cineEl.classList.toggle('last', i===CINE_N-1);
  cinePrev.disabled = (i===0); cineNext.disabled = (i===CINE_N-1);

  clearTimeout(cinema.swapTimer); cancelAnimationFrame(cinema.yearRaf);
  cineStage.classList.remove('in');
  cinema.swapTimer = setTimeout(()=>{
    cineEl.classList.toggle('intro', c.type==='intro');
    cineEl.classList.toggle('ficha', c.type==='ficha');   // el layout cambia mientras el texto está invisible
    cineEyebrow.textContent = c.eyebrow || '';
    const isYear = /^\d{4}$/.test(c.year||'');
    cineYear.textContent = c.year || '';
    cineYear.classList.toggle('long', !!c.year && !isYear);
    if(c.type==='intro' && !reducedMotion){
      cineTitle.innerHTML = [...c.title].map((ch,k)=>'<span aria-hidden="true" style="--i:'+k+'">'+ch+'</span>').join('');
      cineTitle.setAttribute('aria-label', c.title);
    } else { cineTitle.textContent = c.title; cineTitle.removeAttribute('aria-label'); }
    cineText.innerHTML = c.text;
    void cineStage.offsetWidth;                // reinicia la animación de entrada
    cineStage.classList.add('in');
    if(isYear && !reducedMotion) countYear(+c.year);
  }, first ? 1150 : 340);
  if(!first) playSwoosh();
}
function countYear(target){
  const from = target-42, t0 = performance.now();
  const step = (now)=>{
    const k = clamp01((now-t0)/850), e = 1-Math.pow(1-k,3);
    cineYear.textContent = Math.round(from + (target-from)*e);
    if(k<1) cinema.yearRaf = requestAnimationFrame(step);
  };
  cinema.yearRaf = requestAnimationFrame(step);
}
function cineNextChapter(){ if(cinema.idx < CINE_N-1) setChapter(cinema.idx+1); }
function cinePrevChapter(){ if(cinema.idx > 0) setChapter(cinema.idx-1); }

/* ---- Cada frame ---- */
function updateCinema(dt){
  cinema.t += dt;
  if(cinema.idx >= 0){
    const c = CINE_CHAPTERS[cinema.idx];
    if(cinema.t > 1.1) cinema.chapT = Math.min(1, cinema.chapT + dt/c.dur);
    if(cinema.chapT >= 1 && CINE_AUTOPLAY && cinema.idx < CINE_N-1) setChapter(cinema.idx+1);
    cineSegs[cinema.idx].querySelector('i').style.transform = 'scaleX('+cinema.chapT.toFixed(3)+')';
  }
  // la cámara avanza por la órbita según el progreso total de la historia
  const target = CINE_N>1 ? (Math.max(0,cinema.idx) + cinema.chapT) / CINE_N : 0;
  cinema.camP += (target - cinema.camP) * (1 - Math.exp(-2.4*dt));
  placeCinemaCamera();
  updateRings(dt);
  if(cinema.light){
    const k = smooth01((cinema.t-0.4)/3);
    cinema.light.position.set(cinema.center.x, cinema.topY + 2.5, cinema.center.z);
    cinema.light.intensity = (dayMode ? 14 : 70) * k;     // ← sube/baja estos números si quieres más/menos brillo en el casco
  }
  drawDust(dt);
}

function placeCinemaCamera(){
  const u = clamp01(cinema.camP), s = smooth01(u);
  const ang = cinema.a0 + CINE_ORBIT_DIR * CINE_ORBIT_SWEEP * s * (reducedMotion ? 0.35 : 1);
  const rad = cinema.R0 * (1 + 0.14*Math.sin(Math.PI*s));
  const h = cinema.h0 + (cinema.hMax - cinema.h0) * Math.sin(s*Math.PI*0.5);
  _cPos.set(cinema.center.x + Math.cos(ang)*rad, h, cinema.center.z + Math.sin(ang)*rad);
  _cLook.set(cinema.center.x, THREE.MathUtils.lerp(cinema.midY, cinema.topY, s), cinema.center.z);
  const b = smooth01(cinema.t/2.4);                       // transición suave desde la cámara del personaje
  camera.position.lerpVectors(cinema.startPos, _cPos, b);
  _cLook.lerpVectors(cinema.startLook, _cLook, b);
  camera.lookAt(_cLook);
  const fov = cinema.fov0 - 7*s;                          // acercamiento lento
  if(Math.abs(camera.fov - fov) > 0.01){ camera.fov = fov; camera.updateProjectionMatrix(); }
}

function updateRings(dt){
  for(const r of cinema.rings){
    const d = r.userData; d.age += dt;
    const a = d.age - d.delay;
    if(a < 0) continue;
    const k = clamp01(a/d.life), e = 1 - Math.pow(1-k, 3);
    if(k >= 1){ r.scale.setScalar(0.0001); r.material.opacity = 0; continue; }
    r.scale.setScalar(0.5 + e*17);
    r.material.opacity = (1-k)*0.9;
  }
}

/* ---- Polvo dorado ---- */
let dust = [];
function resizeDust(){
  const dpr = Math.min(2, window.devicePixelRatio||1);
  dustCv.width = Math.round(window.innerWidth*dpr); dustCv.height = Math.round(window.innerHeight*dpr);
  dctx.setTransform(dpr,0,0,dpr,0,0);
}
function initDust(){
  dust = reducedMotion ? [] : Array.from({length: window.innerWidth<700 ? 34 : 68}, ()=>({
    x:Math.random()*window.innerWidth, y:Math.random()*window.innerHeight, r:Math.random()*2.2+0.7,
    vx:(Math.random()-0.5)*14, vy:-(Math.random()*26+8), a:Math.random()*0.55+0.25, ph:Math.random()*6.28,
    c: Math.random()<0.78 ? '255,206,60' : '140,185,255'
  }));
}
function drawDust(dt){
  dctx.clearRect(0,0,window.innerWidth,window.innerHeight);
  for(const p of dust){
    p.x += (p.vx + Math.sin(cinema.t*0.8+p.ph)*6)*dt; p.y += p.vy*dt;
    if(p.y < -12){ p.y = window.innerHeight+12; p.x = Math.random()*window.innerWidth; }
    const tw = 0.6 + 0.4*Math.sin(cinema.t*2 + p.ph), R = p.r*4;
    const g = dctx.createRadialGradient(p.x,p.y,0,p.x,p.y,R);
    g.addColorStop(0,'rgba('+p.c+','+(p.a*tw).toFixed(3)+')'); g.addColorStop(1,'rgba('+p.c+',0)');
    dctx.fillStyle = g; dctx.beginPath(); dctx.arc(p.x,p.y,R,0,6.2832); dctx.fill();
  }
}
window.addEventListener('resize', ()=>{ if(cinema.active) resizeDust(); });

/* ---- Fin: devuelve el control con una transición suave ---- */
function endCinema(){
  if(!cinema.active) return;
  cinema.active = false;
  clearTimeout(cinema.swapTimer); cancelAnimationFrame(cinema.yearRaf);
  cineEl.classList.remove('on','intro','ficha','last'); cineEl.setAttribute('aria-hidden','true'); cineStage.classList.remove('in');
  document.body.classList.remove('cinema');
  dctx.clearRect(0,0,window.innerWidth,window.innerHeight);

  blendOut.pos.copy(camera.position); blendOut.quat.copy(camera.quaternion); blendOut.fovFrom = camera.fov; blendOut.t = 0; blendOut.on = true;

  // el personaje queda mirando hacia el casco
  yaw = Math.atan2(cinema.center.x - playerPos.x, cinema.center.z - playerPos.z); pitch = 0.12;
  characterYaw = yaw; targetCharacterYaw = yaw; velocity.set(0,0);
  mode = MODE.WALK;

  cinema.rings.forEach(r=>{ r.scale.setScalar(0.0001); r.material.opacity = 0; r.userData.age = 99; });
  if(cinema.light) cinema.light.intensity = 0;
  if(audioOn) fadeMusic(MUSIC_VOL, 1800);
  if(!isTouchDevice){ try{ const p = canvas.requestPointerLock(); if(p && p.catch) p.catch(()=>{}); }catch(e){} }
  announce && announce('Escena terminada. Ya puedes recorrer la plaza.');
}
// Mezcla suave entre la última cámara de cine y la cámara normal de caminar (se llama cada frame en modo caminar)
function applyCinemaBlendOut(dt){
  if(!blendOut.on) return;
  blendOut.t += dt/1.4;
  const e = smooth01(blendOut.t);
  _cPos.copy(camera.position); _bQuat.copy(camera.quaternion);
  camera.position.lerpVectors(blendOut.pos, _cPos, e);
  camera.quaternion.copy(blendOut.quat).slerp(_bQuat, e);
  camera.fov = THREE.MathUtils.lerp(blendOut.fovFrom, cinema.fov0, e); camera.updateProjectionMatrix();
  if(blendOut.t >= 1){ blendOut.on = false; camera.fov = cinema.fov0; camera.updateProjectionMatrix(); }
}

/* ---- Controles de la escena ---- */
document.getElementById('cine-skip').addEventListener('click', endCinema);
document.getElementById('cine-explore').addEventListener('click', endCinema);
cinePrev.addEventListener('click', cinePrevChapter);
cineNext.addEventListener('click', cineNextChapter);
cineEl.addEventListener('click', (e)=>{ if(!e.target.closest('button')) cineNextChapter(); });
window.addEventListener('keydown', (e)=>{
  if(!cinema.active) return;
  const onButton = e.target.closest && e.target.closest('button');
  if(e.code==='Escape'){ e.preventDefault(); endCinema(); }
  else if(e.code==='ArrowRight' || ((e.code==='Space'||e.code==='Enter') && !onButton)){ e.preventDefault(); cineNextChapter(); }
  else if(e.code==='ArrowLeft'){ e.preventDefault(); cinePrevChapter(); }
}, true);


/* ============================================================ 20. FULLSCREEN ============================================================ */
function toggleFullscreen(){ if(!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

/* ============================================================ 21b. NPCs — PERSONAS EN LA PLAZA (sentadas, caminando y paradas) ============================================================
   Se colocan con Empties en Blender (los busco por nombre y los dejo ocultos):
     NPC_sit_##     → una persona sentada (el Empty en el piso bajo la cadera; mira hacia el eje −Y de Blender del Empty)
     NPC_pathA_##   → ruta A en orden (se cierra sola). NPC_pathB_## … ruta B, etc.
     NPC_stand_##   → lugares donde un caminante se detiene un rato de pie
   Navegación: se construye una grilla de la plaza leyendo la geometría real del GLB (bancas, jardines, rejas,
   monumentos = obstáculos; rampas COL_* = altura del piso). Entre cada par de puntos de tu ruta corre A*
   (con costo extra cerca de obstáculos para no pegarse a las rejas), se enderezan las esquinas
   (string-pulling) y se suaviza con una curva Catmull-Rom. Los caminantes ceden el paso al jugador y entre sí. */

const NPC_ENABLED = true;
const NPC_DEBUG = false;                 // true = dibuja obstáculos (rojo/naranja) y rutas calculadas (también: npcDebug(true) en la consola)
const NPC_MAN_GLB = './npc_hombre.glb';
const NPC_WOMAN_GLB = './npc_mujer.glb';

/* ---- Ajustes que puedes tocar ---- */
const NPC_HEIGHT_MULT = 1.0;             // tamaño de todos los NPC (1 = misma altura que tu personaje jugable)
const NPC_WOMAN_RATIO = 0.94;            // la mujer un poco más baja que el hombre
const NPC_FACING_OFFSET = 0;             // si los NPC caminan/miran de espaldas: Math.PI
const NPC_SIT_YAW_OFFSET = 0;            // si al sentarse salen al revés: Math.PI  (la "línea de corrección")
const NPC_SIT_Y_OFFSET = 0;              // ★ UN solo número para la altura de todos los sentados (metros, + sube / − baja)
const NPC_SIT_FWD_OFFSET = 0;            // mueve a los sentados hacia adelante (+) o atrás (−) de la banca
const NPC_SEAT_HIP_RATIO = 0.30;         // altura de la cadera sentada respecto a la estatura (ya iguala hombre y mujer)
const NPC_WALK_SPEED_REL = 0.75;         // velocidad al caminar, en "alturas por segundo"
const NPC_WALKERS = { A:3, B:2, default:2 }; // cuántos caminantes por ruta (se limita según el largo de la ruta)
const NPC_STOP_EVERY = [18, 40];         // cada cuántos segundos un caminante decide ir a un NPC_stand_##
const NPC_STOP_TIME = [8, 16];           // cuánto se queda de pie ahí

const NPC_MARKER_RE = /^NPC_(sit|stand|path([A-Za-z0-9]*))_(\d+)/i;
const npcAgents = [];
const npcStops = [];
let npcRefH = 1.2;                       // altura de referencia (se mide del personaje jugable)
let npcGenderCounter = 0;
const npcRand = (a,b)=> a + Math.random()*(b-a);

/* ---- Variedad de ropa: cada NPC recibe camiseta y pantalón/short de colores distintos (cada color se repite como máximo 2 veces) ---- */
const NPC_SHIRT_COLORS = [0xc0392b,0x2e86c1,0x27ae60,0xf1c40f,0x8e44ad,0xe67e22,0x16a085,0xec7063,0x34495e,0xf5f5f0,0x7d6608,0x5dade2];
const NPC_PANTS_COLORS = [0x1f2a44,0x3b3b3b,0x6e4b2a,0x2c5f4a,0x8c7a5b,0x5b2a3b,0x2a4d7a,0x9a9a9a,0x4a3a6b,0x7a2f2f,0xb08d57,0x1e5f6b];
const npcShuffle = a=>{ const r=a.slice(); for(let i=r.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [r[i],r[j]]=[r[j],r[i]]; } return r; };
const npcShirtSeq = npcShuffle(NPC_SHIRT_COLORS), npcPantsSeq = npcShuffle(NPC_PANTS_COLORS);
let npcOutfitCounter = 0;
const NPC_CLOTHES_RE = /shirt|pants|tops|bottoms/i;   // Ch22_Shirt, Ch22_Pants (mujer) · Tops, Bottoms (hombre)

// Copia del material que reemplaza el color de la tela por el tinte, conservando el sombreado/detalle de la textura
function npcTintMaterial(mat, hex){
  const m = mat.clone(), c = new THREE.Color(hex);
  m.onBeforeCompile = (sh)=>{
    sh.uniforms.uNpcTint = { value:c };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uNpcTint;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  float npcL = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n  diffuseColor.rgb = uNpcTint * (0.45 + 0.85*npcL);');
  };
  m.customProgramCacheKey = ()=> 'npcTint';
  return m;
}

// Se empieza a descargar al cargar el script, en paralelo con la plaza
const npcModelsPromise = NPC_ENABLED
  ? Promise.all([gltfLoader.loadAsync(NPC_MAN_GLB), gltfLoader.loadAsync(NPC_WOMAN_GLB)])
      .catch(e=>{ console.warn('No se pudieron cargar npc_hombre.glb / npc_mujer.glb', e); return null; })
  : null;

/* ---------------------------------------------------------- marcadores (Empties) ---------------------------------------------------------- */
function collectNPCMarkers(){
  const M = { sit:[], stand:[], paths:{} };
  plazaRoot.updateMatrixWorld(true);
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), d = new THREE.Vector3();
  plazaRoot.traverse(o=>{
    const m = NPC_MARKER_RE.exec(o.name || '');
    if(!m) return;
    o.getWorldPosition(p); o.getWorldQuaternion(q);
    d.set(0,0,1).applyQuaternion(q);       // −Y de Blender  =  +Z en three.js
    const rec = { n:parseInt(m[3],10), x:p.x, y:p.y, z:p.z, yaw:Math.atan2(d.x,d.z) };
    const kind = m[1].toLowerCase();
    if(kind==='sit') M.sit.push(rec);
    else if(kind==='stand') M.stand.push(rec);
    else { const key = (m[2] || 'A').toUpperCase(); (M.paths[key] = M.paths[key] || []).push(rec); }
    o.visible = false;
  });
  const bySeq = (a,b)=> a.n-b.n;
  M.sit.sort(bySeq); M.stand.sort(bySeq);
  Object.values(M.paths).forEach(l=>l.sort(bySeq));
  return M;
}

/* ---------------------------------------------------------- modelos Mixamo ---------------------------------------------------------- */
function npcFindHips(root){ let h=null; root.traverse(o=>{ if(!h && /hips$/i.test(o.name)) h=o; }); return h; }

// Pone el modelo en el primer cuadro de un clip y mide su caja (con la piel aplicada) y la posición de la cadera.
function npcMeasurePose(scn, clip){
  const m = SkeletonUtils.clone(scn);
  const mixer = new THREE.AnimationMixer(m);
  mixer.clipAction(clip).play(); mixer.update(0);
  m.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m, true);
  const hips = npcFindHips(m), hp = new THREE.Vector3(); let ws = 1;
  if(hips){ hips.getWorldPosition(hp); if(hips.parent) ws = hips.parent.getWorldScale(new THREE.Vector3()).x; }
  mixer.stopAllAction(); mixer.uncacheRoot(m);
  return { box, hips:hp, ws };
}

function npcPrepareTemplate(gltf, label){
  const clips = gltf.animations || [];
  const T = { label, scene:gltf.scene, clips:{}, walkNativeRaw:0 };
  T.clips.idle = clips.find(a=>/idle/i.test(a.name)) || clips[0];
  T.clips.walk = clips.find(a=>/walk|camin/i.test(a.name)) || null;
  T.clips.sit  = clips.find(a=>/sit|sent/i.test(a.name)) || null;
  if(!T.clips.idle) throw new Error('El modelo '+label+' no trae animaciones');
  gltf.scene.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.isNPC = true; } });

  T.idle = npcMeasurePose(T.scene, T.clips.idle);
  T.rawH = T.idle.box.max.y - T.idle.box.min.y;
  T.sit = T.clips.sit ? npcMeasurePose(T.scene, T.clips.sit) : null;

  // El clip "walk" de Mixamo viene CON desplazamiento (root motion: la cadera avanza ~3 m por ciclo).
  // Se quita ese avance para que el código mueva al NPC por la ruta, y de ahí se calcula su velocidad "natural" (sin patinar).
  if(T.clips.walk){
    const tr = T.clips.walk.tracks.find(t=>/Hips\.position$/i.test(t.name));
    if(tr){
      const v = tr.values, t = tr.times, n = t.length;
      const dx = v[(n-1)*3] - v[0], dy = v[(n-1)*3+1] - v[1], dur = t[n-1]-t[0];
      if(dur>0 && Math.hypot(dx,dy) > 1e-3){
        for(let i=0;i<n;i++){ const k=(t[i]-t[0])/dur; v[i*3] -= dx*k; v[i*3+1] -= dy*k; }
        T.walkNativeRaw = Math.hypot(dx,dy) * T.idle.ws / dur;   // m/s a escala 1
      }
    }
  }
  console.log('✓ NPC '+label+': alto '+T.rawH.toFixed(2)+' | clips: '+Object.entries(T.clips).filter(([,c])=>c).map(([k,c])=>k+'='+c.name).join(', ')
    + (T.sit ? ' | cadera sentada a '+(T.sit.hips.y-T.sit.box.min.y).toFixed(2)+' sobre el punto más bajo' : ''));
  return T;
}

function npcMeasureReferenceHeight(){
  if(character){
    character.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(character, true);
    const h = b.max.y - b.min.y;
    if(h>0.3 && h<6) return h;
  }
  return 1.6*0.75;   // altura de tu personaje.glb × su escala 0.75
}

/* ---------------------------------------------------------- instancias ---------------------------------------------------------- */
function npcCreate(T, role){
  const model = SkeletonUtils.clone(T.scene);
  model.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.isNPC = true; } });
  const outfit = { top: npcShirtSeq[npcOutfitCounter % npcShirtSeq.length], bottom: npcPantsSeq[(npcOutfitCounter*5+3) % npcPantsSeq.length] };
  npcOutfitCounter++;
  model.traverse(o=>{
    if(!o.isMesh || !NPC_CLOTHES_RE.test(o.name) || Array.isArray(o.material)) return;
    o.material = npcTintMaterial(o.material, /shirt|tops/i.test(o.name) ? outfit.top : outfit.bottom);
  });
  const isWoman = T.label==='mujer';
  const targetH = npcRefH * NPC_HEIGHT_MULT * (isWoman ? NPC_WOMAN_RATIO : 1);
  const s = targetH / T.rawH;
  model.scale.setScalar(s);
  if(role==='sit' && T.sit){
    // cadera exactamente sobre el Empty y a una altura fija respecto al piso (igual para hombre y mujer)
    const hipY = NPC_SEAT_HIP_RATIO*targetH + NPC_SIT_Y_OFFSET;
    model.position.set(-T.sit.hips.x*s, hipY - T.sit.hips.y*s, -T.sit.hips.z*s + NPC_SIT_FWD_OFFSET);
  } else {
    // de pie: pies en el piso y cadera centrada en el punto
    model.position.set(-T.idle.hips.x*s, -T.idle.box.min.y*s, -T.idle.hips.z*s);
  }
  const holder = new THREE.Group();
  holder.add(model);
  scene.add(holder);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for(const k of ['idle','walk','sit']){
    if(!T.clips[k]) continue;
    const a = mixer.clipAction(T.clips[k]);
    a.setLoop(THREE.LoopRepeat, Infinity);
    actions[k] = a;
  }
  const agent = { T, holder, model, mixer, actions, cur:null, scale:s, yaw:0, targetYaw:0, v:0, role,
                  nativeSpeed: (T.walkNativeRaw*s) || 1, track:null, loopTrack:null, s:0, speed:0, state:'idle',
                  timer:0, blockT:0, ignoreT:0, stop:null, returnS:0, standYaw:0 };
  npcAgents.push(agent);
  // los jugadores no atraviesan a los NPC (reutiliza tu sistema de colisión circular; el centro sigue al NPC)
  colliders.push({ center: holder.position, radius: 0.2*npcRefH });
  return agent;
}

function npcSetAnim(a, name, fade=0.35){
  if(a.cur===name) return;
  const next = a.actions[name]; if(!next) return;
  const prev = a.cur ? a.actions[a.cur] : null;
  next.enabled = true; next.setEffectiveWeight(1);
  if(prev){ next.reset(); next.play(); prev.crossFadeTo(next, fade, false); } else next.play();
  a.cur = name;
}

function npcNextTemplate(){ const T = npcTemplates[(npcGenderCounter++)%2]; return T; }
let npcTemplates = null;

function npcSpawnSitter(rec){
  const a = npcCreate(npcNextTemplate(), 'sit');
  a.holder.position.set(rec.x, rec.y, rec.z);
  a.yaw = rec.yaw + NPC_SIT_YAW_OFFSET;
  a.holder.rotation.y = a.yaw + NPC_FACING_OFFSET;
  const name = a.actions.sit ? 'sit' : 'idle';
  npcSetAnim(a, name);
  a.actions[name].time = Math.random()*a.actions[name].getClip().duration;
  a.state = 'sit';
  return a;
}

/* ============================ NAVEGACIÓN: grilla + A* ============================ */
const nav = { ready:false, debugTracks:[] };
const NPC_NB = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
const _nbox = new THREE.Box3();
let _navT = 0;
async function navYield(){ if(performance.now()-_navT > 10){ await new Promise(r=>setTimeout(r,0)); _navT = performance.now(); } }

class NavHeap{
  constructor(){ this.k=[]; this.v=[]; }
  get size(){ return this.k.length; }
  push(key,val){
    const k=this.k, v=this.v; let i=k.length; k.push(key); v.push(val);
    while(i>0){ const p=(i-1)>>1; if(k[p]<=key) break; k[i]=k[p]; v[i]=v[p]; i=p; }
    k[i]=key; v[i]=val;
  }
  pop(){
    const k=this.k, v=this.v, top=v[0], lk=k.pop(), lv=v.pop(), n=k.length;
    if(n>0){
      let i=0;
      for(;;){ let c=2*i+1; if(c>=n) break; if(c+1<n && k[c+1]<k[c]) c++; if(k[c]>=lk) break; k[i]=k[c]; v[i]=v[c]; i=c; }
      k[i]=lk; v[i]=lv;
    }
    return top;
  }
}

const navIdx = (i,j)=> j*nav.nx + i;
const navFree = (i,j)=> i>=0 && j>=0 && i<nav.nx && j<nav.nz && nav.blocked[j*nav.nx+i]===0;
const navCellOf = (x,z)=> [Math.floor((x-nav.x0)/nav.cell), Math.floor((z-nav.z0)/nav.cell)];
const navCenter = (i,j)=> ({ x: nav.x0+(i+0.5)*nav.cell, z: nav.z0+(j+0.5)*nav.cell });

// Triángulo (2D, plano XZ) vs. celda: prueba de ejes separadores
function navTriCell(ax,az,bx,bz,cx,cz,x0,z0,x1,z1){
  const V=[ax,az,bx,bz,cx,cz];
  for(let e=0;e<3;e++){
    const px=V[e*2], pz=V[e*2+1], qx=V[((e+1)%3)*2], qz=V[((e+1)%3)*2+1], rx=V[((e+2)%3)*2], rz=V[((e+2)%3)*2+1];
    const nx=-(qz-pz), nz=(qx-px);
    if(Math.abs(nx)+Math.abs(nz) < 1e-9) continue;
    const tp=nx*px+nz*pz, tq=nx*qx+nz*qz, tr=nx*rx+nz*rz;
    const tmin=Math.min(tp,tq,tr), tmax=Math.max(tp,tq,tr);
    const c1=nx*x0+nz*z0, c2=nx*x1+nz*z0, c3=nx*x0+nz*z1, c4=nx*x1+nz*z1;
    const cmin=Math.min(c1,c2,c3,c4), cmax=Math.max(c1,c2,c3,c4);
    if(cmax<tmin-1e-6 || cmin>tmax+1e-6) return false;
  }
  return true;
}

async function navRasterize(meshes, tri){
  let cnt = 0;
  const A=new THREE.Vector3(), tmp=new THREE.Matrix4();
  for(const m of meshes){
    const g = m.geometry, pos = g.attributes.position;
    if(!pos) continue;
    if(!g.boundingBox) g.computeBoundingBox();
    const idx = g.index, n = idx ? idx.count : pos.count;
    m.updateWorldMatrix(true,false);
    const mats = [];
    if(m.isInstancedMesh){ for(let k=0;k<m.count;k++){ m.getMatrixAt(k,tmp); mats.push(new THREE.Matrix4().multiplyMatrices(m.matrixWorld,tmp)); } }
    else mats.push(m.matrixWorld);
    for(const mw of mats){
      _nbox.copy(g.boundingBox).applyMatrix4(mw);
      if(_nbox.max.x<nav.x0 || _nbox.min.x>nav.x1 || _nbox.max.z<nav.z0 || _nbox.min.z>nav.z1) continue;
      const e = mw.elements;
      for(let t=0;t<n;t+=3){
        const i0 = idx?idx.getX(t):t, i1 = idx?idx.getX(t+1):t+1, i2 = idx?idx.getX(t+2):t+2;
        let x=pos.getX(i0), y=pos.getY(i0), z=pos.getZ(i0);
        const ax=e[0]*x+e[4]*y+e[8]*z+e[12], ay=e[1]*x+e[5]*y+e[9]*z+e[13], az=e[2]*x+e[6]*y+e[10]*z+e[14];
        x=pos.getX(i1); y=pos.getY(i1); z=pos.getZ(i1);
        const bx=e[0]*x+e[4]*y+e[8]*z+e[12], by=e[1]*x+e[5]*y+e[9]*z+e[13], bz=e[2]*x+e[6]*y+e[10]*z+e[14];
        x=pos.getX(i2); y=pos.getY(i2); z=pos.getZ(i2);
        const cx=e[0]*x+e[4]*y+e[8]*z+e[12], cy=e[1]*x+e[5]*y+e[9]*z+e[13], cz=e[2]*x+e[6]*y+e[10]*z+e[14];
        tri(ax,ay,az,bx,by,bz,cx,cy,cz);
        if((++cnt & 4095)===0) await navYield();
      }
    }
  }
  A.set(0,0,0);
}

async function buildNavGrid(M){
  const H = npcRefH;
  nav.cell = Math.max(0.33*H, 0.25);
  nav.low = 0.2*H;        // un obstáculo cuenta si ocupa la franja [piso+low, piso+high]
  nav.high = 0.9*H;
  nav.maxStep = 0.3*H;    // desnivel máximo entre celdas vecinas (escalón)
  nav.radius = 0.22*H;    // "grosor" del NPC
  nav.clear = 0.9*H;      // distancia a partir de la cual deja de importar alejarse de los obstáculos

  // límites: todos los puntos de rutas y paradas + margen
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  const take = r=>{ minX=Math.min(minX,r.x); maxX=Math.max(maxX,r.x); minZ=Math.min(minZ,r.z); maxZ=Math.max(maxZ,r.z); };
  Object.values(M.paths).forEach(l=>l.forEach(take)); M.stand.forEach(take);
  const pad = 5*H;
  nav.x0 = minX-pad; nav.z0 = minZ-pad; nav.x1 = maxX+pad; nav.z1 = maxZ+pad;
  while(((nav.x1-nav.x0)/nav.cell)*((nav.z1-nav.z0)/nav.cell) > 400000) nav.cell *= 1.25;
  nav.nx = Math.ceil((nav.x1-nav.x0)/nav.cell); nav.nz = Math.ceil((nav.z1-nav.z0)/nav.cell);
  const N = nav.nx*nav.nz;
  nav.floor = new Float32Array(N).fill(-1e9);
  nav.raw = new Uint8Array(N);
  nav.blocked = new Uint8Array(N);
  nav.dist = new Float32Array(N);
  nav.cost = new Float32Array(N);
  nav.g = new Float32Array(N); nav.came = new Int32Array(N);
  nav.seen = new Uint32Array(N); nav.closed = new Uint32Array(N); nav.stamp = 0;
  _navT = performance.now();

  // 1) meshes: pisos caminables (COL_*) y obstáculos (todo lo visible de la plaza)
  const floors = walkSurfaces.slice();
  const floorSet = new Set(floors);
  const obstacles = [];
  const visibleChain = o=>{ for(let p=o;p;p=p.parent){ if(p.visible===false) return false; } return true; };
  plazaRoot.traverse(o=>{
    if(!o.isMesh || o.isSkinnedMesh || floorSet.has(o)) return;
    if(!visibleChain(o)) return;
    if(/mostrar_historia|^COL_|spawn/i.test(o.name)) return;
    const mt = Array.isArray(o.material) ? o.material[0] : o.material;
    if(mt && mt.opacity===0) return;
    obstacles.push(o);
  });

  // 2) altura del piso por celda (a partir de las rampas COL_)
  const cell = nav.cell, nx = nav.nx, nz = nav.nz, x0 = nav.x0, z0 = nav.z0;
  await navRasterize(floors, (ax,ay,az,bx,by,bz,cx,cy,cz)=>{
    const minx=Math.min(ax,bx,cx), maxx=Math.max(ax,bx,cx), minz=Math.min(az,bz,cz), maxz=Math.max(az,bz,cz);
    const i0=Math.max(0,Math.floor((minx-x0)/cell)), i1=Math.min(nx-1,Math.floor((maxx-x0)/cell));
    const j0=Math.max(0,Math.floor((minz-z0)/cell)), j1=Math.min(nz-1,Math.floor((maxz-z0)/cell));
    if(i1<i0 || j1<j0) return;
    const d = (bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    if(Math.abs(d)<1e-9) return;
    let any = false;
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
      const px=x0+(i+0.5)*cell, pz=z0+(j+0.5)*cell;
      const l1=((bz-cz)*(px-cx)+(cx-bx)*(pz-cz))/d, l2=((cz-az)*(px-cx)+(ax-cx)*(pz-cz))/d, l3=1-l1-l2;
      if(l1<-1e-4||l2<-1e-4||l3<-1e-4) continue;
      const y=l1*ay+l2*by+l3*cy, k=j*nx+i;
      if(y>nav.floor[k]) nav.floor[k]=y;
      any = true;
    }
    if(!any){ // triángulo más chico que una celda
      const ci=Math.floor(((ax+bx+cx)/3-x0)/cell), cj=Math.floor(((az+bz+cz)/3-z0)/cell);
      if(ci>=0&&cj>=0&&ci<nx&&cj<nz){ const k=cj*nx+ci; if(nav.floor[k]<-1e8) nav.floor[k]=(ay+by+cy)/3; }
    }
  });
  let fMin=0, fMax=0;
  for(let k=0;k<N;k++){ if(nav.floor[k]<-1e8) nav.floor[k]=0; else { fMin=Math.min(fMin,nav.floor[k]); fMax=Math.max(fMax,nav.floor[k]); } }

  // 3) obstáculos: triángulos que ocupan la franja de altura caminable sobre el piso de cada celda
  const low=nav.low, high=nav.high;
  await navRasterize(obstacles, (ax,ay,az,bx,by,bz,cx,cy,cz)=>{
    const ymin=Math.min(ay,by,cy), ymax=Math.max(ay,by,cy);
    if(ymax < fMin+low || ymin > fMax+high) return;
    const minx=Math.min(ax,bx,cx), maxx=Math.max(ax,bx,cx), minz=Math.min(az,bz,cz), maxz=Math.max(az,bz,cz);
    const i0=Math.max(0,Math.floor((minx-x0)/cell)), i1=Math.min(nx-1,Math.floor((maxx-x0)/cell));
    const j0=Math.max(0,Math.floor((minz-z0)/cell)), j1=Math.min(nz-1,Math.floor((maxz-z0)/cell));
    if(i1<i0 || j1<j0) return;
    const e1x=bx-ax,e1y=by-ay,e1z=bz-az,e2x=cx-ax,e2y=cy-ay,e2z=cz-az;
    const nX=e1y*e2z-e1z*e2y, nY=e1z*e2x-e1x*e2z, nZ=e1x*e2y-e1y*e2x;
    const nl=Math.hypot(nX,nY,nZ)||1, slopey = Math.abs(nY)/nl > 0.35;   // superficie más bien horizontal/inclinada (no pared)
    const single = (i0===i1 && j0===j1);
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
      const k=j*nx+i;
      if(nav.raw[k]) continue;
      const f=nav.floor[k];
      let rmin=ymin, rmax=ymax;
      if(slopey){   // altura local del triángulo dentro de esta celda (para no confundir rampas con muros)
        const pcx=x0+(i+0.5)*cell, pcz=z0+(j+0.5)*cell;
        const yc=ay-(nX*(pcx-ax)+nZ*(pcz-az))/nY, hr=(Math.abs(nX)+Math.abs(nZ))/Math.abs(nY)*cell*0.5;
        rmin=Math.max(ymin,yc-hr); rmax=Math.min(ymax,yc+hr);
        if(rmin>rmax){ rmin=rmax=Math.min(ymax,Math.max(ymin,yc)); }
      }
      if(rmax < f+low || rmin > f+high) continue;
      if(!single && !navTriCell(ax,az,bx,bz,cx,cz,x0+i*cell,z0+j*cell,x0+(i+1)*cell,z0+(j+1)*cell)) continue;
      nav.raw[k]=1;
    }
  });

  // 4) colisiones circulares (monumentos y NPC sentados)
  for(const c of colliders){
    const r = c.radius + 0.05, i0=Math.max(0,Math.floor((c.center.x-r-x0)/cell)), i1=Math.min(nx-1,Math.floor((c.center.x+r-x0)/cell));
    const j0=Math.max(0,Math.floor((c.center.z-r-z0)/cell)), j1=Math.min(nz-1,Math.floor((c.center.z+r-z0)/cell));
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
      const dx=x0+(i+0.5)*cell-c.center.x, dz=z0+(j+0.5)*cell-c.center.z;
      if(dx*dx+dz*dz<=r*r) nav.raw[j*nx+i]=1;
    }
  }

  // 5) inflar obstáculos por el radio del NPC
  const rc = Math.max(1, Math.ceil(nav.radius/cell));
  for(let j=0;j<nz;j++) for(let i=0;i<nx;i++){
    if(!nav.raw[j*nx+i]) continue;
    for(let dj=-rc;dj<=rc;dj++) for(let di=-rc;di<=rc;di++){
      if(di*di+dj*dj>rc*rc+1) continue;
      const a=i+di,b=j+dj; if(a>=0&&b>=0&&a<nx&&b<nz) nav.blocked[b*nx+a]=1;
    }
  }

  // 6) distancia al obstáculo más cercano (chamfer) → costo extra para no caminar pegado a rejas/bancas
  const INF=1e6, D=nav.dist, W2=Math.SQRT2;
  for(let k=0;k<N;k++) D[k]=nav.raw[k]?0:INF;
  for(let j=0;j<nz;j++) for(let i=0;i<nx;i++){
    const k=j*nx+i; let d=D[k];
    if(i>0) d=Math.min(d,D[k-1]+1);
    if(j>0){ d=Math.min(d,D[k-nx]+1); if(i>0) d=Math.min(d,D[k-nx-1]+W2); if(i<nx-1) d=Math.min(d,D[k-nx+1]+W2); }
    D[k]=d;
  }
  for(let j=nz-1;j>=0;j--) for(let i=nx-1;i>=0;i--){
    const k=j*nx+i; let d=D[k];
    if(i<nx-1) d=Math.min(d,D[k+1]+1);
    if(j<nz-1){ d=Math.min(d,D[k+nx]+1); if(i<nx-1) d=Math.min(d,D[k+nx+1]+W2); if(i>0) d=Math.min(d,D[k+nx-1]+W2); }
    D[k]=d;
  }
  nav.softD = nav.clear/cell;
  for(let k=0;k<N;k++){ const t=Math.max(0,1-D[k]/nav.softD); nav.cost[k]=1+3*t*t; }

  nav.ready = true;
  let nb=0; for(let k=0;k<N;k++) if(nav.raw[k]) nb++;
  console.log('✓ Grilla de navegación '+nx+'×'+nz+' (celda '+cell.toFixed(2)+' m), '+nb+' celdas bloqueadas, '+obstacles.length+' meshes analizados');
}

function navSnap(x,z,maxR=12){
  let [i,j] = navCellOf(x,z);
  i = Math.min(nav.nx-1,Math.max(0,i)); j = Math.min(nav.nz-1,Math.max(0,j));
  if(navFree(i,j)) return { i,j,moved:false };
  for(let r=1;r<=maxR;r++){
    let best=null, bd=1e9;
    for(let dj=-r;dj<=r;dj++) for(let di=-r;di<=r;di++){
      if(Math.max(Math.abs(di),Math.abs(dj))!==r) continue;
      if(!navFree(i+di,j+dj)) continue;
      const d=di*di+dj*dj; if(d<bd){ bd=d; best={ i:i+di, j:j+dj, moved:true }; }
    }
    if(best) return best;
  }
  return null;
}

function navAstar(si,sj,gi,gj){
  const nx=nav.nx, st=++nav.stamp, g=nav.g, came=nav.came, seen=nav.seen, closed=nav.closed, fl=nav.floor, cost=nav.cost;
  const s=sj*nx+si, goal=gj*nx+gi, heap=new NavHeap();
  const hf=(i,j)=>{ const dx=Math.abs(i-gi), dz=Math.abs(j-gj); return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz); };
  g[s]=0; seen[s]=st; came[s]=-1; heap.push(hf(si,sj),s);
  while(heap.size){
    const cur=heap.pop();
    if(closed[cur]===st) continue;
    closed[cur]=st;
    if(cur===goal) break;
    const ci=cur%nx, cj=(cur/nx)|0;
    for(const [dx,dz,w] of NPC_NB){
      const ni=ci+dx, nj=cj+dz;
      if(!navFree(ni,nj)) continue;
      const k=nj*nx+ni;
      if(closed[k]===st) continue;
      if(Math.abs(fl[k]-fl[cur])>nav.maxStep) continue;
      if(dx&&dz && (!navFree(ci+dx,cj) || !navFree(ci,cj+dz))) continue;   // sin cortar esquinas
      const ng=g[cur]+w*0.5*(cost[cur]+cost[k]);
      if(seen[k]!==st || ng<g[k]){ seen[k]=st; g[k]=ng; came[k]=cur; heap.push(ng+hf(ni,nj),k); }
    }
  }
  if(closed[goal]!==st) return null;
  const out=[]; for(let k=goal;k!==-1;k=came[k]) out.push([k%nx,(k/nx)|0]);
  return out.reverse();
}

// ¿Hay línea de visión libre (y con holgura) entre dos celdas?
function navLos(i0,j0,i1,j1){
  const dx=i1-i0, dz=j1-j0, steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)*2));
  let prev=navIdx(i0,j0), minD=Infinity;
  for(let s=1;s<=steps;s++){
    const t=s/steps, ci=Math.round(i0+dx*t), cj=Math.round(j0+dz*t);
    if(!navFree(ci,cj)) return false;
    const k=navIdx(ci,cj);
    if(Math.abs(nav.floor[k]-nav.floor[prev])>nav.maxStep) return false;
    prev=k; minD=Math.min(minD,nav.dist[k]);
  }
  return minD >= Math.min(nav.dist[navIdx(i0,j0)], nav.dist[navIdx(i1,j1)], nav.softD)*0.85;
}

function navStringPull(cells){
  if(cells.length<3) return cells;
  const out=[cells[0]]; let a=0;
  while(a<cells.length-1){
    let b=cells.length-1;
    while(b>a+1 && !navLos(cells[a][0],cells[a][1],cells[b][0],cells[b][1])) b--;
    out.push(cells[b]); a=b;
  }
  return out;
}

// Camino entre dos puntos del mundo → [{x,z}] o null
function navPath(ax,az,bx,bz){
  const s=navSnap(ax,az), g=navSnap(bx,bz);
  if(!s||!g) return null;
  let cells;
  if(s.i===g.i && s.j===g.j) cells=[[s.i,s.j]];
  else { cells=navAstar(s.i,s.j,g.i,g.j); if(!cells) return null; cells=navStringPull(cells); }
  const nodes=cells.map(([i,j])=>navCenter(i,j));
  if(!s.moved) nodes[0]={x:ax,z:az}; else nodes.unshift({x:ax,z:az});
  if(!g.moved) nodes[nodes.length-1]={x:bx,z:bz};
  return nodes;
}

function navGroundY(x,z){
  const [i,j]=navCellOf(x,z);
  const hint = (i>=0&&j>=0&&i<nav.nx&&j<nav.nz) ? nav.floor[j*nav.nx+i] : 0;
  if(!walkSurfaces.length) return hint;
  _gOrigin.set(x, hint+nav.maxStep+0.2, z);
  groundRay.set(_gOrigin, _gDown);
  groundRay.far = nav.maxStep*2+0.6;
  const hits = groundRay.intersectObjects(walkSurfaces,false);
  return hits.length ? hits[0].point.y : hint;
}

const navRawBlockedAt = (x,z)=>{ const [i,j]=navCellOf(x,z); return i<0||j<0||i>=nav.nx||j>=nav.nz || nav.raw[j*nav.nx+i]===1; };

/* ---------------------------------------------------------- pistas (rutas suavizadas y muestreadas) ---------------------------------------------------------- */
function npcResample(pts, closed, ds){
  const P = pts.slice(); if(closed) P.push(P[0]);
  const cum=[0]; for(let i=1;i<P.length;i++) cum.push(cum[i-1]+P[i].distanceTo(P[i-1]));
  const total=cum[cum.length-1];
  const N=Math.max(2,Math.round(total/ds)), out=[]; let seg=0;
  const count = closed ? N : N+1;
  for(let k=0;k<count;k++){
    const d=total*k/N;
    while(seg<P.length-2 && cum[seg+1]<d) seg++;
    const l=cum[seg+1]-cum[seg], f=l>1e-9?(d-cum[seg])/l:0;
    out.push(new THREE.Vector3().lerpVectors(P[seg],P[seg+1],Math.min(1,Math.max(0,f))));
  }
  return out;
}

function npcBuildTrack(nodes, closed){
  let pts = [];
  for(const n of nodes){ const v=new THREE.Vector3(n.x,0,n.z); if(!pts.length || v.distanceTo(pts[pts.length-1])>0.05) pts.push(v); }
  if(closed && pts.length>1 && pts[0].distanceTo(pts[pts.length-1])<0.05) pts.pop();
  if(pts.length<2) return null;
  const ds = nav.cell*0.5;
  let sampled = null;
  if(pts.length>=3){
    try{
      const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
      const len = curve.getLength(), N = Math.max(8, Math.ceil(len/ds));
      let sp = curve.getSpacedPoints(N);
      if(closed) sp.pop();
      if(sp.every(p=>!navRawBlockedAt(p.x,p.z))) sampled = sp;   // la curva no debe cortar ningún obstáculo
    }catch(e){}
  }
  if(!sampled) sampled = npcResample(pts, closed, ds);
  const n = sampled.length;
  for(const p of sampled) p.y = navGroundY(p.x,p.z);
  const ys = sampled.map(p=>p.y);
  for(let i=0;i<n;i++){   // suavizado leve de la altura (escalones/rampas)
    const a=ys[closed?(i+n-1)%n:Math.max(0,i-1)], c=ys[closed?(i+1)%n:Math.min(n-1,i+1)];
    sampled[i].y = (a+ys[i]*2+c)/4;
  }
  const cum=[0]; for(let i=1;i<n;i++) cum.push(cum[i-1]+sampled[i].distanceTo(sampled[i-1]));
  let total = cum[n-1]; if(closed) total += sampled[n-1].distanceTo(sampled[0]);
  return { pts:sampled, cum, n, total, closed };
}

function npcEval(tr, s, out){
  const n=tr.n;
  const t = tr.closed ? ((s%tr.total)+tr.total)%tr.total : Math.min(Math.max(s,0),tr.total);
  let lo=0, hi=n-1;
  while(lo<hi){ const mid=(lo+hi+1)>>1; if(tr.cum[mid]<=t) lo=mid; else hi=mid-1; }
  const nxt = tr.closed ? (lo+1)%n : Math.min(lo+1,n-1);
  const segLen = (tr.closed && lo===n-1) ? tr.total-tr.cum[lo] : (lo<n-1 ? tr.cum[lo+1]-tr.cum[lo] : 0);
  const f = segLen>1e-9 ? (t-tr.cum[lo])/segLen : 0;
  return out.lerpVectors(tr.pts[lo], tr.pts[nxt], Math.min(1,Math.max(0,f)));
}

/* ---------------------------------------------------------- caminantes ---------------------------------------------------------- */
const _npcP = new THREE.Vector3(), _npcQ = new THREE.Vector3();

function npcSpawnWalker(route, startS, speed){
  const a = npcCreate(npcNextTemplate(), 'walk');
  a.track = a.loopTrack = route.track;
  a.s = startS; a.speed = speed; a.state = 'loop';
  a.timer = npcRand(NPC_STOP_EVERY[0], NPC_STOP_EVERY[1]);
  npcEval(a.track, a.s, _npcP);
  a.holder.position.copy(_npcP);
  npcEval(a.track, a.s+0.4, _npcQ);
  a.yaw = a.targetYaw = Math.atan2(_npcQ.x-_npcP.x, _npcQ.z-_npcP.z);
  a.holder.rotation.y = a.yaw + NPC_FACING_OFFSET;
  npcSetAnim(a,'walk');
  if(a.actions.walk) a.actions.walk.time = Math.random()*a.actions.walk.getClip().duration;
  return a;
}

function npcIsBlocked(a){
  const R = 0.85*npcRefH, hx=Math.sin(a.yaw), hz=Math.cos(a.yaw), p=a.holder.position;
  const check = (x,z,y)=>{
    if(Math.abs(y-p.y)>1.2) return false;
    const dx=x-p.x, dz=z-p.z, d=Math.hypot(dx,dz);
    return d<R && d>1e-4 && (dx*hx+dz*hz)/d>0.5;
  };
  if(mode===MODE.WALK && check(playerPos.x, playerPos.z, groundY)) return true;
  for(const o of npcAgents){
    if(o===a || o.role==='sit') continue;
    if(check(o.holder.position.x, o.holder.position.z, o.holder.position.y)) return true;
  }
  return false;
}

function npcStartStop(a){
  a.timer = npcRand(NPC_STOP_EVERY[0], NPC_STOP_EVERY[1]);   // si no se puede, reintenta más tarde
  if(!nav.ready) return;
  const free = npcStops.filter(s=>!s.taken);
  if(!free.length) return;
  const st = free[(Math.random()*free.length)|0];
  const p = a.holder.position;
  const nodes = navPath(p.x,p.z,st.x,st.z);
  const tr = nodes && npcBuildTrack(nodes,false);
  if(!tr || tr.total>80) return;
  st.taken = true; a.stop = st; a.track = tr; a.s = 0; a.state = 'goto';
}

function npcReturnToLoop(a){
  if(a.stop){ a.stop.taken=false; a.stop=null; }
  const L=a.loopTrack, p=a.holder.position;
  let k=0, bd=Infinity;
  for(let i=0;i<L.n;i++){ const d=(L.pts[i].x-p.x)**2+(L.pts[i].z-p.z)**2; if(d<bd){ bd=d; k=i; } }
  const target=L.pts[k];
  const nodes = navPath(p.x,p.z,target.x,target.z) || [{x:p.x,z:p.z},{x:target.x,z:target.z}];
  const tr = npcBuildTrack(nodes,false);
  a.returnS = L.cum[k];
  if(!tr){ a.track=L; a.s=a.returnS; a.state='loop'; a.timer=npcRand(NPC_STOP_EVERY[0],NPC_STOP_EVERY[1]); return; }
  a.track=tr; a.s=0; a.state='return';
}

function updateWalker(a, dt){
  if(a.state==='stand'){ a.timer-=dt; if(a.timer<=0) npcReturnToLoop(a); }
  else if(a.state==='loop'){ a.timer-=dt; if(a.timer<=0) npcStartStop(a); }

  let want = a.state==='stand' ? 0 : a.speed;
  if(want>0){
    let blocked = npcIsBlocked(a);
    if(blocked){ a.blockT+=dt; if(a.blockT>3.5){ a.ignoreT=2; a.blockT=0; } } else a.blockT=Math.max(0,a.blockT-dt);
    if(a.ignoreT>0){ a.ignoreT-=dt; blocked=false; }
    if(blocked) want=0;
  }
  a.v += (want-a.v)*(1-Math.exp(-5*dt));
  if(want===0 && a.v<0.02) a.v=0;
  a.s += a.v*dt;

  const tr=a.track;
  if(!tr.closed && a.s>=tr.total){
    a.s = tr.total;
    if(a.state==='goto'){ a.state='stand'; a.timer=npcRand(NPC_STOP_TIME[0],NPC_STOP_TIME[1]); a.standYaw=a.stop?a.stop.yaw:a.yaw; }
    else if(a.state==='return'){ a.track=a.loopTrack; a.s=a.returnS; a.state='loop'; a.timer=npcRand(NPC_STOP_EVERY[0],NPC_STOP_EVERY[1]); }
  }
  npcEval(a.track, a.s, _npcP);
  a.holder.position.copy(_npcP);

  if(a.state==='stand' && a.v<0.05) a.targetYaw = a.standYaw;
  else {
    npcEval(a.track, a.s+0.35*npcRefH, _npcQ);
    const dx=_npcQ.x-_npcP.x, dz=_npcQ.z-_npcP.z;
    if(dx*dx+dz*dz>1e-6) a.targetYaw = Math.atan2(dx,dz);
  }
  a.yaw = lerpAngle(a.yaw, a.targetYaw, 1-Math.exp(-7*dt));
  a.holder.rotation.y = a.yaw + NPC_FACING_OFFSET;

  if(a.v>0.05 && a.actions.walk){
    npcSetAnim(a,'walk');
    a.actions.walk.timeScale = THREE.MathUtils.clamp(a.v/a.nativeSpeed, 0.4, 2.2);
  } else npcSetAnim(a,'idle');
}

function updateNPCs(dt){
  if(!npcAgents.length) return;
  for(const a of npcAgents){
    if(a.role==='walk' && a.track) updateWalker(a, dt);
    a.mixer.update(dt);
  }
}

/* ---------------------------------------------------------- depuración visual ---------------------------------------------------------- */
let npcDebugGroup = null;
function npcDebugBuild(){
  if(npcDebugGroup){ scene.remove(npcDebugGroup); npcDebugGroup=null; }
  if(!nav.ready) return;
  npcDebugGroup = new THREE.Group();
  const cells=[]; for(let k=0;k<nav.blocked.length;k++) if(nav.blocked[k]) cells.push(k);
  const geo = new THREE.PlaneGeometry(nav.cell*0.92, nav.cell*0.92); geo.rotateX(-Math.PI/2);
  const mat = new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.45, depthWrite:false });
  const im = new THREE.InstancedMesh(geo, mat, cells.length), m4=new THREE.Matrix4(), col=new THREE.Color();
  cells.forEach((k,n)=>{
    const i=k%nav.nx, j=(k/nav.nx)|0, c=navCenter(i,j);
    m4.setPosition(c.x, nav.floor[k]+0.06, c.z); im.setMatrixAt(n,m4);
    im.setColorAt(n, col.set(nav.raw[k]?0xff2020:0xff9a20));
  });
  npcDebugGroup.add(im);
  nav.debugTracks.forEach((t,idx)=>{
    const pts = t.pts.map(p=>new THREE.Vector3(p.x,p.y+0.12,p.z));
    const line = t.closed ? new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: idx%2?0x20e0ff:0x40ff60 }))
                          : new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:0xffffff }));
    npcDebugGroup.add(line);
  });
  scene.add(npcDebugGroup);
}
window.npcDebug = (on=true)=>{ if(on) npcDebugBuild(); else if(npcDebugGroup){ scene.remove(npcDebugGroup); npcDebugGroup=null; } };

/* ---------------------------------------------------------- arranque ---------------------------------------------------------- */
async function initNPCs(){
  if(!NPC_ENABLED || !npcModelsPromise) return;
  try{
    const M = collectNPCMarkers();
    const nPaths = Object.keys(M.paths).length;
    if(!M.sit.length && !nPaths && !M.stand.length){
      console.warn('NPC: no se encontró ningún Empty NPC_sit_## / NPC_pathA_## / NPC_stand_## en el GLB. Re-exporta proyecto_plaza.glb con los Empties incluidos.');
      return;
    }
    console.log('✓ NPC marcadores: '+M.sit.length+' sit, '+Object.entries(M.paths).map(([k,l])=>l.length+' path'+k).join(', ')+', '+M.stand.length+' stand');
    const gl = await npcModelsPromise;
    if(!gl) return;
    npcRefH = npcMeasureReferenceHeight();
    npcTemplates = [ npcPrepareTemplate(gl[0],'hombre'), npcPrepareTemplate(gl[1],'mujer') ];

    // 1) sentados (no necesitan navegación)
    M.sit.forEach(r=>npcSpawnSitter(r));

    // 2) navegación + caminantes
    if(!nPaths) return;
    await buildNavGrid(M);
    M.stand.forEach(r=>npcStops.push({ x:r.x, y:r.y, z:r.z, yaw:r.yaw, taken:false }));
    nav.debugTracks = [];

    for(const key of Object.keys(M.paths).sort()){
      const W = M.paths[key];
      if(W.length<3){ console.warn('NPC: la ruta '+key+' necesita al menos 3 puntos.'); continue; }
      // puntos de la ruta a celdas libres
      const pts = W.map(r=>{ const s=navSnap(r.x,r.z); if(!s){ return {x:r.x,z:r.z}; } return s.moved ? navCenter(s.i,s.j) : {x:r.x,z:r.z}; });
      const nodes = [];
      for(let i=0;i<pts.length;i++){
        const a=pts[i], b=pts[(i+1)%pts.length];
        const seg = navPath(a.x,a.z,b.x,b.z);
        if(!seg){ console.warn('NPC: ruta '+key+', no hay camino entre el punto '+(i+1)+' y el '+(((i+1)%pts.length)+1)+'. Se une en línea recta; revisa que no haya un obstáculo cerrado.'); nodes.push(a); continue; }
        nodes.push(...seg.slice(0,-1));
      }
      const track = npcBuildTrack(nodes, true);
      if(!track){ console.warn('NPC: no se pudo construir la ruta '+key); continue; }
      nav.debugTracks.push(track);
      const want = NPC_WALKERS[key] !== undefined ? NPC_WALKERS[key] : NPC_WALKERS.default;
      const count = Math.max(1, Math.min(want, Math.floor(track.total/(5*npcRefH))));
      const speed = NPC_WALK_SPEED_REL*npcRefH*(key==='B'?0.9:1);
      for(let k=0;k<count;k++) npcSpawnWalker({ track }, (k/count)*track.total + npcRand(0,0.8), speed);
      console.log('✓ Ruta '+key+': '+track.total.toFixed(1)+' m, '+count+' caminante(s)');
    }
    if(NPC_DEBUG) npcDebugBuild();
  }catch(err){ console.error('NPC: error al iniciar', err); }
}

/* ============================================================ 21c. EXTRAS — Ir a · Recorrido guiado · Sonido ambiente · Palomas · Audio-guía · Modo foto · Consejos de carga ============================================================
   Todo está pensado para poder quitarlo fácil: cada bloque es independiente (busca su "/* ---- " de inicio). */
const byId = id => document.getElementById(id);
const exV3 = (x=0,y=0,z=0)=> new THREE.Vector3(x,y,z);
const exRand = (a,b)=> a + Math.random()*(b-a);

/* ---- Monumentos que se pueden visitar (menú «Ir a» y recorrido guiado) ---- */
const EX_STOPS = [
  { names:['monumento_casco_minero'], title:'Casco Minero', sub:'El corazón de la plaza',
    eyebrow:'La Virgen del Rosario sobre el casco',
    text:'El casco minero monumental simboliza el trabajo y la identidad de Huanuni. En su cima, la Virgen del Rosario acompaña a los mineros en cada jornada bajo tierra.' },
  { names:['estatua_simon_bolivar','estatua_simon_bolivar1'], title:'Simón Bolívar', sub:'Libertador · 1783–1830',
    eyebrow:'Libertador de América',
    text:'Simón Bolívar encabezó la independencia de varios países sudamericanos. En 1825 el nuevo Estado adoptó el nombre de Bolivia en su honor. El busto lo muestra con uniforme militar y laureles.' },
  { names:['estatua_fermin_lopez','estatua_fermin_lopez1'], title:'Fermín López Téllez', sub:'Dirigente minero · 1863–1934',
    eyebrow:'El nombre de la plaza',
    text:'Fermín López Téllez fue un destacado dirigente minero de Huanuni, defensor de los derechos de los trabajadores. Esta plaza lleva su nombre como homenaje a su legado.' },
  { names:['estatua_pantaleon_dalence'], title:'Pantaleón Dalence', sub:'Padre de la Justicia · 1815–1892',
    eyebrow:'Padre de la Justicia Boliviana',
    text:'Pantaleón Dalence fue jurista, presidente de la Corte Suprema y ministro de Hacienda. La provincia cuya capital es Huanuni lleva su nombre.' },
  { names:['estatua_juan_lechin'], title:'Juan Lechín Oquendo', sub:'Líder sindical minero',
    eyebrow:'Voz del sindicalismo minero',
    text:'Durante más de cuatro décadas, Juan Lechín fue la voz más influyente del sindicalismo minero boliviano, al frente de la COB y de la FSTMB. El monumento fue develado por dirigentes de la FSTMB.' },
];
const exEntry = st => { for(const n of st.names){ if(interactables[n]) return interactables[n]; } return null; };
const exStops = () => EX_STOPS.filter(exEntry);
// Hay algo en curso que no debe interrumpirse con un cambio de modo
function extrasBusy(){ return tour.active || mode===MODE.FLYING || mode===MODE.INSPECT; }

/* ---- Aviso breve (toast) y fundido a negro ---- */
let exToastT = null;
function showToast(msg, ms=2600){
  const t = byId('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(exToastT); exToastT = setTimeout(()=> t.classList.remove('show'), ms);
}
function fadeThen(fn){
  const f = byId('fx-fade'); f.classList.add('on');
  setTimeout(()=>{ fn(); setTimeout(()=> f.classList.remove('on'), 140); }, 280);
}

/* ---- Consejos en la pantalla de carga ---- */
(function loaderTips(){
  const el = byId('lo-tip'); if(!el) return;
  const tips = isTouchDevice ? [
    'Toca «Caminar» y usa el joystick para recorrer la plaza.',
    'Toca un monumento para inspeccionarlo en 3D.',
    'Sube las gradas hasta el casco minero: ahí te espera la historia de Huanuni.',
    'Prueba el modo noche: la plaza se ilumina.',
    'Con «Ir a» vuelas directo a cualquier monumento.',
    'Activa el recorrido guiado y déjate llevar.'
  ] : [
    'Pulsa «Caminar» y usa W A S D para recorrer la plaza. Shift para correr.',
    'Haz clic en un monumento para inspeccionarlo en 3D.',
    'Sube las gradas hasta el casco minero: ahí te espera la historia de Huanuni.',
    'Prueba el modo noche: la plaza se ilumina.',
    'Con «Ir a» vuelas directo a cualquier monumento.',
    'Activa el recorrido guiado y déjate llevar.',
    'El modo foto guarda una imagen de la plaza con tu encuadre.'
  ];
  let i = (Math.random()*tips.length)|0;
  const show = ()=>{ el.classList.remove('in'); setTimeout(()=>{ el.textContent = tips[i++ % tips.length]; el.classList.add('in'); }, 260); };
  show();
  const id = setInterval(()=>{ if(loaderEl.classList.contains('hidden')){ clearInterval(id); return; } show(); }, 3800);
})();

/* ---- Menú «Ir a» (teletransporte rápido) ---- */
const gotoMenu = byId('goto-menu'), gotoBtn = byId('btn-goto');
function buildGotoMenu(){
  const list = byId('gm-list'); list.innerHTML = '';
  exStops().forEach(st=>{
    const b = document.createElement('button');
    b.className = 'gm-item'; b.setAttribute('role','menuitem');
    b.innerHTML = `<span class="gm-dot"></span><span class="gm-t">${st.title}</span><span class="gm-s">${st.sub}</span>`;
    b.addEventListener('click', ()=> gotoStop(st));
    list.appendChild(b);
  });
  const ov = document.createElement('button');
  ov.className = 'gm-item gm-over'; ov.setAttribute('role','menuitem');
  ov.innerHTML = '<span class="gm-dot"></span><span class="gm-t">Vista general</span><span class="gm-s">Volver al encuadre inicial</span>';
  ov.addEventListener('click', ()=>{ closeGoto(); recenterView(); });
  list.appendChild(ov);
}
function openGoto(){
  if(mode!==MODE.ORBIT && mode!==MODE.WALK) return;
  if(document.pointerLockElement) document.exitPointerLock();
  gotoMenu.classList.add('open'); gotoMenu.setAttribute('aria-hidden','false'); gotoBtn.setAttribute('aria-expanded','true');
  const f = gotoMenu.querySelector('button'); if(f) f.focus();
}
function closeGoto(){
  gotoMenu.classList.remove('open'); gotoMenu.setAttribute('aria-hidden','true'); gotoBtn.setAttribute('aria-expanded','false');
}
function toggleGoto(){ gotoMenu.classList.contains('open') ? closeGoto() : openGoto(); }
gotoBtn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleGoto(); });
document.addEventListener('pointerdown', (e)=>{
  if(gotoMenu.classList.contains('open') && !e.target.closest('#goto-menu,#btn-goto')) closeGoto();
});

function gotoStop(st){
  closeGoto();
  if(mode!==MODE.ORBIT && mode!==MODE.WALK) return;
  const entry = exEntry(st); if(!entry) return;
  const { camPos, lookAt, size } = calculateInspectionCamera(entry.object);
  if(mode===MODE.ORBIT){
    const p = lookAt.clone().add(camPos.clone().sub(lookAt).multiplyScalar(1.25));
    p.y = Math.max(p.y, lookAt.y + size.y*0.2);
    flyCameraTo(p, lookAt, 1.7, ()=>{ mode = MODE.ORBIT; orbit.enabled = true; orbit.target.copy(lookAt); orbit.update(); });
    mode = MODE.FLYING; orbit.enabled = false;   // (flyCameraTo ya tomó el punto de partida)
    playSwoosh();
  } else {
    teleportWalk(entry);
  }
}
function teleportWalk(entry){
  const box = entry.box || new THREE.Box3().setFromObject(entry.object);
  const c = box.getCenter(exV3()), s = box.getSize(exV3());
  const dir = exV3(-c.x, 0, -c.z);                 // del monumento hacia el centro de la plaza
  if(dir.lengthSq() < 0.25) dir.set(0,0,1);
  dir.normalize();
  const dist = Math.max(s.x, s.z)*0.5 + 2.6;
  let px = c.x + dir.x*dist, pz = c.z + dir.z*dist;
  if(nav.ready){ const sn = navSnap(px, pz, 30); if(sn){ const cc = navCenter(sn.i, sn.j); px = cc.x; pz = cc.z; } }
  fadeThen(()=>{
    [px,pz] = resolveCollisions(px,pz);
    playerPos.set(px, 0, pz);
    groundY = box.min.y; groundY = getGroundHeight(px,pz);
    yaw = Math.atan2(c.x-px, c.z-pz); pitch = 0.12;
    velocity.set(0,0); characterYaw = yaw; targetCharacterYaw = yaw;
    if(!isTouchDevice){ try{ const r = canvas.requestPointerLock(); if(r && r.catch) r.catch(()=>{}); }catch(e){} }
    announce('Te trasladaste a '+(entry.title||'el monumento'));
  });
}

/* ---- Audio-guía narrada (síntesis de voz del navegador, sin archivos) ---- */
const narr = { supported:('speechSynthesis' in window) && ('SpeechSynthesisUtterance' in window), chunks:[], idx:0, active:false, paused:false, token:0, voice:null, onEnd:null, u:null };
function narrVoice(){
  if(narr.voice) return narr.voice;
  const vs = speechSynthesis.getVoices(); if(!vs.length) return null;
  for(const lang of ['es-BO','es-419','es-MX','es-US','es-AR','es-CO','es-CL','es-PE','es-ES','es']){
    const v = vs.find(v=> v.lang && v.lang.replace('_','-').toLowerCase().startsWith(lang.toLowerCase()));
    if(v){ narr.voice = v; return v; }
  }
  return null;
}
if(narr.supported) speechSynthesis.onvoiceschanged = ()=>{ narr.voice = null; };
function narrSplit(text){
  const parts = (text.replace(/\s+/g,' ').match(/[^.!?…]+[.!?…]*/g) || [text]).map(s=>s.trim()).filter(Boolean);
  const out = []; let cur = '';
  for(const p of parts){ if((cur+' '+p).length > 170 && cur){ out.push(cur); cur = p; } else cur = cur ? cur+' '+p : p; }
  if(cur) out.push(cur);
  return out;
}
const narrPlain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g,' ').trim(); };
function narrDuck(on){ if(audioOn) fadeMusic(on ? MUSIC_VOL*0.3 : MUSIC_VOL, on?600:1100); }
function narrate(text, onEnd){
  narrationStop(true);
  if(!narr.supported){ onEnd && onEnd(); return; }
  narr.chunks = narrSplit(text); narr.idx = 0; narr.active = true; narr.paused = false; narr.onEnd = onEnd || null;
  narr.token++; narrDuck(true); narrSpeak(); narrUI();
}
function narrSpeak(){
  const my = narr.token;
  const u = new SpeechSynthesisUtterance(narr.chunks[narr.idx]);
  const v = narrVoice(); if(v){ u.voice = v; u.lang = v.lang; } else u.lang = 'es-ES';
  u.rate = 0.98; u.pitch = 1; u.volume = Math.max(0.15, masterVol);
  u.onend = ()=>{ if(my!==narr.token || narr.paused) return; narr.idx++; if(narr.idx < narr.chunks.length) narrSpeak(); else narrFinish(); };
  u.onerror = (e)=>{ if(my!==narr.token || narr.paused) return; if(e && (e.error==='canceled' || e.error==='interrupted')) return; narrFinish(); };
  narr.u = u;   // referencia viva (evita que el navegador la descarte a mitad)
  speechSynthesis.speak(u);
}
function narrFinish(){
  narr.active = false; narr.paused = false; narrDuck(false); narrUI();
  const cb = narr.onEnd; narr.onEnd = null; cb && cb();
}
function narrationPause(){ if(!narr.active || narr.paused) return; narr.paused = true; speechSynthesis.cancel(); narrUI(); }
function narrationResume(){ if(!narr.active || !narr.paused) return; narr.paused = false; narr.token++; narrSpeak(); narrUI(); }
function narrationStop(silent){
  if(!narr.supported) return;
  const was = narr.active;
  narr.token++; narr.active = false; narr.paused = false; narr.onEnd = null;
  speechSynthesis.cancel();
  if(was){ narrDuck(false); }
  narrUI();
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && narr.active) narrationPause(); });

// Botones en el panel de inspección
let guideText = '';
function buildGuideBar(){
  const info = byId('info-col'), body = byId('panel-body');
  const bar = document.createElement('div');
  bar.className = 'guide-bar'; bar.id = 'guide-bar';
  bar.innerHTML = '<button class="gbtn" id="guide-play" aria-label="Escuchar la historia"><span class="gi" aria-hidden="true">▶</span><span class="gl">Escuchar</span></button>'
    + '<button class="gbtn gstop" id="guide-stop" aria-label="Detener la narración" title="Detener">■</button>'
    + '<span class="gwave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
  info.insertBefore(bar, body);
  if(!narr.supported){ bar.hidden = true; return; }
  byId('guide-play').addEventListener('click', ()=>{
    if(!narr.active) narrate(guideText);
    else if(narr.paused) narrationResume(); else narrationPause();
  });
  byId('guide-stop').addEventListener('click', ()=> narrationStop());
}
function narrUI(){
  const bar = byId('guide-bar'); if(bar){
    const playing = narr.active && !narr.paused;
    bar.classList.toggle('playing', playing); bar.classList.toggle('on', narr.active);
    byId('guide-play').querySelector('.gi').textContent = playing ? '❚❚' : '▶';
    byId('guide-play').querySelector('.gl').textContent = !narr.active ? 'Escuchar' : (narr.paused ? 'Continuar' : 'Pausar');
    byId('guide-play').setAttribute('aria-label', !narr.active ? 'Escuchar la historia' : (narr.paused ? 'Continuar la narración' : 'Pausar la narración'));
  }
  const tn = byId('tour-narr');
  if(tn){ tn.classList.toggle('speaking', narr.active && !narr.paused); }
}
function extrasOnPanelOpen(name, info){
  narrationStop(true);
  guideText = info.title+'. '+(info.eyebrow ? info.eyebrow+'. ' : '')+narrPlain(info.body);
  narrUI();
}

/* ---- Recorrido guiado ---- */
const tourCard = byId('tour-card');
const tour = { active:false, i:0, phase:'idle', t:0, dur:2.4, hold:0, holdMax:9, paused:false, narrate:false, narrDone:true, narrDoneT:0,
               saved:null, sPos:exV3(), sLook:exV3(), ePos:exV3(), eLook:exV3(), cur:exV3(), off:exV3(), ang:0, stops:[], finished:false };
function tourDots(){
  const d = byId('tour-dots'); d.innerHTML = '';
  tour.stops.forEach((_,k)=>{ const s = document.createElement('i'); d.appendChild(s); });
}
function tourCardSet(i){
  const n = tour.stops.length, st = tour.stops[i];
  byId('tour-count').textContent = i<n ? (i+1)+' / '+n : '¡Listo!';
  byId('tour-title').textContent = i<n ? st.title : 'Fin del recorrido';
  byId('tour-eyebrow').textContent = i<n ? st.eyebrow : 'Plaza Fermín López';
  byId('tour-text').textContent = i<n ? st.text : 'Ya conoces los monumentos principales. Ahora puedes caminar por la plaza, sube las gradas hasta el casco minero y descubre su historia.';
  byId('tour-next').textContent = i<n ? '›' : 'Terminar';
  byId('tour-next').classList.toggle('wide', i>=n);
  byId('tour-bar').style.width = '0%';
  [...byId('tour-dots').children].forEach((s,k)=> s.className = k<i ? 'done' : (k===i ? 'cur' : ''));
  tourCard.classList.remove('swap'); void tourCard.offsetWidth; tourCard.classList.add('swap');
}
function startTour(){
  if(tour.active || (mode!==MODE.ORBIT && mode!==MODE.WALK)) return;
  tour.stops = exStops(); if(!tour.stops.length) return;
  closeGoto(); narrationStop(true);
  tour.saved = { mode, position:camera.position.clone(), target: mode===MODE.ORBIT ? orbit.target.clone() : getWalkLookPoint(), yaw, pitch };
  tour.cur.copy(tour.saved.target);
  tour.active = true; tour.paused = false; tour.finished = false;
  if(document.pointerLockElement) document.exitPointerLock();
  mode = MODE.FLYING; orbit.enabled = false;
  document.body.classList.add('touring');
  tourCard.classList.add('show'); tourCard.setAttribute('aria-hidden','false');
  byId('tour-play').textContent = '❚❚'; byId('tour-play').setAttribute('aria-label','Pausar recorrido');
  tourDots(); tourGo(0);
  announce('Recorrido guiado iniciado');
}
function tourGo(i){
  const n = tour.stops.length;
  narrationStop(true);
  tour.i = Math.max(0, Math.min(n, i)); tour.finished = tour.i >= n;
  tour.narrDone = true; tour.narrDoneT = 0;
  if(tour.finished){ tour.phase = 'end'; tourCardSet(tour.i); return; }
  const st = tour.stops[tour.i], entry = exEntry(st);
  const { camPos, lookAt, size } = calculateInspectionCamera(entry.object);
  tour.eLook.copy(lookAt);
  tour.ePos.copy(lookAt).add(camPos.clone().sub(lookAt).multiplyScalar(1.22));
  tour.ePos.y = Math.max(tour.ePos.y, lookAt.y + size.y*0.15);
  tour.sPos.copy(camera.position); tour.sLook.copy(tour.cur);
  tour.dur = THREE.MathUtils.clamp(tour.sPos.distanceTo(tour.ePos)/9, 1.8, 3.6);
  tour.t = 0; tour.phase = 'fly'; tour.hold = 0; tour.ang = 0; tour.off.copy(tour.ePos).sub(tour.eLook);
  tour.holdMax = Math.max(7, st.text.split(/\s+/).length*0.36 + 2.5);
  tourCardSet(tour.i);
  if(tour.narrate && narr.supported){ tour.narrDone = false; narrate(st.title+'. '+st.text, ()=>{ tour.narrDone = true; tour.narrDoneT = 0; }); }
  playSwoosh();
}
function tourPauseToggle(){
  tour.paused = !tour.paused;
  byId('tour-play').textContent = tour.paused ? '▶' : '❚❚';
  byId('tour-play').setAttribute('aria-label', tour.paused ? 'Continuar recorrido' : 'Pausar recorrido');
  if(narr.active){ tour.paused ? narrationPause() : narrationResume(); }
}
function tourNarrToggle(){
  if(!narr.supported) return;
  tour.narrate = !tour.narrate;
  const b = byId('tour-narr'); b.setAttribute('aria-pressed', tour.narrate ? 'true':'false'); b.classList.toggle('on', tour.narrate);
  if(tour.narrate && tour.phase!=='end' && tour.phase!=='ret'){
    const st = tour.stops[tour.i]; tour.narrDone = false;
    narrate(st.title+'. '+st.text, ()=>{ tour.narrDone = true; tour.narrDoneT = 0; });
  } else { narrationStop(true); tour.narrDone = true; }
}
function endTour(){
  if(!tour.active || tour.phase==='ret') return;
  narrationStop(true);
  tourCard.classList.remove('show'); tourCard.setAttribute('aria-hidden','true');
  tour.sPos.copy(camera.position); tour.sLook.copy(tour.cur); tour.t = 0; tour.phase = 'ret';
}
function tourFinishReturn(){
  const s = tour.saved;
  document.body.classList.remove('touring');
  if(s.mode===MODE.ORBIT){
    mode = MODE.ORBIT; orbit.enabled = true; camera.position.copy(s.position); orbit.target.copy(s.target); orbit.update();
  } else {
    mode = MODE.WALK; yaw = s.yaw; pitch = s.pitch; targetCharacterYaw = characterYaw;
    if(!isTouchDevice){ try{ const r = canvas.requestPointerLock(); if(r && r.catch) r.catch(()=>{}); }catch(e){} }
  }
  tour.active = false; tour.phase = 'idle';
  announce('Recorrido terminado');
}
function updateTour(dt){
  if(tour.paused && tour.phase!=='ret') return;
  if(tour.phase==='fly'){
    tour.t += dt/tour.dur;
    const e = easeInOutCubic(Math.min(1, tour.t));
    camera.position.lerpVectors(tour.sPos, tour.ePos, e);
    tour.cur.lerpVectors(tour.sLook, tour.eLook, e);
    camera.lookAt(tour.cur);
    if(tour.t>=1){ tour.phase = 'hold'; tour.hold = 0; }
  } else if(tour.phase==='hold'){
    tour.hold += dt; tour.ang += dt*0.06;
    const c = Math.cos(tour.ang), s = Math.sin(tour.ang);
    camera.position.set(tour.eLook.x + tour.off.x*c - tour.off.z*s, tour.ePos.y + Math.sin(tour.hold*0.5)*0.06, tour.eLook.z + tour.off.x*s + tour.off.z*c);
    tour.cur.copy(tour.eLook); camera.lookAt(tour.cur);
    let ready;
    if(tour.narrate && narr.supported){ ready = tour.narrDone && ((tour.narrDoneT += dt) > 1.2); byId('tour-bar').style.width = (narr.active ? Math.min(95, 100*narr.idx/Math.max(1,narr.chunks.length)) : 100)+'%'; }
    else { ready = tour.hold >= tour.holdMax; byId('tour-bar').style.width = Math.min(100, 100*tour.hold/tour.holdMax)+'%'; }
    if(ready && tour.hold>3) tourGo(tour.i+1);
  } else if(tour.phase==='ret'){
    tour.t += dt/1.5;
    const e = easeInOutCubic(Math.min(1, tour.t));
    camera.position.lerpVectors(tour.sPos, tour.saved.position, e);
    tour.cur.lerpVectors(tour.sLook, tour.saved.target, e);
    camera.lookAt(tour.cur);
    if(tour.t>=1) tourFinishReturn();
  }
}
byId('btn-tour').addEventListener('click', startTour);
byId('tour-exit').addEventListener('click', endTour);
byId('tour-play').addEventListener('click', tourPauseToggle);
byId('tour-prev').addEventListener('click', ()=>{ if(tour.i>0) tourGo(tour.i-1); });
byId('tour-next').addEventListener('click', ()=>{ if(tour.finished) endTour(); else tourGo(tour.i+1); });
byId('tour-narr').addEventListener('click', tourNarrToggle);
if(!narr.supported) byId('tour-narr').hidden = true;

/* ---- Sonido ambiente (generado en vivo, sin archivos): pasos · fuente · murmullo de gente · aleteo de palomas ---- */
const EX_WATER_SOUND = false;   // true = vuelve el sonido de la fuente
const xa = { ready:false, master:null, buf:null, waterG:null, crowdG:null, stepT:0.3, side:0, waterT:0, crowdT:0, boxes:[], wTarget:0, cTarget:0.02 };
function xaNoise(freq, q, type){
  const ctx = audioCtx, src = ctx.createBufferSource(); src.buffer = xa.buf; src.loop = true;
  src.loopStart = 0; src.loopEnd = xa.buf.duration;
  const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
  src.connect(f); src.start(0, Math.random()*1.5);
  return { src, f };
}
function xaInit(){
  if(xa.ready || !audioCtx) return;
  const ctx = audioCtx;
  xa.master = ctx.createGain(); xa.master.gain.value = 0; xa.master.connect(ctx.destination);
  const len = ctx.sampleRate*2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0;   // ruido rosa (Paul Kellet)
  for(let i=0;i<len;i++){ const w = Math.random()*2-1; b0 = 0.99765*b0 + w*0.0990460; b1 = 0.96300*b1 + w*0.2965164; b2 = 0.57000*b2 + w*1.0526913; d[i] = (b0+b1+b2+w*0.1848)*0.2; }
  xa.buf = buf;
  // fuente: burbujeo grave + brillo agudo con ondulación lenta
  xa.waterG = ctx.createGain(); xa.waterG.gain.value = 0; xa.waterG.connect(xa.master);
  const w1 = xaNoise(650, 0.6), w2 = xaNoise(3400, 0.9, 'highpass');
  const g1 = ctx.createGain(); g1.gain.value = 0.9; const g2 = ctx.createGain(); g2.gain.value = 0.22;
  w1.f.connect(g1).connect(xa.waterG); w2.f.connect(g2).connect(xa.waterG);
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.37; lg.gain.value = 0.25; lfo.connect(lg).connect(g1.gain); lfo.start();
  // murmullo de gente: dos formantes de voz con variación silábica
  xa.crowdG = ctx.createGain(); xa.crowdG.gain.value = 0; xa.crowdG.connect(xa.master);
  const c1 = xaNoise(480, 1.3), c2 = xaNoise(1500, 1.6);
  const cg1 = ctx.createGain(); cg1.gain.value = 1; const cg2 = ctx.createGain(); cg2.gain.value = 0.55;
  c1.f.connect(cg1).connect(xa.crowdG); c2.f.connect(cg2).connect(xa.crowdG);
  xa.ready = true;
}
function xaStep(onStairs){
  const ctx = audioCtx, t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = xa.buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.value = (onStairs ? 520 : 950) * (1 + (xa.side ? 0.1 : -0.08)) * exRand(0.92,1.08); f.Q.value = 0.9;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(onStairs?0.7:0.55, t+0.006); g.gain.exponentialRampToValueAtTime(0.0001, t+0.085);
  src.connect(f).connect(g).connect(xa.master);
  src.start(t, Math.random()*1.6, 0.1); xa.side ^= 1;
}
function xaFlutter(dist){
  if(!xa.ready || !audioOn) return;
  const vol = THREE.MathUtils.clamp(1 - dist/24, 0, 1)*0.55; if(vol<0.02) return;
  const ctx = audioCtx, t0 = ctx.currentTime;
  for(let k=0;k<7;k++){
    const t = t0 + k*0.05 + Math.random()*0.012;
    const src = ctx.createBufferSource(); src.buffer = xa.buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800 + Math.random()*900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol*(1-k*0.09), t+0.012); g.gain.exponentialRampToValueAtTime(0.0001, t+0.05);
    src.connect(f).connect(g).connect(xa.master); src.start(t, Math.random()*1.6, 0.06);
  }
}
function collectWaterBoxes(){
  xa.boxes.length = 0;
  if(!plazaRoot) return;
  plazaRoot.traverse(o=>{ if(WATER_NAME_PATTERN.test(o.name)){ const b = new THREE.Box3().setFromObject(o); if(isFinite(b.min.x)) xa.boxes.push(b); } });
}
function updateExtrasAudio(dt){
  if(!audioCtx) return;
  if(!audioOn){ if(xa.ready) xa.master.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2); return; }
  if(!xa.ready) xaInit();
  if(!xa.ready) return;
  if(audioCtx.state==='suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const quiet = (narr.active || cinema.active) ? 0.35 : 1;
  xa.master.gain.setTargetAtTime(masterVol*0.9*quiet, now, 0.25);

  // fuente: más fuerte cuanto más cerca de la cámara
  xa.waterT -= dt;
  if(xa.waterT<=0){
    xa.waterT = 0.2; let dmin = Infinity;
    for(const b of xa.boxes) dmin = Math.min(dmin, b.distanceToPoint(camera.position));
    xa.wTarget = (EX_WATER_SOUND && isFinite(dmin)) ? 0.5*Math.pow(THREE.MathUtils.clamp(1 - dmin/22, 0, 1), 1.6) : 0;
  }
  xa.waterG.gain.setTargetAtTime(xa.wTarget, now, 0.3);

  // murmullo: base suave + más cuanta más gente cerca
  xa.crowdT -= dt;
  if(xa.crowdT<=0){
    xa.crowdT = exRand(0.25, 0.6); let n = 0;
    for(const a of npcAgents){ if(a.holder.position.distanceTo(camera.position) < 14) n++; }
    xa.cTarget = Math.min(0.1, 0.018 + n*0.012) * exRand(0.55, 1.35);
  }
  xa.crowdG.gain.setTargetAtTime(xa.cTarget, now, 0.22);

  // pasos del personaje
  if(mode===MODE.WALK){
    const sp = Math.hypot(velocity.x, velocity.y);
    if(sp > 0.4){
      xa.stepT += dt;
      const interval = THREE.MathUtils.clamp(0.95/sp, 0.27, 0.65);
      if(xa.stepT >= interval){ xa.stepT = 0; xaStep(groundY > 0.25); }
    } else xa.stepT = 0.3;
  }
}

/* ---- Palomas ---- */
const pigeons = [];
const PG = { ready:false, started:false, spots:[], scan:0, k:1, S:0.24, geo:null, pal:[] };
const PG_PALETTES = [
  { body:0x8f95a3, wing:0x6e7482, neck:0x3f8a7a, head:0x757c8a },
  { body:0x5a5f6b, wing:0x3f434d, neck:0x6a4f8a, head:0x4a4e58 },
  { body:0xe9e8e3, wing:0xcfcec8, neck:0xd9d8d2, head:0xe2e1dc },
  { body:0x9c7b66, wing:0x7a5b49, neck:0x4f8a6a, head:0x866a58 },
  { body:0xaeb3bd, wing:0x8a909c, neck:0x5a7fa0, head:0x969ca8 },
];
function pigeonAssets(){
  if(PG.geo) return;
  PG.geo = { sph:new THREE.SphereGeometry(1,10,8), box:new THREE.BoxGeometry(1,1,1), cone:new THREE.ConeGeometry(0.03,0.12,5), leg:new THREE.CylinderGeometry(0.012,0.012,0.2,5) };
  const std = c=> new THREE.MeshStandardMaterial({ color:c, roughness:0.92, metalness:0 });
  PG.pal = PG_PALETTES.map(p=>({ body:std(p.body), wing:std(p.wing), neck:std(p.neck), head:std(p.head) }));
  PG.beak = std(0x3a3230); PG.leg = std(0xc2566a); PG.eye = new THREE.MeshStandardMaterial({ color:0xff8a1e, emissive:0x401800, roughness:0.5 });
}
function buildPigeon(palIdx){
  pigeonAssets();
  const M = PG.pal[palIdx % PG.pal.length], G = PG.geo;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const part = (geo, mat, sx,sy,sz, x,y,z, parent, cast)=>{
    const o = new THREE.Mesh(geo, mat); o.scale.set(sx,sy,sz); o.position.set(x,y,z);
    o.castShadow = !!cast; o.userData.isNPC = true; parent.add(o); return o;
  };
  part(G.sph, M.body, 0.26,0.24,0.44, 0,0.42,0, body, true);
  part(G.sph, M.body, 0.22,0.22,0.26, 0,0.46,0.22, body, false);
  const head = new THREE.Group(); head.position.set(0,0.55,0.36); body.add(head);
  part(G.sph, M.neck, 0.13,0.15,0.14, 0,0.06,0.03, head);
  part(G.sph, M.head, 0.10,0.10,0.115, 0,0.17,0.11, head);
  const beak = part(G.cone, PG.beak, 1,1,1, 0,0.16,0.22, head); beak.rotation.x = Math.PI/2;
  part(G.sph, PG.eye, 0.022,0.022,0.022, 0.065,0.19,0.15, head);
  part(G.sph, PG.eye, 0.022,0.022,0.022, -0.065,0.19,0.15, head);
  const tail = part(G.box, M.wing, 0.2,0.02,0.3, 0,0.42,-0.5, body); tail.rotation.x = 0.25;
  const legs = [-1,1].map(sx=> part(G.leg, PG.leg, 1,1,1, sx*0.07,0.1,0.05, root));
  const mkWing = sx=>{
    const piv = new THREE.Group(); piv.position.set(sx*0.17,0.66,0.05); body.add(piv);
    const m = part(G.box, M.wing, 0.5,0.03,0.32, sx*0.25,0,0, piv); return { piv, m, sx };
  };
  const wR = mkWing(1), wL = mkWing(-1);
  const S = PG.S; root.scale.setScalar(S*exRand(0.92,1.08));
  scene.add(root);
  const p = { root, body, head, wR, wL, legs, state:'idle', timer:exRand(0.5,2.5), peckT:0, peckGap:exRand(0.4,1.8), walk:null, open:0, phase:Math.random()*6.28, delay:0, th:null, f:null, bob:Math.random()*6.28, headLook:0, headLookT:0 };
  pigeonWings(p, 0);
  pigeons.push(p);
  return p;
}
function pigeonWings(p, flap){
  const o = p.open;
  for(const w of [p.wR, p.wL]){
    const sx = w.sx;
    const fold = THREE.MathUtils.lerp(Math.PI/2, 0.12, o);
    w.piv.rotation.y = sx*fold;
    w.piv.rotation.z = sx*THREE.MathUtils.lerp(-0.4, flap, o);
    const len = THREE.MathUtils.lerp(0.5, 0.72, o);
    w.m.scale.x = len; w.m.position.x = sx*len*0.5;
  }
  for(const l of p.legs) l.scale.y = 1 - 0.75*o;
}
function buildPigeonSpots(){
  PG.spots.length = 0;
  if(nav.ready){
    const near = [];
    nav.debugTracks.forEach(t=>{ for(let i=0;i<t.pts.length;i+=4) near.push(t.pts[i]); });
    for(let n=0; n<6000 && PG.spots.length<160; n++){
      const i = (Math.random()*nav.nx)|0, j = (Math.random()*nav.nz)|0, k = j*nav.nx+i;
      if(nav.blocked[k] || nav.dist[k] < nav.softD*0.7 || nav.floor[k] > 0.12) continue;
      const c = navCenter(i,j);
      if(near.length){ let ok = false; for(const q of near){ if((q.x-c.x)**2 + (q.z-c.z)**2 < 100){ ok = true; break; } } if(!ok) continue; }
      PG.spots.push({ x:c.x, y:nav.floor[k], z:c.z });
    }
  }
  if(PG.spots.length < 6){   // respaldo: anillo alrededor del punto de inicio
    PG.spots.length = 0;
    for(let n=0;n<40;n++){ const a = Math.random()*6.283, r = exRand(3,10); PG.spots.push({ x:spawnPoint.x+Math.cos(a)*r, y:0, z:spawnPoint.z+Math.sin(a)*r }); }
  }
}
function initPigeons(){
  if(PG.started) return; PG.started = true;
  const tryBuild = (attempt)=>{
    if(!nav.ready && attempt<80){ setTimeout(()=>tryBuild(attempt+1), 500); return; }
    PG.S = 0.2*npcRefH; PG.k = npcRefH/1.2;
    pigeonAssets();
    buildPigeonSpots();
    const sizes = isTouchDevice ? [3,3,2] : [5,4,3], centers = [];
    for(const count of sizes){
      let c = null;
      for(let t=0;t<40;t++){ const s = PG.spots[(Math.random()*PG.spots.length)|0]; if(centers.every(q=>Math.hypot(q.x-s.x,q.z-s.z) > 8*PG.k)){ c = s; break; } }
      c = c || PG.spots[(Math.random()*PG.spots.length)|0]; centers.push(c);
      for(let n=0;n<count;n++){
        const p = buildPigeon((Math.random()*PG.pal.length)|0);
        let x = c.x, z = c.z;
        for(let t=0;t<8;t++){
          const a = Math.random()*6.283, r = exRand(0.2,1.3)*PG.k, tx = c.x+Math.cos(a)*r, tz = c.z+Math.sin(a)*r;
          if(!nav.ready || navFree(...navCellOf(tx,tz))){ x = tx; z = tz; break; }
        }
        p.root.position.set(x, c.y, z); p.root.rotation.y = Math.random()*6.283;
      }
    }
    PG.ready = true;
    console.log('✓ Palomas: '+pigeons.length+' · puntos de aterrizaje: '+PG.spots.length);
  };
  tryBuild(0);
}
function pigeonThreat(p){
  const pos = p.root.position, k = PG.k;
  if(mode===MODE.WALK){
    const d = Math.hypot(playerPos.x-pos.x, playerPos.z-pos.z), run = Math.hypot(velocity.x, velocity.y) > 3.4;
    if(d < (run ? 4.8 : 3.2)*k && Math.abs(groundY-pos.y) < 1.5) return { x:playerPos.x, z:playerPos.z };
  } else if(mode===MODE.ORBIT){
    if(camera.position.distanceTo(pos) < 6.5*k) return { x:camera.position.x, z:camera.position.z };
  }
  for(const a of npcAgents){
    if(a.role!=='walk' || a.v<0.2) continue;
    const q = a.holder.position;
    if(Math.hypot(q.x-pos.x, q.z-pos.z) < 1.6*k && Math.abs(q.y-pos.y) < 1.5) return { x:q.x, z:q.z };
  }
  return null;
}
function pigeonAlert(p, th, delay){
  p.state = 'alert'; p.th = th; p.delay = delay; p.walk = null;
}
function pigeonTakeoff(p){
  const pos = p.root.position, th = p.th || { x:pos.x+Math.random()-0.5, z:pos.z+Math.random()-0.5 }, k = PG.k;
  let ax = pos.x-th.x, az = pos.z-th.z; const al = Math.hypot(ax,az) || 1; ax /= al; az /= al;
  let best = null, bs = -1e9;
  for(let n=0;n<16;n++){
    const s = PG.spots[(Math.random()*PG.spots.length)|0], dx = s.x-pos.x, dz = s.z-pos.z, d = Math.hypot(dx,dz);
    if(d < 5*k || d > 16*k) continue;
    const score = (dx*ax+dz*az)/d + Math.random()*0.5 - Math.abs(d-10*k)*0.02;
    if(score > bs){ bs = score; best = s; }
  }
  if(!best) best = PG.spots[(Math.random()*PG.spots.length)|0];
  const d = Math.hypot(best.x-pos.x, best.z-pos.z);
  p.f = { x0:pos.x, y0:pos.y, z0:pos.z, x1:best.x, y1:best.y, z1:best.z, t:0, T:THREE.MathUtils.clamp(d/(5.5*k)+0.9, 1.4, 4.2), apex:(2.2+Math.random()*1.8)*k };
  p.state = 'fly'; p.phase = 0;
  xaFlutter(camera.position.distanceTo(pos));
}
function pigeonFlightPos(f, s, out){
  const e = s*s*(3-2*s)*0.7 + s*0.3;
  out.x = f.x0 + (f.x1-f.x0)*e; out.z = f.z0 + (f.z1-f.z0)*e;
  out.y = f.y0 + (f.y1-f.y0)*e + f.apex*4*s*(1-s);
  return out;
}
const _pgA = exV3(), _pgB = exV3();
function updatePigeons(dt){
  if(!PG.ready) return;
  PG.scan -= dt; const doScan = PG.scan <= 0; if(doScan) PG.scan = 0.12;
  const k = PG.k;
  for(const p of pigeons){
    const pos = p.root.position;
    if(p.state==='idle' || p.state==='walk'){
      if(doScan){
        const th = pigeonThreat(p);
        if(th){
          pigeonAlert(p, th, exRand(0, 0.25));
          for(const o of pigeons){ if(o!==p && (o.state==='idle'||o.state==='walk') && Math.hypot(o.root.position.x-pos.x, o.root.position.z-pos.z) < 4.2*k) pigeonAlert(o, th, exRand(0.05, 0.5)); }
        }
      }
      if(p.state==='idle'){
        // picoteo
        if(p.peckT>0){
          p.peckT -= dt; const kk = Math.sin((1 - Math.max(0,p.peckT)/0.4)*Math.PI);
          p.head.rotation.x = 0.1 + kk*0.95; p.body.rotation.x = kk*0.2;
        } else {
          p.head.rotation.x += (0.05 - p.head.rotation.x)*(1-Math.exp(-10*dt)); p.body.rotation.x += (0 - p.body.rotation.x)*(1-Math.exp(-10*dt));
          p.peckGap -= dt; if(p.peckGap<=0){ p.peckT = 0.4; p.peckGap = Math.random()<0.3 ? 0.15 : exRand(0.7,2.2); }
          p.headLookT -= dt; if(p.headLookT<=0){ p.headLook = exRand(-0.7,0.7); p.headLookT = exRand(0.8,2.5); }
        }
        p.head.rotation.y += (p.headLook - p.head.rotation.y)*(1-Math.exp(-6*dt));
        p.timer -= dt;
        if(p.timer<=0){
          if(Math.random()<0.55){
            for(let t=0;t<6;t++){
              const a = Math.random()*6.283, r = exRand(0.6,1.6)*k, tx = pos.x+Math.cos(a)*r, tz = pos.z+Math.sin(a)*r;
              if(!nav.ready || navFree(...navCellOf(tx,tz))){ p.walk = { x:tx, z:tz }; p.state = 'walk'; break; }
            }
          }
          p.timer = exRand(1,3.2);
        }
      } else {   // caminando con cabeceo
        const w = p.walk; const dx = w.x-pos.x, dz = w.z-pos.z, d = Math.hypot(dx,dz);
        p.bob += dt*11;
        p.head.position.z = 0.36 + Math.sin(p.bob)*0.035; p.head.rotation.x += (0.0 - p.head.rotation.x)*(1-Math.exp(-8*dt));
        if(d < 0.05*k+0.03){ p.state = 'idle'; p.walk = null; p.head.position.z = 0.36; p.timer = exRand(0.8,2.5); }
        else {
          p.root.rotation.y = lerpAngle(p.root.rotation.y, Math.atan2(dx,dz), 1-Math.exp(-9*dt));
          const step = Math.min(d, 1.2*PG.S*dt*exRand(0.9,1.1));
          pos.x += dx/d*step; pos.z += dz/d*step;
        }
      }
      p.open += (0 - p.open)*(1-Math.exp(-10*dt));
    }
    else if(p.state==='alert'){
      p.delay -= dt; p.head.rotation.x += (-0.35 - p.head.rotation.x)*(1-Math.exp(-14*dt));
      p.head.position.z = 0.36; p.body.rotation.x += (-0.1 - p.body.rotation.x)*(1-Math.exp(-10*dt));
      if(p.delay<=0) pigeonTakeoff(p);
    }
    else if(p.state==='fly'){
      const f = p.f; f.t += dt/f.T; const s = Math.min(1, f.t);
      pigeonFlightPos(f, s, _pgA); pigeonFlightPos(f, Math.min(1, s+0.03), _pgB);
      pos.copy(_pgA);
      const dx = _pgB.x-_pgA.x, dz = _pgB.z-_pgA.z, dy = _pgB.y-_pgA.y, hz = Math.hypot(dx,dz);
      if(hz>1e-4) p.root.rotation.y = lerpAngle(p.root.rotation.y, Math.atan2(dx,dz), 1-Math.exp(-10*dt));
      const pitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.max(hz,1e-3)), -0.9, 0.9);
      p.body.rotation.x += (pitch - p.body.rotation.x)*(1-Math.exp(-8*dt));
      p.head.rotation.x += (0.0 - p.head.rotation.x)*(1-Math.exp(-8*dt)); p.head.rotation.y *= 0.9; p.head.position.z = 0.36;
      p.open += ((s>0.93 ? 0.55 : 1) - p.open)*(1-Math.exp(-12*dt));
      p.phase += dt*Math.PI*2*(s<0.9 ? 8 : 5);
      if(s>=1){ pos.set(f.x1, f.y1, f.z1); p.state = 'idle'; p.timer = exRand(1,3); p.peckT = 0; p.peckGap = exRand(0.5,1.5); p.f = null; }
    }
    pigeonWings(p, p.state==='fly' ? Math.sin(p.phase)*0.85 + 0.15 : 0);
  }
}

/* ---- Modo foto ---- */
const photo = { on:false, filter:'none', canShare:false, last:null };
const PHOTO_FILTERS = { natural:'none', calido:'sepia(.25) saturate(1.2) contrast(1.05) brightness(1.03)', cine:'contrast(1.18) saturate(1.12) brightness(.94)', bn:'grayscale(1) contrast(1.12)' };
const photoFilterOK = (()=>{ try{ return typeof document.createElement('canvas').getContext('2d').filter === 'string'; }catch(e){ return false; } })();
function enterPhoto(){
  if(photo.on || (mode!==MODE.ORBIT && mode!==MODE.WALK)) return;
  closeGoto(); photo.on = true; document.body.classList.add('photo');
  byId('photo-bar').setAttribute('aria-hidden','false');
  if(document.pointerLockElement) document.exitPointerLock();
  showToast(mode===MODE.WALK ? 'Modo foto · arrastra para mirar, WASD para moverte' : 'Modo foto · arrastra para encuadrar', 3200);
}
function exitPhoto(){
  if(!photo.on) return;
  photo.on = false; document.body.classList.remove('photo'); canvas.style.filter = '';
  byId('photo-bar').setAttribute('aria-hidden','true');
  if(mode===MODE.WALK && !isTouchDevice){ try{ const r = canvas.requestPointerLock(); if(r && r.catch) r.catch(()=>{}); }catch(e){} }
}
function setPhotoFilter(key){
  photo.filter = photoFilterOK ? PHOTO_FILTERS[key] : 'none';
  canvas.style.filter = photo.filter==='none' ? '' : photo.filter;
  document.querySelectorAll('#photo-bar [data-filter]').forEach(b=> b.classList.toggle('on', b.dataset.filter===key));
}
function capturePhoto(){
  renderer.render(scene, camera);
  const w = canvas.width, h = canvas.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if(photoFilterOK && photo.filter!=='none') x.filter = photo.filter;
  x.drawImage(canvas, 0, 0); x.filter = 'none';
  // marca de agua
  const bh = Math.round(h*0.085), g = x.createLinearGradient(0, h-bh, 0, h);
  g.addColorStop(0, 'rgba(6,10,26,0)'); g.addColorStop(1, 'rgba(6,10,26,.55)'); x.fillStyle = g; x.fillRect(0, h-bh, w, bh);
  const fs = Math.max(14, Math.round(h*0.026)), pad = Math.round(h*0.025);
  x.textBaseline = 'alphabetic';
  x.beginPath(); x.arc(pad+fs*0.42, h-pad-fs*0.3, fs*0.36, 0, 6.283); x.fillStyle = '#e8c873'; x.fill();
  x.font = '600 '+fs+'px Fraunces, Georgia, serif'; x.fillStyle = '#fff8e9'; x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = fs*0.3;
  x.fillText('Plaza Fermín López', pad+fs*1.1, h-pad-fs*0.1);
  x.font = '500 '+Math.round(fs*0.62)+'px Manrope, system-ui, sans-serif'; x.textAlign = 'right';
  x.fillText('Huanuni · Oruro · Bolivia', w-pad, h-pad-fs*0.1);
  c.toBlob(blob=>{
    if(!blob){ showToast('No se pudo guardar la foto'); return; }
    photo.last = blob;
    const d = new Date(), p2 = n=> String(n).padStart(2,'0');
    const name = 'plaza-fermin-lopez-'+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+'-'+p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds())+'.png';
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 4000);
    showToast('Foto guardada ✓');
  }, 'image/png');
  const fl = byId('photo-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
}
async function sharePhoto(){
  if(!photo.last){ showToast('Primero toma una foto'); return; }
  try{
    const file = new File([photo.last], 'plaza-fermin-lopez.png', { type:'image/png' });
    if(navigator.canShare && navigator.canShare({ files:[file] })) await navigator.share({ files:[file], title:'Plaza Fermín López · Huanuni' });
  }catch(e){}
}
byId('photo-shoot').addEventListener('click', capturePhoto);
byId('photo-exit').addEventListener('click', exitPhoto);
byId('btn-photo').addEventListener('click', ()=> photo.on ? exitPhoto() : enterPhoto());
document.querySelectorAll('#photo-bar [data-filter]').forEach(b=> b.addEventListener('click', ()=> setPhotoFilter(b.dataset.filter)));
if(!photoFilterOK) document.querySelector('#photo-bar .pb-filters').hidden = true;
try{ photo.canShare = !!(navigator.canShare && navigator.canShare({ files:[new File([''], 'a.png', { type:'image/png' })] })); }catch(e){}
byId('photo-share').hidden = !photo.canShare;
byId('photo-share').addEventListener('click', sharePhoto);
// En modo foto + caminar, arrastrar con el mouse/dedo gira la cámara
canvas.addEventListener('pointermove', (e)=>{
  if(!photo.on || mode!==MODE.WALK || !(e.buttons&1) || document.pointerLockElement) return;
  yaw -= (e.movementX||0)*0.004; pitch = THREE.MathUtils.clamp(pitch - (e.movementY||0)*0.004, -0.6, 1.0);
});

/* ---- Volumen, preferencias y teclas ---- */
document.querySelectorAll('.vol-range').forEach(r=>{
  r.value = Math.round(masterVol*100);
  r.addEventListener('input', ()=>{
    masterVol = r.value/100; savePref('vol', masterVol);
    document.querySelectorAll('.vol-range').forEach(o=> o.value = r.value);
    if(audioOn) bgMusic.volume = (narr.active ? MUSIC_VOL*0.3 : MUSIC_VOL)*masterVol;
  });
});
btnDayNight.addEventListener('click', ()=> savePref('night', !dayMode));
window.addEventListener('keydown', (e)=>{
  if(e.code!=='Escape' || cinema.active) return;
  if(photo.on) exitPhoto();
  else if(tour.active) endTour();
  else if(gotoMenu.classList.contains('open')) closeGoto();
});

function updateExtras(dt){
  if(tour.active) updateTour(dt);
  updatePigeons(dt);
  updateExtrasAudio(dt);
}
function initExtras(){
  buildGotoMenu(); buildGuideBar();
  collectWaterBoxes();
  if(prefs.night===true) setDayNight(false);
  initPigeons();
}

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
  else if(mode===MODE.WALK){ updateWalk(dt); applyCinemaBlendOut(dt); checkHistoryTrigger(); }
  else if(mode===MODE.CINEMA) updateCinema(dt);

  updateHotspots();
  updateInteractPrompt();
  updateFlags(clock.elapsedTime); // ondulación de banderas por viento, siempre activa
  updateNPCs(dt);                 // NPC: caminantes + animaciones
  updateExtras(dt);               // recorrido guiado, palomas, sonido ambiente
  waterUniforms.uTime.value = clock.elapsedTime; 
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
    groundY = 0;
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