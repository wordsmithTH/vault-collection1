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
    'gs spider man': 'Giant-Size',
    'g size avengers': 'Giant-Size',
    'giant size avengers': 'Giant-Size',
    'g s cap t america': 'Giant-Size',
    'g s cap t marvel': 'Giant-Size',
    'g s iron man': 'Giant-Size',
    'g s power man': 'Giant-Size',
    'g s s stars': 'Giant-Size',
    'g s super villain team up': 'Giant-Size',
    'g s thor': 'Giant-Size',
    'f four': 'Fantastic Four',
    'ff': 'Fantastic Four',
    'fantastic four ann': 'Fantastic Four Annual',
    'gr lantern': 'DC titles / Green Lantern',
    'green lantern': 'DC titles / Green Lantern',
    'hulk ann': 'Incredible Hulk Annual',
    'ironman sub mariner': 'Iron Man',
    'jim': 'Journey into Mystery',
    'journey into mystery': 'Journey into Mystery',
    'm premiere': 'Marvel Premiere',
    'm spotlight': 'Marvel Spotlight',
    'marvel spotlight': 'Marvel Spotlight',
    'mshsecret wars': 'Marvel Super Heroes: Secret Wars',
    'marvel super heroes secret wars': 'Marvel Super Heroes: Secret Wars',
    'marvel preview': 'Marvel Preview',
    'marvel two in one ann': 'Marvel Two-in-One Annual',
    'n t titans': 'DC titles / New Teen Titans',
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
    'deadly hands kung fu': 'Deadly Hands of Kung Fu',
    'dealy hands kung fu': 'Deadly Hands of Kung Fu',
    'logan s run': "Logan's Run",
    'batman odyssey': 'DC titles / Batman',
    'batman vengeance of bane i': 'DC titles / Batman',
    'blackbolt': 'Black Bolt',
    'superman': 'DC titles / Superman',
    'batman family': 'DC titles / Batman',
    'booster gold': 'DC titles / Booster Gold',
    'dc comics presents': 'DC titles / DC Comics Presents',
    'shazam': 'DC titles / Shazam',
    'tottitans': 'DC titles / Tales of the Teen Titans',
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

  // ---------- featured hero book ----------
  // Vault No. 0583 — Amazing Spider-Man 129, CGC 9.8. Ask Claude to swap
  // this to a different vault number whenever you want a new hero book.
  var FEATURED_BOOK_ID = '1762997519641_ttp5kt';

  // ---------- collection price ----------
  // Update this string directly, or ask Claude to change it.
  var COLLECTION_PRICE = 'Price on request';

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
    heroBook: document.getElementById('hero-book'),
    heroImg: document.getElementById('hero-img'),
    heroTitle: document.getElementById('hero-title'),
    heroGrade: document.getElementById('hero-grade'),
    offerPrice: document.getElementById('offer-price'),
  };

  els.offerPrice.textContent = COLLECTION_PRICE;

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
    if (ov.grade != null) c.grade = ov.grade;
    if (ov.ss != null) c.ss = ov.ss;
    if (ov.ssCount != null) c.ssCount = ov.ssCount;
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
      renderHero();
      render();
    })
    .catch(function (err) {
      els.grid.innerHTML = '<p style="color:#c77;font-family:monospace;">Could not load the vault — ' + err + '</p>';
    });

  // ---------- featured hero ----------
  function renderHero() {
    var book = state.all.filter(function (c) { return c.id === FEATURED_BOOK_ID; })[0];
    if (!book) return; // featured book not found in current data — hero just stays empty
    els.heroImg.src = thumbUrl(book.url, 500);
    els.heroImg.alt = displayLabel(book);
    els.heroImg.addEventListener('load', function () {
      els.heroImg.classList.add('loaded');
    });
    els.heroTitle.textContent = book.title || displayLabel(book);
    els.heroGrade.textContent = book.grade ? 'CGC ' + book.grade : '';
  }

  // ---------- grouping + rendering ----------
  // Series values can express a two-level hierarchy using " / " as the
  // separator, e.g. "DC titles / Aquaman" renders "Aquaman" as a
  // sub-section nested inside a "DC titles" super-section. Anything
  // without " / " renders as a normal flat top-level section, same as
  // before — this is purely additive.
  function sortItems(items) {
    items.sort(function (a, b) {
      if (a.issue != null && b.issue != null) {
        if (a.issue !== b.issue) return a.issue - b.issue;
        return (a.title || '').localeCompare(b.title || '');
      }
      if (a.issue != null) return -1;
      if (b.issue != null) return 1;
      return a.no.localeCompare(b.no);
    });
  }

  function buildSection(name, items, opts) {
    opts = opts || {};
    var section = document.createElement('div');
    section.className = 'group' + (opts.sub ? ' sub-group' : '');

    var header = document.createElement('div');
    header.className = 'group-header' + (opts.uncatalogued ? ' uncatalogued' : '') + (opts.sub ? ' sub-header' : '');
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
    return section;
  }

  function render() {
    var q = state.query.trim().toLowerCase();

    var matches = state.all.filter(function (c) {
      if (!q) return true;
      var hay = (c.title || '') + ' ' + c.no + ' ' + (c.grade || '') + ' ' + c.id;
      return hay.toLowerCase().indexOf(q) !== -1;
    });

    var topLevel = {}; // name -> {type:'flat', items:[]} | {type:'super', subgroups:{name:[]}}
    matches.forEach(function (c) {
      var parts = c.series.split(' / ');
      if (parts.length === 2) {
        var superName = parts[0], subName = parts[1];
        if (!topLevel[superName]) topLevel[superName] = { type: 'super', subgroups: {} };
        (topLevel[superName].subgroups[subName] = topLevel[superName].subgroups[subName] || []).push(c);
      } else {
        if (!topLevel[c.series]) topLevel[c.series] = { type: 'flat', items: [] };
        topLevel[c.series].items.push(c);
      }
    });

    var topNames = Object.keys(topLevel).filter(function (g) { return g !== UNCATALOGUED; });
    topNames.sort(function (a, b) { return a.localeCompare(b); });
    if (topLevel[UNCATALOGUED]) topNames.push(UNCATALOGUED); // always last

    els.grid.innerHTML = '';
    state.flatOrder = [];
    var frag = document.createDocumentFragment();
    var totalGroups = 0;

    topNames.forEach(function (name) {
      var entry = topLevel[name];
      if (entry.type === 'flat') {
        sortItems(entry.items);
        totalGroups++;
        frag.appendChild(buildSection(name, entry.items, { uncatalogued: name === UNCATALOGUED }));
      } else {
        var subNames = Object.keys(entry.subgroups).sort(function (a, b) { return a.localeCompare(b); });
        var superSection = document.createElement('div');
        superSection.className = 'super-group';
        var superHeader = document.createElement('div');
        superHeader.className = 'super-header';
        var h1 = document.createElement('h1');
        h1.textContent = name;
        superHeader.appendChild(h1);
        superSection.appendChild(superHeader);
        subNames.forEach(function (subName) {
          var items = entry.subgroups[subName];
          sortItems(items);
          totalGroups++;
          superSection.appendChild(buildSection(subName, items, { sub: true }));
        });
        frag.appendChild(superSection);
      }
    });

    els.grid.appendChild(frag);

    els.resultCount.innerHTML = q
      ? '<b>' + matches.length + '</b> match' + (matches.length === 1 ? '' : 'es') + ' in ' + totalGroups + ' group' + (totalGroups === 1 ? '' : 's')
      : '<b>' + matches.length + '</b> in the vault · ' + totalGroups + ' groups';
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
