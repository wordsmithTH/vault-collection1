(function () {
  'use strict';

  var CLOUD_NAME = 'kobhvma5';
  var BATCH_SIZE = 60;

  var state = {
    all: [],
    filtered: [],
    rendered: 0,
    query: '',
    sort: 'no-asc',
    lightboxIndex: -1,
  };

  var els = {
    grid: document.getElementById('grid'),
    sentinel: document.getElementById('sentinel'),
    search: document.getElementById('search'),
    clearBtn: document.getElementById('clear-search'),
    sort: document.getElementById('sort'),
    resultCount: document.getElementById('result-count'),
    emptyState: document.getElementById('empty-state'),
    statTotal: document.getElementById('stat-total'),
    statCatalogued: document.getElementById('stat-catalogued'),
    lightbox: document.getElementById('lightbox'),
    lbImg: document.getElementById('lb-img'),
    lbNo: document.getElementById('lb-no'),
    lbTitle: document.getElementById('lb-title'),
    lbTags: document.getElementById('lb-tags'),
    lbOpen: document.getElementById('lb-open'),
    lbClose: document.getElementById('lb-close'),
    lbPrev: document.getElementById('lb-prev'),
    lbNext: document.getElementById('lb-next'),
  };

  function thumbUrl(url, width) {
    return url.replace(
      '/upload/',
      '/upload/w_' + width + ',c_fill,ar_2:3,g_auto,q_auto,f_auto/'
    );
  }
  function fullUrl(url) {
    return url.replace('/upload/', '/upload/w_1400,q_auto,f_auto/');
  }

  function displayLabel(c) {
    if (c.title) return c.title;
    return 'No. ' + c.no + ' — uncatalogued';
  }

  // ---------- data load ----------
  // Primary source: the live Netlify Function, backed by a cache that's
  // kept fresh on a schedule from Cloudinary. Falls back to the static
  // data.json snapshot if the function is unreachable (e.g. local preview
  // without `netlify dev`, or a transient function error).
  function loadData() {
    return fetch('/api/comics')
      .then(function (r) {
        if (!r.ok) throw new Error('API responded ' + r.status);
        return r.json();
      })
      .catch(function () {
        return fetch('data.json').then(function (r) { return r.json(); });
      });
  }

  loadData()
    .then(function (data) {
      state.all = data;
      els.statTotal.textContent = data.length;
      els.statCatalogued.textContent = data.filter(function (c) { return c.title; }).length;
      applyFilters();
    })
    .catch(function (err) {
      els.grid.innerHTML = '<p style="color:#c77;font-family:monospace;">Could not load the vault — ' + err + '</p>';
    });

  // ---------- filtering / sorting ----------
  function applyFilters() {
    var q = state.query.trim().toLowerCase();
    var list = state.all.filter(function (c) {
      if (!q) return true;
      var hay = (c.title || '') + ' ' + c.no + ' ' + (c.grade || '') + ' ' + c.id;
      return hay.toLowerCase().indexOf(q) !== -1;
    });

    list = list.slice().sort(function (a, b) {
      switch (state.sort) {
        case 'no-desc': return b.no.localeCompare(a.no);
        case 'added-desc': return new Date(b.added) - new Date(a.added);
        case 'title-asc':
          if (!a.title && !b.title) return a.no.localeCompare(b.no);
          if (!a.title) return 1;
          if (!b.title) return -1;
          return a.title.localeCompare(b.title);
        case 'no-asc':
        default: return a.no.localeCompare(b.no);
      }
    });

    state.filtered = list;
    state.rendered = 0;
    els.grid.innerHTML = '';
    els.resultCount.innerHTML = q
      ? '<b>' + list.length + '</b> match' + (list.length === 1 ? '' : 'es')
      : '<b>' + list.length + '</b> in the vault';
    els.emptyState.style.display = list.length === 0 ? 'block' : 'none';
    renderNextBatch();
  }

  function renderNextBatch() {
    var start = state.rendered;
    var end = Math.min(start + BATCH_SIZE, state.filtered.length);
    var frag = document.createDocumentFragment();

    for (var i = start; i < end; i++) {
      frag.appendChild(buildCard(state.filtered[i], i));
    }
    els.grid.appendChild(frag);
    state.rendered = end;
  }

  function buildCard(c, idx) {
    var card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Open ' + displayLabel(c));
    card.dataset.idx = idx;

    var frame = document.createElement('div');
    frame.className = 'frame skel';

    var noTag = document.createElement('div');
    noTag.className = 'no-tag';
    noTag.textContent = 'No. ' + c.no;
    frame.appendChild(noTag);

    if (c.grade) {
      var gTag = document.createElement('div');
      gTag.className = 'grade-tag';
      gTag.textContent = 'CGC ' + c.grade;
      frame.appendChild(gTag);
    }
    if (c.ss) {
      var sTag = document.createElement('div');
      sTag.className = 'ss-tag';
      sTag.textContent = c.ssCount ? 'SIG ×' + c.ssCount : 'SIGNED';
      frame.appendChild(sTag);
    }

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = displayLabel(c);
    img.src = thumbUrl(c.url, 420);
    img.addEventListener('load', function () {
      img.classList.add('loaded');
      frame.classList.remove('skel');
    });
    frame.appendChild(img);

    var label = document.createElement('div');
    label.className = 'card-label';
    if (c.title) {
      label.textContent = c.title;
    } else {
      var span = document.createElement('span');
      span.className = 'untitled';
      span.textContent = 'No. ' + c.no + ' · uncatalogued';
      label.appendChild(span);
    }

    card.appendChild(frame);
    card.appendChild(label);

    card.addEventListener('click', function () { openLightbox(idx); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(idx); }
    });

    return card;
  }

  // ---------- infinite scroll ----------
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting && state.rendered < state.filtered.length) {
        renderNextBatch();
      }
    });
  }, { rootMargin: '600px 0px' });
  io.observe(els.sentinel);

  // ---------- controls ----------
  var searchTimer;
  els.search.addEventListener('input', function () {
    els.clearBtn.classList.toggle('show', !!els.search.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = els.search.value;
      applyFilters();
    }, 140);
  });
  els.clearBtn.addEventListener('click', function () {
    els.search.value = '';
    els.clearBtn.classList.remove('show');
    state.query = '';
    applyFilters();
    els.search.focus();
  });
  els.sort.addEventListener('change', function () {
    state.sort = els.sort.value;
    applyFilters();
  });

  // ---------- lightbox ----------
  function openLightbox(idx) {
    state.lightboxIndex = idx;
    renderLightbox();
    els.lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    els.lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }
  function renderLightbox() {
    var c = state.filtered[state.lightboxIndex];
    if (!c) return;
    els.lbImg.src = fullUrl(c.url);
    els.lbImg.alt = displayLabel(c);
    els.lbNo.textContent = 'VAULT NO. ' + c.no;
    els.lbTitle.textContent = c.title || 'Uncatalogued scan';
    els.lbOpen.href = c.url;

    els.lbTags.innerHTML = '';
    if (c.grade) {
      var g = document.createElement('span');
      g.className = 'grade';
      g.textContent = 'CGC ' + c.grade;
      els.lbTags.appendChild(g);
    }
    if (c.ss) {
      var s = document.createElement('span');
      s.className = 'sig';
      s.textContent = c.ssCount ? 'Signature ×' + c.ssCount : 'Signature Series';
      els.lbTags.appendChild(s);
    }
    if (!c.title) {
      var u = document.createElement('span');
      u.textContent = 'Not yet catalogued';
      els.lbTags.appendChild(u);
    }
  }
  function step(delta) {
    var next = state.lightboxIndex + delta;
    if (next < 0 || next >= state.filtered.length) return;
    // make sure it's rendered so keyboard/thumbnail state stays consistent
    if (next >= state.rendered) renderNextBatch();
    state.lightboxIndex = next;
    renderLightbox();
  }

  els.lbClose.addEventListener('click', closeLightbox);
  els.lbPrev.addEventListener('click', function () { step(-1); });
  els.lbNext.addEventListener('click', function () { step(1); });
  els.lightbox.addEventListener('click', function (e) {
    if (e.target === els.lightbox) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    if (!els.lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
})();
