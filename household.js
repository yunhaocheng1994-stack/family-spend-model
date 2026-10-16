/* household.js — unified household decision layer over ModelA / ModelB (UMD) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(function () { return { A: require('./modelA.js'), B: require('./modelB.js') }; });
  } else {
    root.Household = factory(function () { return { A: root.ModelA, B: root.ModelB }; });
  }
})(typeof self !== 'undefined' ? self : this, function (loadEngines) {
  'use strict';

  // ---------------- engine plumbing ----------------
  var E = null, mA = null, mB = null;
  function eng() {
    if (!E) {
      E = loadEngines();
      if (!E || !E.A || !E.B) throw new Error('ModelA/ModelB not available');
      mA = E.A.createModel(); mB = E.B.createModel();
    }
    return E;
  }
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v)) return +v;
    return null;
  }
  function z(v) { return Number.isFinite(v) ? v : 0; }
  function fin(v) { return Number.isFinite(v) ? v : null; }
  function txt(v) { if (v == null) return ''; if (typeof v === 'object') return v.code ? String(v.code) : ''; return String(v); }
  function gA(ref) { return num(mA.get(ref)); }
  function gB(ref) { return num(mB.get(ref)); }
  function cA(sheet, col, row) { return num(mA.get(sheet + '!' + col + row)); }
  function cB(sheet, col, row) { return num(mB.get(sheet + '!' + col + row)); }
  function wan(x) { return Number.isFinite(x) ? (x / 1e4).toFixed(1) + '万' : '—'; }
  function pct(x, d) { return Number.isFinite(x) ? (x * 100).toFixed(d == null ? 1 : d) + '%' : '—'; }
  function has(o, k) { return o && Object.prototype.hasOwnProperty.call(o, k); }

  var SH0 = '现金流_基准', SH8 = '现金流_压力·组合', SHUP = '现金流_乐观';
  var LIQ = 300000;

  // ---------------- family fields ----------------
  var CONF = '沿用原模型示例值，请按家庭实际确认';
  var FAMILY_FIELDS = [
    { key: 'male_income', label: '男方月到手', unit: '元/月', ref: '假设输入!B6', engine: 'A', step: 500, note: '', confirm: false },
    { key: 'female_income', label: '女方月到手', unit: '元/月', ref: '假设输入!B7', engine: 'A', step: 500, note: '', confirm: false },
    { key: 'male_hpf', label: '男方公积金月缴存', unit: '元/月', ref: '假设输入!B8', engine: 'A', step: 100, note: '', confirm: false },
    { key: 'female_hpf', label: '女方公积金月缴存', unit: '元/月', ref: '假设输入!B9', engine: 'A', step: 100, note: '', confirm: false },
    { key: 'cash', label: '现有现金(两人合计)', unit: '元', ref: '假设输入!B10', engine: 'A', step: 10000, note: '', confirm: false },
    { key: 'living', label: '夫妻每月基础生活支出(不含房、孩子)', unit: '元/月', ref: '假设输入!B43', engine: 'A', step: 500, note: '', confirm: false },
    { key: 'child1', label: '一孩出生年份', unit: '年', ref: '假设输入!B44', engine: 'A', step: 1, note: '', confirm: false },
    { key: 'child2', label: '二孩出生年份', unit: '年', ref: '假设输入!B45', engine: 'A', step: 1, note: '', confirm: false },
    { key: 'parent_age', label: '父母年龄', unit: '岁', ref: '假设输入!B51', engine: 'A', step: 1, note: '', confirm: false },
    { key: 'care_parents', label: '将来需要照护的父母人数', unit: '人', ref: '生命周期参数!C26', engine: 'A', step: 1, note: '', confirm: false },
    { key: 'area', label: '目标房源面积', unit: 'm²', ref: '假设输入!B19', engine: 'A', step: 1, note: '', confirm: false },
    { key: 'price', label: '拟买单价', unit: '元/m²', ref: '假设输入!B20', engine: 'A', step: 1000, note: '', confirm: false },
    { key: 'rent', label: '同类房源月租金(元/m²)', unit: '元/m²/月', ref: '假设输入!B21', engine: 'A', step: 1, note: '', confirm: false },
    { key: 'keep_cash', label: '买房后至少保留现金', unit: '元', ref: '假设输入!B17', engine: 'A', step: 10000, note: '', confirm: false },
    { key: 'km', label: '年行驶里程', unit: 'km', ref: '家庭参数!J16', engine: 'B', step: 1000, note: CONF, confirm: true },
    { key: 'charger', label: '能装家充(1/0)', unit: '', ref: '家庭参数!J15', engine: 'B', step: 1, note: CONF, confirm: true },
    { key: 'car_need', label: '最低需要的车价', unit: '元', ref: '家庭参数!J18', engine: 'B', step: 10000, note: CONF, confirm: true },
    { key: 'car_city', label: '用车城市', unit: '深圳/成都', ref: '家庭参数!J5', engine: 'B', step: null, note: '住房固定为深圳', confirm: true },
    { key: 'medical', label: '一次大病/意外支出(元, 2026价)', unit: '元', ref: null, engine: 'X', step: 10000, note: '待补', confirm: false }
  ];

  function defaults() {
    eng();
    var d = {};
    FAMILY_FIELDS.forEach(function (f) {
      if (f.engine === 'A') d[f.key] = has(E.A.inputs, f.ref) ? E.A.inputs[f.ref] : null;
      else if (f.engine === 'B') d[f.key] = has(E.B.inputs, f.ref) ? E.B.inputs[f.ref] : null;
      else d[f.key] = null;
    });
    return d;
  }

  // ---------------- advanced inputs ----------------
  var ADV_SPEC = (function () {
    var L = [];
    [12, 13, 14, 15, 16, 22, 23, 24, 25, 29, 30, 36, 37, 38, 39, 40, 42, 46, 47, 48, 49, 50, 52, 53, 54]
      .forEach(function (r) { L.push(['A', '假设输入', 'B', r]); });
    ['C6', 'C7', 'C8', 'B13', 'B14', 'B15', 'B16', 'C13', 'C14', 'C15'].forEach(function (c) { L.push(['A', '资金配置', c[0], +c.slice(1)]); });
    for (var r = 7; r <= 29; r++) L.push(['A', '生命周期参数', 'C', r]);
    [4, 6, 8, 10, 19, 20, 21, 31, 32].forEach(function (r) { L.push(['B', '约束规则', 'B', r]); });
    for (var r2 = 8; r2 <= 16; r2++) ['B', 'C', 'D', 'E'].forEach(function (c) { L.push(['B', '车辆参数', c, r2]); });
    return L;
  })();
  var POWER_SUFFIX = { B: '(燃油)', C: '(插混)', D: '(纯电)', E: '(HEV)' };
  var _adv = null;
  function buildAdvanced() {
    if (_adv) return _adv;
    eng(); mA.reset(); mB.reset();
    var out = [];
    ADV_SPEC.forEach(function (s) {
      var ref = s[1] + '!' + s[2] + s[3];
      var inp = s[0] === 'A' ? E.A.inputs : E.B.inputs;
      if (!has(inp, ref)) return;
      var m = s[0] === 'A' ? mA : mB;
      var lab = txt(m.get(s[1] + '!A' + s[3])) || ref;
      if (s[1] === '车辆参数') lab += POWER_SUFFIX[s[2]] || '';
      out.push({ ref: ref, engine: s[0], label: lab, default: inp[ref] });
    });
    _adv = out;
    return out;
  }
  function engineOf(ref) {
    eng();
    if (has(E.A.inputs, ref)) return 'A';
    if (has(E.B.inputs, ref)) return 'B';
    var sh = String(ref).split('!')[0];
    return ['约束规则', '车辆参数', '家庭参数', '方案评估', '推荐结果'].indexOf(sh) >= 0 ? 'B' : 'A';
  }

  // ---------------- gFix ----------------
  function gFix() {
    eng(); mA.reset();
    var g = function (r) { return gA('g判断!' + r); };
    var sc = [['B28', 'C28', 'D28'], ['B29', 'C29', 'D29'], ['B30', 'C30', 'D30'], ['B31', 'C31', 'D31']]
      .map(function (a) { return [z(g(a[0])), z(g(a[1])), z(g(a[2]))]; });
    var w = [z(g('E28')), 0.4, z(g('E30')), z(g('E31'))];
    function idx(s, n) {
      var v = Math.pow(1 + s[0], Math.min(n, Math.max(0, s[1]))) * Math.pow(1 + s[2], Math.max(0, n - s[1]));
      return Number.isFinite(v) ? v : 1;
    }
    var idx20 = 0, idx2030 = 0;
    for (var i = 0; i < 4; i++) { idx20 += w[i] * idx(sc[i], 20); idx2030 += w[i] * idx(sc[i], 4); }
    var gg = idx20 > 0 ? Math.pow(idx20, 1 / 20) - 1 : null;
    var dep = z(g('B33'));
    var after = { idx20: fin(idx20), g: fin(gg), gNet: gg == null ? null : fin(gg + dep), idx2030: fin(idx2030), weights: w, scenarios: sc, depreciation: dep };
    var before = { E29: g('E29'), F29: g('F29'), G29: g('G29'), B34: g('B34'), H29: g('H29') };
    var adoptedG = gA('假设输入!B27');
    var f6 = function (v) { return Number.isFinite(v) ? v.toFixed(4) : '—'; };
    var changes = [
      'S2情景权重原单元格被SUM覆盖，修正为0.4；权重合计 = ' + f6(w[0] + w[1] + w[2] + w[3]),
      '原表 E29=' + f6(before.E29) + '，F29=' + f6(before.F29) + '，G29=' + f6(before.G29) + '，B34=' + f6(before.B34) + '，H29=' + f6(before.H29),
      '修正后 20年加权指数=' + f6(after.idx20) + '，年化g=' + pct(after.g, 2) + '，扣折旧后gNet=' + pct(after.gNet, 2) + '，2030指数=' + f6(after.idx2030)
    ];
    return {
      after: after, before: before,
      inferred: ['S2权重0.4 = 1−0.3−0.2−0.1（原表权重单元格被SUM覆盖）'],
      changes: changes, adoptedG: adoptedG,
      note: '模型采用的g（假设输入!B27=' + pct(adoptedG, 2) + '）取整近似为0，修正后g判断不改变主要结论'
    };
  }

  // ---------------- afford-cap solver ----------------
  function minColOK(sheet, col, thr) {
    for (var r = 5; r <= 60; r++) { var v = cA(sheet, col, r); if (v == null || v < thr) return false; }
    return true;
  }
  function applySets(m, sets) { for (var k in sets) if (has(sets, k)) m.set(k, sets[k]); }
  function solveAffordCap(sheet, extraSets) {
    eng();
    var sh = String(sheet || '基准'); if (sh.indexOf('现金流_') !== 0) sh = '现金流_' + sh;
    extraSets = extraSets || {};
    mA.reset(); applySets(mA, extraSets);
    var area = gA('假设输入!B19');
    if (!area || area <= 0) return null;
    function ok(P) { mA.reset(); applySets(mA, extraSets); mA.set('假设输入!B20', P / area); return minColOK(sh, 'R', LIQ); }
    var lo = 1e6, hi = 3e7;
    if (!ok(lo)) return null;
    if (ok(hi)) return hi;
    for (var i = 0; i < 45; i++) { var mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
    return lo;
  }

  function regression() {
    eng(); mA.reset(); mB.reset();
    var A = {}, B = {};
    ['结论!B7', '结论!B8', '结论!B12', '结论!B13', '结论!B23', '结论!B24'].forEach(function (r) { var v = mA.get(r); A[r] = num(v) != null ? num(v) : txt(v); });
    ['推荐结果!B11', '推荐结果!B12', '推荐结果!B13', '推荐结果!B14'].forEach(function (r) { var v = mB.get(r); B[r] = num(v) != null ? num(v) : txt(v); });
    var caps = {
      stress: solveAffordCap('压力·组合', {}), flat: solveAffordCap('压力·房价持平', {}),
      base: solveAffordCap('基准', {}), extreme4: solveAffordCap('压力·组合', { '生命周期参数!F26': 4 })
    };
    var round = {}; for (var k in caps) round[k] = caps[k] == null ? null : Math.round(caps[k]);
    return { A: A, B: B, affordCaps: caps, affordCapsRounded: round, expected: {} };
  }

  // ---------------- labels ----------------
  var HL = { rent: '租房', buy_target: '买房(拟买价)', buy_cap: '买房(出价上限)' };
  var CL = { rec: '推荐车', down: '降一档车', none: '不买车' };
  var PN = { A: '燃油', B: '插混/增程', C: '纯电', D: '油电HEV' };
  function powerName(p) {
    if (typeof p === 'string' && PN[p.trim()]) return PN[p.trim()];
    var n = num(p); if (n != null && n >= 1 && n <= 4) return PN['ABCD'[n - 1]];
    return txt(p);
  }

  // ---------------- run ----------------
  function run(inputs, advancedOverrides, opts) {
    var t0 = Date.now();
    eng();
    opts = opts || {};
    var prog = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var D = defaults();
    var I = {};
    FAMILY_FIELDS.forEach(function (f) {
      var v = inputs && has(inputs, f.key) ? inputs[f.key] : undefined;
      if (f.key === 'car_city') I[f.key] = (v === '深圳' || v === '成都') ? v : (D[f.key] || '深圳');
      else if (f.key === 'medical') I[f.key] = (v == null || v === '') ? null : num(v);
      else { var n = num(v); I[f.key] = n != null ? n : num(D[f.key]); }
    });
    var flags = [];
    var famA = {}, advA = {}, advB = {};
    FAMILY_FIELDS.forEach(function (f) { if (f.engine === 'A' && Number.isFinite(I[f.key])) famA[f.ref] = I[f.key]; });
    var adv = advancedOverrides || {};
    for (var ref in adv) if (has(adv, ref)) {
      var v = num(adv[ref]); if (v == null) continue;
      if (engineOf(ref) === 'A') advA[ref] = v; else advB[ref] = v;
    }
    var baseSets = Object.assign({}, famA, advA);
    var living = z(I.living);

    // base read
    mA.reset(); applySets(mA, baseSets);
    var pi = z(gA('假设输入!B42')), R_nom = z(gA('资金配置!C17'));
    var r_real = (1 + R_nom) / (1 + pi) - 1;
    var capUnit = gA('结论!B23');
    var bv = { age: z(cA(SH0, 'B', 5)), B12: z(gA('假设输入!B12')), B13: z(gA('假设输入!B13')), B17: z(gA('假设输入!B17')) };
    var priceUnit = gA('假设输入!B20');
    var g_star = gA('合理价格!B15'), g_adopted = gA('假设输入!B27');
    var deflY = function (y) { return Math.pow(1 + pi, y - 2026); };
    prog(0.05, '基础读取完成');

    function hSets(h) { var s = {}; if (h === 'buy_cap' && capUnit != null) s['假设输入!B20'] = capUnit; return s; }

    var SC = [
      { id: 'S0', label: '基准', method: 'engine', approx: '', sets: function () { return {}; } },
      { id: 'S1', label: '2027起男方收入永久−20%', method: 'engine', approx: '', sets: function () { return { '生命周期参数!C14': bv.age + 1, '生命周期参数!C15': 0.2, '生命周期参数!C16': 0 }; } },
      { id: 'S2', label: '男方2027年失业12个月', method: 'engine', approx: '女方失业情景待补', sets: function () { return { '生命周期参数!C14': bv.age + 1, '生命周期参数!C15': 0, '生命周期参数!C16': 12 }; } },
      { id: 'S3a', label: '房价20年累计−20%', method: 'engine', approx: '', sets: function () { return { '生命周期参数!C5': Math.pow(0.8, 1 / 20) - 1 }; } },
      { id: 'S3b', label: '房价20年累计−30%', method: 'engine', approx: '', sets: function () { return { '生命周期参数!C5': Math.pow(0.7, 1 / 20) - 1 }; } },
      { id: 'S4a', label: '房价立即−20%', method: 'analytic', approx: '不回升假设', sets: null, d: 0.2 },
      { id: 'S4b', label: '房价立即−30%', method: 'analytic', approx: '不回升假设', sets: null, d: 0.3 },
      { id: 'S5', label: '利率+1.5pp', method: 'engine', approx: '近似：自购房起即按高利率，无重定价', sets: function () { return { '假设输入!B12': bv.B12 + 0.015, '假设输入!B13': bv.B13 + 0.015 }; } },
      { id: 'S6', label: '照护冲击(4位父母,75岁起)', method: 'engine', approx: '', sets: function () { return { '生命周期参数!C26': 4, '生命周期参数!C27': 75 }; } },
      { id: 'S7', label: '一次大病/意外', method: 'analytic', approx: '在基准最低现金年份发生，按R_nom复利损失', sets: null },
      { id: 'S8', label: '组合压力', method: 'engine', approx: '模型内置压力·组合表', sets: function () { return {}; } },
      { id: 'up', label: '乐观', method: 'engine', approx: '模型内置乐观表', sets: function () { return {}; } }
    ];
    var SCI = {}; SC.forEach(function (s) { SCI[s.id] = s; });
    var LIQ_SIDS = ['S0', 'S1', 'S2', 'S3a', 'S3b', 'S4a', 'S4b', 'S5', 'S6'];
    var ROB_SIDS = SC.map(function (s) { return s.id; }).filter(function (s) { return s !== 'up'; });

    // ---- car feed ----
    function feedFromA() {
      var F6 = z(cA(SH0, 'F', 6)), H6 = z(cA(SH0, 'H', 6)), F15 = z(cA(SH0, 'F', 15)), H15 = z(cA(SH0, 'H', 15));
      var k = 0, jl = 0;
      for (var r = 6; r <= 15; r++) {
        var d = Math.pow(1 + pi, r - 5);
        k += z(cA(SH0, 'K', r)) / d; jl += (z(cA(SH0, 'J', r)) + z(cA(SH0, 'L', r))) / d;
      }
      var b15 = (F6 + H6) > 0 && (F15 + H15) > 0 ? Math.pow((F15 + H15) / (F6 + H6), 1 / 9) / (1 + pi) - 1 : 0;
      return {
        J6: (F6 + H6) / (1 + pi), rentNet: (z(cA(SH0, 'V', 6)) - z(cA(SH0, 'X', 6))) / (1 + pi),
        mortNet: (z(cA(SH0, 'N', 6)) - z(cA(SH0, 'P', 6))) / (1 + pi), J11: k / 10, J12: jl / 10,
        R5: z(cA(SH0, 'R', 5)), Z5: z(cA(SH0, 'Z', 5)), B15: fin(b15) || 0
      };
    }
    function feedSets(h, f) {
      var buy = h !== 'rent';
      var s = {
        '家庭参数!J5': I.car_city, '家庭参数!J6': f.J6, '家庭参数!J7': 2, '家庭参数!J8': 0,
        '家庭参数!J9': buy ? 0 : f.rentNet, '家庭参数!J10': buy ? f.mortNet : 0,
        '家庭参数!J11': f.J11, '家庭参数!J12': f.J12, '家庭参数!J13': 0,
        '家庭参数!J14': buy ? f.R5 : f.Z5, '家庭参数!J20': r_real,
        '约束规则!B15': f.B15, '约束规则!B16': 0
      };
      if (Number.isFinite(I.charger)) s['家庭参数!J15'] = I.charger;
      if (Number.isFinite(I.km)) s['家庭参数!J16'] = I.km;
      if (Number.isFinite(I.car_need)) s['家庭参数!J18'] = I.car_need;
      return s;
    }
    function runB(h, f) {
      mB.reset(); var s = feedSets(h, f); applySets(mB, s); applySets(mB, advB); return s;
    }
    var CARCOLS = ['A', 'B', 'C', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'Y', 'Z', 'AA', 'AB'];
    function readCars(J6) {
      var rows = [];
      for (var r = 5; r <= 68; r++) {
        var o = { row: r };
        CARCOLS.forEach(function (c) { var raw = mB.get('方案评估!' + c + r); o[c] = (c === 'B' || c === 'AB') ? (num(raw) != null && c !== 'AB' ? num(raw) : txt(raw)) : num(raw); });
        o.eac = z(o.W) * J6;
        rows.push(o);
      }
      return rows;
    }
    function detail(o) {
      if (!o) return null;
      return { row: o.row, price: o.A, power: o.B, powerName: powerName(o.B), loan: o.C, npv: o.N, eac: o.eac, upfront: o.R, dNW_N: o.AA, failed: o.AB, feasible: o.Y === 1, robust: o.Z, savings: o.T, emergency: o.U, dti: o.V, eacRatio: o.W };
    }

    // ---- evaluation runs ----
    function readRun(sheet, h) {
      var cc = h === 'rent' ? 'Z' : 'R', nc = h === 'rent' ? 'AA' : 'T';
      var year = [], cash = [], nw = [];
      for (var r = 5; r <= 60; r++) {
        var y = cA(sheet, 'A', r); year.push(y != null ? y : 2021 + r);
        cash.push(z(cA(sheet, cc, r))); nw.push(z(cA(sheet, nc, r)));
      }
      return { year: year, cash: cash, nw: nw, S6: h === 'rent' ? 0 : z(cA(sheet, 'S', 6)) };
    }
    function metrics(rr, h) {
      var n = rr.year.length, minC = Infinity, minY = null, liq = Infinity, forced = false;
      var ser = { year: [], nw: [], cash: [], nw_nom: [] };
      for (var i = 0; i < n; i++) {
        var y = rr.year[i], d = deflY(y);
        ser.year.push(y); ser.nw.push(rr.nw[i] / d); ser.cash.push(rr.cash[i] / d); ser.nw_nom.push(rr.nw[i]);
        if (rr.cash[i] < minC) { minC = rr.cash[i]; minY = y; }
        var lg = (rr.cash[i] - LIQ) / d; if (lg < liq) liq = lg;
        if (h !== 'rent' && rr.cash[i] < 0) forced = true;
      }
      function at(y) { var i = ser.year.indexOf(y); return i >= 0 ? fin(ser.nw[i]) : null; }
      return {
        nw: { y2031: at(2031), y2036: at(2036), y2056: at(2056), y2059: at(2059), y2081: at(2081) },
        series: ser, minCash: fin(minC), minCashYear: minY, liqGap: fin(liq), forcedSale: forced
      };
    }
    var GROUPS = [['S0', 'S8', 'up'], ['S1'], ['S2'], ['S3a'], ['S3b'], ['S5'], ['S6']];
    var SHEETOF = { S8: SH8, up: SHUP };
    function evalOption(h, carAnnual, extra) {
      var out = { runs: {}, extras: null };
      GROUPS.forEach(function (gp) {
        var sets = Object.assign({}, hSets(h), SCI[gp[0]].sets(), { '假设输入!B43': living + z(carAnnual) / 12 }, extra || {});
        mA.reset(); applySets(mA, baseSets); applySets(mA, sets);
        gp.forEach(function (sid) { out.runs[sid] = readRun(SHEETOF[sid] || SH0, h); });
        if (gp[0] === 'S0') {
          var ex = {};
          ['J', 'K', 'L', 'N', 'O', 'P', 'V', 'W', 'X'].forEach(function (c) { ex[c + '6'] = z(cA(SH0, c, 6)); });
          ex.cap_B11 = z(gA('可负担上限!B11')); ex.cap_B12 = z(gA('可负担上限!B12')); ex.cap_B24 = z(gA('可负担上限!B24'));
          ex.dp = z(gA('假设输入!B24')); ex.B39 = z(gA('假设输入!B39')); ex.B40 = z(gA('假设输入!B40')); ex.g = z(gA('假设输入!B27'));
          out.extras = ex;
        }
      });
      return out;
    }
    function buildCells(opt, ev) {
      var h = opt.housing, cells = {}, M = {};
      Object.keys(ev.runs).forEach(function (sid) { M[sid] = metrics(ev.runs[sid], h); });
      var m0 = M.S0, ex = ev.extras, carA = opt.checks.a;
      var mk = function (sid, m, forced, status) {
        var cp = sid === 'S1' || sid === 'S2' ? opt.carPass[sid] : carA;
        if (status === '待补') return { nw2036: null, nw2059: null, dNW2036: null, dNW2059: null, vsRent2059: null, liqGap: null, minCashYear: null, forcedSale: null, carPass: cp, acceptable: null, status: '待补' };
        var liqReq = LIQ_SIDS.indexOf(sid) >= 0;
        return {
          nw2036: m.nw.y2036, nw2059: m.nw.y2059,
          dNW2036: m.nw.y2036 != null && m0.nw.y2036 != null ? m.nw.y2036 - m0.nw.y2036 : null,
          dNW2059: m.nw.y2059 != null && m0.nw.y2059 != null ? m.nw.y2059 - m0.nw.y2059 : null,
          vsRent2059: null, liqGap: m.liqGap, minCashYear: m.minCashYear, forcedSale: forced,
          carPass: cp, acceptable: !forced && (liqReq ? z(m.liqGap) >= 0 : true) && carA, status: 'ok'
        };
      };
      ['S0', 'S1', 'S2', 'S3a', 'S3b', 'S5', 'S6', 'S8', 'up'].forEach(function (sid) { cells[sid] = mk(sid, M[sid], M[sid].forcedSale, 'ok'); });
      ['S4a', 'S4b'].forEach(function (sid) {
        var d = SCI[sid].d;
        if (h === 'rent') { cells[sid] = mk(sid, m0, m0.forcedSale, 'ok'); return; }
        var base = ex.cap_B11 * (1 + ex.g) * (1 - ex.dp - ex.B39 * ex.B40);
        var equity = ev.runs.S0.S6 - d * base;
        var loss = d * base / (1 + pi);
        var m = { nw: { y2036: m0.nw.y2036 == null ? null : m0.nw.y2036 - loss, y2059: m0.nw.y2059 == null ? null : m0.nw.y2059 - loss }, liqGap: m0.liqGap, minCashYear: m0.minCashYear };
        cells[sid] = mk(sid, m, m0.forcedSale || equity < 0, 'ok');
        cells[sid].equity2027 = fin(equity);
      });
      if (I.medical == null) cells.S7 = mk('S7', null, null, '待补');
      else {
        var rr = ev.runs.S0, y0 = m0.minCashYear || 2027, Mn = I.medical * deflY(y0);
        var r2 = { year: rr.year.slice(), cash: rr.cash.slice(), nw: rr.nw.slice(), S6: rr.S6 };
        for (var i = 0; i < r2.year.length; i++) if (r2.year[i] >= y0) {
          var hit = Mn * Math.pow(1 + R_nom, r2.year[i] - y0); r2.cash[i] -= hit; r2.nw[i] -= hit;
        }
        var m7 = metrics(r2, h); cells.S7 = mk('S7', m7, m7.forcedSale, 'ok');
      }
      return { cells: cells, M: M };
    }
    function worstLiq(cells) {
      var w = Infinity; LIQ_SIDS.forEach(function (s) { var c = cells[s]; if (c && Number.isFinite(c.liqGap) && c.liqGap < w) w = c.liqGap; });
      return fin(w);
    }

    // ---- main loop ----
    var options = [], OPT = {}, carByH = {}, matrix = {};
    var Hs = ['rent', 'buy_target', 'buy_cap'];
    Hs.forEach(function (h, hi) {
      mA.reset(); applySets(mA, baseSets); applySets(mA, hSets(h));
      var f = feedFromA();
      var fs = runB(h, f);
      var demand = gB('推荐结果!B4'), b9 = gB('推荐结果!B9'), b10 = txt(mB.get('推荐结果!B10'));
      var rows = readCars(f.J6);
      var rec = b9 != null && b9 > 0 ? rows[Math.round(b9) - 1] || null : null;
      var lower = rows.filter(function (o) { return o.A != null && demand != null && o.A < demand; }).map(function (o) { return o.A; });
      var down = null;
      if (lower.length) {
        var tier = Math.max.apply(null, lower);
        rows.forEach(function (o) { if (o.A === tier && o.Y === 1 && (down == null || z(o.N) < z(down.N))) down = o; });
      }
      var noneAnnual = z(gB('方案评估!C70')) * z(gB('家庭参数!J30'));
      var none = { I70: gB('方案评估!I70'), G70: gB('方案评估!G70') };
      var loanRate = gB('约束规则!B21');
      var ruleThr = { B4: gB('约束规则!B4'), B6: gB('约束规则!B6'), B8: gB('约束规则!B8'), B10: gB('约束规则!B10') };
      var ruleLab = { B4: txt(mB.get('约束规则!A4')), B6: txt(mB.get('约束规则!A6')), B8: txt(mB.get('约束规则!A8')), B10: txt(mB.get('约束规则!A10')) };
      // S1/S2 car checks
      var cp = {};
      ['S1', 'S2'].forEach(function (sid) {
        mA.reset(); applySets(mA, baseSets); applySets(mA, hSets(h)); applySets(mA, SCI[sid].sets());
        var f2 = feedFromA(); runB(h, f2);
        cp[sid] = { rec: rec ? gB('方案评估!Y' + rec.row) === 1 : null, down: down ? gB('方案评估!Y' + down.row) === 1 : null };
      });
      carByH[h] = { feed: fs, rows: rows, rec: rec, down: down, recStatus: b10, demand: demand, noneAnnual: noneAnnual, none: none, loanRate: loanRate, ruleThr: ruleThr, ruleLab: ruleLab, J6: f.J6, mortNet: f.mortNet, rentNet: f.rentNet };

      [['rec', rec], ['down', down], ['none', null]].forEach(function (cc) {
        var c = cc[0], car = cc[1];
        if (c !== 'none' && !car) return;
        var annual = car ? car.eac : noneAnnual;
        var opt = {
          id: h + '|' + c, housing: h, car: c, label: HL[h] + ' + ' + CL[c], car_detail: detail(car),
          carAnnual: fin(annual), carAnnualNone: fin(noneAnnual),
          carPass: { S1: car ? !!cp.S1[c] : true, S2: car ? !!cp.S2[c] : true },
          checks: { a: car ? car.Y === 1 : true, b: false, c: false, c_base: false }
        };
        var ev = evalOption(h, annual, null);
        var bc = buildCells(opt, ev);
        var m0 = bc.M.S0, ex = ev.extras, buy = h !== 'rent';
        var monthly = (ex.J6 + ex.K6 + ex.L6 + (buy ? ex.N6 - ex.P6 + ex.O6 : ex.V6 - ex.X6 + ex.W6)) / 12 / (1 + pi);
        var after = ev.runs.S0.cash[1] / (1 + pi) - (car ? z(car.R) : 0);
        var reserve = Math.max(buy ? ex.cap_B24 : 0, 6 * monthly);
        opt.post = { after: fin(after), reserve: fin(reserve), pass: after >= reserve };
        opt.checks.b = opt.post.pass;
        opt.checks.c_base = z(m0.minCash) >= LIQ;
        opt.checks.c = opt.checks.c_base && z(bc.M.S8.minCash) >= LIQ;
        opt.nw = m0.nw; opt.series = m0.series; opt.minCash = m0.minCash; opt.minCashYear = m0.minCashYear; opt.liqGap = m0.liqGap;
        opt.minCashS8 = bc.M.S8.minCash;
        opt.failed = [];
        if (!opt.checks.a) opt.failed.push('车辆方案未通过：' + (car && car.AB ? car.AB : '约束未满足'));
        if (!opt.checks.b) opt.failed.push('购车后现金 ' + wan(after) + ' 低于保留线 ' + wan(reserve));
        if (!opt.checks.c) opt.failed.push('生命周期最低现金低于30万（基准或组合压力）');
        opt.feasible = opt.checks.a && opt.checks.b && opt.checks.c;
        opt._ev = ev; opt._ex = ex;
        matrix[opt.id] = bc.cells;
        options.push(opt); OPT[opt.id] = opt;
      });
      prog(0.1 + 0.5 * (hi + 1) / 3, HL[h] + ' 情景计算完成');
    });
    // vsRent
    Object.keys(matrix).forEach(function (id) {
      var ref = matrix['rent|none'];
      Object.keys(matrix[id]).forEach(function (sid) {
        var c = matrix[id][sid], r = ref && ref[sid];
        c.vsRent2059 = c.status === 'ok' && r && r.status === 'ok' && c.nw2059 != null && r.nw2059 != null ? c.nw2059 - r.nw2059 : null;
      });
    });

    // ---- robust ----
    var ids = options.map(function (o) { return o.id; });
    var nw59 = function (id, sid) { var c = matrix[id][sid]; return c && c.status === 'ok' ? c.nw2059 : null; };
    var accept = ids.filter(function (id) { return ROB_SIDS.every(function (s) { var c = matrix[id][s]; return !c || c.status !== 'ok' || c.acceptable; }); });
    var pool = accept.length ? accept : ids;
    function argmax(list, fn) { var b = null, bv2 = -Infinity; list.forEach(function (id) { var v = fn(id); if (Number.isFinite(v) && v > bv2) { bv2 = v; b = id; } }); return b || list[0] || null; }
    var baseBest = argmax(pool, function (id) { return nw59(id, 'S0'); });
    var minOf = {}, regretOf = {};
    pool.forEach(function (id) {
      var mn = Infinity; ROB_SIDS.forEach(function (s) { var v = nw59(id, s); if (Number.isFinite(v) && v < mn) mn = v; }); minOf[id] = fin(mn);
    });
    var maximin = argmax(pool, function (id) { return minOf[id]; });
    pool.forEach(function (id) {
      var mr = 0;
      ROB_SIDS.forEach(function (s) {
        var v = nw59(id, s); if (!Number.isFinite(v)) return;
        var best = -Infinity; pool.forEach(function (o) { var w = nw59(o, s); if (Number.isFinite(w) && w > best) best = w; });
        if (best - v > mr) mr = best - v;
      });
      regretOf[id] = mr;
    });
    var mmr = null; pool.forEach(function (id) { if (mmr == null || regretOf[id] < regretOf[mmr]) mmr = id; });
    var bb0 = z(nw59(baseBest, 'S0')), mm0 = z(nw59(maximin, 'S0'));
    var chosen = (bb0 - mm0) <= 0.05 * Math.abs(bb0) ? maximin : baseBest;
    var rstatus = !accept.length ? 'red' : (chosen === baseBest ? 'green' : 'yellow');
    var robust = { acceptable: accept, baseBest: baseBest, maximin: maximin, minimaxRegret: mmr, minNW2059: minOf, maxRegret: regretOf, regretTol: 0.05, chosen: chosen, status: rstatus };

    // ---- asymmetry ----
    var asym = {};
    ids.forEach(function (id) {
      var up = matrix[id].up.dNW2059, down = null;
      ['S1', 'S2', 'S3a', 'S3b', 'S4a', 'S4b', 'S5', 'S6', 'S7', 'S8'].forEach(function (s) { var c = matrix[id][s]; if (c.status === 'ok' && Number.isFinite(c.dNW2059) && (down == null || c.dNW2059 < down)) down = c.dNW2059; });
      var ratio = Number.isFinite(up) && up > 0 && down != null ? Math.abs(down) / Math.max(up, 1) : null;
      asym[id] = { upside2059: fin(up), downside2059: down, ratio: ratio, note: ratio == null ? '无上行' : '' };
    });
    prog(0.65, '稳健性计算完成');

    // ---- decision ----
    var co0 = OPT[chosen] || options[0];
    // 车：家庭已声明最低需求车价（需求档），按购车模型自身规则在需求档内选；不买车作为对冲选项展示
    var okAll = function (o) { return o && o.checks.a && o.checks.b && o.checks.c; };
    var carPick = okAll(OPT[co0.housing + '|rec']) ? 'rec' : okAll(OPT[co0.housing + '|down']) ? 'down' : 'none';
    var co = OPT[co0.housing + '|' + carPick] || co0;
    var robustCar = co0.car;
    var bestCarByH = {};
    Hs.forEach(function (h) {
      var L = options.filter(function (o) { return o.housing === h; });
      var P = L.filter(function (o) { return o.checks.a && o.checks.b && o.checks.c; });
      var b = argmax((P.length ? P : L).map(function (o) { return o.id; }), function (id) { return nw59(id, 'S0'); });
      bestCarByH[h] = b ? OPT[b].car : null;
    });
    var rentSame = OPT['rent|' + co.car] || OPT['rent|none'];
    var hReason = [];
    var bt = OPT['buy_target|' + co.car] || OPT['buy_target|' + bestCarByH.buy_target];
    if (bt && rentSame) {
      var dd = z(bt.nw.y2059) - z(rentSame.nw.y2059);
      hReason.push('买房(拟买价) 2059 年净资产比租房' + (dd >= 0 ? '多 ' : '少 ') + wan(Math.abs(dd)) + '（2026年价）');
    }
    if (priceUnit != null && capUnit != null) hReason.push('拟买单价 ' + Math.round(priceUnit) + ' ' + (priceUnit > capUnit ? '高于' : '不高于') + '出价上限 ' + Math.round(capUnit) + ' 元/m²');
    if (!co.feasible) hReason.push('所选方案仍有未通过项：' + co.failed.join('；'));
    hReason.push(rstatus === 'green' ? '基准最优方案同时满足稳健性要求' : rstatus === 'yellow' ? '为降低压力情景损失，选择最坏情景表现最好的方案（基准净资产差距在5%以内）' : '没有方案在全部压力情景下可接受，以下为基准最优，需谨慎');
    var hd36 = rentSame && co.housing !== 'rent' ? z(co.nw.y2036) - z(rentSame.nw.y2036) : 0;
    var hd59 = rentSame && co.housing !== 'rent' ? z(co.nw.y2059) - z(rentSame.nw.y2059) : 0;

    var cd = co.car_detail, chC = carByH[co.housing], cReason = [];
    if (cd) {
      cReason.push('车价 ' + wan(cd.price) + '，' + cd.powerName + '，' + (z(cd.loan) > 0 ? '贷款' : '全款') + '，NPV ' + wan(cd.npv));
      if (z(cd.loan) > 0 && chC.loanRate != null) cReason.push('车贷利率 ' + pct(chC.loanRate) + (chC.loanRate < r_real ? ' 低于' : ' 不低于') + '实际机会成本 ' + pct(r_real, 2) + '（车贷利率待核实）');
      var fl = {}; chC.rows.forEach(function (o) { if (o.A != null && cd.price != null && o.A > cd.price && o.Y !== 1 && o.AB) fl[o.AB] = 1; });
      var fk = Object.keys(fl).slice(0, 3); if (fk.length) cReason.push('更高档位未通过项：' + fk.join('；'));
    } else cReason.push('不买车：年用车替代成本约 ' + wan(co.carAnnual) + '（2026年价）');
    if (chC.recStatus) cReason.push('车辆模型推荐状态：' + chC.recStatus);
    if (co.car !== 'none' && OPT[co.housing + '|none']) { var dn = z(OPT[co.housing + '|none'].nw.y2059) - z(co.nw.y2059); cReason.push('按家庭声明的最低需求车价在需求档内选择；若用车并非刚需，不买车 2059 年净资产可多 ' + wan(dn) + '（2026年价，未计通勤时间价值）'); }

    var decision = {
      housing: { choice: co.housing, label: HL[co.housing], reason: hReason.join('；'), dNW2036: hd36, dNW2059: hd59, bestCarByHousing: bestCarByH },
      car: { choice: co.car, label: CL[co.car], price: cd ? cd.price : null, power: cd ? cd.power : null, powerName: cd ? cd.powerName : null, loan: cd ? cd.loan : null, reason: cReason.join('；') },
      joint: { optionId: co.id, label: co.label, status: rstatus, checks: co.checks, robustOptionId: co0.id, robustCar: robustCar }
    };

    // ---- guardrails ----
    var RT = chC.ruleThr, RL = chC.ruleLab;
    var thrOr = function (v, d) { return Number.isFinite(v) ? v : d; };
    var em = cd ? cd.emergency : chC.none.I70;
    var dti = cd ? cd.dti : (chC.J6 > 0 ? (co.housing === 'rent' ? chC.rentNet : chC.mortNet) / chC.J6 : null);
    var sav = cd ? cd.savings : chC.none.G70;
    var cr = cd ? cd.eacRatio : 0;
    var minLife = Math.min(z(co.minCash), z(co.minCashS8));
    var gr = [
      { key: 'emergency', label: '应急金（购车后流动资金可覆盖月支出）', value: fin(em), threshold: thrOr(RT.B4, 6), unit: '月', pass: z(em) >= thrOr(RT.B4, 6) },
      { key: 'dti', label: '负债收入比（房贷+车贷）/收入', value: fin(dti), threshold: thrOr(RT.B6, 0.5), unit: '比例', pass: z(dti) <= thrOr(RT.B6, 0.5) },
      { key: 'savings', label: '买车后第1年储蓄率', value: fin(sav), threshold: thrOr(RT.B10, 0.15), unit: '比例', pass: z(sav) >= thrOr(RT.B10, 0.15) },
      { key: 'car_ratio', label: '年均用车现金成本/收入', value: fin(cr), threshold: thrOr(RT.B8, 0.15), unit: '比例', pass: z(cr) <= thrOr(RT.B8, 0.15) },
      { key: 'post_cash_gap', label: '购房购车后现金 − 保留线', value: fin(z(co.post.after) - z(co.post.reserve)), threshold: 0, unit: '元(2026价)', pass: co.post.pass },
      { key: 'min_cash_life', label: '生命周期最低现金(基准与组合压力)', value: fin(minLife), threshold: LIQ, unit: '元(名义)', pass: minLife >= LIQ }
    ];

    // ---- thresholds ----
    var gf = gFix();
    var affSets = Object.assign({}, baseSets, { '假设输入!B43': living + z(co.carAnnual) / 12 });
    var afford = {
      stress: solveAffordCap('压力·组合', affSets), flat: solveAffordCap('压力·房价持平', affSets),
      base: solveAffordCap('基准', affSets), extreme4: solveAffordCap('压力·组合', Object.assign({}, affSets, { '生命周期参数!F26': 4 }))
    };
    prog(0.75, '可负担上限完成');
    var kstar = {}, medmax = {};
    options.forEach(function (o) {
      var sets = Object.assign({}, baseSets, hSets(o.housing), { '假设输入!B43': living + z(o.carAnnual) / 12 });
      var col = o.housing === 'rent' ? 'Z' : 'R', mi = z(I.male_income), fe = z(I.female_income);
      var ok = function (k) { mA.reset(); applySets(mA, sets); mA.set('假设输入!B6', mi * k); mA.set('假设输入!B7', fe * k); return minColOK(SH0, col, LIQ); };
      var k = null;
      if (ok(0)) k = 0; else if (ok(1.5)) { var lo = 0, hi = 1.5; for (var i = 0; i < 30; i++) { var md = (lo + hi) / 2; if (ok(md)) hi = md; else lo = md; } k = hi; }
      kstar[o.id] = { k: k, drop: k == null ? null : 1 - k };
      // medical max
      var rr = o._ev.runs.S0, best = Infinity;
      for (var a = 0; a < rr.year.length; a++) {
        var y = rr.year[a]; if (y < 2027 || y > 2081) continue;
        var mn = Infinity;
        for (var b = a; b < rr.year.length; b++) { var v = (rr.cash[b] - LIQ) / Math.pow(1 + R_nom, rr.year[b] - y); if (v < mn) mn = v; }
        var real = mn / deflY(y); if (real < best) best = real;
      }
      medmax[o.id] = fin(best);
    });
    prog(0.88, '收入阈值完成');
    var rate_star = null, btId = OPT['buy_target|' + co.car] ? 'buy_target|' + co.car : (bestCarByH.buy_target ? 'buy_target|' + bestCarByH.buy_target : null);
    if (btId) {
      var bo = OPT[btId];
      var fr = function (r) { mA.reset(); applySets(mA, baseSets); mA.set('假设输入!B43', living + z(bo.carAnnual) / 12); mA.set('假设输入!B12', r); var a = cA(SH0, 'T', 38), b = cA(SH0, 'AA', 38); return a == null || b == null ? null : a - b; };
      var f0 = fr(0), f1 = fr(0.12);
      if (f0 != null && f1 != null && f0 * f1 <= 0) {
        var lo2 = 0, hi2 = 0.12, flo = f0;
        for (var j = 0; j < 30; j++) { var m2 = (lo2 + hi2) / 2, fm = fr(m2); if (fm == null) break; if (fm * flo <= 0) hi2 = m2; else { lo2 = m2; flo = fm; } }
        rate_star = (lo2 + hi2) / 2;
      }
    }
    var btEx = btId ? OPT[btId]._ex : null;
    var drop_insolvent = null;
    if (btEx) { var den = btEx.cap_B11 * (1 - btEx.dp - btEx.B39 * btEx.B40); drop_insolvent = den > 0 ? fin(1 - btEx.cap_B12 / den) : null; }
    var thresholds = {
      g_star: g_star, g_adopted: g_adopted, g_fix: gf.after.gNet, price_cap_unit: capUnit, price_unit: priceUnit,
      afford: afford, income_k_star: kstar, rate_star: rate_star, drop_insolvent: drop_insolvent, medical_max: medmax
    };

    // ---- hedge catalogue ----
    var cat = [];
    function cmp(id, a, b, label, extraNote) {
      var A_ = OPT[a], B_ = OPT[b];
      if (!A_ || !B_) { cat.push({ id: id, label: label, cost2059: null, benefitLiq: null, status: '不适用', note: '缺少对比方案' }); return; }
      cat.push({ id: id, label: label, compare: [b, a], cost2059: fin(z(A_.nw.y2059) - z(B_.nw.y2059)), benefitLiq: fin(z(worstLiq(matrix[a])) - z(worstLiq(matrix[b]))), status: 'ok', note: extraNote || '' });
    }
    if (btId) {
      var bo2 = OPT[btId];
      var ev1 = evalOption('buy_target', bo2.carAnnual, { '假设输入!B17': bv.B17 + 500000 });
      var cells1 = buildCells(bo2, ev1).cells;
      cat.push({ id: 'h1', label: '加大现金缓冲(+50万保留现金)', compare: [btId], cost2059: fin(z(cells1.S0.nw2059) - z(bo2.nw.y2059)), benefitLiq: fin(z(worstLiq(cells1)) - z(worstLiq(matrix[btId]))), status: 'ok', note: '' });
    } else cat.push({ id: 'h1', label: '加大现金缓冲(+50万保留现金)', cost2059: null, benefitLiq: null, status: '不适用', note: '' });
    var cc0 = co.car;
    cmp('h2', 'buy_cap|' + cc0, 'buy_target|' + cc0, '降低出价到出价上限');
    cmp('h3', 'rent|' + cc0, 'buy_target|' + cc0, '先租不买');
    cmp('h4', co.housing + '|down', co.housing + '|rec', '降一档车');
    cmp('h5', co.housing + '|none', co.housing + '|rec', '不买车');
    var total = btEx ? btEx.cap_B11 : null;
    cat.push({ id: 'h6', label: '保留退出选项', exitCost: total == null ? null : fin(total * (btEx.dp + btEx.B39 * btEx.B40)), cost2059: null, benefitLiq: null, status: 'analytic', note: '卖房退出的交易与首付相关成本（名义2026）' });
    cat.push({ id: 'h7', label: '固定利率', cost2059: null, benefitLiq: null, status: '待补', note: '' });
    cat.push({ id: 'h8', label: '保险(重疾/寿险/医疗)', cost2059: null, benefitLiq: null, status: '待补', note: '' });
    cat.push({ id: 'h9', label: '车辆租赁', cost2059: null, benefitLiq: null, status: '待补', note: '' });
    cat.push({ id: 'h10', label: '等待再买', saving: total != null && gf.after.idx2030 != null ? fin(total * (1 - gf.after.idx2030)) : null, cost2059: null, benefitLiq: null, status: 'analytic', note: '依据修正后g判断，非模型主路径' });

    // ---- details ----
    mA.reset(); applySets(mA, baseSets); applySets(mA, hSets(co.housing)); mA.set('假设输入!B43', living + z(co.carAnnual) / 12);
    var bc = {}; ['year', 'F', 'H', 'J', 'K', 'L', 'N', 'P', 'R', 'T', 'V', 'Z', 'AA'].forEach(function (k) { bc[k] = []; });
    for (var r = 5; r <= 60; r++) {
      bc.year.push(cA(SH0, 'A', r));
      ['F', 'H', 'J', 'K', 'L', 'N', 'P', 'R', 'T', 'V', 'Z', 'AA'].forEach(function (k) { bc[k].push(cA(SH0, k, r)); });
    }
    var cf = Object.assign({}, chC.feed);

    // ---- flags ----
    FAMILY_FIELDS.forEach(function (f) { if (f.confirm) flags.push({ code: 'confirm_' + f.key, text: f.label + '：' + f.note, severity: 'warn' }); });
    if (I.medical == null) flags.push({ code: 'medical_missing', text: '大病/意外支出待补，S7情景不参与稳健性判断', severity: 'warn' });
    flags.push({ code: 'car_loan_rate', text: '车贷利率(约束规则!B21)待核实', severity: 'info' });
    flags.push({ code: 'female_jobloss', text: '女方失业情景待补', severity: 'info' });
    flags.push({ code: 'S5_approx', text: '利率情景近似：自购房起即按高利率，无重定价', severity: 'info' });
    flags.push({ code: 'S4_norecover', text: '房价立即下跌情景按不回升假设', severity: 'info' });
    if (rstatus === 'red') flags.push({ code: 'no_acceptable', text: '没有方案在全部压力情景下可接受', severity: 'error' });

    var conventions = [
      '所有报告金额均为2026年实际价格；通胀率π=假设输入!B42=' + pct(pi, 2),
      '住房模型(A)为名义值，第y年数值除以(1+π)^(y−2026)折算',
      '车辆模型(B)为2027年实际价，除以(1+π)折算到2026年价',
      '统一机会成本：名义R=资金配置!C17=' + pct(R_nom, 2) + '，实际r=(1+R)/(1+π)−1=' + pct(r_real, 2) + '，作为车辆模型贴现率(家庭参数!J20)',
      '政策日期2026年9月；2027年购车(住房模型第1年)；车贷利率3.5%待核实',
      '车辆模型实际收入增长率=2027–2036年名义复合增长率按费雪公式去通胀；实际支出增长率=0',
      '流动性底线：住房模型自带30万名义现金阈值',
      '用车年成本并入住房模型基础生活支出(假设输入!B43)，按2026年价计并随通胀增长'
    ];

    options.forEach(function (o) { delete o._ev; delete o._ex; });
    prog(1, '完成');
    return {
      meta: { basis: 'real2026', pi: pi, R_nom: R_nom, r_real: fin(r_real), policyDate: '2026-09', advUsed: Object.assign({}, adv), conventions: conventions, flags: flags, ms: Date.now() - t0 },
      inputs: I, options: options, decision: decision, guardrails: gr, thresholds: thresholds,
      hedging: {
        scenarios: SC.map(function (s) { return { id: s.id, label: s.label, method: s.method, approx: s.approx, status: s.id === 'S7' && I.medical == null ? '待补' : 'ok' }; }),
        matrix: matrix, asymmetry: asym, catalogue: cat, robust: robust,
        classes: {
          hedgeable: ['S3a', 'S3b', 'S4a', 'S4b', 'S5'], hedgeableNote: '通过租/降价/缓冲',
          partial: ['S1', 'S2', 'S7'], partialNote: '缓冲；保险待补',
          unhedgeable: ['S6', 'S8'], note: '政策风险(养老金、学位) 不可对冲'
        }
      },
      gfix: gf,
      carFeed: Object.assign({ B15: cf['约束规则!B15'], B16: cf['约束规则!B16'] }, cf),
      details: { baseCash: bc, carRows: chC.rows }
    };
  }

  var api = {
    FAMILY_FIELDS: FAMILY_FIELDS, defaults: defaults, run: run, regression: regression,
    gFix: gFix, solveAffordCap: solveAffordCap, num: num
  };
  Object.defineProperty(api, 'ADVANCED', { enumerable: true, get: buildAdvanced });
  return api;
});
