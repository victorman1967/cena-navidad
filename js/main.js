(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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
  }

  function initCountdown() {
    const target = new Date('2026-12-05T23:00:00').getTime();
    const fields = {
      days: $('#cdDays'), hours: $('#cdHours'), minutes: $('#cdMinutes'), seconds: $('#cdSeconds')
    };
    const boxes = $$('#countdown .time-box');
    const label = $('#countdownLabel');
    let previous = null;

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
      previous = next;
    }
    paint();
    setInterval(paint, 1000);
  }

  function initGallery() {
    const PHOTOS_KEY = 'cena-fotos-v1';
    const input = $('#photoInput');
    const dropzone = $('#dropzone');
    const gallery = $('#gallery');
    const empty = $('#galleryEmpty');
    let photos = readStore(PHOTOS_KEY, []);

    function render() {
      gallery.innerHTML = '';
      empty.hidden = photos.length > 0;
      photos.forEach((photo) => {
        const card = document.createElement('figure');
        card.className = 'photo-card';
        card.innerHTML = `<img src="${photo.src}" alt="${photo.name}"><button type="button" title="Eliminar foto">✕</button><figcaption>${photo.name} · ${photo.date}</figcaption>`;
        $('img', card).addEventListener('click', () => {
          $('#lightboxImg').src = photo.src;
          $('#lightbox').hidden = false;
        });
        $('button', card).addEventListener('click', () => {
          photos = photos.filter((item) => item.id !== photo.id);
          if (writeStore(PHOTOS_KEY, photos)) render();
        });
        gallery.appendChild(card);
      });
    }

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
      if (photos.length + images.length > 30) {
        showToast('Máximo 30 fotos en este navegador.');
        return;
      }
      showToast('Añadiendo fotos… 📸');
      for (const file of images) {
        try {
          const src = await compress(file);
          photos.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            src,
            name: file.name.slice(0, 34),
            date: new Date().toLocaleDateString('es-ES')
          });
        } catch (error) {
          showToast('Una imagen no se pudo añadir.');
        }
      }
      writeStore(PHOTOS_KEY, photos);
      render();
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
    render();
  }

  function initWall() {
    const WISHES_KEY = 'cena-deseos-v1';
    const form = $('#wishForm');
    const wall = $('#wall');
    const empty = $('#wallEmpty');
    const colors = ['#ffe6a7', '#ffd9de', '#d8f4e2', '#dcecff', '#f2e1ff', '#ffecd2'];
    let wishes = readStore(WISHES_KEY, []);

    function render() {
      wall.innerHTML = '';
      empty.hidden = wishes.length > 0;
      wishes.slice().reverse().forEach((wish) => {
        const note = document.createElement('article');
        note.className = 'wish';
        note.style.background = colors[Math.floor(Math.random() * colors.length)];
        note.style.setProperty('--rot', `${-2 + Math.random() * 4}deg`);
        note.innerHTML = `<div class="wish-head"><strong>${wish.name}</strong><time>${wish.date}</time></div><p>${wish.text}</p><button type="button" title="Borrar mensaje">Borrar</button>`;
        $('button', note).addEventListener('click', () => {
          wishes = wishes.filter((item) => item.id !== wish.id);
          writeStore(WISHES_KEY, wishes);
          render();
        });
        wall.appendChild(note);
      });
    }

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
      wishes.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: escapeHtml(name),
        text: escapeHtml(text),
        date: new Date().toLocaleDateString('es-ES')
      });
      if (writeStore(WISHES_KEY, wishes)) {
        form.reset();
        render();
        showToast('¡Tu deseo ya está en el muro! ✨');
      }
    });
    render();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
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
    let state = readStore(RACE_KEY, { runners: [] });
    if (!Array.isArray(state.runners)) state = { runners: [] };
    let myId = readStore(ME_KEY, null);
    const grid = $('#qrGrid');
    const panel = $('#runnerPanel');
    const form = $('#registerForm');
    const ranking = $('#ranking');
    const resetBtn = $('#resetRun');

    const currentRunner = () => state.runners.find((runner) => runner.id === myId) || null;

    function save() {
      writeStore(RACE_KEY, state);
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
        card.className = `qr-card${runner && runner.codes.includes(item.id) ? ' done' : ''}`;
        card.dataset.num = String(index + 1).padStart(2, '0');
        card.dataset.code = item.code;
        card.innerHTML = `<div class="qr-canvas"></div><h4>${item.name}</h4><p>${item.clue}</p>`;
        const holder = $('.qr-canvas', card);
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

    function renderRanking() {
      const completed = state.runners.filter((runner) => runner.end)
        .sort((a, b) => a.end - b.end);
      if (!currentRunner() || !currentRunner().end) {
        ranking.hidden = true;
        return;
      }
      ranking.hidden = false;
      const podium = $('#podium');
      podium.innerHTML = '';
      [0, 1, 2].forEach((index) => {
        const runner = completed[index];
        const step = document.createElement('div');
        step.className = 'podium-step';
        step.innerHTML = `<span class="medal">${['🥇', '🥈', '🥉'][index]}</span><span class="pname">${runner ? escapeHtml(runner.name) : 'Por decidir'}</span><span class="ptime">${runner ? formatTime(runner.end - runner.start) : '--:--'}</span><small>${prizes[index]}</small>`;
        podium.appendChild(step);
      });
      const list = $('#rankingList');
      list.innerHTML = '';
      completed.forEach((runner) => {
        const item = document.createElement('li');
        item.innerHTML = `<strong>${escapeHtml(runner.name)}</strong> · ${formatTime(runner.end - runner.start)}`;
        list.appendChild(item);
      });
    }

    function render() {
      const runner = currentRunner();
      form.hidden = Boolean(runner);
      panel.hidden = !runner;
      resetBtn.hidden = !runner;
      buildCards();
      if (runner) {
        $('#runnerNameDisplay').textContent = runner.name;
        $('#progressText').textContent = `${runner.codes.length} de ${codes.length} códigos`;
        $('#progressFill').style.width = `${(runner.codes.length / codes.length) * 100}%`;
        $('#prizeNote').textContent = runner.end
          ? `¡Completado en ${formatTime(runner.end - runner.start)}! Eres ${state.runners.filter((r) => r.end && r.end <= runner.end).length}º. Los tres primeros tienen premio.`
          : 'Completa los 8 códigos para entrar en el ranking y optar a los premios.';
      }
      renderRanking();
    }

    function markCode(rawCode) {
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
      if (runner.codes.length === codes.length) runner.end = Date.now();
      save();
      render();
      showToast(runner.end ? '¡Los 8 QR completados! Mira el ranking 🏆' : `¡Código ${item.id} conseguido! Van ${runner.codes.length}/8`);
      return true;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('#runnerName').value.trim();
      if (!name) return;
      const runner = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: escapeHtml(name).slice(0, 24),
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
      state.runners = state.runners.filter((runner) => runner.id !== myId);
      myId = null;
      save();
      try { localStorage.removeItem(ME_KEY); } catch (error) {}
      render();
      showToast('Participación reiniciada.');
    });

    function handleIncomingCode() {
      const incoming = codeFromLocation();
      if (!incoming) return;
      if (currentRunner()) markCode(incoming);
      else showToast('Has escaneado un QR: inscríbete para registrar tu código.');
      clearCodeFromLocation();
    }

    window.addEventListener('hashchange', handleIncomingCode);
    handleIncomingCode();
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSnow();
    initHeader();
    initCountdown();
    initGallery();
    initWall();
    initGincana();
  });
})();
