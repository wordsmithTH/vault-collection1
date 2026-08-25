(function () {
  'use strict';

  // ---------- series normalization ----------
  // Filenames used inconsistent abbreviations/casing for the same series
  // (ASM vs Amazing Spiderman, G-S vs Giant Size, TOS vs T. O. S, etc).
  // This folds known aliases into one canonical group name. Anything not
  // listed here just uses its parsed name as-is.
  var SERIES_ALIASES = {
    'asm': 'Amazing Spider-Man',
    'amazing spiderman': 'Amazing Spider-Man',
    'gs spider man': 'Giant-Size Spider-Man',
    'g size avengers': 'Giant-Size Avengers',
    'giant size avengers': 'Giant-Size Avengers',
    'g s cap t america': 'Giant-Size Captain America',
    'g s cap t marvel': 'Giant-Size Captain Marvel',
    'g s iron man': 'Giant-Size Iron Man',
    'g s power man': 'Giant-Size Power Man',
    'g s s stars': 'Giant-Size Super-Stars',
    'g s super villain team up': 'Giant-Size Super-Villain Team-Up',
    'g s thor': 'Giant-Size Thor',
    'f four': 'Fantastic Four',
    'ff': 'Fantastic Four',
    'fantastic four ann': 'Fantastic Four Annual',
    'gr lantern': 'Green Lantern',
    'green lantern': 'Green Lantern',
    'hulk ann': 'Incredible Hulk Annual',
    'ironman sub mariner': 'Iron Man / Sub-Mariner',
    'jim': 'Journey into Mystery',
    'journey into mystery': 'Journey into Mystery',
    'm premiere': 'Marvel Premiere',
    'm spotlight': 'Marvel Spotlight',
    'marvel spotlight': 'Marvel Spotlight',
    'mshsecret wars': 'Marvel Super Heroes: Secret Wars',
    'marvel super heroes secret wars': 'Marvel Super Heroes: Secret Wars',
    'marvel preview': 'Marvel Preview',
    'marvel two in one ann': 'Marvel Two-in-One Annual',
    'n t titans': 'New Teen Titans',
    'new miutants': 'New Mutants',
    'new mutants': 'New Mutants',
    'ninja sxroll': 'Ninja Scroll',
    'ninja scroll': 'Ninja Scroll',
    'silver surfer ann': 'Silver Surfer Annual',
    'silver surfer annual': 'Silver Surfer Annual',
    'strange tales': 'Strange Tales',
    'super villain t up': 'Super-Villain Team-Up',
    't o s': 'Tales of Suspense',
    'tos': 'Tales of Suspense',
    'tales of suspense': 'Tales of Suspense',
    't t a': 'Tales to Astonish',
    'tta': 'Tales to Astonish',
    'tales to astonish': 'Tales to Astonish',
    'tottitans': 'Tales of the Teen Titans',
    'deadly hands kung fu': 'Deadly Hands of Kung Fu',
    'dealy hands kung fu': 'Deadly Hands of Kung Fu',
    'logan s run': "Logan's Run",
    'batman odyssey': 'Batman: Odyssey',
    'batman vengeance of bane i': 'Batman: Vengeance of Bane',
    'blackbolt': 'Black Bolt',
  };

  function normKey(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  // Splits a cleaned title like "X-Men 129" or "Alpha Flight 1 Canadian variant"
  // into { series: "X-Men", issue: 129 } for grouping + natural sort.
  function splitSeriesIssue(title) {
    var tokens = title.split(' ');
    var issueIdx = -1;
    for (var i = 0; i < tokens.length; i++) {
      if (/^\d+(\.\d+)?$/.test(tokens[i])) { issueIdx = i; break; }
    }
    var rawSeries = issueIdx === -1 ? title : tokens.slice(0, issueIdx).join(' ');
    var issue = issueIdx === -1 ? null : parseFloat(tokens[issueIdx]);
    var key = normKey(rawSeries);
    var series = SERIES_ALIASES[key] || rawSeries;
    return { series: series, issue: issue };
  }

  var UNCATALOGUED = 'Uncatalogued Scans';

  // ---------- state ----------
  var state = {
    all: [],       // raw comics from the API, each annotated with .series/.issue
    query: '',
    flatOrder: [], // current filtered+grouped flat list, for lightbox prev/next
  };

  var els = {
    grid: document.getElementById('grid'),
    search: document.getElementById('search'),
    clearBtn: document.getElementById('clear-search'),
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

  // the sort <select> no longer applies (fixed grouped order per request) —
  // hide it if present rather than deleting markup/behavior elsewhere.
  var sortWrap = document.querySelector('.sort-wrap');
  if (sortWrap) sortWrap.style.display = 'none';

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
    return c.title || ('No. ' + c.no + ' — uncatalogued');
  }

  // ---------- data load ----------
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

  // Manual curation layer — lets specific comics be reassigned to a
  // different/new section, or given a corrected title, without touching
  // the Cloudinary sync. Keyed by the comic's stable `id` (public_id), not
  // vault number, since vault numbers can shift as books are added/removed.
  // Safe to be missing entirely (treated as no overrides).
  function loadOverrides() {
    return fetch('overrides.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; });
  }

  function applyOverride(c, ov) {
    if (!ov) return;
    if (ov.title) {
      c.title = ov.title;
      var split = splitSeriesIssue(ov.title);
      c.series = ov.series || split.series;
      c.issue = ov.issue != null ? ov.issue : split.issue;
    } else if (ov.series) {
      c.series = ov.series;
      if (ov.issue != null) c.issue = ov.issue;
    }
  }

  Promise.all([loadData(), loadOverrides()])
    .then(function (results) {
      var data = results[0];
      var overrides = results[1] || {};

      state.all = data.map(function (c) {
        if (c.title) {
          var split = splitSeriesIssue(c.title);
          c.series = split.series;
          c.issue = split.issue;
        } else {
          c.series = UNCATALOGUED;
          c.issue = null;
        }
        applyOverride(c, overrides[c.id]);
        return c;
      });
      els.statTotal.textContent = data.length;
      els.statCatalogued.textContent = state.all.filter(function (c) { return c.title; }).length;
      render();
    })
    .catch(function (err) {
      els.grid.innerHTML = '<p style="color:#c77;font-family:monospace;">Could not load the vault — ' + err + '</p>';
    });

  // ---------- grouping + rendering ----------
  function render() {
    var q = state.query.trim().toLowerCase();

    var matches = state.all.filter(function (c) {
      if (!q) return true;
      var hay = (c.title || '') + ' ' + c.no + ' ' + (c.grade || '') + ' ' + c.id;
      return hay.toLowerCase().indexOf(q) !== -1;
    });

    var groups = {};
    matches.forEach(function (c) {
      (groups[c.series] = groups[c.series] || []).push(c);
    });

    var groupNames = Object.keys(groups).filter(function (g) { return g !== UNCATALOGUED; });
    groupNames.sort(function (a, b) { return a.localeCompare(b); });
    if (groups[UNCATALOGUED]) groupNames.push(UNCATALOGUED); // always last

    groupNames.forEach(function (name) {
      groups[name].sort(function (a, b) {
        if (a.issue != null && b.issue != null) {
          if (a.issue !== b.issue) return a.issue - b.issue;
          return (a.title || '').localeCompare(b.title || '');
        }
        if (a.issue != null) return -1;
        if (b.issue != null) return 1;
        return a.no.localeCompare(b.no);
      });
    });

    els.grid.innerHTML = '';
    state.flatOrder = [];
    var frag = document.createDocumentFragment();

    groupNames.forEach(function (name) {
      var items = groups[name];
      var section = document.createElement('div');
      section.className = 'group';

      var header = document.createElement('div');
      header.className = 'group-header' + (name === UNCATALOGUED ? ' uncatalogued' : '');
      var h2 = document.createElement('h2');
      h2.textContent = name;
      var count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = items.length + (items.length === 1 ? ' book' : ' books');
      header.appendChild(h2);
      header.appendChild(count);
      section.appendChild(header);

      var sectionGrid = document.createElement('div');
      sectionGrid.className = 'grid';
      items.forEach(function (c) {
        var idx = state.flatOrder.length;
        state.flatOrder.push(c);
        sectionGrid.appendChild(buildCard(c, idx));
      });
      section.appendChild(sectionGrid);

      frag.appendChild(section);
    });

    els.grid.appendChild(frag);

    els.resultCount.innerHTML = q
      ? '<b>' + matches.length + '</b> match' + (matches.length === 1 ? '' : 'es') + ' in ' + groupNames.length + ' group' + (groupNames.length === 1 ? '' : 's')
      : '<b>' + matches.length + '</b> in the vault · ' + groupNames.length + ' groups';
    els.emptyState.style.display = matches.length === 0 ? 'block' : 'none';
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

    var metaRow = document.createElement('div');
    metaRow.className = 'meta-row';

    var noTag = document.createElement('span');
    noTag.className = 'tag no-tag';
    noTag.textContent = 'No. ' + c.no;
    metaRow.appendChild(noTag);

    if (c.grade) {
      var gTag = document.createElement('span');
      gTag.className = 'tag grade-tag';
      gTag.textContent = 'CGC ' + c.grade;
      metaRow.appendChild(gTag);
    }
    if (c.ss) {
      var sTag = document.createElement('span');
      sTag.className = 'tag ss-tag';
      sTag.textContent = c.ssCount ? 'SIG ×' + c.ssCount : 'SIGNED';
      metaRow.appendChild(sTag);
    }

    card.appendChild(frame);
    card.appendChild(label);
    card.appendChild(metaRow);

    card.addEventListener('click', function () { openLightbox(idx); });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(idx); }
    });

    return card;
  }

  // ---------- controls ----------
  var searchTimer;
  els.search.addEventListener('input', function () {
    els.clearBtn.classList.toggle('show', !!els.search.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = els.search.value;
      render();
    }, 140);
  });
  els.clearBtn.addEventListener('click', function () {
    els.search.value = '';
    els.clearBtn.classList.remove('show');
    state.query = '';
    render();
    els.search.focus();
  });

  // ---------- lightbox ----------
  var lightboxIndex = -1;

  function openLightbox(idx) {
    lightboxIndex = idx;
    renderLightbox();
    els.lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    els.lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }
  function renderLightbox() {
    var c = state.flatOrder[lightboxIndex];
    if (!c) return;
    els.lbImg.src = fullUrl(c.url);
    els.lbImg.alt = displayLabel(c);
    els.lbNo.textContent = 'VAULT NO. ' + c.no + ' · ' + c.series;
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
    var next = lightboxIndex + delta;
    if (next < 0 || next >= state.flatOrder.length) return;
    lightboxIndex = next;
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
