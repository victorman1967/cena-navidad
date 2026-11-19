(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const store = window.CenaStore;
  const collections = [];
  const GINCANA_START = new Date('2026-12-05T23:30:00+01:00').getTime();

  const toastEl = $('#toast');
  let toastTimer;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function readStore(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      showToast('No se pudo guardar: memoria del navegador llena.');
      return false;
    }
  }

  function createCollection(name, path, options) {
    const settings = options || {};
    const storageKey = `cena-${name}-v1`;
    let items = readStore(storageKey, []);
    if (!Array.isArray(items)) items = [];
    const listeners = [];

    function persist() {
      const snapshot = items.map((item) => {
        if (store.enabled && item.synced && settings.memoryOnly) {
          const copy = Object.assign({}, item);
          settings.memoryOnly.forEach((field) => { delete copy[field]; });
          return copy;
        }
        return item;
      });
      writeStore(storageKey, snapshot);
    }

    function all() { return items.slice(); }
    function subscribe(fn) { listeners.push(fn); fn(items); }
    function notify() { listeners.forEach((fn) => fn(items)); }

    function add(item) {
      item.synced = false;
      items.push(item);
      persist();
      notify();
      flush();
    }

    function remove(id) {
      const before = items.length;
      items = items.filter((item) => item.id !== id);
      if (items.length === before) return;
      persist();
      notify();
      if (store.enabled) store.remove(`${path}/${id}`).catch(() => {});
    }

    async function flush() {
      if (!store.enabled) {
        let changed = false;
        items.forEach((item) => {
          if (!item.synced) { item.synced = true; changed = true; }
        });
        if (changed) { persist(); notify(); }
        return;
      }
      for (const item of items.slice()) {
        if (item.synced) continue;
        try {
          await store.put(`${path}/${item.id}`, store.payload(item));
          item.synced = true;
          persist();
          notify();
        } catch (error) {
          return;
        }
      }
    }

    async function poll() {
      if (!store.enabled) return;
      let remote;
      try {
        remote = await store.keys(path);
      } catch (error) {
        return;
      }
      const remoteIds = remote && typeof remote === 'object' ? Object.keys(remote) : [];
      let changed = false;

      for (const id of remoteIds) {
        const index = items.findIndex((item) => item.id === id);
        const local = index >= 0 ? items[index] : null;
        const complete = !settings.memoryOnly || settings.memoryOnly.every((field) => local && local[field] != null);
        if (local && local.synced && complete) continue;
        try {
          const item = await store.get(`${path}/${id}`);
          if (!item || !item.id) continue;
          item.synced = true;
          if (local) items[index] = item; else items.push(item);
          changed = true;
        } catch (error) {}
      }

      const stale = items.filter((item) => item.synced && remoteIds.indexOf(item.id) === -1);
      if (stale.length) {
        items = items.filter((item) => stale.indexOf(item) === -1);
        changed = true;
      }
      if (changed) { persist(); notify(); }
    }

    const api = { all, subscribe, add, remove, flush, poll };
    collections.push(api);
    return api;
  }

  function initSnow() {
    const container = $('#snow');
    const flakes = ['❄', '✦', '❅', '·'];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    for (let i = 0; i < 45; i += 1) {
      const flake = document.createElement('span');
      flake.className = 'flake';
      flake.textContent = flakes[Math.floor(Math.random() * flakes.length)];
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.setProperty('--size', `${8 + Math.random() * 14}px`);
      flake.style.setProperty('--drift', `${-60 + Math.random() * 120}px`);
      flake.style.animationDuration = `${9 + Math.random() * 13}s`;
      flake.style.animationDelay = `${-Math.random() * 20}s`;
      container.appendChild(flake);
    }
  }

  function initHeader() {
    const header = $('#siteHeader');
    const toggle = $('#menuToggle');
    const nav = $('#siteNav');
    const update = () => header.classList.toggle('scrolled', window.scrollY > 30);
    update();
    window.addEventListener('scroll', update, { passive: true });
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('a', nav).forEach((link) => link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));

    const badge = $('#syncBadge');
    if (badge) {
      badge.hidden = false;
      badge.textContent = store.enabled ? '☁️ Datos compartidos' : '📱 Solo este navegador';
      badge.title = store.enabled
        ? 'Fotos, mensajes y ranking se comparten entre todos los invitados'
        : 'Configura js/config.js para compartir los datos entre todos los invitados';
    }
    if (store.enabled) {
      ['#liveFotos', '#liveMuro', '#liveRanking'].forEach((selector) => {
        const live = $(selector);
        if (!live) return;
        live.hidden = false;
        live.textContent = 'EN DIRECTO';
      });
    }
  }

  function initCountdown() {
    const target = new Date('2026-12-05T23:00:00+01:00').getTime();
    const fields = {
      days: $('#cdDays'), hours: $('#cdHours'), minutes: $('#cdMinutes'), seconds: $('#cdSeconds')
    };
    const boxes = $$('#countdown .time-box');
    const label = $('#countdownLabel');

    function paint() {
      const remaining = Math.max(0, target - Date.now());
      const totalSeconds = Math.floor(remaining / 1000);
      const next = {
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60
      };
      Object.keys(fields).forEach((key) => {
        const value = next[key];
        const text = key === 'days' ? String(value) : String(value).padStart(2, '0');
        if (fields[key].textContent !== text) {
          fields[key].textContent = text;
          const box = boxes[Object.keys(fields).indexOf(key)];
          box.classList.remove('tick');
          void box.offsetWidth;
          box.classList.add('tick');
        }
      });
      if (remaining === 0) {
        label.textContent = '¡Ya estamos celebrando esta noche tan especial! 🎉';
      } else if (next.days === 0) {
        label.textContent = '¡Hoy es el gran día! Nos vemos a las 23:00 h 🥂';
      }
    }
    paint();
    setInterval(paint, 1000);
  }

  function initGallery() {
    const input = $('#photoInput');
    const dropzone = $('#dropzone');
    const gallery = $('#gallery');
    const empty = $('#galleryEmpty');
    const photos = createCollection('fotos', 'photos', { memoryOnly: ['src'] });

    function render(items) {
      gallery.innerHTML = '';
      empty.hidden = items.length > 0;
      items.forEach((photo) => {
        const card = document.createElement('figure');
        card.className = 'photo-card';
        const img = document.createElement('img');
        if (photo.src) img.src = photo.src;
        img.alt = photo.name || 'Foto de la cena';
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Eliminar foto';
        button.textContent = '✕';
        const caption = document.createElement('figcaption');
        caption.textContent = `${photo.name || 'Foto'} · ${photo.date || ''}`;
        img.addEventListener('click', () => {
          if (!photo.src) return;
          $('#lightboxImg').src = photo.src;
          $('#lightbox').hidden = false;
        });
        button.addEventListener('click', () => photos.remove(photo.id));
        card.append(img, button, caption);
        gallery.appendChild(card);
      });
    }
    photos.subscribe(render);

    function compress(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.onload = () => {
          const image = new Image();
          image.onerror = () => reject(new Error('Formato no válido'));
          image.onload = () => {
            const max = 1100;
            const scale = Math.min(1, max / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }

    async function addFiles(files) {
      const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
      if (!images.length) return;
      const current = photos.all();
      if (current.length + images.length > 30) {
        showToast('Máximo 30 fotos en la galería.');
        return;
      }
      showToast('Añadiendo fotos… 📸');
      for (const file of images) {
        try {
          const src = await compress(file);
          photos.add({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            src,
            name: file.name.slice(0, 34),
            date: new Date().toLocaleDateString('es-ES')
          });
        } catch (error) {
          showToast('Una imagen no se pudo añadir.');
        }
      }
      showToast('¡Fotos añadidas! Ya están en la galería.');
    }

    input.addEventListener('change', (event) => {
      addFiles(event.target.files);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((event) => dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((event) => dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }));
    dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

    const lightbox = $('#lightbox');
    const closeLightbox = () => {
      lightbox.hidden = true;
      $('#lightboxImg').removeAttribute('src');
    };
    $('#lightboxClose').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  function initWall() {
    const form = $('#wishForm');
    const wall = $('#wall');
    const empty = $('#wallEmpty');
    const colors = ['#ffe6a7', '#ffd9de', '#d8f4e2', '#dcecff', '#f2e1ff', '#ffecd2'];
    const wishes = createCollection('deseos', 'wishes');

    function render(items) {
      wall.innerHTML = '';
      empty.hidden = items.length > 0;
      items.slice().reverse().forEach((wish) => {
        const note = document.createElement('article');
        note.className = 'wish';
        note.style.background = colors[Math.floor(Math.random() * colors.length)];
        note.style.setProperty('--rot', `${-2 + Math.random() * 4}deg`);
        const head = document.createElement('div');
        head.className = 'wish-head';
        const name = document.createElement('strong');
        name.textContent = wish.name || 'Invitado';
        const date = document.createElement('time');
        date.textContent = wish.date || '';
        head.append(name, date);
        const text = document.createElement('p');
        text.textContent = wish.text || '';
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Borrar mensaje';
        button.textContent = 'Borrar';
        button.addEventListener('click', () => wishes.remove(wish.id));
        note.append(head, text, button);
        wall.appendChild(note);
      });
    }
    wishes.subscribe(render);

    $$('#emojiPicks button').forEach((button) => button.addEventListener('click', () => {
      const textarea = $('#wishText');
      textarea.value += `${button.textContent} `;
      textarea.focus();
    }));

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('#wishName').value.trim();
      const text = $('#wishText').value.trim();
      if (!name || !text) return;
      wishes.add({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.slice(0, 30),
        text: text.slice(0, 240),
        date: new Date().toLocaleDateString('es-ES')
      });
      form.reset();
      showToast('¡Tu deseo ya está en el muro! ✨');
    });
  }

  function initGincana() {
    const RACE_KEY = 'cena-gincana-v1';
    const ME_KEY = 'cena-gincana-me-v1';
    const codes = [
      { id: 'QR-01', code: 'NAVIDAD-2026-01', name: 'La recepción', clue: 'Junto al mostrador principal' },
      { id: 'QR-02', code: 'NAVIDAD-2026-02', name: 'El vestíbulo', clue: 'En la entrada del hotel' },
      { id: 'QR-03', code: 'NAVIDAD-2026-03', name: 'El bar', clue: 'Cerca de la barra' },
      { id: 'QR-04', code: 'NAVIDAD-2026-04', name: 'El restaurante', clue: 'En la mesa del bufé' },
      { id: 'QR-05', code: 'NAVIDAD-2026-05', name: 'El salón', clue: 'Junto al árbol de Navidad' },
      { id: 'QR-06', code: 'NAVIDAD-2026-06', name: 'La piscina', clue: 'En la zona de tumbonas' },
      { id: 'QR-07', code: 'NAVIDAD-2026-07', name: 'El gimnasio', clue: 'Junto a las máquinas' },
      { id: 'QR-08', code: 'JEFE-2026-08', name: 'Busca a tu jefe', clue: 'Pregunta por el mando de la organización' }
    ];
    const prizes = ['Cesta navideña de productos extremeños', 'Botella especial y copas grabadas', 'Tarjeta regalo sorpresa'];
    const finishers = createCollection('finalistas', 'finishers');
    let state = readStore(RACE_KEY, { runners: [] });
    if (!Array.isArray(state.runners)) state = { runners: [] };
    let myId = readStore(ME_KEY, null);
    const grid = $('#qrGrid');
    const panel = $('#runnerPanel');
    const form = $('#registerForm');
    const ranking = $('#ranking');
    const resetBtn = $('#resetRun');
    const lockedPanel = $('#gincanaLocked');
    const lockedText = $('#gincanaLockedText');

    const currentRunner = () => state.runners.find((runner) => runner.id === myId) || null;
    const isLocked = () => Date.now() < GINCANA_START;

    function updateGate() {
      const locked = isLocked();
      lockedPanel.hidden = !locked;
      if (locked) {
        const remaining = GINCANA_START - Date.now();
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        lockedText.textContent = `Faltan ${hours} h ${minutes} min ${seconds} s para empezar. ¡Prepara el móvil!`;
      }
      $('#runnerName').disabled = locked;
      $('button', form).disabled = locked;
      $('#manualInput').disabled = locked;
      $('#manualBtn').disabled = locked;
      resetBtn.disabled = locked;
    }

    function save() {
      writeStore(RACE_KEY, state);
      const runner = currentRunner();
      if (runner && store.enabled) store.put(`runners/${runner.id}`, store.payload(runner)).catch(() => {});
    }

    function codeFromLocation() {
      const hash = location.hash.replace(/^#/, '');
      for (const part of hash.split('&')) {
        const [key, value] = part.split('=');
        if (key === 'qr' && value) return decodeURIComponent(value).toUpperCase();
      }
      const query = new URLSearchParams(location.search).get('qr');
      return query ? query.toUpperCase() : null;
    }

    function clearCodeFromLocation() {
      if (!codeFromLocation()) return;
      const clean = `${location.pathname}${location.search}#gincana`;
      try { history.replaceState(null, '', clean); } catch (error) {}
    }

    function qrUrl(code) {
      const url = new URL(location.href);
      url.hash = `gincana&qr=${encodeURIComponent(code)}`;
      return url.toString();
    }

    function formatTime(ms) {
      const total = Math.max(0, Math.floor(ms / 1000));
      return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    function buildCards() {
      grid.innerHTML = '';
      const runner = currentRunner();
      codes.forEach((item, index) => {
        const card = document.createElement('article');
        const done = runner && runner.codes.includes(item.id);
        card.className = `qr-card${done ? ' done' : ''}`;
        card.dataset.num = String(index + 1).padStart(2, '0');
        card.dataset.code = item.code;
        const holder = document.createElement('div');
        holder.className = 'qr-canvas';
        card.appendChild(holder);
        const title = document.createElement('h4');
        title.textContent = item.name;
        const clue = document.createElement('p');
        clue.textContent = item.clue;
        card.append(title, clue);
        if (typeof QRCode === 'function') {
          new QRCode(holder, {
            text: qrUrl(item.code),
            width: 112,
            height: 112,
            colorDark: '#24352c',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.M : undefined
          });
        } else {
          holder.textContent = item.code;
        }
        card.addEventListener('click', () => {
          if (!runner) showToast('¡Inscríbete primero para participar!');
          else if (runner.codes.includes(item.id)) showToast(`✓ ${item.name} ya está completado`);
          else showToast(`Escanea el QR de "${item.name}" con el móvil`);
        });
        grid.appendChild(card);
      });
    }

    function renderRanking(items) {
      const completed = items.slice().sort((a, b) => a.end - b.end);
      ranking.hidden = false;

      const podium = $('#podium');
      podium.innerHTML = '';
      [0, 1, 2].forEach((index) => {
        const runner = completed[index];
        const step = document.createElement('div');
        step.className = 'podium-step';
        const medal = document.createElement('span');
        medal.className = 'medal';
        medal.textContent = ['🥇', '🥈', '🥉'][index];
        const name = document.createElement('span');
        name.className = 'pname';
        name.textContent = runner ? runner.name : 'Por decidir';
        const time = document.createElement('span');
        time.className = 'ptime';
        time.textContent = runner ? formatTime(runner.end - runner.start) : '--:--';
        const prize = document.createElement('small');
        prize.textContent = prizes[index];
        step.append(medal, name, time, prize);
        podium.appendChild(step);
      });

      const list = $('#rankingList');
      list.innerHTML = '';
      if (!completed.length) {
        const empty = document.createElement('li');
        empty.className = 'ranking-empty';
        empty.textContent = 'Todavía no hay finalistas. ¡El primer nombre aparecerá aquí!';
        list.appendChild(empty);
      }
      completed.slice(0, 10).forEach((runner, index) => {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = `${index + 1}. ${runner.name}`;
        item.append(name, document.createTextNode(` · ${formatTime(runner.end - runner.start)}`));
        list.appendChild(item);
      });
    }
    finishers.subscribe(renderRanking);

    function render() {
      const runner = currentRunner();
      const locked = isLocked();
      form.hidden = Boolean(runner) || locked;
      $('.manual-code').hidden = locked;
      panel.hidden = !runner;
      resetBtn.hidden = !runner || locked;
      updateGate();
      buildCards();
      if (runner) {
        $('#runnerNameDisplay').textContent = runner.name;
        $('#progressText').textContent = `${runner.codes.length} de ${codes.length} códigos`;
        $('#progressFill').style.width = `${(runner.codes.length / codes.length) * 100}%`;
        const position = finishers.all().filter((item) => item.end <= runner.end).length;
        $('#prizeNote').textContent = runner.end
          ? `¡Completado en ${formatTime(runner.end - runner.start)}! Eres ${position}º. Quedan guardados los 10 primeros.`
          : 'Completa los 8 códigos para entrar en el ranking y optar a los premios.';
      }
    }

    function markCode(rawCode) {
      if (isLocked()) {
        showToast('La gincana empieza a las 23:30 h del 5 de diciembre 🔒');
        return false;
      }
      const code = String(rawCode || '').trim().toUpperCase();
      const item = codes.find((entry) => entry.code === code || entry.id === code);
      if (!item) {
        showToast('Ese código no es de esta gincana.');
        return false;
      }
      const runner = currentRunner();
      if (!runner) {
        showToast('¡Inscríbete primero con tu nombre!');
        return false;
      }
      if (runner.end) {
        showToast('¡Ya completaste la gincana! 🎉');
        return false;
      }
      if (runner.codes.includes(item.id)) {
        showToast(`${item.name} ya estaba conseguido ✓`);
        return false;
      }
      runner.codes.push(item.id);
      if (runner.codes.length === codes.length) {
        runner.end = Date.now();
        finishers.add({
          id: runner.id,
          name: runner.name,
          start: runner.start,
          end: runner.end
        });
      }
      save();
      render();
      showToast(runner.end ? '¡Los 8 QR completados! Mira el ranking 🏆' : `¡Código ${item.id} conseguido! Van ${runner.codes.length}/8`);
      return true;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (isLocked()) {
        showToast('La gincana empieza a las 23:30 h del 5 de diciembre 🔒');
        return;
      }
      const name = $('#runnerName').value.trim();
      if (!name) return;
      const runner = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: name.slice(0, 24),
        start: Date.now(),
        end: null,
        codes: []
      };
      state.runners.push(runner);
      myId = runner.id;
      save();
      writeStore(ME_KEY, myId);
      render();
      showToast('¡Inscrito! A buscar los 8 QR por el hotel 🎄');
      const pending = codeFromLocation();
      if (pending) {
        markCode(pending);
        clearCodeFromLocation();
      }
    });

    $('#manualBtn').addEventListener('click', () => {
      const input = $('#manualInput');
      if (markCode(input.value)) input.value = '';
    });
    $('#manualInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('#manualBtn').click();
    });
    resetBtn.addEventListener('click', () => {
      if (!window.confirm('¿Quieres borrar tu participación y empezar de nuevo?')) return;
      const previous = currentRunner();
      state.runners = state.runners.filter((runner) => runner.id !== myId);
      myId = null;
      save();
      writeStore(ME_KEY, null);
      if (previous && store.enabled) store.remove(`runners/${previous.id}`).catch(() => {});
      render();
      showToast('Participación reiniciada.');
    });

    function handleIncomingCode() {
      const incoming = codeFromLocation();
      if (!incoming) return;
      if (isLocked()) showToast('Escaneaste un QR, pero la gincana empieza a las 23:30 h 🔒');
      else if (currentRunner()) markCode(incoming);
      else showToast('Has escaneado un QR: inscríbete para registrar tu código.');
      clearCodeFromLocation();
    }

    window.addEventListener('hashchange', handleIncomingCode);
    handleIncomingCode();
    render();
    setInterval(updateGate, 1000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSnow();
    initHeader();
    initCountdown();
    initGallery();
    initWall();
    initGincana();
    if (store.enabled) {
      collections.forEach((collection) => collection.poll());
      setInterval(() => collections.forEach((collection) => collection.poll()), 4000);
    }
  });
})();
