/* BONET — interacciones de scroll cinematográfico */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Ventanas del Flatiron (generadas) ---------- */
  (function buildWindows() {
    var g = document.getElementById('windows');
    if (!g) return;
    var ns = 'http://www.w3.org/2000/svg';
    var cols = [138, 162, 186, 210];           // cara clara
    var prowCols = [262, 286];                  // cara en sombra (proa)
    var frag = document.createDocumentFragment();
    for (var row = 0; row < 11; row++) {
      var y = 180 + row * 42;
      cols.forEach(function (x) {
        frag.appendChild(win(x, y, false));
      });
      prowCols.forEach(function (x) {
        if (x < 250 + (row * 4)) frag.appendChild(win(x, y, true));
      });
    }
    g.appendChild(frag);

    function win(x, y, dark) {
      var r = document.createElementNS(ns, 'rect');
      r.setAttribute('class', 'window');
      r.setAttribute('x', x); r.setAttribute('y', y);
      r.setAttribute('width', 14); r.setAttribute('height', 24);
      r.setAttribute('rx', 1);
      r.dataset.lit = '0';
      return r;
    }

    // Encendido progresivo, cálido, aleatorio — como un edificio al anochecer
    if (!reduce) {
      var wins = g.querySelectorAll('.window');
      var order = Array.prototype.slice.call(wins).sort(function () { return Math.random() - 0.5; });
      order.forEach(function (w, i) {
        if (Math.random() > 0.55) {
          setTimeout(function () { w.classList.add('lit'); }, 700 + i * 55);
        }
      });
    }
  })();

  /* ---------- Hero ready ---------- */
  var hero = document.getElementById('top');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { if (hero) hero.classList.add('ready'); });
  });

  /* ---------- Nav + barra de progreso ---------- */
  var nav = document.getElementById('nav');
  var progress = document.getElementById('progress');
  var building = document.getElementById('building');
  var ticking = false;

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    if (nav) nav.classList.toggle('scrolled', y > 60);
    if (building && !reduce && y < window.innerHeight * 1.3) {
      building.style.transform = 'translateY(' + (y * 0.22) + 'px) scale(' + (1 + y * 0.00007) + ')';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        if (e.target.classList.contains('stats')) animateCounts();
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

  document.querySelectorAll('.r').forEach(function (el) { io.observe(el); });

  var statsSection = document.querySelector('.stats');
  if (statsSection) io.observe(statsSection);

  /* ---------- Contadores ---------- */
  var counted = false;
  function animateCounts() {
    if (counted) return; counted = true;
    document.querySelectorAll('.num[data-count]').forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      var plain = el.getAttribute('data-plain') === '1';
      var span = el.querySelector('span:first-child');
      if (reduce) { setVal(target); return; }
      var dur = 1500, start = null;
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);

      function setVal(v) {
        var txt = plain ? String(v) : v.toLocaleString('es-ES');
        if (span) span.textContent = txt; else el.firstChild.textContent = txt;
      }
    });
  }

  /* ---------- Smooth anchor (respeta reduce) ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (ev) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var t = document.querySelector(id);
      if (t) { ev.preventDefault(); t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
    });
  });
})();
