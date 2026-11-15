// Token Launch Radar dashboard: renders window.RADAR (written by main.ts
// as data.js), with search, category/chain filters, watchlist toggle,
// sortable columns and a per-protocol detail view with its farm plan.
// No network: every byte the page needs is local. Hash state so a view can
// be linked: #detail=<slug>, #cat=<category>, #watch=1, #q=<text>.

(function () {
  var D = window.RADAR;
  if (!D) { document.getElementById('rows').innerHTML = '<tr><td colspan="9">No data loaded.</td></tr>'; return; }
  var rows = D.rows.slice();
  var live = D.live || [];
  var sel = null;

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(v) {
    if (v === null || v === undefined) return '<span class="flat">n/a</span>';
    var c = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + c + '">' + (v > 0 ? '+' : '') + v.toFixed(1) + '%</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Header stats.
  var top = rows[0];
  document.getElementById('stats').innerHTML =
    '<div><dt>Board</dt><dd>' + rows.length + '<span>pre-token protocols</span></dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + D.watchlist_size + '<span>floor $50M, no token</span></dd></div>' +
    '<div><dt>Top implied</dt><dd>' + money(top ? top.implied_value_usd : 0) + '<span>' + esc(top ? top.name : '') + '</span></dd></div>' +
    '<div><dt>Snapshot</dt><dd>' + esc(D.as_of) + '<span>DefiLlama fetch</span></dd></div>';
  document.getElementById('formula').textContent = D.model_formula + '  ·  model ' + D.model_version;
  document.getElementById('asof').textContent = D.as_of;
  document.getElementById('src').textContent = D.source;

  // Filter option lists, in first-seen order.
  function fillSelect(id, values) {
    var el = document.getElementById(id);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v; el.appendChild(o);
    });
  }
  fillSelect('cat', Array.from(new Set(rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort());
  fillSelect('chain', Array.from(new Set(rows.flatMap(function (r) { return r.chains; }))).sort());

  var qEl = document.getElementById('q'), catEl = document.getElementById('cat'),
      chainEl = document.getElementById('chain'), sortEl = document.getElementById('sort'),
      watchEl = document.getElementById('watch'), liveEl = document.getElementById('live');

  function current() {
    var q = qEl.value.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (watchEl.checked && !r.on_watchlist) return false;
      if (catEl.value && (r.category || 'Uncategorised') !== catEl.value) return false;
      if (chainEl.value && r.chains.indexOf(chainEl.value) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var k = sortEl.value;
    var key = k === 'tvl' ? 'tvl_usd' : k === 'growth' ? 'change_7d' : k === 'age' ? 'age_days' : 'implied_value_usd';
    list.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av === null) av = -Infinity; if (bv === null) bv = -Infinity;
      return bv - av || a.rank - b.rank;
    });
    return list;
  }

  function render() {
    var list = current();
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols';
    document.getElementById('empty').hidden = list.length > 0;
    document.getElementById('rows').innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</b><span>' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ') || '—') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days === null ? '—' : r.age_days + 'd') + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td><button type="button" data-open="' + esc(r.slug) + '">Farm plan</button></td></tr>';
    }).join('');
    document.getElementById('livewrap').hidden = !liveEl.checked;
    if (liveEl.checked) {
      document.getElementById('liverows').innerHTML = live.map(function (r) {
        return '<tr><td><b>' + esc(r.name) + '</b><br><span>' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td><td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
      }).join('');
    }
  }

  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    var box = document.getElementById('detail');
    if (!r) { box.hidden = true; sel = null; render(); return; }
    sel = slug;
    var m = r.model;
    box.innerHTML =
      '<button type="button" class="close" id="closeDetail">Close ×</button>' +
      '<h2>#' + r.rank + ' ' + esc(r.name) + (r.on_watchlist ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<div class="facts"><span>TVL <b>' + money(r.tvl_usd) + '</b></span>' +
      '<span>Implied value <b>' + money(r.implied_value_usd) + '</b></span>' +
      '<span>7-day change <b>' + (r.change_7d === null ? 'not reported' : r.change_7d.toFixed(1) + '%') + '</b></span>' +
      '<span>Tracked since <b>' + esc(r.listed_at || 'unknown') + '</b> (' + (r.age_days === null ? 'age unknown' : r.age_days + ' days, no token recorded') + ')</span>' +
      '<span>Chains <b>' + esc(r.chains.join(', ') || '—') + '</b></span>' +
      '<span>Category <b>' + esc(r.category || '—') + '</b></span></div>' +
      '<p>Value breakdown — sector multiple ' + m.sector_multiple + ' × growth ' + m.growth_factor +
      ' × age ' + m.age_factor + ' × chains ' + m.chain_factor + ' = ' + money(r.implied_value_usd) +
      '. The snapshot records no token for this protocol; that is a record, not a promise of a launch.</p>' +
      '<h2>Farm plan</h2><ol>' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    box.hidden = false;
    box.scrollIntoView({ block: 'start' });
    document.getElementById('closeDetail').addEventListener('click', function () { showDetail(null); });
    render();
  }

  document.getElementById('board').addEventListener('click', function (e) {
    var t = e.target.closest('tr[data-slug]');
    if (t) showDetail(t.getAttribute('data-slug'));
  });
  document.querySelectorAll('th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var map = { rank: 'implied', name: 'implied', tvl: 'tvl', growth: 'growth', age: 'age', implied: 'implied' };
      sortEl.value = map[th.getAttribute('data-k')] || 'implied';
      render();
    });
  });
  [qEl, catEl, chainEl, sortEl, watchEl, liveEl].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  window.addEventListener('hashchange', applyHash);
  function applyHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('q')) qEl.value = h.get('q');
    if (h.get('cat')) catEl.value = h.get('cat');
    if (h.get('watch') === '1') watchEl.checked = true;
    if (h.get('sort')) sortEl.value = h.get('sort');
    render();
    if (h.get('detail')) showDetail(h.get('detail'));
    else if (sel !== null) showDetail(null);
  }

  applyHash();
})();
