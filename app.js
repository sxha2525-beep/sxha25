(() => {
  'use strict';
  const config = window.CARD_CONFIG || {};
  const scenes = ['wine', 'cream', 'blue'];
  const $ = (id) => document.getElementById(id);
  const svg = (name) => `<svg class="icon"><use href="#i-${name}"/></svg>`;
  let active = 'wine';
  let soundOn = true;
  let previewActive = false;
  let viewing = false;
  let switching = false;
  let currentTrack = null;
  let lastFocus = null;
  let viewerOpenedFromKeyboard = false;
  let raf = 0;
  let introFinished = false;
  let introEntering = false;
  const preview = $('previewAudio');

  // Una letra sube cuando el cursor la cruza. El resto del título no se mueve.
  const letterTimers = new WeakMap();
  function decorateTitle(el) {
    if (!el) return;
    const label = el.textContent;
    el.setAttribute('aria-label',label);
    function split(node) {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          for (const char of child.textContent) {
            if (/\s/.test(char)) frag.append(document.createTextNode(char));
            else {
              const span = document.createElement('span');
              span.className = 'title-letter';
              span.textContent = char;
              span.setAttribute('aria-hidden','true');
              frag.append(span);
            }
          }
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('title-letter')) split(child);
      }
    }
    split(el);
    if (el.dataset.letterWaveReady) return;
    el.dataset.letterWaveReady = 'true';
    el.addEventListener('pointerover',(event) => {
      if (!window.matchMedia('(hover:hover)').matches) return;
      const letter = event.target.closest?.('.title-letter');
      if (!letter || !el.contains(letter)) return;
      window.clearTimeout(letterTimers.get(letter));
      letter.classList.remove('rippling');
      void letter.offsetWidth;
      letter.classList.add('rippling');
      letterTimers.set(letter,window.setTimeout(()=>letter.classList.remove('rippling'),530));
    });
  }
  document.querySelectorAll('.wine-title,.wip-title,.archive-heading h2,.viewer-info h2').forEach(decorateTitle);

  // The three ambient layers start together and remain synchronized.
  // Web Audio gain nodes crossfade layers instead of restarting them.
  let context;
  const layers = {};
  let previewGain;
  let ambientBus;
  let previewSource;
  const audioFiles = config.ambient || {};
  function setupAudio() {
    if (context) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    context = new AudioContextClass();
    ambientBus = context.createGain();
    ambientBus.gain.value = 0.16;
    ambientBus.connect(context.destination);
    for (const key of scenes) {
      const path = audioFiles[key];
      if (!path) continue;
      const audio = new Audio(path);
      audio.loop = true;
      audio.preload = key === active ? 'auto' : 'metadata';
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = key === active ? 1 : 0;
      source.connect(gain).connect(ambientBus);
      layers[key] = { audio, gain };
      audio.addEventListener('playing',updateSoundControl);
      audio.addEventListener('pause',updateSoundControl);
    }
    context.onstatechange = updateSoundControl;
    previewSource = context.createMediaElementSource(preview);
    previewGain = context.createGain();
    previewGain.gain.value = 0.0001;
    previewSource.connect(previewGain).connect(context.destination);
  }
  function ramp(node, value, duration = 0.9) {
    if (!context || !node) return;
    const now = context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(value, now + duration);
  }
  function mix() {
    if (!context) return;
    if (switching) return;
    // Interpolación por posición: dos pistas se mezclan progresivamente al
    // cruzar el límite entre pantallas, incluso durante un scroll muy lento.
    const viewportCenter = window.innerHeight * 0.5;
    const weights = scenes.map((key) => {
      const rect = $(key).getBoundingClientRect();
      const center = (rect.top + rect.bottom) * 0.5;
      return Math.max(0, 1 - Math.abs(center - viewportCenter) / window.innerHeight);
    });
    const total = weights.reduce((a,b) => a+b, 0) || 1;
    scenes.forEach((key, index) => {
      const node = layers[key]?.gain;
      if (!node) return;
      node.gain.setTargetAtTime(soundOn ? weights[index] / total : 0, context.currentTime, 0.08);
    });
    ramp(ambientBus, soundOn && !previewActive ? 0.16 : 0.001, 0.85);
  }
  function audioActuallyRunning() {
    return !!context && context.state === 'running' &&
      Object.values(layers).some(({audio}) => !audio.paused && audio.readyState >= 2);
  }
  function updateSoundControl() {
    const button = $('soundToggle');
    const needsGesture = soundOn && !audioActuallyRunning();
    button.dataset.needsGesture = String(needsGesture);
    button.setAttribute('aria-pressed',String(soundOn && !needsGesture));
    button.setAttribute('aria-label',needsGesture ? 'Activar sonido' : soundOn ? 'Silenciar música' : 'Activar música');
    button.title = needsGesture ? 'Activar sonido' : soundOn ? 'Silenciar música' : 'Activar música';
    button.innerHTML = svg(soundOn ? 'sound' : 'mute');
  }
  async function setSound(enabled) {
    soundOn = enabled;
    if (enabled) {
      setupAudio();
      // Ambos intentos se disparan dentro del gesto del visitante. Esperar
      // resume() antes de play() puede perder la activación temporal.
      const requests = [];
      if (context) requests.push(context.resume());
      requests.push(...Object.values(layers).map(({audio}) => audio.play()));
      updateSoundControl();
      await Promise.race([
        Promise.allSettled(requests),
        new Promise(resolve=>window.setTimeout(resolve,1200))
      ]);
    } else {
      preview.pause();
      previewActive = false;
      ramp(previewGain, 0.0001, 0.25);
      updatePlayButton();
    }
    mix();
    updateSoundControl();
  }
  $('soundToggle').addEventListener('click', () => setSound(!soundOn || !audioActuallyRunning()));

  function activateScene(target) {
    if (!scenes.includes(target) || active === target) return;
    $(active).classList.remove('active');
    active = target;
    $(active).classList.add('active');
    document.body.dataset.scene = active;
    document.querySelector('meta[name="theme-color"]').content = {wine:'#302127',cream:'#ded4be',blue:'#202b39'}[active];
    const rails = [...document.querySelectorAll('.progress-rail i')];
    $('progressCurrent').style.transform = `translateY(${rails[scenes.indexOf(active)]?.offsetTop || 0}px)`;
    mix();
  }
  let scrollScheduled = false;
  function syncFromScroll() {
    scrollScheduled = false;
    const middle = window.innerHeight * 0.52;
    let closest = active;
    let distance = Infinity;
    for (const key of scenes) {
      const r = $(key).getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - middle);
      if (d < distance) { distance = d; closest = key; }
      if (!motionReduced.matches) {
        const drift = Math.max(-1,Math.min(1,r.top / window.innerHeight));
        $(key).style.setProperty('--section-drift', `${(drift * 38).toFixed(1)}px`);
        $(key).style.setProperty('--section-scale', (1 - Math.abs(drift) * 0.025).toFixed(3));
        $(key).style.setProperty('--section-opacity', (1 - Math.abs(drift) * 0.14).toFixed(3));
      }
    }
    activateScene(closest);
    mix();
  }
  window.addEventListener('scroll', () => {
    if (!scrollScheduled) {scrollScheduled = true; requestAnimationFrame(syncFromScroll);}
  }, {passive:true});
  window.addEventListener('resize',syncFromScroll);
  if ('IntersectionObserver' in window) {
    const appearanceObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle('in-view', entry.intersectionRatio > 0.12);
    }, {threshold:[0,0.12,0.4]});
    scenes.forEach(key => appearanceObserver.observe($(key)));
  } else scenes.forEach(key => $(key).classList.add('in-view'));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && viewing) closeViewer();
  });

  // La rueda avanza por escenas completas. La cortina oculta el salto real de
  // scroll, mientras el audio cruza entre las dos pistas durante un segundo.
  const sceneColors = {wine:'#302127',cream:'#ded4be',blue:'#202b39'};
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let wheelAccum = 0;
  function stepScene(direction) {
    if (viewing || switching) return;
    const from = scenes.indexOf(active);
    const to = Math.max(0,Math.min(scenes.length - 1,from + direction));
    if (to === from) return;
    const target = scenes[to];
    if (motionReduced.matches) {
      window.scrollTo({top:$(target).offsetTop,behavior:'instant'});
      activateScene(target);
      mix();
      return;
    }
    switching = true;
    document.body.style.setProperty('--curtain-color',sceneColors[target]);
    document.body.dataset.curtain = target;
    document.body.dataset.shift = direction > 0 ? 'down' : 'up';
    $('transitionNumber').textContent = String(to + 1).padStart(2,'0');
    document.body.classList.add('is-switching');
    if (context) {
      const now = context.currentTime;
      for (const [i,key] of scenes.entries()) {
        const gain = layers[key]?.gain;
        if (!gain) continue;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value,now);
        gain.gain.linearRampToValueAtTime(soundOn && i === to ? 1 : 0,now + 1.0);
      }
    }
    window.setTimeout(() => {
      window.scrollTo({top:$(target).offsetTop,behavior:'instant'});
      activateScene(target);
      $(target).classList.add('in-view');
    },460);
    window.setTimeout(() => {
      document.body.classList.remove('is-switching');
      switching = false;
      mix();
    },1120);
  }
  window.addEventListener('wheel',(event) => {
    if (viewing || event.ctrlKey || event.metaKey) return;
    if (!introFinished) {event.preventDefault();return;}
    event.preventDefault();
    if (switching) return;
    const normalized = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
    if (Math.sign(normalized) !== Math.sign(wheelAccum)) wheelAccum = 0;
    wheelAccum += normalized;
    if (Math.abs(wheelAccum) < 12) return;
    const direction = wheelAccum > 0 ? 1 : -1;
    wheelAccum = 0;
    stepScene(direction);
  },{passive:false});

  // En teléfonos, un deslizamiento vertical equivale a un paso de rueda.
  // Cancelamos el scroll nativo solo si el gesto es claramente vertical;
  // así no compite con la cortina ni impide los toques sobre las portadas.
  let touchOrigin = null;
  window.addEventListener('touchstart',(event) => {
    touchOrigin = null;
    if (!introFinished || viewing || switching || event.touches.length !== 1) return;
    if (!event.target.closest?.('#stage')) return;
    const touch = event.touches[0];
    touchOrigin = {x:touch.clientX,y:touch.clientY};
  },{passive:true});
  window.addEventListener('touchmove',(event) => {
    if (event.touches.length !== 1) {touchOrigin = null;return;}
    if (!touchOrigin) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchOrigin.x;
    const dy = touch.clientY - touchOrigin.y;
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2 && event.cancelable) {
      event.preventDefault();
    }
  },{passive:false});
  window.addEventListener('touchend',(event) => {
    const origin = touchOrigin;
    touchOrigin = null;
    if (!origin || !introFinished || viewing || switching || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = origin.y - touch.clientY;
    if (Math.abs(dy) >= 55 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      stepScene(dy > 0 ? 1 : -1);
    }
  },{passive:true});
  window.addEventListener('touchcancel',() => {touchOrigin = null;},{passive:true});

  window.addEventListener('keydown',(event) => {
    if (!introFinished || viewing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (document.activeElement?.closest('button,a,input,textarea,select')) return;
    const dir = ['ArrowDown','PageDown',' '].includes(event.key) ? 1 : ['ArrowUp','PageUp'].includes(event.key) ? -1 : 0;
    if (dir) {event.preventDefault();stepScene(dir);}
  });

  // Tipografía editorial: los datos siguen en config.js, pero ya no se
  // representan como categorías ni etiquetas de interfaz.
  document.querySelectorAll('[data-group]').forEach((container) => {
    const group = (config.grupos || []).find(g => g.nombre === container.dataset.group);
    if (!group) return;
    for (const value of group.items) {
      const line = document.createElement('span');
      line.textContent = value;
      container.append(line);
    }
  });
  for (const color of (config.colores || [])) {
    const card = document.createElement('div');
    card.className = 'mini-color';
    card.style.backgroundColor = color.hex;
    card.style.color = color.texto;
    const name = document.createElement('span'); name.textContent = color.nombre;
    const hex = document.createElement('code'); hex.textContent = color.hex.toUpperCase();
    card.append(name,hex);
    $('favoriteColors').append(card);
  }

  function coverMarkup(item) {
    if (item.cover) {
      const img = document.createElement('img');
      img.src = item.cover;
      img.alt = `Portada de ${item.title}`;
      img.loading = 'lazy';
      return img;
    }
    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder-art';
    const label = document.createElement('span');
    label.textContent = 'sin portada';
    placeholder.append(label);
    return placeholder;
  }
  const tracks = config.compositions || [];
  $('archiveCount').textContent = `${String(tracks.length).padStart(2,'0')} ${tracks.length === 1 ? 'obra' : 'obras'}`;
  tracks.forEach((item) => {
    const button = document.createElement('button');
    button.className = 'release';
    button.type = 'button';
    button.setAttribute('aria-label', `Abrir ${item.title}`);
    const art = document.createElement('div'); art.className = 'release-art';
    const disc = document.createElement('div'); disc.className = 'release-disc'; disc.setAttribute('aria-hidden','true');
    const cover = document.createElement('div'); cover.className = 'release-cover'; cover.append(coverMarkup(item));
    art.append(disc,cover);
    const title = document.createElement('div'); title.className = 'release-title'; title.textContent = item.title;
    const hint = document.createElement('div'); hint.className = 'release-hint'; hint.textContent = 'Escuchar · Ver partitura';
    button.append(art,title,hint);
    button.addEventListener('click', (event) => openViewer(item, event.detail === 0));
    $('releaseGrid').append(button);
  });

  function updatePlayButton() {
    const playing = !preview.paused;
    $('playPreview').innerHTML = svg(playing ? 'pause' : 'play');
    $('playPreview').setAttribute('aria-label', playing ? 'Pausar fragmento' : 'Reproducir fragmento');
    $('viewerRecord').classList.toggle('is-playing', playing);
  }
  function updateProgress() {
    const n = Math.min(30, preview.currentTime || 0);
    $('elapsed').textContent = `0:${String(Math.floor(n)).padStart(2,'0')}`;
    $('seekfill').style.width = `${n / 30 * 100}%`;
    $('seekline').setAttribute('aria-valuenow', String(Math.floor(n)));
    if (n >= 30 && !preview.paused) { preview.pause(); fadePreviewOut(); }
    raf = requestAnimationFrame(updateProgress);
  }
  function fadePreviewOut() {previewActive = false;ramp(previewGain,0.0001,0.65);mix();updatePlayButton();}
  function configureLink(anchor, url) {
    anchor.classList.toggle('disabled', !url);
    if (url) anchor.href = url;
    else anchor.removeAttribute('href');
    anchor.setAttribute('aria-disabled', String(!url));
    anchor.tabIndex = url ? 0 : -1;
  }
  function openViewer(item, fromKeyboard = false) {
    lastFocus = document.activeElement;
    viewerOpenedFromKeyboard = fromKeyboard;
    viewing = true;
    currentTrack = item;
    $('viewerTitle').textContent = item.title;
    decorateTitle($('viewerTitle'));
    $('viewerCover').replaceChildren(coverMarkup(item));
    $('scoreImage').src = item.scorePreview || './assets/partitura-vista.png';
    configureLink($('downloadScore'), item.score);
    configureLink($('musicLink'), item.youtubeMusic);
    $('viewerNote').textContent = item.preview ? '' : 'Fragmento no disponible.';
    $('playPreview').disabled = !item.preview;
    $('playPreview').style.opacity = item.preview ? '1' : '.35';
    if (item.preview) preview.src = item.preview;
    else preview.removeAttribute('src');
    preview.load();
    $('viewerShell').classList.add('open');
    document.body.classList.add('viewer-open');
    $('viewerShell').setAttribute('aria-hidden','false');
    document.getElementById('stage').inert = true;
    document.querySelector('.topbar').inert = true;
    $('viewerClose').focus();
    mix();
    cancelAnimationFrame(raf);
    updateProgress();
    updatePlayButton();
    // A click opening the artwork is also the user gesture that permits audio.
    if (item.preview) playExcerpt();
  }
  async function playExcerpt() {
    if (!currentTrack?.preview) return;
    setupAudio();
    if (context) await context.resume();
    if (!soundOn) await setSound(true);
    previewActive = true;
    mix();
    ramp(previewGain,0.9,0.9);
    try { await preview.play(); $('viewerNote').textContent = ''; }
    catch { previewActive = false; mix(); $('viewerNote').textContent = 'Tocá reproducir para escuchar el fragmento.'; }
    updatePlayButton();
  }
  function closeViewer() {
    if (!viewing) return;
    viewing = false;
    previewActive = false;
    preview.pause();
    preview.currentTime = 0;
    ramp(previewGain,0.0001,0.45);
    $('viewerShell').classList.remove('open');
    document.body.classList.remove('viewer-open');
    $('viewerShell').setAttribute('aria-hidden','true');
    document.getElementById('stage').inert = false;
    document.querySelector('.topbar').inert = false;
    cancelAnimationFrame(raf);
    updatePlayButton();
    mix();
    if (lastFocus) {
      // Conservamos el foco accesible, pero sin dejar el marco blanco después
      // de abrir/cerrar con el ratón. El teclado sí conserva su indicador.
      if (!viewerOpenedFromKeyboard) {
        const restored = lastFocus;
        restored.classList.add('pointer-restored');
        restored.addEventListener('blur', () => restored.classList.remove('pointer-restored'), {once:true});
      }
      lastFocus.focus({preventScroll:true});
    }
  }
  $('viewerClose').addEventListener('click',closeViewer);
  $('viewerBackdrop').addEventListener('click',closeViewer);
  $('playPreview').addEventListener('click',() => {
    if (preview.paused) { if (preview.currentTime >= 30) preview.currentTime = 0; playExcerpt(); }
    else {preview.pause();fadePreviewOut();}
  });
  preview.addEventListener('ended',fadePreviewOut);
  preview.addEventListener('pause',updatePlayButton);
  preview.addEventListener('play',updatePlayButton);
  // Trap focus inside the modal for keyboard users.
  $('viewerShell').addEventListener('keydown',(event) => {
    if (event.key !== 'Tab') return;
    const items = [...$('viewerShell').querySelectorAll('button:not(:disabled),a:not([aria-disabled="true"])')];
    if (!items.length) return;
    const first = items[0], last = items[items.length-1];
    if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
    if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
  });
  // La entrada es un gesto explícito: permite iniciar Web Audio y los tres
  // archivos ambientales en el mismo evento que abre la card.
  const intro = $('introOverlay');
  document.querySelector('.topbar').inert = true;
  $('stage').inert = true;
  function finishIntro() {
    if (introFinished) return;
    introFinished = true;
    intro.classList.add('leaving');
    intro.setAttribute('aria-hidden','true');
    intro.blur();
    document.querySelector('.topbar').inert = false;
    $('stage').inert = false;
    window.setTimeout(()=>{intro.hidden = true;},1250);
    // La entrada conserva el escalonado de las tarjetas; luego el hover
    // deja de heredar el retardo individual de cada animación inicial.
    window.setTimeout(()=>{
      document.querySelectorAll('.collage-paper').forEach(el=>el.classList.add('reveal-settled'));
    },1400);
  }
  function waitForFirstAmbient() {
    const audio = layers.wine?.audio;
    if (!audio || audio.readyState >= 3) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      const done = () => {if(settled)return;settled=true;resolve();};
      audio.addEventListener('canplay',done,{once:true});
      audio.addEventListener('error',done,{once:true});
      audio.load();
      window.setTimeout(done,12000);
    });
  }
  function startIntro() {
    setupAudio();
    // La carga visual dura dos segundos exactos, independientemente de la red.
    // El audio sigue preparándose y se activa únicamente con el clic de entrada.
    window.setTimeout(()=>{
      intro.classList.add('armed');
      intro.setAttribute('aria-busy','false');
      intro.setAttribute('aria-disabled','false');
      intro.setAttribute('aria-label','Entrar a Sxha25 y activar la música');
    },2000);
    return waitForFirstAmbient().then(()=>{
      intro.classList.add('ready');
    });
  }
  const introPreparation = startIntro();
  async function enterFromGesture() {
    if (!intro.classList.contains('armed') || introEntering || introFinished) return;
    introEntering = true;
    intro.classList.add('entering');
    intro.setAttribute('aria-busy','true');
    // setSound llama a resume() y play() antes de su primer await, mientras
    // sigue vigente el gesto del click. El preload ya está en marcha.
    const audioStart = setSound(true);
    await Promise.all([introPreparation,audioStart]);
    mix();
    finishIntro();
  }
  intro.addEventListener('click',()=>{
    void enterFromGesture();
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target.closest?.('#soundToggle')) return;
    if (introFinished && soundOn && (context?.state !== 'running' || Object.values(layers).some(({audio})=>audio.paused))) void setSound(true);
  }, {capture:true});
  document.addEventListener('keydown', (event) => {
    if (event.target.closest?.('#soundToggle')) return;
    if (introFinished && soundOn && (context?.state !== 'running' || Object.values(layers).some(({audio})=>audio.paused))) void setSound(true);
  }, {capture:true});
  window.addEventListener('load', syncFromScroll);
  syncFromScroll();
})();
