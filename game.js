/* =========================================================================
   CENIZA 7 — Carrera por la Caldera
   Juego original de carrera sin fin. HTML + CSS + JavaScript nativos.

   Organización del archivo:
   1. Constantes y estado
   2. Utilidades, almacenamiento y sonido sintetizado
   3. Pantallas, controles y flujo de la partida
   4. Lógica: generación de obstáculos, física, colisiones y dificultad
   5. Dibujo: escenario, pista, obstáculos, coleccionables y personaje
   6. Bucle principal
   ========================================================================= */

'use strict';

(() => {
  /* -----------------------------------------------------------------------
     1. CONSTANTES Y ESTADO
     ----------------------------------------------------------------------- */

  const LANE_WIDTH = 2.25;
  const LANES = [-LANE_WIDTH, 0, LANE_WIDTH];
  const TRACK_HALF = LANE_WIDTH * 1.55;
  const PLAYER_Z = 9;           // posición fija del personaje respecto a la cámara
  const SPAWN_Z = 148;          // los obstáculos nacen lejos, junto al horizonte
  const CAMERA_Y = 3;           // altura de la cámara (metros)
  const HORIZON_RATIO = 0.3;

  const BASE_SPEED = 15;        // metros por segundo al comenzar
  const MAX_SPEED = 34;         // límite de velocidad
  const SPEED_RAMP = 0.0095;    // velocidad ganada por metro recorrido
  const GRAVITY = 23;
  const JUMP_VELOCITY = 8.4;
  const SLIDE_TIME = 0.62;

  const SCORE_PER_SPARK = 10;
  const STORAGE_BEST = 'ceniza7.record.v1';
  const STORAGE_MUTED = 'ceniza7.sonido.v1';

  const $ = (selector) => document.querySelector(selector);

  const canvas = $('#game');
  const ctx = canvas.getContext('2d');

  const dom = {
    menu: $('#menu'),
    pause: $('#pause'),
    gameover: $('#gameover'),
    startBtn: $('#start-btn'),
    resumeBtn: $('#resume-btn'),
    retryBtn: $('#retry-btn'),
    menuBtn: $('#menu-btn'),
    score: $('#score'),
    distance: $('#distance'),
    sparks: $('#sparks'),
    hudBest: $('#hud-best'),
    menuBest: $('#menu-best'),
    speedValue: $('#speed-value'),
    speedFill: $('#speed-fill'),
    hint: $('.pause-hint'),
    finalScore: $('#final-score'),
    finalDistance: $('#final-distance'),
    finalSparks: $('#final-sparks'),
    finalCores: $('#final-cores'),
    finalBest: $('#final-best'),
    newRecord: $('#new-record'),
    impact: $('#impact'),
    toast: $('#toast')
  };

  const state = {
    mode: 'menu',               // menu | running | paused | gameover
    W: 0, H: 0, cx: 0, horizon: 0, focal: 800, dpr: 1,
    lastFrame: 0,
    time: 0,
    menuTime: 0,
    distance: 0,
    speed: BASE_SPEED,
    score: 0,
    sparks: 0,
    cores: 0,
    best: loadNumber(STORAGE_BEST, 0),
    muted: loadNumber(STORAGE_MUTED, 0) === 1,
    lane: 1,
    x: 0,
    targetX: 0,
    y: 0,
    vy: 0,
    grounded: true,
    sliding: false,
    slideTimer: 0,
    runCycle: 0,
    obstacles: [],
    coins: [],
    particles: [],
    floaters: [],
    nextSpawnAt: 20,
    dustTimer: 0,
    bestBeaten: false,
    lastHud: { score: '', distance: '', sparks: '', speed: '' }
  };

  // Brasas decorativas en primer plano (coordenadas normalizadas).
  const ash = Array.from({ length: 38 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.7,
    speed: 0.012 + Math.random() * 0.045,
    drift: 0.1 + Math.random() * 0.8,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.18 + Math.random() * 0.55
  }));

  // Vetas de lava laterales. Se reutilizan para no generar formas cada frame.
  const lavaVeins = Array.from({ length: 16 }, (_, index) => ({
    side: index % 2 === 0 ? -1 : 1,
    offset: Math.random() * 170,
    lateral: 0.45 + Math.random() * 0.9,
    length: 12 + Math.random() * 28,
    wiggle: 0.4 + Math.random() * 1.6
  }));

  /* -----------------------------------------------------------------------
     2. UTILIDADES, ALMACENAMIENTO Y SONIDO
     ----------------------------------------------------------------------- */

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const laneX = (lane) => LANES[lane];

  function formatNumber(value) {
    return String(Math.max(0, Math.floor(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function loadNumber(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      const value = Number(raw);
      return raw !== null && Number.isFinite(value) ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveValue(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (error) {
      // El juego sigue funcionando aunque el navegador bloquee localStorage.
    }
  }

  // Sonido generado con la Web Audio API: no usa archivos externos.
  const Sound = (() => {
    let audio = null;

    function getContext() {
      if (state.muted) return null;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        if (!audio) audio = new AudioCtor();
        if (audio.state === 'suspended') audio.resume().catch(() => {});
        return audio;
      } catch (error) {
        return null;
      }
    }

    function tone(frequency, endFrequency, duration, type, volume, delay = 0) {
      const audioContext = getContext();
      if (!audioContext) return;
      try {
        const start = audioContext.currentTime + delay;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, frequency), start);
        if (endFrequency && endFrequency !== frequency) {
          oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20, endFrequency),
            start + duration
          );
        }
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      } catch (error) {
        // Ignorar fallos de audio: nunca deben detener el juego.
      }
    }

    function noise(duration, volume) {
      const audioContext = getContext();
      if (!audioContext) return;
      try {
        const length = Math.floor(audioContext.sampleRate * duration);
        const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / length);
        }
        const source = audioContext.createBufferSource();
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        filter.type = 'lowpass';
        filter.frequency.value = 720;
        gain.gain.value = volume;
        gain.gain.setTargetAtTime(0.0001, audioContext.currentTime + duration * 0.35, duration * 0.25);
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioContext.destination);
        source.start();
      } catch (error) {
        // Silencio si el navegador no permite sintetizar.
      }
    }

    return {
      start() {
        tone(300, 620, 0.18, 'triangle', 0.045);
        tone(620, 900, 0.16, 'sine', 0.03, 0.1);
      },
      move() {
        tone(340, 430, 0.06, 'triangle', 0.022);
      },
      jump() {
        tone(260, 540, 0.13, 'sine', 0.04);
      },
      slide() {
        tone(180, 85, 0.18, 'sawtooth', 0.025);
        noise(0.12, 0.012);
      },
      pickup(isCore) {
        const base = isCore ? 520 : 700;
        tone(base, base * 1.35, 0.07, 'triangle', 0.032);
        if (isCore) tone(base * 1.5, base * 2, 0.16, 'sine', 0.035, 0.06);
      },
      crash() {
        noise(0.3, 0.1);
        tone(150, 42, 0.5, 'sawtooth', 0.06);
        tone(90, 30, 0.6, 'square', 0.035, 0.05);
      },
      pause() {
        tone(440, 330, 0.09, 'sine', 0.028);
      },
      resume() {
        tone(330, 500, 0.09, 'sine', 0.028);
      },
      ui() {
        tone(520, 700, 0.07, 'sine', 0.025);
      }
    };
  })();

  /* -----------------------------------------------------------------------
     LIENZO Y HUD
     ----------------------------------------------------------------------- */

  function resizeCanvas() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.W = canvas.clientWidth || window.innerWidth;
    state.H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(state.W * state.dpr));
    canvas.height = Math.max(1, Math.round(state.H * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.cx = state.W / 2;
    state.horizon = state.H * HORIZON_RATIO;
    state.focal = Math.min(state.H * 1.5, state.W * 0.98);
  }

  // Proyección en perspectiva: el mundo se mide en metros y la cámara mira al fondo.
  function project(x, y, z) {
    const safeZ = Math.max(z, 0.55);
    const scale = state.focal / safeZ;
    return {
      x: state.cx + x * scale,
      y: state.horizon + (CAMERA_Y - y) * scale,
      scale
    };
  }

  function setText(element, text, key) {
    if (key && state.lastHud[key] === text) return;
    if (key) state.lastHud[key] = text;
    element.textContent = text;
  }

  function updateHUD() {
    setText(dom.score, formatNumber(state.score), 'score');
    setText(dom.distance, formatNumber(Math.floor(state.distance)) + ' m', 'distance');
    setText(dom.sparks, formatNumber(state.sparks), 'sparks');
    dom.hudBest.textContent = formatNumber(state.best);
    const kmh = String(Math.round(state.speed * 3.6));
    setText(dom.speedValue, kmh, 'speed');
    const ratio = clamp((state.speed - BASE_SPEED) / (MAX_SPEED - BASE_SPEED), 0, 1);
    dom.speedFill.style.width = (ratio * 100).toFixed(1) + '%';
  }

  function updateBestLabels() {
    dom.menuBest.textContent = formatNumber(state.best);
    dom.hudBest.textContent = formatNumber(state.best);
    dom.finalBest.textContent = formatNumber(state.best);
  }

  let toastTimer = 0;
  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => dom.toast.classList.remove('show'), 1400);
  }

  function blurFocusedElement() {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
  }

  /* -----------------------------------------------------------------------
     3. FLUJO DE LA PARTIDA
     ----------------------------------------------------------------------- */

  function setMode(mode) {
    state.mode = mode;
    document.body.dataset.mode = mode;
    dom.menu.hidden = mode !== 'menu';
    dom.pause.hidden = mode !== 'paused';
    dom.gameover.hidden = mode !== 'gameover';
    dom.hint.textContent = mode === 'paused'
      ? 'ESPACIO · reanudar  |  ESC · menú'
      : 'ESPACIO · pausa  |  ESC · salir';
  }

  function resetRun() {
    state.time = 0;
    state.distance = 0;
    state.speed = BASE_SPEED;
    state.score = 0;
    state.sparks = 0;
    state.cores = 0;
    state.lane = 1;
    state.x = 0;
    state.targetX = 0;
    state.y = 0;
    state.vy = 0;
    state.grounded = true;
    state.sliding = false;
    state.slideTimer = 0;
    state.runCycle = 0;
    state.obstacles = [];
    state.coins = [];
    state.particles = [];
    state.floaters = [];
    state.dustTimer = 0;
    state.nextSpawnAt = 20;
    state.bestBeaten = false;
    state.lastHud = { score: '', distance: '', sparks: '', speed: '' };
    dom.newRecord.hidden = true;

    // Pequeña introducción amable: chispas en el carril central y dos obstáculos lejanos.
    spawnCoinLine(1, 40, 6, 1.7);
    state.obstacles.push(makeObstacle(0, 104, 'low'));
    state.obstacles.push(makeObstacle(2, 126, 'block'));
    updateHUD();
    updateBestLabels();
  }

  function beginRun() {
    if (!['menu', 'paused', 'gameover'].includes(state.mode)) return;
    resetRun();
    setMode('running');
    updateBestLabels();
    Sound.start();
    blurFocusedElement();
  }

  function pauseRun() {
    if (state.mode !== 'running') return;
    setMode('paused');
    Sound.pause();
    blurFocusedElement();
  }

  function resumeRun() {
    if (state.mode !== 'paused') return;
    setMode('running');
    Sound.resume();
    blurFocusedElement();
  }

  function endRun() {
    if (state.mode !== 'running') return;

    if (state.score > state.best) {
      state.best = Math.floor(state.score);
      state.bestBeaten = true;
      saveValue(STORAGE_BEST, state.best);
    }

    setMode('gameover');
    updateBestLabels();
    updateResults();
    triggerImpact();
    spawnCrashBurst();
    Sound.crash();

    // Llevar el foco al botón de reintento sin robar el teclado si ya se reinició.
    window.setTimeout(() => {
      if (state.mode === 'gameover') {
        dom.retryBtn.focus({ preventScroll: true });
      }
    }, 260);
  }

  function updateResults() {
    dom.finalScore.textContent = formatNumber(state.score);
    dom.finalDistance.textContent = formatNumber(Math.floor(state.distance)) + ' m';
    dom.finalSparks.textContent = formatNumber(state.sparks);
    dom.finalCores.textContent = formatNumber(state.cores);
    dom.finalBest.textContent = formatNumber(state.best);
    dom.newRecord.hidden = !state.bestBeaten;
  }

  function returnToMenu() {
    resetRun();
    state.obstacles = [];
    state.coins = [];
    state.particles = [];
    state.floaters = [];
    state.menuTime = 0;
    setMode('menu');
    updateHUD();
    updateBestLabels();
    blurFocusedElement();
  }

  function toggleSound() {
    const wasMuted = state.muted;
    state.muted = !state.muted;
    saveValue(STORAGE_MUTED, state.muted ? 1 : 0);
    if (wasMuted) Sound.ui();
    showToast(state.muted ? 'Sonido silenciado' : 'Sonido activado');
  }

  function triggerImpact() {
    dom.impact.classList.remove('flash');
    void dom.impact.offsetWidth; // reinicia la animación CSS
    dom.impact.classList.add('flash');
  }

  /* -----------------------------------------------------------------------
     4. LÓGICA DE LA CARRERA
     ----------------------------------------------------------------------- */

  function makeObstacle(lane, z, type, options = {}) {
    const full = Boolean(options.full);
    const isBlock = type === 'block';
    return {
      type,
      lane: full ? 1 : lane,
      x: full ? 0 : laneX(lane),
      z,
      prevZ: z,
      width: full ? LANE_WIDTH * 2 + 1.95 : (isBlock ? 1.85 : 1.9),
      depth: isBlock ? 1.15 : (type === 'beam' ? 0.55 : 0.7),
      yBottom: type === 'low' ? 0 : (type === 'beam' ? 1.12 : 0),
      yTop: type === 'low' ? 0.98 : (type === 'beam' ? 2.15 : 2.78),
      full,
      seed: Math.random() * 100
    };
  }

  function spawnCoinLine(lane, zStart, count = 5, spacing = 1.8, y = 0.92) {
    for (let i = 0; i < count; i += 1) {
      const z = zStart + i * spacing;
      if (z < 12 || z > 166) continue;
      state.coins.push({
        type: 'spark',
        x: laneX(lane),
        z,
        prevZ: z,
        y: y + Math.sin(i * 1.3) * 0.06,
        seed: Math.random() * 10
      });
    }
  }

  function spawnCoinArc(lane, zCenter, count = 5, height = 1.4) {
    for (let i = 0; i < count; i += 1) {
      const t = count > 1 ? i / (count - 1) : 0.5;
      const z = zCenter - 6 + t * 12;
      state.coins.push({
        type: 'spark',
        x: laneX(lane),
        z,
        prevZ: z,
        y: 0.92 + Math.sin(t * Math.PI) * height,
        seed: Math.random() * 10
      });
    }
  }

  function spawnCore(lane, z) {
    if (z < 14 || z > 164) return;
    state.coins.push({
      type: 'core',
      x: laneX(lane),
      z,
      prevZ: z,
      y: 1.05,
      seed: Math.random() * 10
    });
  }

  function pickHazard(distance) {
    const roll = Math.random();
    if (distance < 90) return roll < 0.58 ? 'low' : 'beam';
    if (roll < 0.36) return 'low';
    if (roll < 0.7) return 'beam';
    return 'block';
  }

  // Genera una "familia" de obstáculos y devuelve metros extra de respiro.
  function spawnPattern() {
    const distance = state.distance;
    const z = SPAWN_Z + rand(-3, 3);
    const roll = Math.random();
    let freeLane = randInt(0, 2);
    let coinsPlaced = false;
    let extraGap = 0;

    if (distance > 200 && roll < 0.09) {
      // Barrera baja de lado a lado: solo se supera saltando.
      state.obstacles.push(makeObstacle(0, z, 'low', { full: true }));
      spawnCoinArc(randInt(0, 2), z, 5, 1.35);
      coinsPlaced = true;
      extraGap = 12;
    } else if (distance > 300 && roll < 0.17) {
      // Viga de lado a lado: solo se supera deslizándose.
      state.obstacles.push(makeObstacle(0, z, 'beam', { full: true }));
      spawnCoinLine(randInt(0, 2), z - 7, 5, 1.55, 0.52);
      coinsPlaced = true;
      extraGap = 12;
    } else if (distance > 120 && roll < 0.46) {
      // Dos carriles bloqueados: queda un pasillo libre.
      const blocked = [0, 1, 2].filter((lane) => lane !== freeLane);
      blocked.forEach((lane, index) => {
        state.obstacles.push(makeObstacle(lane, z + index * 1.1, pickHazard(distance)));
      });
    } else if (distance > 450 && roll < 0.65) {
      // Dos bloqueos escalonados en carriles distintos; el tercero queda libre.
      const laneA = randInt(0, 2);
      const laneB = (laneA + randInt(1, 2)) % 3;
      state.obstacles.push(makeObstacle(laneA, z, pickHazard(distance)));
      state.obstacles.push(makeObstacle(laneB, z + 15, pickHazard(distance)));
      freeLane = 3 - laneA - laneB;
    } else {
      const lane = randInt(0, 2);
      state.obstacles.push(makeObstacle(lane, z, pickHazard(distance)));
      freeLane = (lane + 1 + randInt(0, 1)) % 3;
    }

    if (!coinsPlaced) {
      // Las chispas "enseñan" el carril seguro antes de llegar al obstáculo.
      spawnCoinLine(freeLane, z - 28, 5, 1.8);
      if (Math.random() < 0.14) spawnCore(freeLane, z - 12);
    }

    return extraGap;
  }

  function nextSpawnGap() {
    // Más velocidad = más adelante nace el siguiente grupo, pero también más rápido llega.
    const base = Math.max(state.speed * 0.95, 36 - state.distance * 0.006);
    return base + rand(0, 6);
  }

  function moveLane(direction) {
    if (state.mode !== 'running') return;
    const nextLane = clamp(state.lane + direction, 0, 2);
    if (nextLane === state.lane) return;
    state.lane = nextLane;
    state.targetX = laneX(nextLane);
    Sound.move();
  }

  function jump() {
    if (state.mode !== 'running') return;
    if (!state.grounded) return;
    state.sliding = false;
    state.slideTimer = 0;
    state.vy = JUMP_VELOCITY;
    state.grounded = false;
    Sound.jump();
  }

  function slide() {
    if (state.mode !== 'running') return;
    if (!state.grounded) {
      // En el aire, abajo acelera la caída (aterrizaje rápido).
      state.vy = Math.min(state.vy, -16);
      return;
    }
    state.sliding = true;
    state.slideTimer = SLIDE_TIME;
    Sound.slide();
  }

  function update(dt) {
    state.time += dt;
    state.speed = Math.min(MAX_SPEED, BASE_SPEED + state.distance * SPEED_RAMP);
    const step = state.speed * dt;
    state.distance += step;

    // Cambio de carril suave, independiente de los FPS.
    const smoothing = 1 - Math.exp(-17 * dt);
    state.x += (state.targetX - state.x) * smoothing;
    if (Math.abs(state.targetX - state.x) < 0.005) state.x = state.targetX;

    // Salto con gravedad.
    if (!state.grounded) {
      state.vy -= GRAVITY * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
        state.grounded = true;
      }
    }

    // Fin del deslizamiento.
    if (state.sliding) {
      state.slideTimer -= dt;
      if (state.slideTimer <= 0) {
        state.sliding = false;
        state.slideTimer = 0;
      }
    }

    state.runCycle += dt * (8 + state.speed * 0.45);
    updateEmbers(dt);

    // Avance del mundo hacia la cámara.
    state.obstacles.forEach((obstacle) => {
      obstacle.prevZ = obstacle.z;
      obstacle.z -= step;
    });
    state.coins.forEach((coin) => {
      coin.prevZ = coin.z;
      coin.z -= step;
    });

    state.obstacles = state.obstacles.filter((obstacle) => obstacle.z > 3.2);
    state.coins = state.coins.filter((coin) => coin.z > 3.2);

    // Dificultad: los grupos aparecen más seguidos y la velocidad sube con la distancia.
    if (state.distance >= state.nextSpawnAt) {
      const extraGap = spawnPattern();
      state.nextSpawnAt = state.distance + nextSpawnGap() + extraGap;
    }

    collectCoins();
    state.score = Math.floor(state.distance) + state.sparks * SCORE_PER_SPARK;
    checkCollisions();

    if (state.mode !== 'running') {
      updateHUD();
      return;
    }

    spawnDust(dt);
    updateEffects(dt);
    updateHUD();
  }

  function collectCoins() {
    const remaining = [];
    for (const coin of state.coins) {
      const inLane = Math.abs(coin.x - state.x) < 0.92;
      const inZ = coin.z <= PLAYER_Z + 1.1 && coin.prevZ >= PLAYER_Z - 1.4;
      if (!inLane || !inZ) {
        remaining.push(coin);
        continue;
      }

      const isCore = coin.type === 'core';
      state.sparks += isCore ? 5 : 1;
      if (isCore) state.cores += 1;
      Sound.pickup(isCore);
      spawnPickupBurst(coin, isCore);
      state.floaters.push({
        text: isCore ? '+5' : '+1',
        x: project(coin.x, coin.y + 0.35, coin.z).x,
        y: project(coin.x, coin.y + 0.35, coin.z).y - 10,
        vy: -55,
        life: 0.85,
        maxLife: 0.85,
        color: isCore ? '#8ff7ff' : '#ffd27a'
      });
    }
    state.coins = remaining;
  }

  function checkCollisions() {
    if (state.mode !== 'running') return;
    const playerHeight = state.sliding ? 0.62 : 1.78;
    const playerBottom = state.y + 0.02;
    const playerTop = state.y + playerHeight;

    for (const obstacle of state.obstacles) {
      const halfZ = obstacle.depth / 2 + 0.42;
      const overlapsZ = obstacle.z - halfZ <= PLAYER_Z && obstacle.prevZ + halfZ >= PLAYER_Z;
      if (!overlapsZ) continue;

      const overlapsX = Math.abs(obstacle.x - state.x) <= obstacle.width / 2 + 0.18;
      if (!overlapsX) continue;

      const overlapsY = playerBottom < obstacle.yTop && playerTop > obstacle.yBottom;
      if (overlapsY) {
        endRun();
        return;
      }
    }
  }

  function spawnPickupBurst(coin, isCore) {
    const point = project(coin.x, coin.y, coin.z);
    const count = isCore ? 14 : 7;
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        x: point.x + rand(-6, 6),
        y: point.y + rand(-6, 6),
        vx: rand(-80, 80),
        vy: rand(-150, -30),
        gravity: 260,
        life: rand(0.28, 0.6),
        maxLife: 0.6,
        size: rand(1.2, 3.4),
        color: isCore ? '#8ff7ff' : '#ffd27a'
      });
    }
  }

  function spawnCrashBurst() {
    const point = project(state.x, state.y + 0.9, PLAYER_Z);
    for (let i = 0; i < 28; i += 1) {
      state.particles.push({
        x: point.x + rand(-14, 14),
        y: point.y + rand(-30, 30),
        vx: rand(-260, 260),
        vy: rand(-260, 80),
        gravity: 380,
        life: rand(0.4, 1),
        maxLife: 1,
        size: rand(1.5, 4.5),
        color: Math.random() < 0.45 ? '#ffcf8a' : '#ff6a2b'
      });
    }
  }

  function spawnDust(dt) {
    state.dustTimer -= dt;
    if (state.dustTimer > 0) return;
    if (!state.grounded) {
      state.dustTimer = 0.1;
      return;
    }

    state.dustTimer = state.sliding ? 0.025 : 0.06;
    const foot = project(state.x, 0, PLAYER_Z);
    const amount = state.sliding ? 2 : 1;
    for (let i = 0; i < amount; i += 1) {
      state.particles.push({
        x: foot.x + rand(-14, 14),
        y: foot.y + rand(-3, 2),
        vx: rand(-24, 24) - state.speed * 0.7,
        vy: rand(-30, -8),
        gravity: 12,
        life: rand(0.2, 0.45),
        maxLife: 0.45,
        size: rand(1, 3),
        color: 'rgba(255, 180, 120, 0.75)'
      });
    }
  }

  function updateEffects(dt) {
    state.particles = state.particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      return particle.life > 0;
    });

    state.floaters = state.floaters.filter((floater) => {
      floater.life -= dt;
      floater.y += floater.vy * dt;
      floater.vy *= 0.96;
      return floater.life > 0;
    });
  }

  function updateEmbers(dt) {
    for (const ember of ash) {
      ember.y -= ember.speed * dt;
      ember.x += Math.sin(state.time * 0.7 + ember.phase) * ember.drift * dt * 0.01;
      if (ember.y < -0.03) {
        ember.y = 1.03;
        ember.x = Math.random();
      }
      if (ember.x > 1.03) ember.x = -0.03;
      if (ember.x < -0.03) ember.x = 1.03;
    }
  }

  function updateMenu(dt) {
    state.menuTime += dt;
    state.time += dt;
    state.runCycle += dt * 7.5;
    state.x = 0;
    state.targetX = 0;
    updateEmbers(dt);
  }

  /* -----------------------------------------------------------------------
     5. DIBUJO DEL ESCENARIO
     ----------------------------------------------------------------------- */

  function ridgeValue(index, layer) {
    const raw = Math.sin(index * 12.9898 + layer * 78.233) * 43758.5453;
    return raw - Math.floor(raw);
  }

  function drawRidge(layer) {
    const { W, H, horizon } = state;
    const specs = [
      { height: H * 0.14, color: '#1a1320', baseY: horizon + 26, step: 30 },
      { height: H * 0.095, color: '#110d17', baseY: horizon + 31, step: 40 },
      { height: H * 0.06, color: '#0a0810', baseY: horizon + 37, step: 52 }
    ];
    const spec = specs[layer];

    ctx.beginPath();
    ctx.moveTo(-30, horizon + 48);
    for (let x = -30; x <= W + 30; x += spec.step) {
      const index = Math.round(x / spec.step) + layer * 11;
      const noise = ridgeValue(index, layer);
      const envelope = 0.62 + 0.38 * Math.sin((x / W) * Math.PI);
      const peak = spec.baseY - spec.height * (0.22 + noise * 0.95) * envelope;
      ctx.lineTo(x, peak);
    }
    ctx.lineTo(W + 30, horizon + 48);
    ctx.closePath();
    ctx.fillStyle = spec.color;
    ctx.fill();

    if (layer === 1) {
      ctx.strokeStyle = 'rgba(255, 112, 55, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawSky(scroll) {
    const { W, H, horizon } = state;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 24);
    sky.addColorStop(0, '#050409');
    sky.addColorStop(0.45, '#0d0912');
    sky.addColorStop(0.72, '#27121b');
    sky.addColorStop(0.9, '#56231d');
    sky.addColorStop(1, '#803723');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 24);

    // Halo de calor sobre la caldera.
    const haloX = W * 0.67;
    const halo = ctx.createRadialGradient(haloX, horizon, 0, haloX, horizon, W * 0.6);
    halo.addColorStop(0, 'rgba(255, 122, 58, 0.3)');
    halo.addColorStop(0.45, 'rgba(255, 90, 40, 0.12)');
    halo.addColorStop(1, 'rgba(255, 90, 40, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, horizon + 30);
    ctx.restore();

    // Sol de ceniza: disco pálido con una sombra que lo vuelve creciente.
    const sunX = W * 0.75;
    const sunY = horizon * 0.46;
    const sunR = Math.min(W, H) * 0.072;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 4.2);
    sunGlow.addColorStop(0, 'rgba(255, 220, 178, 0.26)');
    sunGlow.addColorStop(0.4, 'rgba(255, 155, 92, 0.09)');
    sunGlow.addColorStop(1, 'rgba(255, 155, 92, 0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 4.2, 0, Math.PI * 2);
    ctx.fill();

    const sunDisc = ctx.createLinearGradient(sunX, sunY - sunR, sunX, sunY + sunR);
    sunDisc.addColorStop(0, '#ffe4bd');
    sunDisc.addColorStop(0.55, '#f8b57b');
    sunDisc.addColorStop(1, '#d77b50');
    ctx.fillStyle = sunDisc;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(12, 8, 13, 0.78)';
    ctx.beginPath();
    ctx.arc(sunX + sunR * 0.38, sunY - sunR * 0.12, sunR * 0.94, 0, Math.PI * 2);
    ctx.fill();

    // Bandas de nubes de ceniza.
    for (let i = 0; i < 6; i += 1) {
      const drift = state.time * (2.2 + i * 0.4);
      const x = ((W * (0.02 + i * 0.19) + drift) % (W + 340)) - 170;
      const y = horizon * (0.2 + (i % 3) * 0.16);
      const width = W * (0.16 + (i % 3) * 0.05);
      const height = Math.max(5, H * (0.008 + (i % 2) * 0.006));
      ctx.fillStyle = 'rgba(7, 5, 10, 0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y, width, height, -0.03, 0, Math.PI * 2);
      ctx.ellipse(x - width * 0.35, y + height * 0.8, width * 0.6, height * 0.7, 0.03, 0, Math.PI * 2);
      ctx.fill();
    }

    // Montañas lejanas.
    drawRidge(0);

    // Volcán de la Caldera.
    const vx = W * 0.17;
    const vBase = horizon + 23;
    const vTop = horizon - H * 0.165;
    const crater = W * 0.026;
    const foot = W * 0.155;
    ctx.beginPath();
    ctx.moveTo(vx - foot, vBase);
    ctx.lineTo(vx - crater * 1.4, vTop + 6);
    ctx.lineTo(vx - crater * 0.45, vTop + 10);
    ctx.lineTo(vx + crater * 0.55, vTop + 8);
    ctx.lineTo(vx + crater * 1.6, vTop + 3);
    ctx.lineTo(vx + foot, vBase);
    ctx.closePath();
    ctx.fillStyle = '#0f0b14';
    ctx.fill();

    const craterGlow = ctx.createRadialGradient(vx, vTop + 8, 0, vx, vTop + 8, W * 0.075);
    craterGlow.addColorStop(0, 'rgba(255, 116, 52, 0.5)');
    craterGlow.addColorStop(0.35, 'rgba(255, 90, 38, 0.16)');
    craterGlow.addColorStop(1, 'rgba(255, 90, 38, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = craterGlow;
    ctx.fillRect(vx - W * 0.09, vTop - H * 0.04, W * 0.18, H * 0.16);
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 95, 38, 0.24)';
    ctx.lineWidth = Math.max(1, H * 0.0018);
    ctx.beginPath();
    ctx.moveTo(vx + crater * 0.4, vTop + 14);
    ctx.quadraticCurveTo(vx + W * 0.02, vTop + H * 0.07, vx + W * 0.045, vBase - 4);
    ctx.stroke();

    // Silueta de la ciudad suspendida.
    drawSkyline();

    // Cordilleras cercanas.
    drawRidge(1);
    drawRidge(2);

    // Faro de la Caldera: referencia lejana y original.
    drawBeacon();

    // Bruma cálida sobre el horizonte.
    const haze = ctx.createLinearGradient(0, horizon - H * 0.05, 0, horizon + H * 0.06);
    haze.addColorStop(0, 'rgba(255, 110, 55, 0)');
    haze.addColorStop(0.55, 'rgba(255, 110, 55, 0.16)');
    haze.addColorStop(1, 'rgba(30, 12, 16, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - H * 0.05, W, H * 0.11);

    // Polvo fino iluminado por el sol.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i += 1) {
      const px = (W * 0.55 + i * 71 + scroll * 0.08) % W;
      const py = horizon * 0.22 + ((i * 53) % (horizon * 0.65));
      const alpha = 0.05 + ((i * 7) % 5) * 0.018;
      ctx.fillStyle = `rgba(255, 190, 130, ${alpha})`;
      ctx.fillRect(px, py, 1.4, 1.4);
    }
    ctx.restore();
  }

  function drawSkyline() {
    const { W, H, horizon } = state;
    const base = horizon + 22;
    const towers = [
      [0.31, 0.035, 0.007], [0.325, 0.06, 0.005], [0.338, 0.03, 0.009],
      [0.355, 0.075, 0.006], [0.37, 0.045, 0.011], [0.39, 0.028, 0.006],
      [0.402, 0.055, 0.008], [0.42, 0.036, 0.005], [0.47, 0.042, 0.006],
      [0.49, 0.028, 0.004], [0.56, 0.05, 0.005], [0.585, 0.03, 0.007]
    ];

    ctx.fillStyle = '#0b0810';
    towers.forEach(([rx, rh, rw], index) => {
      const x = W * rx;
      const height = H * rh;
      const width = Math.max(3, W * rw);
      ctx.fillRect(x, base - height, width, height + 3);
      if (index % 2 === 0) {
        ctx.fillRect(x + width * 0.45, base - height - H * 0.018, 1.2, H * 0.018);
      }
    });

    ctx.fillStyle = 'rgba(255, 174, 104, 0.34)';
    towers.forEach(([rx, rh, rw], index) => {
      if (index % 3 === 2) return;
      const x = W * rx + Math.max(3, W * rw) * 0.3;
      const y = base - H * rh + H * 0.012;
      ctx.fillRect(x, y, 1.3, 1.6);
      ctx.fillRect(x + 3, y + H * 0.018, 1.1, 1.3);
    });
  }

  function drawBeacon() {
    const { W, H, horizon } = state;
    const x = W * 0.855;
    const base = horizon + 20;
    const top = horizon - H * 0.17;
    const pulse = 0.55 + 0.45 * Math.sin(state.time * 2.1);

    ctx.strokeStyle = '#18121b';
    ctx.lineWidth = Math.max(1.5, W * 0.0015);
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, top);
    ctx.moveTo(x - W * 0.008, top + H * 0.04);
    ctx.lineTo(x + W * 0.008, top + H * 0.04);
    ctx.moveTo(x - W * 0.005, top + H * 0.09);
    ctx.lineTo(x + W * 0.005, top + H * 0.09);
    ctx.stroke();

    const radius = Math.max(8, H * 0.03);
    const glow = ctx.createRadialGradient(x, top, 0, x, top, radius * 2.6);
    glow.addColorStop(0, `rgba(255, 233, 186, ${0.75 * pulse})`);
    glow.addColorStop(0.2, `rgba(255, 171, 92, ${0.34 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 130, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, top, radius * 2.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 240, 209, ${0.7 + pulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, top, Math.max(1.5, radius * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround() {
    const { W, H, horizon } = state;
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, '#34171a');
    ground.addColorStop(0.16, '#1a1016');
    ground.addColorStop(0.55, '#0b080e');
    ground.addColorStop(1, '#050408');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);
  }

  function drawLavaVeins(scroll) {
    const { W, H, horizon } = state;
    const span = 170;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, W, H - horizon);
    ctx.clip();
    ctx.lineCap = 'round';

    for (const vein of lavaVeins) {
      const wrapped = ((vein.offset - scroll) % span + span) % span;
      const zStart = 6 + wrapped;
      if (zStart > 164) continue;

      const drawSegments = (widthFactor, color) => {
        ctx.beginPath();
        for (let i = 0; i <= 5; i += 1) {
          const t = i / 5;
          const z = zStart + t * vein.length;
          const lateral = 4.25 + t * vein.lateral * 5.2
            + Math.sin(t * 7 + vein.wiggle) * 0.28;
          const point = project(vein.side * lateral, 0, z);
          if (i === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = clamp((state.focal / zStart) * 0.04 * widthFactor, 0.7, 6);
        ctx.stroke();
      };

      const fade = clamp(1 - (zStart - 6) / 156, 0, 1);
      drawSegments(1.6, `rgba(255, 82, 30, ${0.3 * fade})`);
      drawSegments(0.55, `rgba(255, 205, 120, ${0.35 * fade})`);
    }
    ctx.restore();
  }

  function drawWalkway(side) {
    const nearZ = 3;
    const farZ = 166;
    const inner = side * TRACK_HALF;
    const outer = side * (TRACK_HALF + 1.05);
    const a = project(inner, 0.02, nearZ);
    const b = project(outer, 0.02, nearZ);
    const c = project(outer, 0.02, farZ);
    const d = project(inner, 0.02, farZ);

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(9, 7, 12, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawTrack(scroll) {
    const { horizon, H } = state;
    const nearZ = 3;
    const farZ = 166;
    const nL = project(-TRACK_HALF, 0, nearZ);
    const nR = project(TRACK_HALF, 0, nearZ);
    const fL = project(-TRACK_HALF, 0, farZ);
    const fR = project(TRACK_HALF, 0, farZ);

    drawWalkway(-1);
    drawWalkway(1);

    // Superficie de basalto.
    const road = ctx.createLinearGradient(0, horizon, 0, H);
    road.addColorStop(0, '#241a1e');
    road.addColorStop(0.35, '#1b1419');
    road.addColorStop(0.7, '#141015');
    road.addColorStop(1, '#0d0a10');
    ctx.beginPath();
    ctx.moveTo(nL.x, nL.y);
    ctx.lineTo(nR.x, nR.y);
    ctx.lineTo(fR.x, fR.y);
    ctx.lineTo(fL.x, fL.y);
    ctx.closePath();
    ctx.fillStyle = road;
    ctx.fill();

    // Vetas tenues de calor sobre el asfalto.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const heat = ctx.createRadialGradient(state.cx, horizon + H * 0.22, 0, state.cx, horizon + H * 0.22, H * 0.65);
    heat.addColorStop(0, 'rgba(255, 92, 40, 0.045)');
    heat.addColorStop(1, 'rgba(255, 92, 40, 0)');
    ctx.fillStyle = heat;
    ctx.fillRect(0, horizon, state.W, H - horizon);
    ctx.restore();

    // Líneas discontinuas de los carriles.
    const dashLength = 4.1;
    const period = 9.4;
    const phase = scroll % period;
    ctx.fillStyle = 'rgba(240, 223, 205, 0.16)';
    for (const boundary of [-LANE_WIDTH / 2, LANE_WIDTH / 2]) {
      for (let z = period - phase; z < 155; z += period) {
        const z1 = Math.max(z, 3.05);
        const z2 = Math.max(z + dashLength, 3.1);
        if (z2 <= 3.05) continue;
        const a = project(boundary - 0.045, 0.015, z1);
        const b = project(boundary + 0.045, 0.015, z1);
        const c = project(boundary + 0.045, 0.015, z2);
        const d = project(boundary - 0.045, 0.015, z2);
        ctx.globalAlpha = clamp(1 - z1 / 175, 0.12, 1);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Rieles turquesa que enmarcan la pista.
    for (const side of [-1, 1]) {
      const near = project(side * (TRACK_HALF - 0.04), 0.05, nearZ);
      const far = project(side * (TRACK_HALF - 0.04), 0.05, farZ);
      const rail = ctx.createLinearGradient(near.x, near.y, far.x, far.y);
      rail.addColorStop(0, 'rgba(102, 230, 209, 0.72)');
      rail.addColorStop(0.45, 'rgba(102, 230, 209, 0.35)');
      rail.addColorStop(1, 'rgba(102, 230, 209, 0.03)');
      ctx.save();
      ctx.strokeStyle = rail;
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(102, 230, 209, 0.55)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(near.x, near.y);
      ctx.lineTo(far.x, far.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPosts(scroll) {
    const spacing = 18;
    const phase = scroll % spacing;
    for (let i = 0; i < 9; i += 1) {
      const z = 12 + i * spacing - phase;
      if (z < 6) continue;
      drawPost(-4.55, z);
      drawPost(4.55, z);
    }
  }

  function drawPost(x, z) {
    const base = project(x, 0, z);
    const top = project(x, 2.6, z);
    const width = clamp(base.scale * 0.035, 1, 3.5);

    ctx.strokeStyle = '#231b22';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(102, 230, 209, 0.28)';
    ctx.lineWidth = Math.max(0.7, width * 0.24);
    ctx.beginPath();
    ctx.moveTo(base.x + width * 0.6, base.y);
    ctx.lineTo(top.x + width * 0.6, top.y + width * 1.2);
    ctx.stroke();

    const lampY = top.y + width * 1.4;
    const radius = clamp(base.scale * 0.08, 2.5, 8);
    const glow = ctx.createRadialGradient(top.x, lampY, 0, top.x, lampY, radius * 3);
    glow.addColorStop(0, 'rgba(255, 224, 165, 0.55)');
    glow.addColorStop(0.3, 'rgba(255, 160, 82, 0.25)');
    glow.addColorStop(1, 'rgba(255, 130, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(top.x, lampY, radius * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 235, 195, 0.9)';
    ctx.beginPath();
    ctx.arc(top.x, lampY, Math.max(0.8, radius * 0.28), 0, Math.PI * 2);
    ctx.fill();
  }

  /* -----------------------------------------------------------------------
     6. DIBUJO DE ENTIDADES Y PERSONAJE
     ----------------------------------------------------------------------- */

  function roundRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawGlowDot(px, py, radius, rgb) {
    const r = Math.max(1.5, radius);
    const glow = ctx.createRadialGradient(px, py, 0, px, py, r * 4.5);
    glow.addColorStop(0, `rgba(${rgb}, 0.65)`);
    glow.addColorStop(0.3, `rgba(${rgb}, 0.3)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, r * 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${rgb}, 0.95)`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBox(x, z, width, depth, yBottom, yTop, palette) {
    const nearZ = Math.max(z - depth / 2, 0.75);
    const farZ = z + depth / 2;
    const xl = x - width / 2;
    const xr = x + width / 2;

    const nlb = project(xl, yBottom, nearZ);
    const nrb = project(xr, yBottom, nearZ);
    const nlt = project(xl, yTop, nearZ);
    const nrt = project(xr, yTop, nearZ);
    const flb = project(xl, yBottom, farZ);
    const frb = project(xr, yBottom, farZ);
    const flt = project(xl, yTop, farZ);
    const frt = project(xr, yTop, farZ);

    const frontPath = () => {
      ctx.beginPath();
      ctx.moveTo(nlt.x, nlt.y);
      ctx.lineTo(nrt.x, nrt.y);
      ctx.lineTo(nrb.x, nrb.y);
      ctx.lineTo(nlb.x, nlb.y);
      ctx.closePath();
    };

    // Cara superior.
    if (yTop < CAMERA_Y) {
      ctx.beginPath();
      ctx.moveTo(nlt.x, nlt.y);
      ctx.lineTo(nrt.x, nrt.y);
      ctx.lineTo(frt.x, frt.y);
      ctx.lineTo(flt.x, flt.y);
      ctx.closePath();
      ctx.fillStyle = palette.top;
      ctx.fill();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Lateral visible según el lado del carril.
    if (x > 0.02) {
      ctx.beginPath();
      ctx.moveTo(nlb.x, nlb.y);
      ctx.lineTo(nlt.x, nlt.y);
      ctx.lineTo(flt.x, flt.y);
      ctx.lineTo(flb.x, flb.y);
      ctx.closePath();
      ctx.fillStyle = palette.side;
      ctx.fill();
    } else if (x < -0.02) {
      ctx.beginPath();
      ctx.moveTo(nrb.x, nrb.y);
      ctx.lineTo(nrt.x, nrt.y);
      ctx.lineTo(frt.x, frt.y);
      ctx.lineTo(frb.x, frb.y);
      ctx.closePath();
      ctx.fillStyle = palette.side;
      ctx.fill();
    }

    // Cara frontal con degradado.
    const front = ctx.createLinearGradient(0, nlt.y, 0, nlb.y);
    front.addColorStop(0, palette.frontTop);
    front.addColorStop(1, palette.frontBottom);
    frontPath();
    ctx.fillStyle = front;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Franjas de peligro inclinadas (solo si hay píxeles suficientes).
    const faceHeight = nlb.y - nlt.y;
    if (palette.stripe && faceHeight > 14) {
      ctx.save();
      frontPath();
      ctx.clip();
      const top = Math.min(nlt.y, nrt.y);
      const bottom = Math.max(nlb.y, nrb.y);
      const span = Math.max(8, bottom - top);
      ctx.strokeStyle = palette.stripe;
      ctx.lineWidth = Math.max(2, span * 0.14);
      const minX = Math.min(nlt.x, nrt.x, nlb.x, nrb.x);
      const maxX = Math.max(nlt.x, nrt.x, nlb.x, nrb.x);
      for (let sx = minX - span; sx < maxX + span; sx += span * 0.95) {
        ctx.beginPath();
        ctx.moveTo(sx, bottom);
        ctx.lineTo(sx + span, top);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Banda reflectante superior.
    if (palette.band) {
      const bandTop = project(xl, yTop - 0.05, nearZ);
      const bandBottom = project(xl, yTop - 0.2, nearZ);
      const bandBottomR = project(xr, yTop - 0.2, nearZ);
      const bandTopR = project(xr, yTop - 0.05, nearZ);
      ctx.beginPath();
      ctx.moveTo(bandTop.x, bandTop.y);
      ctx.lineTo(bandTopR.x, bandTopR.y);
      ctx.lineTo(bandBottomR.x, bandBottomR.y);
      ctx.lineTo(bandBottom.x, bandBottom.y);
      ctx.closePath();
      ctx.fillStyle = palette.band;
      ctx.fill();
    }

    // Arista superior brillante.
    ctx.strokeStyle = palette.rim || palette.edge;
    ctx.lineWidth = Math.max(1, faceHeight * 0.025);
    ctx.beginPath();
    ctx.moveTo(nlt.x, nlt.y);
    ctx.lineTo(nrt.x, nrt.y);
    ctx.stroke();
  }

  function drawObstacle(obstacle) {
    if (obstacle.z < 3.3) return;

    if (obstacle.type === 'low') {
      const palette = {
        top: '#4d3329',
        side: '#1c1318',
        frontTop: '#3b2923',
        frontBottom: '#181116',
        edge: 'rgba(255, 130, 62, 0.5)',
        stripe: 'rgba(255, 126, 54, 0.72)',
        band: 'rgba(255, 177, 92, 0.85)',
        rim: 'rgba(255, 191, 122, 0.85)'
      };
      drawBox(obstacle.x, obstacle.z, obstacle.width, obstacle.depth, 0.46, 0.98, palette);

      // Patas de la barrera.
      const legPalette = {
        top: '#2e2325', side: '#120e13', frontTop: '#241b1e',
        frontBottom: '#0e0b10', edge: 'rgba(255, 130, 62, 0.25)'
      };
      const legPositions = obstacle.full
        ? [-2.9, -1.45, 0, 1.45, 2.9]
        : [-obstacle.width * 0.36, obstacle.width * 0.36];
      for (const offset of legPositions) {
        drawBox(obstacle.x + offset, obstacle.z + 0.04, 0.17, obstacle.depth * 0.75, 0, 0.48, legPalette);
      }

      const lamp = project(obstacle.x, 1.06, obstacle.z);
      drawGlowDot(lamp.x, lamp.y, clamp(lamp.scale * 0.035, 1.5, 4), '255, 112, 54');
      if (obstacle.full) {
        for (const offset of [-2.2, 0, 2.2]) {
          const extraLamp = project(obstacle.x + offset, 1.04, obstacle.z);
          drawGlowDot(extraLamp.x, extraLamp.y, clamp(extraLamp.scale * 0.022, 1, 2.6), '255, 112, 54');
        }
      }
    } else if (obstacle.type === 'beam') {
      const palette = {
        top: '#49362d',
        side: '#1b1419',
        frontTop: '#3d2c26',
        frontBottom: '#171117',
        edge: 'rgba(255, 177, 92, 0.45)',
        stripe: 'rgba(255, 177, 92, 0.34)',
        band: 'rgba(255, 92, 46, 0.85)',
        rim: 'rgba(255, 203, 140, 0.8)'
      };
      drawBox(obstacle.x, obstacle.z, obstacle.width, obstacle.depth, 1.12, 2.15, palette);

      // Cadenas / soportes que cuelgan del techo.
      const supportOffsets = obstacle.full ? [-2.75, 0, 2.75] : [-0.62, 0.62];
      for (const offset of supportOffsets) {
        const top = project(obstacle.x + offset, 3.05, obstacle.z);
        const bottom = project(obstacle.x + offset, 2.1, obstacle.z);
        ctx.strokeStyle = 'rgba(28, 22, 27, 0.95)';
        ctx.lineWidth = clamp(bottom.scale * 0.045, 1, 4);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 177, 92, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      for (const offset of (obstacle.full ? [-2.55, 0, 2.55] : [-0.68, 0.68])) {
        const lamp = project(obstacle.x + offset, 1.32, obstacle.z);
        drawGlowDot(lamp.x, lamp.y, clamp(lamp.scale * 0.03, 1.4, 3.6), '255, 138, 54');
      }

      // Línea de aviso justo bajo la viga.
      const warnLeft = project(obstacle.x - obstacle.width / 2, 1.11, obstacle.z);
      const warnRight = project(obstacle.x + obstacle.width / 2, 1.11, obstacle.z);
      ctx.strokeStyle = 'rgba(255, 98, 48, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(warnLeft.x, warnLeft.y);
      ctx.lineTo(warnRight.x, warnRight.y);
      ctx.stroke();
    } else {
      // Columna de basalto: hay que cambiar de carril o saltar no basta.
      const palette = {
        top: '#3b303a',
        side: '#151017',
        frontTop: '#3a2d38',
        frontBottom: '#171119',
        edge: 'rgba(255, 106, 43, 0.35)',
        band: 'rgba(255, 106, 43, 0.6)',
        rim: 'rgba(255, 151, 83, 0.65)'
      };
      drawBox(obstacle.x, obstacle.z, obstacle.width, obstacle.depth, 0, 2.78, palette);

      const frontZ = obstacle.z - obstacle.depth / 2;
      const crack = [
        project(obstacle.x - 0.12, 2.42, frontZ),
        project(obstacle.x + 0.2, 2.08, frontZ),
        project(obstacle.x - 0.18, 1.7, frontZ),
        project(obstacle.x + 0.14, 1.28, frontZ),
        project(obstacle.x - 0.04, 0.82, frontZ),
        project(obstacle.x + 0.1, 0.3, frontZ)
      ];
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 108, 44, 0.85)';
      ctx.lineWidth = clamp(crack[0].scale * 0.014, 1, 3);
      ctx.shadowColor = 'rgba(255, 90, 37, 0.85)';
      ctx.shadowBlur = 9;
      ctx.beginPath();
      crack.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.restore();

      const branchStart = crack[2];
      const branchEnd = project(obstacle.x + 0.48, 1.52 + Math.sin(obstacle.seed) * 0.13, frontZ);
      ctx.strokeStyle = 'rgba(255, 118, 48, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(branchStart.x, branchStart.y);
      ctx.lineTo(branchEnd.x, branchEnd.y);
      ctx.stroke();

      const core = project(obstacle.x, 1.78, frontZ);
      drawGlowDot(core.x, core.y, clamp(core.scale * 0.026, 1.2, 3), '255, 104, 42');
    }
  }

  function drawCoin(coin) {
    const bob = Math.sin(state.time * 3.2 + coin.seed) * 0.07;
    const point = project(coin.x, coin.y + bob, coin.z);
    if (point.y < -40 || point.y > state.H + 60) return;

    const isCore = coin.type === 'core';
    const radius = Math.max(1.3, (isCore ? 0.3 : 0.22) * point.scale);
    const pulse = 0.82 + 0.18 * Math.sin(state.time * 4.4 + coin.seed);
    const rgb = isCore ? '143, 247, 255' : '255, 198, 108';

    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3.6);
    glow.addColorStop(0, `rgba(${rgb}, 0.5)`);
    glow.addColorStop(0.4, `rgba(${rgb}, 0.16)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 3.6, 0, Math.PI * 2);
    ctx.fill();

    const spin = Math.abs(Math.cos(state.time * 2.5 + coin.seed));
    const width = radius * (0.32 + 0.68 * spin);

    const body = ctx.createLinearGradient(
      point.x - width, point.y - radius,
      point.x + width, point.y + radius
    );
    if (isCore) {
      body.addColorStop(0, '#e8ffff');
      body.addColorStop(0.45, '#8ff7ff');
      body.addColorStop(1, '#2aa9c4');
    } else {
      body.addColorStop(0, '#fff6cf');
      body.addColorStop(0.45, '#ffd166');
      body.addColorStop(1, '#e9852b');
    }

    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Math.sin(state.time * 1.4 + coin.seed) * 0.12);
    ctx.fillStyle = body;
    ctx.strokeStyle = isCore ? 'rgba(216, 255, 255, 0.9)' : 'rgba(255, 236, 190, 0.85)';
    ctx.lineWidth = Math.max(1, radius * 0.14);
    ctx.beginPath();
    ctx.ellipse(0, 0, width, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.08, Math.max(0.6, width * 0.25), radius * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isCore) {
      ctx.strokeStyle = `rgba(143, 247, 255, ${0.6 * pulse})`;
      ctx.lineWidth = Math.max(1, radius * 0.12);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.65, state.time * 1.5, state.time * 1.5 + Math.PI * 1.35);
      ctx.stroke();
      ctx.strokeStyle = `rgba(220, 255, 255, ${0.75 * pulse})`;
      ctx.beginPath();
      ctx.moveTo(-radius * 2.1, 0);
      ctx.lineTo(radius * 2.1, 0);
      ctx.moveTo(0, -radius * 2.1);
      ctx.lineTo(0, radius * 2.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLeg(hipX, lift, sway) {
    const footX = hipX + sway;
    const footY = -0.03 - lift;
    const kneeX = hipX + sway * 0.42;
    const kneeY = -0.43 - lift * 0.55;

    ctx.strokeStyle = '#241c27';
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.moveTo(hipX, -0.82);
    ctx.lineTo(kneeX, kneeY);
    ctx.stroke();

    ctx.strokeStyle = '#302532';
    ctx.lineWidth = 0.145;
    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.lineTo(footX, footY - 0.06);
    ctx.stroke();

    ctx.fillStyle = '#0b0910';
    roundRectPath(footX - 0.1, footY - 0.13, 0.2, 0.15, 0.05);
    ctx.fill();
    ctx.fillStyle = 'rgba(102, 230, 209, 0.32)';
    ctx.fillRect(footX - 0.08, footY - 0.1, 0.16, 0.018);
  }

  function drawArm(side, phaseOffset) {
    const air = !state.grounded;
    const shoulderX = side * 0.27;
    const shoulderY = -1.4;
    const swing = air ? -0.22 : Math.sin(state.runCycle + phaseOffset) * 0.13;
    const elbowX = side * 0.36;
    const elbowY = -1.14 + swing * 0.25;
    const handX = side * (0.37 + Math.abs(swing) * 0.4);
    const handY = air ? -1.13 : -0.9 + swing * 0.5;

    ctx.strokeStyle = '#d74a25';
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    ctx.fillStyle = '#c98662';
    ctx.beginPath();
    ctx.arc(handX, handY, 0.052, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRunner() {
    const phase = state.runCycle;
    const air = !state.grounded;
    const slide = state.sliding;
    const wave = Math.sin(state.time * 9) * 0.06;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Bufanda turquesa que ondea.
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.strokeStyle = '#4fd9c4';
    ctx.lineWidth = 0.085;
    ctx.beginPath();
    ctx.moveTo(-0.03, -1.51);
    ctx.bezierCurveTo(0.2, -1.54, 0.34, -1.38 + wave, 0.6, -1.24 + wave);
    ctx.stroke();
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.01, -1.47);
    ctx.bezierCurveTo(0.18, -1.43, 0.25, -1.28 + wave, 0.43, -1.03 + wave);
    ctx.stroke();
    ctx.restore();

    // Piernas.
    if (air) {
      drawLeg(-0.14, 0.32, -0.05);
      drawLeg(0.14, 0.28, 0.06);
    } else if (slide) {
      drawLeg(-0.2, 0.04, -0.14);
      drawLeg(0.18, 0.04, 0.12);
    } else {
      const swingA = Math.sin(phase);
      const swingB = Math.sin(phase + Math.PI);
      drawLeg(-0.13, Math.max(0, swingA) * 0.24, swingA * 0.05);
      drawLeg(0.13, Math.max(0, swingB) * 0.24, swingB * 0.05);
    }

    // Torso / chaqueta.
    const jacket = ctx.createLinearGradient(-0.3, 0, 0.3, 0);
    jacket.addColorStop(0, '#ff7c3e');
    jacket.addColorStop(0.48, '#e5542a');
    jacket.addColorStop(1, '#b6391c');
    ctx.beginPath();
    ctx.moveTo(-0.3, -1.46);
    ctx.quadraticCurveTo(0, -1.54, 0.3, -1.46);
    ctx.lineTo(0.23, -0.87);
    ctx.quadraticCurveTo(0, -0.79, -0.23, -0.87);
    ctx.closePath();
    ctx.fillStyle = jacket;
    ctx.fill();
    ctx.strokeStyle = 'rgba(96, 28, 12, 0.7)';
    ctx.lineWidth = 0.022;
    ctx.stroke();

    // Franja reflectante y bajo de la chaqueta.
    ctx.fillStyle = 'rgba(255, 222, 183, 0.82)';
    ctx.fillRect(-0.235, -1.13, 0.47, 0.055);
    ctx.fillStyle = 'rgba(255, 170, 110, 0.3)';
    ctx.fillRect(-0.22, -0.92, 0.44, 0.035);

    drawArm(-1, Math.PI);
    drawArm(1, 0);

    // Mochila con el núcleo de brasa.
    ctx.fillStyle = '#0f3b38';
    roundRectPath(-0.18, -1.38, 0.36, 0.38, 0.07);
    ctx.fill();
    ctx.strokeStyle = 'rgba(102, 230, 209, 0.4)';
    ctx.lineWidth = 0.018;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(122, 43, 24, 0.9)';
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.24, -1.44);
    ctx.lineTo(-0.19, -1.06);
    ctx.moveTo(0.24, -1.44);
    ctx.lineTo(0.19, -1.06);
    ctx.stroke();

    ctx.fillStyle = '#ffce7e';
    ctx.beginPath();
    ctx.arc(0, -1.19, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff0c2';
    ctx.lineWidth = 0.018;
    ctx.stroke();

    // Capucha y cabeza (vista desde atrás).
    ctx.fillStyle = '#bf3e1c';
    ctx.beginPath();
    ctx.arc(0, -1.66, 0.215, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#211823';
    ctx.beginPath();
    ctx.arc(0, -1.68, 0.155, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(102, 230, 209, 0.55)';
    roundRectPath(-0.19, -1.55, 0.38, 0.055, 0.025);
    ctx.fill();

    // Pequeño brillo del núcleo sobre la espalda.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, -1.19, 0, 0, -1.19, 0.6);
    glow.addColorStop(0, 'rgba(255, 213, 140, 0.55)');
    glow.addColorStop(0.4, 'rgba(255, 160, 80, 0.18)');
    glow.addColorStop(1, 'rgba(255, 130, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -1.19, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const ground = project(state.x, 0, PLAYER_Z);
    const feet = project(state.x, state.y, PLAYER_Z);
    const scale = feet.scale;
    const running = state.mode === 'running';
    const bob = running && state.grounded && !state.sliding
      ? Math.abs(Math.sin(state.runCycle)) * 0.028
      : 0;

    // Charco de luz cálida en el suelo.
    ctx.save();
    const pool = ctx.createRadialGradient(ground.x, ground.y, 0, ground.x, ground.y, 1.3 * scale);
    pool.addColorStop(0, 'rgba(255, 158, 84, 0.17)');
    pool.addColorStop(0.6, 'rgba(255, 140, 70, 0.06)');
    pool.addColorStop(1, 'rgba(255, 120, 60, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, 1.25 * scale, 0.34 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sombra (se aclara y encoge al saltar).
    const shadowAlpha = clamp(0.4 - state.y * 0.18, 0.06, 0.4);
    const shadowScale = clamp(1 - state.y * 0.24, 0.45, 1);
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, 0.55 * scale * shadowScale, 0.14 * scale * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // El personaje se dibuja en su espacio local (1 unidad = 1 metro).
    ctx.save();
    ctx.translate(feet.x, feet.y - bob * scale);
    const lean = clamp((state.targetX - state.x) * 0.055, -0.14, 0.14);
    ctx.rotate(lean);
    ctx.scale(scale, scale);
    if (state.sliding) ctx.scale(1, 0.62);
    drawRunner();
    ctx.restore();
  }

  function drawEntities() {
    const items = [];
    if (state.mode !== 'menu') {
      state.obstacles.forEach((obstacle) => items.push({ z: obstacle.z, kind: 'obstacle', value: obstacle }));
      state.coins.forEach((coin) => items.push({ z: coin.z, kind: 'coin', value: coin }));
    }
    items.push({ z: PLAYER_Z, kind: 'player', value: null });
    items.sort((a, b) => b.z - a.z);

    for (const item of items) {
      if (item.kind === 'obstacle') drawObstacle(item.value);
      else if (item.kind === 'coin') drawCoin(item.value);
      else drawPlayer();
    }
  }

  function drawEffects() {
    ctx.save();
    for (const particle of state.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const floater of state.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      const size = clamp(state.H * 0.028, 13, 24);
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${size}px "Consolas", monospace`;
      ctx.fillStyle = floater.color;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 8;
      ctx.fillText(floater.text, floater.x, floater.y);
    }
    ctx.restore();
  }

  function drawAsh() {
    const { W, H } = state;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const ember of ash) {
      const twinkle = 0.6 + 0.4 * Math.sin(state.time * 2.2 + ember.phase);
      const alpha = ember.alpha * twinkle;
      ctx.fillStyle = `rgba(255, 176, 112, ${alpha})`;
      ctx.beginPath();
      ctx.arc(ember.x * W, ember.y * H, ember.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    const { W, H, cx } = state;
    const vignette = ctx.createRadialGradient(
      cx, H * 0.56, Math.min(W, H) * 0.2,
      cx, H * 0.56, Math.max(W, H) * 0.74
    );
    vignette.addColorStop(0, 'rgba(2, 2, 5, 0)');
    vignette.addColorStop(0.62, 'rgba(2, 2, 5, 0.12)');
    vignette.addColorStop(1, 'rgba(2, 2, 5, 0.68)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  /* -----------------------------------------------------------------------
     7. BUCLE PRINCIPAL, CONTROLES E INICIO
     ----------------------------------------------------------------------- */

  function render() {
    const scroll = state.mode === 'menu' ? state.menuTime * 8.5 : state.distance;
    drawSky(scroll);
    drawGround();
    drawLavaVeins(scroll);
    drawTrack(scroll);
    drawPosts(scroll);
    drawEntities();
    drawEffects();
    drawVignette();
    drawAsh();
  }

  function handleKeyDown(event) {
    const code = event.code;
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const isArrow = code === 'ArrowLeft' || code === 'ArrowRight'
      || code === 'ArrowUp' || code === 'ArrowDown';

    // Evitar que las flechas y el espacio desplacen la página.
    if (code === 'Space' || (state.mode !== 'menu' && isArrow)) {
      event.preventDefault();
    }
    if (event.repeat) return;

    if (state.mode === 'menu') {
      if (code === 'Space' || code === 'Enter') beginRun();
      else if (key === 'm') toggleSound();
      return;
    }

    if (state.mode === 'running') {
      if (code === 'ArrowLeft') moveLane(-1);
      else if (code === 'ArrowRight') moveLane(1);
      else if (code === 'ArrowUp') jump();
      else if (code === 'ArrowDown') slide();
      else if (code === 'Space' || code === 'Escape') pauseRun();
      else if (key === 'm') toggleSound();
      return;
    }

    if (state.mode === 'paused') {
      if (code === 'Space') resumeRun();
      else if (key === 'r') beginRun();
      else if (code === 'Escape') returnToMenu();
      else if (key === 'm') toggleSound();
      return;
    }

    if (state.mode === 'gameover') {
      if (code === 'KeyR' || code === 'Space') beginRun();
      else if (code === 'Escape') returnToMenu();
      else if (key === 'm') toggleSound();
    }
  }

  function bindEvents() {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', resizeCanvas);

    dom.startBtn.addEventListener('click', () => {
      if (state.mode === 'menu') beginRun();
    });
    dom.resumeBtn.addEventListener('click', resumeRun);
    dom.retryBtn.addEventListener('click', () => {
      if (state.mode === 'gameover') beginRun();
    });
    dom.menuBtn.addEventListener('click', returnToMenu);

    // Si la pestaña se oculta, la carrera se pausa para no perder de forma injusta.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.mode === 'running') pauseRun();
    });
  }

  function frame(now) {
    const elapsed = state.lastFrame ? (now - state.lastFrame) / 1000 : 0;
    const dt = clamp(elapsed, 0, 0.05);
    state.lastFrame = now;

    if (state.mode === 'running') update(dt);
    else if (state.mode === 'menu') updateMenu(dt);

    render();
    window.requestAnimationFrame(frame);
  }

  function init() {
    if (!ctx) {
      document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;padding:2rem">'
        + 'Tu navegador no permite dibujar el juego (Canvas 2D).</p>';
      return;
    }

    resizeCanvas();
    resetRun();
    state.obstacles = [];
    state.coins = [];
    state.particles = [];
    state.floaters = [];
    setMode('menu');
    updateBestLabels();
    updateHUD();
    bindEvents();
    state.lastFrame = performance.now();
    window.requestAnimationFrame(frame);
  }

  init();
})();
