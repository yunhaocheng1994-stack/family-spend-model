// ui.js
(function () {
  'use strict';
  /* ---------- helpers ---------- */
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  function wan(x, d) {
    if (!fin(x)) return '待补';
    var v = x / 1e4;
    if (Math.abs(v) < 0.1 && x !== 0) return Math.round(x).toLocaleString('zh-CN') + '元';
    return v.toFixed(d == null ? 1 : d) + '万';
  }
  function pct(x, d) { return fin(x) ? (x * 100).toFixed(d == null ? 1 : d) + '%' : '待补'; }
  function num(x, d) {
    if (!fin(x)) return '—';
    if (Math.abs(x) >= 1000) return x.toLocaleString('zh-CN', { maximumFractionDigits: d == null ? 0 : d });
    if (Number.isInteger(x)) return String(x);
    return x.toFixed(d == null ? 4 : d);
  }
  function fv(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (typeof v === 'number') return num(v);
    if (Array.isArray(v)) return v.map(fv).join(', ');
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return '—'; } }
    return String(v);
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'text') e.textContent = v;
      else if (k === 'cls') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function table(head, rows, cls) {
    var t = el('table', { cls: cls || '' });
    t.appendChild(el('thead', null, [el('tr', null, head.map(function (h) { return typeof h === 'string' ? el('th', { text: h }) : h; }))]));
    var tb = el('tbody');
    rows.forEach(function (r) {
      if (r instanceof HTMLElement) { tb.appendChild(r); return; }
      tb.appendChild(el('tr', null, r.map(function (c) { return c instanceof HTMLElement ? c : el('td', { text: c == null ? '—' : String(c) }); })));
    });
    t.appendChild(tb);
    return el('div', { cls: 'tblwrap' }, [t]);
  }
  function card(title, kids, note) {
    return el('div', { cls: 'lx-card' }, [el('h3', { text: title }), note ? el('p', { cls: 'note', text: note }) : null].concat(kids || []));
  }
  function badge(text, kind) { return el('span', { cls: 'badge b-' + kind, text: text }); }
  function ck(b) { return el('span', { cls: b ? 'ok' : 'bad', text: b ? '✓' : '✗' }); }
  function splitReason(s) { return String(s || '').split('；').map(function (x) { return x.trim(); }).filter(Boolean); }
  function ul(items) { return el('ul', null, items.map(function (t) { return el('li', { text: t }); })); }

  var tip = document.getElementById('tip');
  function showTip(ev, head, rows) {
    tip.textContent = '';
    tip.appendChild(el('div', { cls: 'lx-tip-h', text: head }));
    rows.forEach(function (r) {
      tip.appendChild(el('div', { cls: 'lx-tip-r' }, [
        r[2] ? el('span', { cls: 'lx-sw', style: 'display:inline-block;width:8px;height:8px;margin-right:4px;background:' + r[2] }) : null,
        el('span', { cls: 'lx-tip-n', text: r[0] + ' ' }), el('span', { cls: 'lx-tip-v', text: r[1] })]));
    });
    tip.style.display = 'block';
    var x = ev.clientX + 14, y = ev.clientY + 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }
  function attachTip(node, head, rowsFn) {
    node.addEventListener('mousemove', function (e) { showTip(e, head, rowsFn()); });
    node.addEventListener('mouseleave', hideTip);
  }

  /* ---------- state ---------- */
  var HH = window.Household;
  var inputs = HH.defaults();
  var defs = HH.defaults();
  var adv = {};
  var H = null, timer = null, charts = [];
  var main = document.getElementById('main');
  var side = document.getElementById('side');
  var overlay = document.getElementById('overlay');

  function fail(e) {
    var p = document.getElementById('err');
    p.style.display = 'block';
    p.textContent = '错误：' + (e && e.stack ? e.stack : String(e));
    overlay.classList.remove('on');
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(compute, 400);
  }
  function compute() {
    overlay.classList.add('on');
    setTimeout(function () {
      try {
        var E3 = window.V3 ? V3.engine(V3.S.values) : { inputs: inputs, adv: {} };
        inputs = E3.inputs;
        H = HH.run(inputs, Object.assign({}, E3.adv, adv), {});
        render();
      } catch (e) { fail(e); }
      overlay.classList.remove('on');
    }, 30);
  }

  /* ---------- left column ---------- */
  function selectFor(key, opts, cur) {
    var s = el('select', { onchange: function () {
      var o = opts[s.selectedIndex]; inputs[key] = o[1]; schedule();
    } }, opts.map(function (o, i) { var op = el('option', { text: o[0], value: String(i) }); if (o[1] === cur) op.selected = true; return op; }));
    return s;
  }
  function boolOpts(d) {
    if (typeof d === 'boolean') return [['是', true], ['否', false]];
    if (typeof d === 'number') return [['是', 1], ['否', 0]];
    return [['是', '是'], ['否', '否']];
  }
  function buildSide() {
    side.textContent = '';
        V3.buildIntake(side, function () { buildSide(); schedule(); });
    side.appendChild(el('button', { cls: 'btn', text: '恢复默认', onclick: function () {
      inputs = HH.defaults(); adv = {}; V3.S.values = null; V3.S.thrOv = {}; V3.S.thrAdv = {}; buildSide(); schedule();
    } }));
    var A = HH.ADVANCED || [];
    var det = el('details', null, [el('summary', { text: '高级参数（' + A.length + ' 项）' })]);
    var groups = {};
    A.forEach(function (a) {
      var g = (a.engine === 'A' ? '住房模型' : '购车模型') + ' · ' + String(a.ref).split('!')[0];
      (groups[g] = groups[g] || []).push(a);
    });
    Object.keys(groups).forEach(function (g) {
      det.appendChild(el('div', { cls: 'grp', text: g }));
      groups[g].forEach(function (a) {
        var cur = a.ref in adv ? adv[a.ref] : a.default;
        var b = badge('≠默认', 'warn');
        var inp = el('input', { type: 'number', step: 'any', value: fin(cur) ? cur : '' });
        var upd = function () { var c = a.ref in adv; b.style.display = c ? '' : 'none'; inp.classList.toggle('chg', c); };
        inp.addEventListener('input', function () {
          var n = parseFloat(inp.value);
          if (inp.value.trim() === '' || !isFinite(n) || n === a.default) delete adv[a.ref]; else adv[a.ref] = n;
          upd(); schedule();
        });
        upd();
        det.appendChild(el('div', { cls: 'fld' }, [el('label', { title: a.ref }, [a.label || a.ref, b]), inp]));
      });
    });
    side.appendChild(det);
  }

  /* ---------- derived ---------- */
  function optMap() { var m = {}; (H.options || []).forEach(function (o) { m[o.id] = o; }); return m; }
  function optLabel(id) { var o = optMap()[id]; return o ? o.label : (id || '—'); }
  function carKey() { return (H.decision && H.decision.car && H.decision.car.choice) || 'none'; }
  function chosenId() { return (H.decision && H.decision.joint && H.decision.joint.optionId) || ''; }
  function scnLabel(id) {
    var s = ((H.hedging || {}).scenarios || []).filter(function (x) { return x.id === id; })[0];
    return s ? s.id + ' ' + s.label : id;
  }

  /* ---------- render ---------- */
  function render() {
    charts = [];
    hideTip();
    var m = H.meta || {};
    document.getElementById('lead').textContent = '基于统一家庭模型（实际值·2026年价格，机会成本 R=' + pct(m.R_nom, 2) + ' 名义 / ' + pct(m.r_real, 2) + ' 实际，政策时点 ' + (m.policyDate || '待补') + '）';
    main.textContent = '';
    var miss = V3.missingRequired();
    if (miss.length) {
      document.getElementById('lead').textContent = V3.GATE_NOTICE + '（还缺 ' + miss.length + ' 项）';
      var R0 = null; try { R0 = V3.evaluate(H); } catch (e) { console.warn(e); }
      [function gate() { return V3.secGate(miss); }, function v3Mac() { return V3.secMacro(H, R0 || { sig: {} }); }].forEach(function (f) {
        try { main.appendChild(f()); } catch (e) { main.appendChild(el('pre', { cls: 'bad', text: f.name + ': ' + e.message })); }
      });
      return;
    }
    var R3 = V3.evaluate(H);
    var rerun = function (eng) { if (eng) schedule(); else render(); };
    [function v3Con() { return V3.secConclusions(H, R3); }, function v3Thr() { return V3.secThresholds(H, R3, rerun); },
     function v3Par() { return V3.secParams(H, R3); }, function v3Mac() { return V3.secMacro(H, R3); },
     secNW, secThresh, secHedge, secDetails].forEach(function (f) {
      try { main.appendChild(f()); } catch (e) { main.appendChild(el('pre', { cls: 'bad', text: f.name + ': ' + e.message })); }
    });
    drawCharts();
  }

  function secDecision() {
    var d = H.decision || {}, hs = d.housing || {}, c = d.car || {}, j = d.joint || {};
    var hBig = hs.label || '待补';
    if (hs.choice === 'rent') hBig = '先租房';
    else if (String(hs.choice).indexOf('buy_cap') === 0) hBig = '买房（不超过 ' + num((H.thresholds || {}).price_cap_unit, 0) + ' 元/m²）';
    else if (String(hs.choice).indexOf('buy') === 0) hBig = '买房（' + (hs.label || '') + '）';
    var cBig;
    if (c.choice === 'none') cBig = '暂不买车';
    else cBig = '买 ' + (fin(c.price) ? (c.price / 1e4).toFixed(0) + ' 万' : '待补价格') + (c.powerName || '') + '，' + (fin(c.loan) && c.loan > 0 ? '贷款 ' + wan(c.loan) : '全款');
    var st = j.status || 'red';
    var stText = { green: '稳健=基准最优', yellow: '稳健方案与基准最优不同', red: '无方案全部通过' }[st] || st;
    var chk = j.checks || {};
    var cw = [['a', '购车模型四项约束'], ['b', '购房购车后现金不低于保留线'], ['c', '一生最低现金≥30万（含组合压力）']];
    var jointKids = [
      el('div', { cls: 'bigt', text: j.label || '待补' }),
      el('div', null, [el('span', { cls: 'pill p-' + st, text: stText })]),
      el('ul', { style: 'list-style:none;padding-left:0' }, cw.map(function (x) {
        return el('li', null, [ck(!!chk[x[0]]), ' ' + x[0] + '. ' + x[1]]);
      }))
    ];
    if (j.robustOptionId && j.robustOptionId !== j.optionId) jointKids.push(el('p', { cls: 'note warn', text: '若只看稳健性：' + optLabel(j.robustOptionId) }));
    return el('div', { cls: 'dec3' }, [
      card('住房决定', [el('div', { cls: 'bigt', text: hBig }), ul(splitReason(hs.reason))]),
      card('购车决定', [el('div', { cls: 'bigt', text: cBig }), ul(splitReason(c.reason))]),
      card('综合结论', jointKids)
    ]);
  }

  function gVal(g) {
    var u = g.unit || '';
    if (u === '月') return [fin(g.value) ? g.value.toFixed(1) + '月' : '待补', fin(g.threshold) ? g.threshold + '月' : '—'];
    if (u === '%' || u === '比例') return [pct(g.value), pct(g.threshold)];
    if (u.indexOf('元') >= 0) return [wan(g.value), wan(g.threshold)];
    return [num(g.value, 2) + u, num(g.threshold, 2) + u];
  }
  function secGuard() {
    var s = el('section', null, [el('h2', { text: '护栏' })]);
    var tiles = el('div', { cls: 'lx-tiles' });
    (H.guardrails || []).forEach(function (g) {
      var v = gVal(g);
      tiles.appendChild(el('div', { cls: 'lx-tile' }, [
        el('div', { cls: 'k', text: g.label || g.key }),
        el('div', { cls: 'big' }, [v[0] + ' ', ck(!!g.pass)]),
        el('div', { cls: 'ref', text: '门槛：' + v[1] })
      ]));
    });
    s.appendChild(tiles);
    return s;
  }

  function secNW() {
    var s = el('section', null, [el('h2', { text: '净资产影响（5 / 10 / 30 年）' })]);
    var cid = chosenId(), om = optMap(), ch = om[cid] || {};
    var cnw = ch.nw || {};
    var rows = (H.options || []).map(function (o) {
      var nw = o.nw || {};
      var cd = o.car_detail || {};
      var inf = cd.feasible === false;
      var dl = function (y) { return fin(nw[y]) && fin(cnw[y]) ? wan(nw[y] - cnw[y]) : '—'; };
      var tr = el('tr', { cls: (o.id === cid ? 'hl' : '') + (inf ? ' muted' : ''), title: inf ? '不可行：' + (cd.failed || '待补') : null },
        [o.label + (o.id === cid ? ' ★' : '') + (inf ? '（不可行）' : ''), wan(nw.y2031), wan(nw.y2036), wan(nw.y2056), dl('y2031'), dl('y2036'), dl('y2056')].map(function (t) { return el('td', { text: t }); }));
      return tr;
    });
    s.appendChild(card('各方案净资产（2026年价）', [table(['方案', '2031', '2036', '2056', 'Δ2031 vs 选定', 'Δ2036', 'Δ2056'], rows)]));
    var ck_ = carKey();
    var ids = [cid, 'buy_target|' + ck_, 'buy_cap|' + ck_, 'rent|none'].filter(function (x, i, a) { return om[x] && a.indexOf(x) === i; });
    var box = el('div', { cls: 'lx-chart', style: 'height:300px' });
    var leg = el('div', { cls: 'lx-legend' });
    var cols = ['#5fb3ff', '#ff9f43', '#c58cff', '#7bd88f'];
    ids.forEach(function (id, i) {
      leg.appendChild(el('span', { cls: 'lx-li' }, [el('span', { cls: 'lx-sw', style: 'background:' + cols[i] }), ' ' + om[id].label]));
    });
    charts.push(function () { lineChart(box, ids.map(function (id, i) { return { name: om[id].label, color: cols[i], s: om[id].series || {} }; })); });
    s.appendChild(card('净资产路径（万元，2026年价）', [leg, box]));
    return s;
  }

  function lineChart(box, list) {
    box.textContent = '';
    var W = Math.max(280, box.clientWidth), Hh = 300, mg = { t: 10, r: 14, b: 26, l: 52 };
    var pts = list.map(function (l) {
      var yr = l.s.year || [], v = l.s.nw || [];
      return yr.map(function (y, i) { return { x: y, y: fin(v[i]) ? v[i] / 1e4 : null }; }).filter(function (p) { return fin(p.x) && p.y != null; });
    });
    var all = [].concat.apply([], pts);
    if (!all.length) { box.appendChild(el('p', { cls: 'mut', text: '待补' })); return; }
    var x = d3.scaleLinear().domain(d3.extent(all, function (p) { return p.x; })).range([mg.l, W - mg.r]);
    var ext = d3.extent(all, function (p) { return p.y; });
    var y = d3.scaleLinear().domain([Math.min(0, ext[0]), ext[1]]).nice().range([Hh - mg.b, mg.t]);
    var svg = d3.select(box).append('svg').attr('width', W).attr('height', Hh);
    svg.append('g').attr('class', 'lx-grid').attr('transform', 'translate(' + mg.l + ',0)')
      .call(d3.axisLeft(y).ticks(5).tickSize(-(W - mg.l - mg.r)).tickFormat(function (d) { return d + '万'; }));
    svg.append('g').attr('transform', 'translate(0,' + (Hh - mg.b) + ')').call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')));
    svg.selectAll('.domain').attr('stroke', 'var(--cds-chart-axis)');
    svg.selectAll('.lx-grid line').attr('stroke', 'var(--cds-chart-grid)');
    svg.append('line').attr('class', 'lx-zero').attr('x1', mg.l).attr('x2', W - mg.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    var ln = d3.line().x(function (p) { return x(p.x); }).y(function (p) { return y(p.y); });
    pts.forEach(function (p, i) {
      svg.append('path').attr('class', 'lx-line').attr('d', ln(p)).attr('fill', 'none').attr('stroke', list[i].color).attr('stroke-width', 2);
    });
    var vl = svg.append('line').attr('y1', mg.t).attr('y2', Hh - mg.b).attr('stroke', 'var(--cds-chart-axis)').style('display', 'none');
    svg.append('rect').attr('x', mg.l).attr('y', mg.t).attr('width', W - mg.l - mg.r).attr('height', Hh - mg.t - mg.b).attr('fill', 'transparent')
      .on('mousemove', function (ev) {
        var yr = Math.round(x.invert(d3.pointer(ev)[0]));
        vl.style('display', null).attr('x1', x(yr)).attr('x2', x(yr));
        showTip(ev, yr + ' 年', pts.map(function (p, i) {
          var q = p.filter(function (z) { return z.x === yr; })[0];
          return [list[i].name, q ? q.y.toFixed(1) + '万' : '—', list[i].color];
        }));
      })
      .on('mouseleave', function () { vl.style('display', 'none'); hideTip(); });
  }

  function secThresh() {
    var t = H.thresholds || {}, s = el('section', null, [el('h2', { text: '什么会改变这个决定' })]);
    var cid = chosenId(), bt = 'buy_target|' + carKey();
    var g = el('div', { cls: 'cols3' });
    g.appendChild(card('房价涨幅门槛', [el('div', { cls: 'bigt', text: 'g* = ' + pct(t.g_star, 2) }),
      ul(['模型采用 g = ' + pct(t.g_adopted, 2), '修正后 g = ' + pct(t.g_fix, 2), (fin(t.g_star) && fin(t.g_fix) ? (t.g_fix >= t.g_star ? '修正后 g 已超过 g*，买房有优势' : '修正后 g 低于 g*，买房不划算') : '待补')])],
      '房价年涨幅（实际）需超过 g* 买房才不亏'));
    var dist = fin(t.price_cap_unit) && fin(t.price_unit) && t.price_unit ? (t.price_unit / t.price_cap_unit - 1) : null;
    g.appendChild(card('出价上限', [el('div', { cls: 'bigt', text: num(t.price_cap_unit, 0) + ' 元/m²' }),
      ul(['拟买单价 ' + num(t.price_unit, 0) + ' 元/m²', dist == null ? '差距 待补' : '拟买价高出上限 ' + pct(dist)])]));
    var af = t.afford || {};
    g.appendChild(card('负担上限总价（名义）', [ul([['stress', '压力'], ['flat', '房价持平'], ['base', '基准'], ['extreme4', '极端']].map(function (k) { return k[1] + '：' + wan(af[k[0]]); }))], '已计入所选车的用车成本'));
    var ik = t.income_k_star || {};
    var ikl = function (id) { var v = ik[id]; return optLabel(id) + '：收入下降超过 ' + (v ? pct(v.drop) : '待补') + ' 时一生最低现金跌破30万'; };
    g.appendChild(card('收入下降容忍度', [ul([ikl(cid), ikl(bt)])]));
    g.appendChild(card('利率门槛', [el('p', { text: fin(t.rate_star) ? '机会成本利率低于 ' + pct(t.rate_star, 2) + ' 时买房更优' : '在 0–12% 区间内买房 2059 年净资产始终不及租房' })]));
    g.appendChild(card('房价暴跌', [el('p', { text: '房价一次性下跌超过 ' + pct(t.drop_insolvent) + ' 资不抵债' })]));
    var mm = t.medical_max || {};
    g.appendChild(card('可承受的一次性大额支出上限', [ul([optLabel(cid) + '：' + wan(mm[cid]), optLabel(bt) + '：' + wan(mm[bt])])]));
    s.appendChild(g);
    return s;
  }

  function secHedge() {
    var hd = H.hedging || {}, s = el('section', null, [el('h2', { text: '对冲与压力测试' })]);
    var opts = H.options || [], mx = hd.matrix || {}, rb = hd.robust || {};
    var acc = rb.acceptable || [];
    var scs = (hd.scenarios || []).filter(function (x) { return x.id !== 'up'; });
    // a heatmap
    var maxAbs = 1;
    opts.forEach(function (o) { scs.forEach(function (sc) { var c = (mx[o.id] || {})[sc.id]; if (c && fin(c.dNW2059)) maxAbs = Math.max(maxAbs, Math.abs(c.dNW2059)); }); });
    var head = ['情景'].concat(opts.map(function (o) { return o.label + (acc.indexOf(o.id) >= 0 ? ' ✓' : ''); }));
    var rows = scs.map(function (sc) {
      var tr = el('tr', null, [el('td', { text: sc.id + ' ' + sc.label })]);
      opts.forEach(function (o) {
        var c = (mx[o.id] || {})[sc.id];
        var td = el('td', { cls: 'cell' });
        if (!c || c.status === '待补' || sc.status === '待补') { td.appendChild(el('span', { cls: 'mut', text: '待补' })); }
        else {
          var v = c.dNW2059, a = fin(v) ? Math.min(1, Math.abs(v) / maxAbs) : 0;
          td.style.background = fin(v) ? (v >= 0 ? 'rgba(60,200,120,' : 'rgba(240,80,80,') + (0.12 + 0.55 * a).toFixed(2) + ')' : '';
          td.appendChild(el('div', { text: wan(v) }));
          var l2 = el('div', { cls: 'l2' + (fin(c.liqGap) && c.liqGap < 0 ? ' bad' : ''), text: (fin(c.liqGap) && c.liqGap < 0 ? '缺口 ' : '余量 ') + wan(c.liqGap) + (c.forcedSale ? ' ⚠卖房' : '') });
          td.appendChild(l2);
          if (c.acceptable === false) td.classList.add('unacc');
        }
        attachTip(td, sc.label + ' · ' + o.label, function () {
          return [['方法', (sc.method || '—') + (sc.approx ? '（' + sc.approx + '）' : '')],
            ['2059净资产', c ? wan(c.nw2059) : '待补'], ['Δ2059', c ? wan(c.dNW2059) : '待补'],
            ['流动性余量(负=缺口)', c ? wan(c.liqGap) : '待补'], ['被迫卖房', c ? fv(!!c.forcedSale) : '—'], ['可接受', c ? fv(c.acceptable !== false) : '—']];
        });
        tr.appendChild(td);
      });
      return tr;
    });
    s.appendChild(card('情景 × 方案（2059年净资产相对基准变化，万元）', [table(head, rows, 'hm')], '红框=不可接受；第二行为一生最低现金相对30万保留线的余量（负数=缺口）；列标 ✓ 为稳健可接受方案'));
    // b robust
    var rk = ['baseBest', '基准最优'], items = [['baseBest', '基准最优'], ['maximin', '最坏情景最好（maximin）'], ['minimaxRegret', '最小最大遗憾'], ['chosen', '最终稳健选择']];
    var rrows = opts.map(function (o) {
      return el('tr', { cls: o.id === rb.chosen ? 'hl' : '' }, [o.label, wan((rb.minNW2059 || {})[o.id]), wan((rb.maxRegret || {})[o.id]), acc.indexOf(o.id) >= 0 ? '✓' : '✗'].map(function (t) { return el('td', { text: t }); }));
    });
    s.appendChild(card('稳健选择 vs 基准最优', [
      el('div', null, [el('span', { cls: 'pill p-' + (rb.status || 'red'), text: ({green:'稳健方案 = 基准最优',yellow:'稳健方案与基准最优不同',red:'无方案全部通过'})[rb.status] || '待补' })]),
      ul(items.map(function (k) { return k[1] + '：' + optLabel(rb[k[0]]); })),
      el('p', { cls: 'note', text: '可接受方案：不被迫卖房、S0–S6 流动性缺口≥0、购车约束通过。maximin = 最坏情景下2059年净资产最高；遗憾 = 与该情景最优方案的差距，取最大遗憾最小者（容忍度 ' + pct(rb.regretTol, 0) + '）。' }),
      table(['方案', '最坏2059净资产', '最大遗憾', '可接受'], rrows)
    ]));
    // c asymmetry
    var box = el('div', { cls: 'lx-chart', style: 'height:' + (opts.length * 30 + 40) + 'px' });
    charts.push(function () { divChart(box, opts, hd.asymmetry || {}); });
    s.appendChild(card('上行 vs 下行不对称（2059年，万元）', [box], '绿色向右=最好情景增益，红色向左=最坏情景损失；右侧为 下行/上行 比'));
    // d catalogue
    var cat = hd.catalogue || [];
    var extraKeys = [];
    cat.forEach(function (c) { ['exitCost', 'saving'].forEach(function (k) { if (k in c && extraKeys.indexOf(k) < 0) extraKeys.push(k); }); });
    var stB = function (st) { return st === 'engine' || st === 'ok' ? badge('模型计算', 'ok') : st === 'analytic' ? badge('解析估算', 'warn') : badge('待补', 'mut'); };
    var crow = cat.map(function (c) {
      var r = [el('td', { text: c.label || c.id }), el('td', { text: (c.compare || []).map(optLabel).join(' → ') }),
        el('td', { cls: fin(c.cost2059) ? (c.cost2059 < 0 ? 'bad' : 'ok') : '', text: wan(c.cost2059) }),
        el('td', { text: wan(c.benefitLiq) }), el('td', null, [stB(c.method || c.status)])];
      extraKeys.forEach(function (k) { r.push(el('td', { text: wan(c[k]) })); });
      r.push(el('td', { style: 'white-space:normal;text-align:left;min-width:160px', text: c.note || '' }));
      return el('tr', null, r);
    });
    s.appendChild(card('对冲手段与成本', [table(['手段', '比较', '2059年净资产变化', '最坏流动性改善', '状态'].concat(extraKeys.map(function (k) { return k === 'exitCost' ? '退出成本' : '节省'; })).concat(['说明']), crow)], '负值=成本，正值=收益'));
    // e classes
    var cl = hd.classes || {};
    var col = function (t, ids, note, cls) { return card(t, [ul((ids || []).map(scnLabel)), note ? el('p', { cls: 'note ' + cls, text: note }) : null]); };
    s.appendChild(el('div', { cls: 'cols3' }, [col('可对冲', cl.hedgeable, cl.hedgeableNote, 'ok'), col('部分可对冲', cl.partial, cl.partialNote, 'warn'), col('不可对冲', cl.unhedgeable, cl.note || cl.unhedgeableNote, 'bad')]));
    // f downside detail
    var cid = chosenId(), bt = 'buy_target|' + carKey();
    var det = el('div', { cls: 'lx-grid2' });
    [cid, bt].filter(function (x, i, a) { return a.indexOf(x) === i && mx[x]; }).forEach(function (id) {
      var r = scs.map(function (sc) {
        var c = mx[id][sc.id];
        if (!c) return [sc.id + ' ' + sc.label, '待补', '', '', '', '', ''];
        return [sc.id + ' ' + sc.label, wan(c.nw2059), wan(c.dNW2059), wan(c.liqGap), fin(c.minCashYear) ? c.minCashYear : '—', c.forcedSale ? '⚠是' : '否', c.carPass === false ? '✗' : '✓'];
      });
      det.appendChild(card('下行明细：' + optLabel(id), [table(['情景', '2059净资产', 'Δ2059', '流动性余量(负=缺口)', '最低现金年', '被迫卖房', '购车约束'], r)]));
    });
    s.appendChild(det);
    return s;
  }

  function divChart(box, opts, asy) {
    box.textContent = '';
    var W = Math.max(280, box.clientWidth), rowH = 30, mg = { t: 8, r: 60, b: 24, l: 130 };
    var Hh = opts.length * rowH + mg.t + mg.b;
    var vals = [];
    opts.forEach(function (o) { var a = asy[o.id] || {}; if (fin(a.upside2059)) vals.push(a.upside2059 / 1e4); if (fin(a.downside2059)) vals.push(a.downside2059 / 1e4); });
    var m = d3.max(vals.map(Math.abs)) || 1;
    var x = d3.scaleLinear().domain([-m, m]).nice().range([mg.l, W - mg.r]);
    var svg = d3.select(box).append('svg').attr('width', W).attr('height', Hh);
    svg.append('g').attr('transform', 'translate(0,' + (Hh - mg.b) + ')').call(d3.axisBottom(x).ticks(6).tickFormat(function (d) { return d + '万'; }));
    svg.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', mg.t).attr('y2', Hh - mg.b).attr('stroke', 'var(--cds-chart-axis)');
    opts.forEach(function (o, i) {
      var a = asy[o.id] || {}, y0 = mg.t + i * rowH + 5, h = rowH - 10;
      var gg = svg.append('g');
      gg.append('text').attr('x', mg.l - 6).attr('y', y0 + h / 2 + 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').style('font-size', '11px').text(o.label);
      if (fin(a.upside2059)) gg.append('rect').attr('x', x(0)).attr('y', y0).attr('height', h).attr('width', Math.max(0, x(a.upside2059 / 1e4) - x(0))).attr('fill', 'var(--color-ok)');
      if (fin(a.downside2059)) gg.append('rect').attr('x', x(a.downside2059 / 1e4)).attr('y', y0).attr('height', h).attr('width', Math.max(0, x(0) - x(a.downside2059 / 1e4))).attr('fill', 'var(--color-bad)');
      gg.append('text').attr('x', W - mg.r + 4).attr('y', y0 + h / 2 + 4).attr('fill', 'var(--color-fg-muted)').style('font-size', '11px').text(fin(a.ratio) ? '×' + a.ratio.toFixed(2) : '—');
      gg.append('rect').attr('x', 0).attr('y', y0 - 5).attr('width', W).attr('height', rowH).attr('fill', 'transparent')
        .on('mousemove', function (ev) { showTip(ev, o.label, [['上行', wan(a.upside2059), 'var(--color-ok)'], ['下行', wan(a.downside2059), 'var(--color-bad)'], ['比', fin(a.ratio) ? a.ratio.toFixed(2) : '—'], ['说明', a.note || '—']]); })
        .on('mouseleave', hideTip);
    });
  }

  /* ---------- details ---------- */
  var testRes = null, testErr = false;
  function secDetails() {
    var d = el('details', { style: 'margin-top:24px' }, [el('summary', { text: '明细 / 假设（模型内部）' })]);
    var tabs = [['统一口径与假设', tabConv], ['g判断修正', tabG], ['逐年现金流', tabCash], ['购车方案评估', tabCar], ['回归模式', tabReg], ['数据来源', tabSrc]];
    var bar = el('div', { cls: 'lx-tabs', role: 'tablist' });
    var panes = [];
    tabs.forEach(function (t, i) {
      var pane = el('div', { cls: 'tabpane' + (i === 0 ? ' on' : '') });
      var built = false;
      var b = el('button', { cls: 'lx-tab', role: 'tab', 'aria-selected': i === 0 ? 'true' : 'false', text: t[0], onclick: function () {
        panes.forEach(function (p) { p[0].classList.remove('on'); p[1].setAttribute('aria-selected', 'false'); });
        pane.classList.add('on'); b.setAttribute('aria-selected', 'true');
        if (!built) { built = true; build(); }
      } });
      function build() { try { pane.appendChild(t[1]()); } catch (e) { pane.appendChild(el('pre', { cls: 'bad', text: e.message })); } }
      if (i === 0) { built = true; build(); }
      panes.push([pane, b]);
      bar.appendChild(b);
    });
    d.appendChild(bar);
    panes.forEach(function (p) { d.appendChild(p[0]); });
    return d;
  }
  function tabConv() {
    var m = H.meta || {}, w = el('div');
    w.appendChild(card('统一口径', [ul(m.conventions || [])]));
    var sevC = { warn: 'warn', bad: 'bad', error: 'bad', info: 'mut' };
    w.appendChild(card('提示', [el('ul', null, (m.flags || []).map(function (f) {
      return el('li', { cls: sevC[f.severity] || '', text: '[' + (f.code || '') + '] ' + (f.text || '') });
    }))]));
    var cf = H.carFeed || {};
    w.appendChild(card('住房→购车模型输入（carFeed）', [table(['引用', '值'], Object.keys(cf).map(function (k) { return [k, fv(cf[k])]; }))]));
    return w;
  }
  function tabG() {
    var g = H.gfix || {}, a = g.after || {}, b = g.before || {}, w = el('div');
    w.appendChild(card('修正前', [table(['单元格', '值'], Object.keys(b).map(function (k) { return [k, fv(b[k])]; }))]));
    w.appendChild(card('修正后', [table(['指标', '值'], ['idx20', 'g', 'gNet', 'idx2030', 'depreciation'].map(function (k) { return [k, k.charAt(0) === 'g' || k === 'depreciation' ? pct(a[k], 2) : num(a[k])]; }))]));
    var sc = a.scenarios || [], wt = a.weights || [];
    w.appendChild(card('情景参数', [table(['情景', 'g1', 'y1', 'g2', 'w', '权重'], sc.map(function (r, i) {
      r = r || [];
      return ['S' + (i + 1), pct(r[0], 2), fv(r[1]), pct(r[2], 2), fv(r[3]), fin(wt[i]) ? wt[i].toFixed(2) : '—'];
    }))]));
    w.appendChild(card('推断项', (g.inferred || []).map(function (t) { return el('div', { cls: 'amber', text: t }); })));
    w.appendChild(card('修改', [ul(g.changes || []), el('p', { cls: 'note', text: '采用 g = ' + pct(g.adoptedG, 2) + '；' + (g.note || '') })]));
    return w;
  }
  function tabCash() {
    var bc = (H.details || {}).baseCash || {}, keys = Object.keys(bc), yr = bc.year || [];
    var cols = keys.filter(function (k) { return k !== 'year'; });
    return table(['年份'].concat(cols), yr.map(function (y, i) { return [y].concat(cols.map(function (k) { var v = (bc[k] || [])[i]; return fin(v) ? num(v, 0) : '—'; })); }));
  }
  function tabCar() {
    var rows = (H.details || {}).carRows || [], keys = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    return table(keys, rows.map(function (r) { return keys.map(function (k) { var v = r[k]; return fin(v) && Math.abs(v) < 1000 && !Number.isInteger(v) ? v.toFixed(4) : fv(v); }); }));
  }
  function tabReg() {
    var w = el('div'), R = {};
    try { R = HH.regression() || {}; } catch (e) { w.appendChild(el('pre', { cls: 'bad', text: '回归计算失败：' + e.message })); }
    ['A', 'B'].forEach(function (k) {
      var o = R[k] || {};
      w.appendChild(card((k === 'A' ? '住房模型' : '购车模型') + '回归值', [table(['单元格', '值'], Object.keys(o).map(function (c) { return [c, fv(o[c])]; }))]));
    });
    var ac = R.affordCapsRounded || R.affordCaps || {}, ex = R.expected || {};
    var exA = ex.affordCapsRounded || ex.affordCaps || ex;
    var ks = Object.keys(ac);
    w.appendChild(card('负担上限 vs 预期', [table(['项', '计算值', '原始值', '预期', '一致'], ks.map(function (k) {
      var v = ac[k], e = exA ? exA[k] : undefined;
      var eq = v != null && e != null && (fin(v) && fin(e) ? Math.abs(v - e) < 1e-6 : JSON.stringify(v) === JSON.stringify(e));
      return [k, fv(v), fv((R.affordCaps || {})[k]), fv(e), eq ? '✓' : (e == null ? '待补' : '✗')];
    }))]));
    var tw = el('div');
    var fillT = function () {
      tw.textContent = '';
      if (testErr || !testRes) { tw.appendChild(el('p', { cls: 'mut', text: testErr ? '测试结果：待补（test/results.json 无法读取）' : '加载中…' })); return; }
      tw.appendChild(el('p', { cls: 'note', text: '测试时间：' + (testRes.time || '待补') }));
      [['excel_match', '逐格对 Excel'], ['lo_perturb', '扰动测试'], ['unified_sanity', '统一模型合理性']].forEach(function (k) {
        var r = testRes[k[0]] || {};
        tw.appendChild(el('div', null, [el('strong', { text: k[1] + ' ' }), r.pass === true ? badge('通过', 'ok') : r.pass === false ? badge('失败', 'bad') : badge('待补', 'mut')]));
        tw.appendChild(el('pre', { text: r.out == null ? '待补' : (typeof r.out === 'string' ? r.out : fv(r.out)) }));
      });
    };
    fillT();
    if (!testRes && !testErr) loadTests(fillT);
    w.appendChild(card('自动测试', [tw]));
    w.appendChild(el('p', null, [el('a', { href: 'v1/index.html', text: '回归模式（v1 原始双模型面板，逐格复现 Excel）' })]));
    return w;
  }
  function tabSrc() {
    return card('数据来源', [el('p', { text: '住房模型数据来源见 v1 面板『假设与来源』；购车模型说明见 v1' }), el('a', { href: 'v1/index.html', text: '打开 v1 面板' })]);
  }
  function loadTests(cb) {
    fetch('test/results.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { testRes = j || {}; cb(); })
      .catch(function () { testErr = true; cb(); });
  }

  function drawCharts() { charts.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  var rz;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(drawCharts, 200); });

  /* ---------- init ---------- */
  try {
    if (!HH) throw new Error('Household 未加载');
    V3.load(function () { try { buildSide(); compute(); } catch (e) { fail(e); } });
  } catch (e) { fail(e); }
})();
