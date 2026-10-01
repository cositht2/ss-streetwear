/* ==========================================================
   vida.js — animaciones extra de la tienda (todo comentado)
   Se ejecuta solo, no depende de app.js.
   ========================================================== */
(() => {                                                       // función que se ejecuta sola para no ensuciar el código global
  'use strict';                                                // modo estricto: avisa de errores comunes
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches; // ¿el usuario pidió menos movimiento?

  /* ---- 1. Barra de progreso al bajar ---- */
  const barra = document.createElement('div');                 // crea el elemento de la barra
  barra.id = 'vidaProgreso';                                   // le pone el id que usa el CSS
  document.body.appendChild(barra);                            // lo agrega a la página
  const pintarBarra = () => {                                  // calcula cuánto se ha bajado
    const total = document.documentElement.scrollHeight - innerHeight; // alto total que se puede recorrer
    barra.style.width = (total > 0 ? scrollY / total * 100 : 0) + '%'; // porcentaje recorrido
  };
  addEventListener('scroll', pintarBarra, { passive: true });  // actualiza al hacer scroll (passive = más fluido)
  pintarBarra();                                               // dibuja el estado inicial

  /* ---- 3. Secciones que aparecen al bajar ---- */
  if (!reducir && 'IntersectionObserver' in window) {          // si el navegador lo permite
    const vigia = new IntersectionObserver(entradas => {       // vigila qué elementos entran en pantalla
      entradas.forEach(en => {                                 // revisa cada elemento vigilado
        if (en.isIntersecting) {                               // si ya es visible
          en.target.classList.replace('vida-oculto', 'vida-visible'); // lo muestra con animación
          vigia.unobserve(en.target);                          // deja de vigilarlo (ya apareció)
        }
      });
    }, { threshold: 0.12 });                                   // se activa cuando se ve el 12 %
    document.querySelectorAll('.section, .trust, .editorial, footer').forEach(el => { // secciones de la tienda
      el.classList.add('vida-oculto');                         // las esconde al inicio
      vigia.observe(el);                                       // empieza a vigilarlas
    });
  }

  /* ---- 4. Onda al hacer clic en botones ---- */
  document.addEventListener('click', e => {                    // escucha clics en toda la página
    const b = e.target.closest('.btn, button.primary, .add-cart'); // ¿fue en un botón con efecto?
    if (!b || reducir) return;                                 // si no, o si hay poco movimiento, no hace nada
    const r = b.getBoundingClientRect();                       // posición y tamaño del botón
    const o = document.createElement('span');                  // crea el círculo de la onda
    const d = Math.max(r.width, r.height);                     // diámetro = lado más grande
    o.className = 'vida-onda';                                 // clase con la animación
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`; // nace donde se hizo clic
    b.appendChild(o);                                          // lo agrega al botón
    setTimeout(() => o.remove(), 650);                         // lo borra al terminar la animación
  });

  /* ---- 5. Inclinación 3D en tarjetas de producto ---- */
  if (!reducir && matchMedia('(hover: hover)').matches) {      // solo con mouse
    document.addEventListener('mousemove', e => {              // al mover el mouse
      const c = e.target.closest('.product-card, .category-card'); // ¿está sobre una tarjeta?
      document.querySelectorAll('.vida-tilt').forEach(t => { if (t !== c) t.style.transform = ''; }); // suelta las demás
      if (!c) return;                                          // si no hay tarjeta, termina
      c.classList.add('vida-tilt');                            // activa la transición suave
      const r = c.getBoundingClientRect();                     // medidas de la tarjeta
      const x = (e.clientX - r.left) / r.width - 0.5;          // posición horizontal del mouse (-0.5 a 0.5)
      const y = (e.clientY - r.top) / r.height - 0.5;          // posición vertical del mouse (-0.5 a 0.5)
      c.style.transform = `perspective(800px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-4px)`; // inclina hacia el mouse
    }, { passive: true });
  }

  /* ---- 6. Bloquear el scroll de atrás cuando hay una ventana abierta ---- */
  const revisarVentanas = () => {                              // decide si la página de fondo debe quedarse quieta
    const abierta = document.querySelector('.modal.active, .modal.open, .modal.show'); // ¿hay ventana abierta?
    document.body.style.overflow = abierta ? 'hidden' : '';    // sí: congela el fondo; no: lo libera
  };
  new MutationObserver(revisarVentanas).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); // reacciona cuando cambian las clases

  /* ---- 7. Cerrar ventanas con la tecla Escape ---- */
  addEventListener('keydown', e => {                           // al presionar una tecla
    if (e.key !== 'Escape') return;                            // solo nos importa Escape
    document.querySelectorAll('.modal.active, .modal.open, .modal.show').forEach(m => // cada ventana abierta
      m.querySelector('.modal-close, [data-close], .close')?.click()); // pulsa su botón de cerrar
  });
})();

/* ==========================================================
   CAPA PREMIUM — scroll, menú, imágenes, contadores y PWA
   ========================================================== */
(() => {
  'use strict';
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches; // ¿pidió menos movimiento?

  /* ---- 1. Botón "volver arriba" ---- */
  const subir = document.createElement('button');               // crea el botón
  subir.id = 'vidaSubir'; subir.type = 'button';                // id para el CSS
  subir.setAttribute('aria-label', 'Volver arriba'); subir.textContent = '↑';
  subir.addEventListener('click', () => scrollTo({ top: 0, behavior: reducir ? 'auto' : 'smooth' })); // sube suave
  document.body.appendChild(subir);

  /* ---- 2. Menú compacto, sección activa y parallax del hero (un solo listener, fluido) ---- */
  const header = document.getElementById('header');
  const heroImg = () => document.querySelector('.hero-slides'); // las fotos del carrusel se crean más abajo
  const enlaces = [...document.querySelectorAll('.desktop-nav a')];
  const secciones = enlaces.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  let esperando = false;                                        // evita trabajar de más en cada pixel
  const alScroll = () => {
    if (esperando) return; esperando = true;
    requestAnimationFrame(() => {                               // se ejecuta una vez por fotograma
      const y = scrollY;
      subir.classList.toggle('on', y > 700);                    // botón visible tras bajar un poco
      header?.classList.toggle('vida-compacto', y > 40);        // menú más sólido al bajar
      const hs = heroImg(); if (hs && !reducir && y < innerHeight) hs.style.transform = `translate3d(0,${y * 0.22}px,0)`; // parallax
      let actual = null;                                        // sección que se está viendo
      secciones.forEach(s => { if (s.getBoundingClientRect().top < innerHeight * 0.4) actual = s.id; });
      enlaces.forEach(a => a.classList.toggle('vida-activo', a.getAttribute('href') === '#' + actual));
      esperando = false;
    });
  };
  addEventListener('scroll', alScroll, { passive: true }); alScroll();

  /* ---- 3. Contadores animados (12+, 4+, 24/7, 100%) ---- */
  const contadores = document.querySelectorAll('.stats-grid strong');
  if ('IntersectionObserver' in window && !reducir) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const fin = parseInt(e.target.textContent, 10), t0 = performance.now();
      const paso = t => {                                       // sube de 0 al número con frenado suave
        const k = Math.min((t - t0) / 1400, 1);
        e.target.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }), { threshold: 0.6 });
    contadores.forEach(c => io.observe(c));
  }

  /* ---- 4. Fotos que aparecen al terminar de cargar (también las de productos creadas por app.js) ---- */
  const marcar = img => img.complete ? img.classList.add('vida-cargada') : img.addEventListener('load', () => img.classList.add('vida-cargada'), { once: true });
  const revisarFotos = () => document.querySelectorAll('img[loading="lazy"]:not(.vida-cargada)').forEach(marcar);
  revisarFotos();
  new MutationObserver(revisarFotos).observe(document.getElementById('productGrid') || document.body, { childList: true, subtree: true });
  setTimeout(() => document.querySelectorAll('img').forEach(i => i.classList.add('vida-cargada')), 4000); // red de seguridad: nunca quedan invisibles

  /* ---- 5. Modo sin conexión (antes estaba en el HTML y la política de seguridad lo bloqueaba) ---- */
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/user/sw.js', { scope: '/user/' }).catch(() => {}));
})();

/* ==========================================================
   ARREGLO: la página nunca debe quedar "congelada"
   Si no hay ninguna ventana o panel abierto, se libera el scroll.
   ========================================================== */
(() => {
  'use strict';
  const soltar = () => {                                        // libera el scroll si quedó bloqueado por error
    if (document.querySelector('.modal.active, .side-panel.active')) return; // hay algo abierto: no tocar
    document.body.classList.remove('lock');                     // quita el bloqueo de app.js
    document.body.style.overflow = ''; document.documentElement.style.overflow = ''; // quita bloqueos en línea
  };
  ['wheel', 'touchstart', 'keydown', 'click'].forEach(ev => addEventListener(ev, () => setTimeout(soltar, 350), { passive: true, capture: true }));
  addEventListener('pageshow', soltar);                         // al volver con el botón "atrás"
  soltar();
})();

/* ==========================================================
   NUEVO — tema claro/oscuro, carrusel, preloader, WhatsApp,
   oferta con cuenta regresiva, cookies y ventanas accesibles
   ========================================================== */
(() => {
  'use strict';
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.querySelector(s);

  /* ---- 1. Botón de modo claro / oscuro (se guarda en el navegador) ---- */
  const LUNA = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  const SOL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const tema = document.createElement('button');
  tema.id = 'temaBtn'; tema.type = 'button'; tema.className = 'icon-btn';
  const pintarTema = () => {                                           // actualiza icono, texto de ayuda y color del navegador
    const osc = document.documentElement.dataset.tema === 'oscuro';
    tema.innerHTML = osc ? SOL : LUNA;
    tema.setAttribute('aria-label', osc ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    const m = $('meta[name="theme-color"]'); if (m) m.content = osc ? '#060606' : '#f6f4ef';
  };
  tema.addEventListener('click', () => {
    const nuevo = document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = nuevo;
    try { localStorage.setItem('ss_tema', nuevo); } catch (e) {}
    pintarTema();
  });
  const acciones = $('.header-actions');
  if (acciones) acciones.insertBefore(tema, $('#menuBtn') || null);
  pintarTema();

  /* ---- 2. Preloader corto ---- */
  const pre = $('#vidaPre');
  const quitarPre = () => { if (pre) { pre.classList.add('fuera'); setTimeout(() => pre.remove(), 600); } };
  addEventListener('load', () => setTimeout(quitarPre, 250));
  setTimeout(quitarPre, 2500);                                          // red de seguridad: nunca se queda pegado

  /* ---- 3. Carrusel del hero: automático, flechas, puntos y deslizamiento táctil ---- */
  const hero = $('.hero');
  if (hero) {
    const fotos = ['hero', 'campaign', 'lookbook_01', 'lookbook_02', 'lookbook_03'];
    const cont = document.createElement('div'); cont.className = 'hero-slides';
    const slides = fotos.map((f, i) => { const d = document.createElement('div'); d.className = 'hero-slide' + (i ? '' : ' on'); cont.appendChild(d); return d; });
    slides[0].style.backgroundImage = 'url(assets/visuals/hero.webp)';
    hero.insertBefore(cont, hero.firstChild);
    const propias = {};                                                  // posiciones que el admin ya cambió
    addEventListener('load', () => slides.forEach((d, i) => { if (!propias[i]) d.style.backgroundImage = `url(assets/visuals/${fotos[i]}.webp)`; })); // las de fábrica cargan después
    fetch('/api/medios', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).then(m => {   // imágenes subidas desde el admin
      ['hero', 'hero2', 'hero3', 'hero4', 'hero5'].forEach((k, i) => {
        if (m && m[k]) { propias[i] = true; slides[i].style.backgroundImage = 'url("' + String(m[k]).replace(/["\\\n]/g, '') + '")'; }
      });
    }).catch(() => {});
    const ctrl = document.createElement('div'); ctrl.className = 'vh-ctrl';
    ctrl.innerHTML = '<button class="vh-nav" type="button" aria-label="Imagen anterior">‹</button>' + fotos.map((f, i) => `<button class="vh-dot" type="button" aria-label="Ir a la imagen ${i + 1}"></button>`).join('') + '<button class="vh-nav" type="button" aria-label="Imagen siguiente">›</button>';
    hero.appendChild(ctrl);
    const puntos = ctrl.querySelectorAll('.vh-dot'); let actual = 0, pausa = false;
    const ir = n => { actual = (n + fotos.length) % fotos.length; slides.forEach((d, i) => d.classList.toggle('on', i === actual)); puntos.forEach((p, i) => p.classList.toggle('on', i === actual)); };
    ir(0);
    ctrl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('vh-dot')) ir([...puntos].indexOf(b)); else ir(actual + (b.getAttribute('aria-label').includes('siguiente') ? 1 : -1));
    });
    let x0 = null;                                                      // deslizar con el dedo
    hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) ir(actual + (dx < 0 ? 1 : -1)); x0 = null; }, { passive: true });
    hero.addEventListener('mouseenter', () => pausa = true); hero.addEventListener('mouseleave', () => pausa = false);
    if (!reducir) setInterval(() => { if (!pausa && !document.hidden) ir(actual + 1); }, 6000); // cambia sola cada 6 s
  }

  /* ---- 4. Botón flotante de WhatsApp (usa el número configurado en el admin) ---- */
  const wa = document.createElement('a');
  wa.id = 'vidaWa'; wa.target = '_blank'; wa.rel = 'noopener'; wa.setAttribute('aria-label', 'Escribir por WhatsApp');
  wa.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 13.8c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2z"/></svg>';
  document.body.appendChild(wa);
  let intentos = 0;
  const buscarWa = setInterval(() => {                                   // app.js pone el enlace cuando carga la configuración
    const src = $('#mainWhatsapp'); intentos++;
    if (src && src.getAttribute('href')) { wa.href = src.getAttribute('href'); wa.classList.add('on'); clearInterval(buscarWa); }
    else if (intentos > 40) clearInterval(buscarWa);
  }, 500);

  /* ---- 5. Cuenta regresiva de la oferta (termina cada domingo a las 23:59) ---- */
  const cuenta = $('#cuenta');
  if (cuenta) {
    const fin = () => { const d = new Date(); d.setDate(d.getDate() + (7 - d.getDay()) % 7); d.setHours(23, 59, 59, 0); return d; };
    const dos = n => String(n).padStart(2, '0');
    const tic = () => {
      const s = Math.max(0, Math.floor((fin() - Date.now()) / 1000));
      const v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
      cuenta.querySelectorAll('b').forEach((b, i) => b.textContent = dos(v[i]));
    };
    tic(); setInterval(tic, 1000);
  }

  /* ---- 6. Aviso de cookies ---- */
  let visto = false; try { visto = localStorage.getItem('ss_cookies') === '1'; } catch (e) {}
  if (!visto) {
    const ck = document.createElement('div'); ck.id = 'vidaCookies'; ck.setAttribute('role', 'dialog'); ck.setAttribute('aria-label', 'Aviso de cookies');
    ck.innerHTML = '<p>Usamos almacenamiento local para recordar tu carrito, tu sesión y tu tema. <a href="/user/informacion.html#privacidad">Más información</a></p><button type="button">Aceptar</button>';
    ck.querySelector('button').addEventListener('click', () => { try { localStorage.setItem('ss_cookies', '1'); } catch (e) {} ck.remove(); });
    document.body.appendChild(ck);
  }

  /* ---- 7. Ventanas: accesibles y se cierran al hacer clic fuera ---- */
  document.querySelectorAll('.modal').forEach(m => { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); });
  document.addEventListener('click', e => {
    const m = e.target;
    if (m.classList && m.classList.contains('modal') && m.classList.contains('active')) m.querySelector('.modal-close, [data-close], .close')?.click(); // clic en el fondo
  });
})();
