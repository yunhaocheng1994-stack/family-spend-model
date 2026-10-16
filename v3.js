/* v3.js — 家庭信息采集 / 显式阈值 / 关键判断参数 / 宏观信号 / 带置信度结论（浏览器端，依赖 Intake、Judge、Household） */
(function () {
  'use strict';
  var I = window.Intake, J = window.Judge, HH = window.Household;
  var fin = function (x) { return typeof x === 'number' && isFinite(x); };
  var AFF = { housing: '买房/租房', car: '买车', joint: '房车组合', emergency: '应急金', insurance: '保险', robust: '稳健性' };
  var LIGHT = { pass: ['通过', 'g'], warn: ['接近', 'y'], fail: ['未通过', 'r'], na: ['待补', 'n'] };
  var DIR = { supports: ['支持', 'g'], challenges: ['挑战', 'r'], neutral: ['中性', 'n'], missing: ['待补', 'n'] };
  function el(tag, a, kids) {
    var n = document.createElement(tag); a = a || {};
    for (var k in a) { if (k === 'text') n.textContent = a[k]; else if (k === 'cls') n.className = a[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), a[k]); else if (a[k] != null) n.setAttribute(k, a[k]); }
    (kids || []).forEach(function (c) { if (c == null) return; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function dot(kind, text) { return el('span', { cls: 'tl tl-' + kind, text: text }); }
  function pct(x, d) { return fin(x) ? (x * 100).toFixed(d == null ? 2 : d) + '%' : '待补'; }
  function fmtVal(v, unit) {
    if (!fin(v)) return '待补';
    if (unit === '比例' || unit === 'ratio') return pct(v, 1);
    if (unit === 'pp') return (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + 'pp';
    if (unit === '元' || unit === '元(名义)') return (v / 1e4).toFixed(1) + '万';
    if (unit === '月') return v.toFixed(1) + ' 个月';
    return String(Math.round(v * 1000) / 1000);
  }
  function wan(x) { return fin(x) ? (x >= 0 ? '+' : '') + (x / 1e4).toFixed(1) + '万' : '—'; }

  var S = { values: null, thrOv: {}, thrAdv: {}, macro: null, sens: null, last: null };

  function initValues() {
    var d = HH.defaults(), v = {};
    I.FIELDS.forEach(function (f) { v[f.key] = f.default; }); // 家庭项一律留空，只预填公共/宏观默认（f.default）
    v.confirmed = {};
    return v;
  }
  function engine(values) {
    var e = I.toEngine(values) || {};
    var inputs = Object.assign(HH.defaults(), e.inputs || {});
    return { inputs: inputs, adv: Object.assign({}, e.adv || {}, S.thrAdv) };
  }

  /* ---------- 左栏：分组采集 ---------- */
  function buildIntake(side, onChange) {
    if (!S.values) S.values = initValues();
    var V = S.values;
    var meter = el('div', { cls: 'meter' });
    function refreshMeter() {
      var c = I.completeness(V);
      meter.textContent = '';
      meter.appendChild(el('div', { cls: 'mt' }, ['信息完整度 ', el('b', { text: c.pct + '%' }), '（' + c.filled + '/' + c.total + '）']));
      meter.appendChild(el('div', { cls: 'bar' }, [el('i', { style: 'width:' + c.pct + '%' })]));
      var pend = c.missing.filter(function (m) { return m.pending; });
      if (pend.length) meter.appendChild(el('div', { cls: 'note warn', text: '待确认 ' + pend.length + ' 项：' + pend.map(function (m) { return m.label; }).join('、') }));
      return c;
    }
    side.appendChild(el('h3', { text: '我们家的情况' }));
    side.appendChild(meter);
    var comp = refreshMeter();
    var missKeys = {}; comp.missing.forEach(function (m) { missKeys[m.key] = m; });
    I.SECTIONS.forEach(function (sec, si) {
      var fs = I.FIELDS.filter(function (f) { return f.section === sec.id; });
      var det = el('details', { cls: 'isec' }); if (si < 2 || sec.id === 'car') det.open = true;
      var nMiss = fs.filter(function (f) { return missKeys[f.key]; }).length;
      det.appendChild(el('summary', null, [sec.label, nMiss ? el('span', { cls: 'badge b-warn', text: '缺 ' + nMiss }) : el('span', { cls: 'badge b-ok', text: '齐' })]));
      det.appendChild(el('div', { cls: 'help', text: sec.help || '' }));
      fs.forEach(function (f) {
        var ctl, cur = V[f.key];
        var set = function (x) { V[f.key] = x; onChange(); };
        if (f.type === 'select') {
          ctl = el('select', { onchange: function () { set(ctl.value === '' ? null : ctl.value); } }, [el('option', { value: '', text: '— 未填 —' })].concat((f.options || []).map(function (o) { var op = el('option', { value: o, text: o }); if (o === cur) op.selected = true; return op; })));
        } else if (f.type === 'bool') {
          ctl = el('select', { onchange: function () { set(ctl.value === '' ? null : ctl.value === '1' ? (f.key === 'charger' ? 1 : true) : (f.key === 'charger' ? 0 : false)); } },
            [['', '— 未填 —'], ['1', '是'], ['0', '否']].map(function (o) { var op = el('option', { value: o[0], text: o[1] }); var c = cur == null ? '' : (cur === true || cur === 1 ? '1' : '0'); if (o[0] === c) op.selected = true; return op; }));
        } else {
          ctl = el('input', { type: 'number', step: 'any', value: fin(cur) ? cur : '', placeholder: '未填' });
          ctl.addEventListener('change', function () { var t = ctl.value.trim(), n = parseFloat(t); set(t === '' || !isFinite(n) ? null : n); });
        }
        var kids = [el('label', { title: f.help || '' }, [f.label + (f.unit ? '（' + f.unit + '）' : '')]), ctl];
        if (f.pending) {
          var cb = el('input', { type: 'checkbox' }); cb.checked = !!V.confirmed[f.key];
          cb.addEventListener('change', function () { V.confirmed[f.key] = cb.checked; onChange(); });
          kids.push(el('label', { cls: 'cf' }, [cb, ' 已确认', V.confirmed[f.key] ? null : el('span', { cls: 'badge b-warn', text: '待确认' })]));
        }
        var m = missKeys[f.key];
        if (m) kids.push(el('div', { cls: 'aff', text: '影响：' + (f.affects || []).map(function (a) { return AFF[a] || a; }).join('、') }));
        det.appendChild(el('div', { cls: 'fld' + (m ? ' miss' : '') }, kids));
      });
      side.appendChild(det);
    });
  }

  /* ---------- 结论门控：关键项未填齐前不出结论 ---------- */
  var REQUIRED = ['male_income', 'female_income', 'cash', 'living', 'area', 'price', 'rent', 'car_need'];
  function missingRequired(values) {
    values = values || S.values || {};
    return REQUIRED.map(function (k) { return I.FIELDS.filter(function (f) { return f.key === k; })[0]; }).filter(function (f) {
      if (!f) return false; var v = values[f.key];
      return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v));
    });
  }
  function sensReady() { var b = (S.sens || {}).base; return !!b && Object.keys(b).length > 0; }
  var GATE_NOTICE = '填写收入、现金、房价、车价等关键项后给出结论';
  function secGate(miss) {
    var txt = '待填写：' + miss.map(function (f) { return f.label; }).join('、');
    var s = el('section', null, [el('h2', { text: '结论与判断' }), el('p', { cls: 'note warn', text: GATE_NOTICE })]);
    var grid = el('div', { cls: 'con3' });
    ['住房：买房还是租房', '用车：买什么车', '房车组合与阈值判断'].forEach(function (t) {
      grid.appendChild(el('div', { cls: 'lx-card ccard gate' }, [el('div', { cls: 'chead' }, [el('span', { cls: 'cid', text: t })]), el('div', { cls: 'bigt mut', text: '待填写' }), el('p', { cls: 'note', text: txt })]));
    });
    s.appendChild(grid);
    return s;
  }

  /* ---------- 右栏 ---------- */
  function evaluate(H) {
    var V = S.values, comp = I.completeness(V), mods = I.modifiers(V);
    var thr = J.evalThresholds(H, V, S.thrOv, mods);
    var par = J.paramTable(H, S.macro, S.sens);
    var sig = J.macroSignals(H, S.macro);
    var con = J.conclusions(H, V, thr, par, sig, comp, mods);
    var lab = {}; (H.options || []).forEach(function (o) { lab[o.id] = o.label; });
    var fix = function (t) { return typeof t === 'string' ? t.replace(/\b(rent|buy_target|buy_cap)\|(rec|down|none)\b/g, function (m) { return lab[m] || m; }).replace(/（none）/g, '（不买车）').replace(/baseBest|maximin|minimaxRegret/g, function (m) { return { baseBest: '基准最优', maximin: '最坏情况最好', minimaxRegret: '最小后悔' }[m]; }) : t; };
    con.forEach(function (c) { c.verdict = fix(c.verdict); c.do = fix(c.do); c.why = (c.why || []).map(fix); c.hedges = (c.hedges || []).map(fix); if (c.confidence) c.confidence.reasons = (c.confidence.reasons || []).map(fix); });
    S.last = { comp: comp, thr: thr, par: par, sig: sig, con: con };
    window.__v3 = S.last;
    return S.last;
  }
  var TH = {}; (J.THRESHOLDS || []).forEach(function (t) { TH[t.id] = t; });
  var PL = {}; (J.PARAMS || []).forEach(function (p) { PL[p.id] = p.label; });

  function secConclusions(H, R) {
    var s = el('section', null, [el('h2', { text: '结论与判断（含置信度）' })]);
    var grid = el('div', { cls: 'con3' });
    R.con.forEach(function (c) {
      var lv = c.confidence || {}, k = lv.level === '高' ? 'g' : lv.level === '中' ? 'y' : 'r';
      var kids = [
        el('div', { cls: 'chead' }, [el('span', { cls: 'cid', text: ({ housing: '住房', car: '用车', joint: '房车组合', emergency: '应急金', insurance: '保险' })[c.id] || c.id }), dot(k, '置信度 ' + (lv.level || '—') + ' · ' + (fin(lv.score) ? lv.score : '—'))]),
        el('div', { cls: 'bigt', text: c.verdict || '待补' }),
        c.do ? el('p', { cls: 'do', text: '怎么做：' + c.do }) : null,
        el('div', { cls: 'k', text: '为什么' }), el('ul', null, (c.why || []).map(function (t) { return el('li', { text: t }); })),
        el('div', { cls: 'k', text: '依据的阈值 / 参数' }),
        el('div', { cls: 'chips' }, ((c.restsOn || {}).thresholds || []).map(function (id) { var t = R.thr.filter(function (x) { return x.id === id; })[0]; return dot(t ? LIGHT[t.light][1] : 'n', (TH[id] || {}).label || id); })
          .concat(((c.restsOn || {}).params || []).map(function (id) { var p = R.par.filter(function (x) { return x.id === id; })[0]; return dot(p ? DIR[p.signal.dir][1] : 'n', PL[id] || id); }))),
      ];
      var mac = c.macro || {};
      if ((mac.supports || []).length) kids.push(el('div', { cls: 'k', text: '宏观支持' }), el('ul', { cls: 'sup' }, mac.supports.map(function (t) { return el('li', { text: t }); })));
      if ((mac.challenges || []).length) kids.push(el('div', { cls: 'k', text: '宏观挑战' }), el('ul', { cls: 'chal' }, mac.challenges.map(function (t) { return el('li', { text: t }); })));
      if ((c.hedges || []).length) kids.push(el('div', { cls: 'k', text: '对冲' }), el('ul', null, c.hedges.slice(0, 4).map(function (t) { return el('li', { text: t }); })));
      kids.push(el('details', null, [el('summary', { text: '置信度如何得出' }), el('ul', null, (lv.reasons || []).map(function (t) { return el('li', { text: t }); }))]));
      grid.appendChild(el('div', { cls: 'lx-card ccard' }, kids));
    });
    s.appendChild(grid);
    return s;
  }

  function secThresholds(H, R, rerun) {
    var s = el('section', null, [el('h2', { text: '判断规则与阈值（可修改）' }),
      el('p', { cls: 'note', text: '每条规则：实际值 vs 阈值，红绿灯与余量。带「引擎」标记的阈值会写回模型并重算。' })]);
    var t = el('table', { cls: 'lx-table thr' });
    t.appendChild(el('thead', null, [el('tr', null, ['规则', '实际值', '阈值(可改)', '默认', '余量', '状态', '依据/来源'].map(function (h) { return el('th', { text: h }); }))]));
    var tb = el('tbody');
    R.thr.forEach(function (r) {
      var d = TH[r.id] || {}, unit = r.unit;
      var scale = (unit === '比例' || unit === 'pp') ? 100 : 1;
      var inp = el('input', { type: 'number', step: 'any', value: fin(r.threshold) ? +(r.threshold * scale).toFixed(4) : '' });
      inp.addEventListener('change', function () {
        var n = parseFloat(inp.value);
        if (!isFinite(n)) { delete S.thrOv[r.id]; if (d.adv) delete S.thrAdv[d.adv]; }
        else { S.thrOv[r.id] = n / scale; if (d.adv) S.thrAdv[d.adv] = n / scale; }
        rerun(!!d.adv);
      });
      var L = LIGHT[r.light] || LIGHT.na;
      tb.appendChild(el('tr', null, [
        el('td', null, [r.label, d.adv ? el('span', { cls: 'badge b-info', text: '引擎' }) : null]),
        el('td', { text: fmtVal(r.value, unit) }),
        el('td', null, [(d.dir === 'min' ? '≥ ' : '≤ '), inp, (scale === 100 ? (unit === 'pp' ? ' pp' : ' %') : (unit ? ' ' + unit : ''))]),
        el('td', { text: fmtVal(d.default, unit) }),
        el('td', { text: fmtVal(r.margin, unit) }),
        el('td', null, [dot(L[1], L[0])]),
        el('td', { cls: 'src', text: (d.rationale || '') + (d.source ? '（' + d.source + '）' : '') })
      ]));
    });
    t.appendChild(tb); s.appendChild(t);
    return s;
  }

  function macroCell(list) {
    return el('div', null, (list || []).map(function (m) {
      return el('div', { cls: 'mv' }, [m.url && /^https?:/.test(m.url) ? el('a', { href: m.url, target: '_blank', text: m.text }) : m.text]);
    }));
  }
  function secParams(H, R) {
    var s = el('section', null, [el('h2', { text: '关键判断参数' }),
      el('p', { cls: 'note', text: '盈亏平衡与敏感性来自 data/sens.json（默认家庭输入下离线重算整套模型；指标：买房(拟买价)−租房 或 有车−不买车 的 2059 年净资产，2026 年价）。g 的盈亏平衡由引擎实时求解。' })]);
    var t = el('table', { cls: 'lx-table par' });
    t.appendChild(el('thead', null, [el('tr', null, ['参数', '采用值', '推导', '宏观证据（来源·日期）', '盈亏平衡', '距离', '敏感性（±Δ）', '宏观信号'].map(function (h) { return el('th', { text: h }); }))]));
    var tb = el('tbody');
    R.par.forEach(function (p) {
      var pctLike = !(p.id === 'elec' || p.id === 'fuel');
      var f = function (x) { return fin(x) ? (pctLike ? pct(x) : x.toFixed(2)) : '—'; };
      var se = p.sensitivity, st = sensReady() ? '—' : '待重算';
      if (se) st = 'Δ=' + (pctLike ? (se.delta * 100).toFixed(1) + 'pp' : se.delta) + '：+Δ ' + wan(se.dNW2059.plus) + ' / −Δ ' + wan(se.dNW2059.minus) + (se.flips ? '（结论翻转）' : '');
      var be = fin(p.breakeven) ? f(p.breakeven) : (!sensReady() && p.id !== 'g') ? '待重算' : ((p.sensMeta && p.sensMeta.beNote) ? '不翻转：' + p.sensMeta.beNote.replace('在 ', '').replace(' 区间内不翻转', '') : '—');
      var D = DIR[p.signal.dir] || DIR.missing;
      tb.appendChild(el('tr', null, [
        el('td', { text: p.label }), el('td', { text: f(p.used) }), el('td', { cls: 'src', text: p.derivation }),
        el('td', null, [macroCell(p.macro)]), el('td', { text: be }),
        el('td', { text: fin(p.distance) ? (pctLike ? (p.distance >= 0 ? '+' : '') + (p.distance * 100).toFixed(2) + 'pp' : p.distance.toFixed(2)) : '—' }),
        el('td', { cls: 'src', text: st }),
        el('td', null, [dot(D[1], D[0]), el('div', { cls: 'src', text: p.signal.text })])
      ]));
    });
    t.appendChild(tb); s.appendChild(t);
    return s;
  }

  function secMacro(H, R) {
    var s = el('section', null, [el('h2', { text: '宏观信号' }), el('p', { cls: 'lx-take', text: R.sig.summary || '' })]);
    var c = R.sig.contradictions || [];
    if (c.length) {
      s.appendChild(el('div', { cls: 'k', text: '与模型默认矛盾的宏观数据（及对结论的影响）' }));
      s.appendChild(el('ul', null, c.map(function (x) { return el('li', null, [dot(x.favors ? 'y' : 'r', x.label), ' ' + x.text + (x.favors ? '　→ 偏向：' + ({ rent: '租房', buy: '买房', ev: '纯电', none: '不买车', ice: '燃油' })[x.favors] : '')]); })));
    }
    var m = (S.macro || {}).series || {};
    var rows = Object.keys(m).map(function (k) { var x = m[k]; return [x.label || k, x.source || '', x.asof || '', x.status === 'ok' ? '已取得' : '待补', x.url]; });
    var t = el('table', { cls: 'lx-table' });
    t.appendChild(el('thead', null, [el('tr', null, ['数据', '来源', '日期', '状态'].map(function (h) { return el('th', { text: h }); }))]));
    var tb = el('tbody');
    rows.forEach(function (r) { tb.appendChild(el('tr', null, [el('td', null, [r[4] && /^https?:/.test(r[4]) ? el('a', { href: r[4], target: '_blank', text: r[0] }) : r[0]]), el('td', { cls: 'src', text: r[1] }), el('td', { text: r[2] }), el('td', null, [dot(r[3] === '已取得' ? 'g' : 'n', r[3])])])); });
    t.appendChild(tb);
    s.appendChild(el('details', null, [el('summary', { text: '已抓取宏观数据清单（data/macro.json，生成于 ' + ((S.macro || {}).generated || '—') + '）' }), t]));
    return s;
  }

  function load(cb) {
    Promise.all(['data/macro.json', 'data/sens.json'].map(function (u) { return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }))
      .then(function (a) { S.macro = a[0] || { series: {} }; S.sens = a[1] || {}; cb(); });
  }
  window.V3 = { S: S, initValues: initValues, engine: engine, buildIntake: buildIntake, evaluate: evaluate, load: load,
    secConclusions: secConclusions, missingRequired: missingRequired, secGate: secGate, GATE_NOTICE: GATE_NOTICE, sensReady: sensReady, secThresholds: secThresholds, secParams: secParams, secMacro: secMacro };
})();
