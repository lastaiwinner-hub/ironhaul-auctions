/* IronHaul Auctions — progressive enhancement.
   Everything here is an upgrade to markup that already works without it:
   forms post normally, links navigate, countdowns start server-rendered. */
(function () {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const csrf = () => {
    const el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  };

  /* ---- Mobile nav ------------------------------------------------------ */
  const navToggle = $('[data-nav-toggle]');
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      const nav = $('#site-nav');
      const open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---- User menu ------------------------------------------------------- */
  const menu = $('[data-usermenu]');
  if (menu) {
    const btn = $('[data-usermenu-btn]', menu);
    const panel = $('[data-usermenu-panel]', menu);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = panel.classList.toggle('hide');
      btn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target)) {
        panel.classList.add('hide');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') panel.classList.add('hide');
    });
  }

  /* ---- Countdowns ------------------------------------------------------
     Rendered server-side first so they are correct with JS disabled; this
     just keeps them ticking. */
  const timers = $$('[data-countdown]');
  if (timers.length) {
    const tick = function () {
      const now = Date.now();
      timers.forEach(function (el) {
        const ends = new Date(el.getAttribute('data-countdown')).getTime();
        const label = $('[data-countdown-label]', el) || el;
        let ms = ends - now;

        if (isNaN(ms)) return;
        if (ms <= 0) {
          label.textContent = 'Auction ended';
          el.classList.remove('is-urgent');
          el.classList.add('is-ended');
          return;
        }

        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;

        if (el.hasAttribute('data-countdown-units')) {
          setUnit(el, 'd', d); setUnit(el, 'h', h);
          setUnit(el, 'm', m); setUnit(el, 's', sec);
        } else if (d > 0) label.textContent = d + 'd ' + h + 'h remaining';
        else if (h > 0) label.textContent = h + 'h ' + m + 'm remaining';
        else if (m > 0) label.textContent = m + 'm ' + pad(sec) + 's remaining';
        else label.textContent = sec + 's remaining';

        el.classList.toggle('is-urgent', ms < 3600 * 1000);
      });
    };
    const pad = (n) => String(n).padStart(2, '0');
    const setUnit = function (el, key, value) {
      const node = $('[data-unit="' + key + '"]', el);
      if (node) node.textContent = pad(value);
    };

    tick();
    setInterval(tick, 1000);
  }

  /* ---- Live lot state --------------------------------------------------
     Polls while the tab is visible so a bidder sees new bids land without
     refreshing, and stops polling in a background tab. */
  const livePanel = $('[data-live-lot]');
  if (livePanel) {
    const slug = livePanel.getAttribute('data-live-lot');
    let timer = null;

    const render = function (state) {
      const price = $('[data-live-price]');
      if (price) price.textContent = state.currentBidFormatted;

      const count = $('[data-live-count]');
      if (count) count.textContent = state.bidCount + (state.bidCount === 1 ? ' bid' : ' bids');

      const min = $('[data-live-minimum]');
      if (min) min.textContent = state.minimumBidFormatted;

      const input = $('[data-bid-input]');
      if (input && document.activeElement !== input) {
        input.min = state.minimumBid / 100;
        input.placeholder = (state.minimumBid / 100).toFixed(2);
      }

      const timerEl = $('[data-countdown]', livePanel);
      if (timerEl && state.endsAt) timerEl.setAttribute('data-countdown', state.endsAt);

      const history = $('[data-live-history]');
      if (history && state.history.length) {
        history.innerHTML = state.history.map(function (b) {
          return '<div class="bid-row ' + (b.isYou ? 'is-you' : '') + '">'
            + '<div><div class="small" style="font-weight:600">' + escapeHtml(b.bidder)
            + (b.isYou ? ' <span class="badge badge-accent" style="margin-left:6px">You</span>' : '')
            + (b.isAuto ? ' <span class="badge badge-muted" style="margin-left:6px">Auto</span>' : '')
            + '</div><div class="xsmall muted">' + escapeHtml(b.ago) + '</div></div>'
            + '<div class="amt mono">' + escapeHtml(b.amountFormatted) + '</div></div>';
        }).join('');
      }
    };

    const poll = function () {
      fetch('/api/lot/' + encodeURIComponent(slug) + '/state', {
        headers: { Accept: 'application/json' },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data && data.ok) render(data); })
        .catch(function () { /* transient network error — try again next tick */ });
    };

    const start = function () {
      if (timer) return;
      poll();
      timer = setInterval(poll, 12000);
    };
    const stop = function () {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
    if (!document.hidden) start();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---- Gallery --------------------------------------------------------- */
  const gallery = $('[data-gallery]');
  if (gallery) {
    const main = $('[data-gallery-main]', gallery);
    const counter = $('[data-gallery-count]', gallery);
    const thumbs = $$('[data-gallery-thumb]', gallery);
    let index = 0;

    const show = function (i) {
      if (!thumbs.length) return;
      index = (i + thumbs.length) % thumbs.length;
      const src = thumbs[index].getAttribute('data-src');
      const alt = thumbs[index].getAttribute('data-alt') || '';
      if (main) { main.src = src; main.alt = alt; }
      if (counter) counter.textContent = (index + 1) + ' / ' + thumbs.length;
      thumbs.forEach((t, n) => t.classList.toggle('is-active', n === index));
    };

    thumbs.forEach((t, i) => t.addEventListener('click', () => show(i)));
    const prev = $('[data-gallery-prev]', gallery);
    const next = $('[data-gallery-next]', gallery);
    if (prev) prev.addEventListener('click', () => show(index - 1));
    if (next) next.addEventListener('click', () => show(index + 1));

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') show(index - 1);
      if (e.key === 'ArrowRight') show(index + 1);
    });
  }

  /* ---- Bid form -------------------------------------------------------- */
  const bidForm = $('[data-bid-form]');
  if (bidForm) {
    const useMax = $('[data-use-max]', bidForm);
    const maxWrap = $('[data-max-wrap]', bidForm);
    if (useMax && maxWrap) {
      const sync = () => maxWrap.classList.toggle('hide', !useMax.checked);
      useMax.addEventListener('change', sync);
      sync();
    }

    $$('[data-bid-step]', bidForm).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const input = $('[data-bid-input]', bidForm);
        const value = parseFloat(btn.getAttribute('data-bid-step'));
        if (input && !isNaN(value)) {
          input.value = value.toFixed(2);
          input.focus();
        }
      });
    });

    bidForm.addEventListener('submit', function () {
      const btn = $('[type="submit"]', bidForm);
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Placing bid…';
      }
    });
  }

  /* ---- Delivery estimator ---------------------------------------------- */
  const estimator = $('[data-delivery-form]');
  if (estimator) {
    estimator.addEventListener('submit', function (e) {
      e.preventDefault();
      const zip = $('[data-delivery-zip]', estimator).value.trim();
      const out = $('[data-delivery-result]', estimator);
      const slug = estimator.getAttribute('data-delivery-form');

      out.innerHTML = '<span class="muted small">Calculating…</span>';

      fetch('/lot/' + encodeURIComponent(slug) + '/delivery-estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
        body: JSON.stringify({ zip: zip }),
      })
        .then((r) => r.json())
        .then(function (data) {
          if (!data.ok) {
            out.innerHTML = '<span class="error-text">' + escapeHtml(data.message || 'Enter a valid ZIP code.') + '</span>';
            return;
          }
          out.innerHTML =
            '<div class="row-between" style="margin-top:10px;padding:12px;background:var(--surface-alt);border-radius:6px">'
            + '<div><div class="xsmall muted">Approx. ' + data.miles.toLocaleString() + ' miles from ' + escapeHtml(data.origin) + '</div>'
            + '<div class="mono" style="font-family:var(--font-display);font-size:1.3rem;font-weight:800">' + escapeHtml(data.costFormatted) + '</div></div>'
            + '</div><p class="xsmall muted" style="margin-top:8px">' + escapeHtml(data.note) + '</p>';
        })
        .catch(function () {
          out.innerHTML = '<span class="error-text">Could not calculate right now. Call us for a quote.</span>';
        });
    });
  }

  /* ---- KYC upload previews --------------------------------------------- */
  $$('[data-upload-tile]').forEach(function (tile) {
    const input = $('input[type="file"]', tile);
    if (!input) return;

    input.addEventListener('change', function () {
      const file = input.files && input.files[0];
      if (!file) return;

      const preview = $('[data-upload-preview]', tile);
      if (preview) {
        preview.src = URL.createObjectURL(file);
        preview.classList.remove('hide');
      }
      const icon = $('[data-upload-icon]', tile);
      if (icon) icon.classList.add('hide');

      const name = $('[data-upload-filename]', tile);
      if (name) name.textContent = file.name;

      tile.classList.add('is-done');
    });
  });

  /* ---- Signature pad ---------------------------------------------------
     Canvas drawing with pointer events so a mouse, a finger and a stylus all
     work from one code path. */
  const pad = $('[data-sig-pad]');
  if (pad) {
    const canvas = $('canvas', pad);
    const ctx = canvas.getContext('2d');
    const hint = $('[data-sig-hint]', pad);
    const dataField = $('[data-sig-data]');
    const methodField = $('[data-sig-method]');
    const clearBtn = $('[data-sig-clear]');
    const submitBtn = $('[data-sig-submit]');
    const consent = $('[data-sig-consent]');
    const typedInput = $('[data-sig-typed]');

    let drawing = false;
    let hasInk = false;
    let last = null;

    const resize = function () {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const image = hasInk ? canvas.toDataURL() : null;

      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1B3A8C';

      if (image) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = image;
      }
    };

    const point = function (e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('pointerdown', function (e) {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      last = point(e);
      if (hint) hint.classList.add('hide');
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!drawing) return;
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      hasInk = true;
      sync();
    });

    const stopDraw = function () { drawing = false; last = null; };
    canvas.addEventListener('pointerup', stopDraw);
    canvas.addEventListener('pointercancel', stopDraw);
    canvas.addEventListener('pointerleave', stopDraw);

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasInk = false;
        if (hint) hint.classList.remove('hide');
        sync();
      });
    }

    /* Tabs: draw vs type */
    $$('[data-sig-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        const mode = tab.getAttribute('data-sig-tab');
        $$('[data-sig-tab]').forEach((t) => t.classList.toggle('is-active', t === tab));
        $$('[data-sig-mode]').forEach(function (panelEl) {
          panelEl.classList.toggle('hide', panelEl.getAttribute('data-sig-mode') !== mode);
        });
        if (methodField) methodField.value = mode;
        sync();
      });
    });

    function currentMethod() {
      return methodField ? methodField.value : 'drawn';
    }

    function sync() {
      const method = currentMethod();
      const signed = method === 'drawn'
        ? hasInk
        : Boolean(typedInput && typedInput.value.trim().length >= 2);
      const agreed = consent ? consent.checked : true;

      if (submitBtn) submitBtn.disabled = !(signed && agreed);
      if (dataField && method === 'drawn' && hasInk) {
        dataField.value = canvas.toDataURL('image/png');
      } else if (dataField && method !== 'drawn') {
        dataField.value = '';
      }
    }

    if (consent) consent.addEventListener('change', sync);
    if (typedInput) typedInput.addEventListener('input', sync);

    window.addEventListener('resize', resize);
    resize();
    sync();

    const signForm = $('[data-sign-form]');
    if (signForm) {
      signForm.addEventListener('submit', function () {
        if (currentMethod() === 'drawn' && hasInk && dataField) {
          dataField.value = canvas.toDataURL('image/png');
        }
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing…';
        }
      });
    }
  }

  /* ---- Confirm destructive actions ------------------------------------- */
  $$('[data-confirm]').forEach(function (el) {
    el.addEventListener('submit', function (e) {
      if (!window.confirm(el.getAttribute('data-confirm'))) e.preventDefault();
    });
    el.addEventListener('click', function (e) {
      if (el.tagName === 'A' && !window.confirm(el.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    });
  });

  /* ---- Walkthrough video dialog ---------------------------------------- */
  (function () {
    const dialog = $('[data-video-dialog]');
    const open = $('[data-video-open]');
    if (!dialog || !open) return;

    open.addEventListener('click', function () {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    const close = $('[data-video-close]', dialog);
    if (close) {
      close.addEventListener('click', function () {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      });
    }
    // Clicking the backdrop closes it, the same as pressing Escape.
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog && typeof dialog.close === 'function') dialog.close();
    });
  }());

  /* ---- Sheet density --------------------------------------------------- */
  /* Buyers scanning a long catalogue want the specs and nothing else; buyers
     comparing two machines want the whole report. The choice is remembered. */
  (function () {
    const groups = $$('[data-density]');
    if (!groups.length) return;

    const KEY = 'ironhaul.density';
    let current = 'full';
    try { current = window.localStorage.getItem(KEY) || 'full'; } catch (err) { /* private mode */ }

    function apply(mode) {
      current = mode === 'compact' ? 'compact' : 'full';
      $$('[data-sheets]').forEach(function (list) {
        list.classList.toggle('compact', current === 'compact');
      });
      groups.forEach(function (group) {
        $$('[data-density-set]', group).forEach(function (btn) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('data-density-set') === current));
        });
      });
      try { window.localStorage.setItem(KEY, current); } catch (err) { /* ignore */ }
    }

    groups.forEach(function (group) {
      $$('[data-density-set]', group).forEach(function (btn) {
        btn.addEventListener('click', function () { apply(btn.getAttribute('data-density-set')); });
      });
    });

    apply(current);
  }());

  /* ---- Hero slider ------------------------------------------------------ */
  /* Auto-advance is a convenience, not the only way through: arrows, dots and
     the keyboard all work, it pauses whenever a pointer or the keyboard is on
     it, and it does not move at all for anyone who asked for reduced motion. */
  (function () {
    const slider = $('[data-slider]');
    if (!slider) return;

    const slides = $$('[data-slide]', slider);
    const dots = $$('[data-slider-dot]', slider);
    if (slides.length < 2) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0;
    let timer = null;

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle('is-on', n === index));
      dots.forEach((d, n) => d.setAttribute('aria-current', String(n === index)));
    }

    function start() {
      if (still || timer) return;
      timer = window.setInterval(() => show(index + 1), 5500);
    }

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    }

    dots.forEach((d, i) => d.addEventListener('click', function (e) {
      e.preventDefault();
      show(i);
      stop();
    }));

    const prev = $('[data-slider-prev]', slider);
    const next = $('[data-slider-next]', slider);
    if (prev) prev.addEventListener('click', (e) => { e.preventDefault(); show(index - 1); stop(); });
    if (next) next.addEventListener('click', (e) => { e.preventDefault(); show(index + 1); stop(); });

    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
    slider.addEventListener('focusin', stop);
    slider.addEventListener('focusout', start);

    // A tab in the background should not burn through the whole set.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    show(0);
    start();
  }());

  /* ---- Filters, folded on small screens -------------------------------- */
  /* The panel ships open so it still works without JavaScript; on a phone we
     fold it up on arrival so the listings are what you land on. */
  (function () {
    const panel = $('[data-filters]');
    if (!panel) return;
    const narrow = window.matchMedia('(max-width: 900px)');
    if (narrow.matches) panel.removeAttribute('open');
    narrow.addEventListener('change', function (e) {
      if (e.matches) panel.removeAttribute('open');
      else panel.setAttribute('open', '');
    });
  }());

  /* ---- Auto-dismiss flashes -------------------------------------------- */
  $$('.flashes .alert').forEach(function (el) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s, transform .4s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => el.remove(), 420);
    }, 9000);
  });
}());
