(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var I = null;
    try { I = require('./intake.js'); } catch (e) { I = null; }
    module.exports = factory(I);
  } else root.Judge = factory(root.Intake || null);
})(typeof self !== 'undefined' ? self : this, function (Intake) {
  'use strict';

  // ---------- 工具 ----------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var x = Number(v);
    return isFinite(x) ? x : null;
  }
  function get(o, path) {
    var p = path.split('.'), c = o;
    for (var i = 0; i < p.length; i++) { if (c === null || c === undefined) return null; c = c[p[i]]; }
    return c === undefined ? null : c;
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function commas(x) { var s = String(Math.round(Math.abs(x))); return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var fmt = {
    num: function (v, d) { v = num(v); return v === null ? '—' : v.toFixed(d === undefined ? 2 : d); },
    yuan: function (v) { v = num(v); return v === null ? '—' : (v < 0 ? '-' : '') + commas(v); },
    wan: function (v, d) { v = num(v); return v === null ? '—' : (v / 1e4).toFixed(d === undefined ? 1 : d) + '万'; },
    pct: function (v, d) { v = num(v); return v === null ? '—' : (v * 100).toFixed(d === undefined ? 1 : d) + '%'; },
    pp: function (v, d) { v = num(v); return v === null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d === undefined ? 2 : d) + 'pp'; },
    byUnit: function (v, unit) {
      if (num(v) === null) return '待补';
      if (unit === '月') return fmt.num(v, 1) + '个月';
      if (unit === '比例') return fmt.pct(v, 1);
      if (unit === '元') return fmt.wan(v);
      if (unit === 'pp') return fmt.pp(v);
      return fmt.num(v, 2);
    }
  };

  function guard(H, pred) {
    var g = (H && Array.isArray(H.guardrails)) ? H.guardrails : [];
    for (var i = 0; i < g.length; i++) if (g[i] && pred(String(g[i].key || ''))) return g[i];
    return null;
  }
  function advUsed(H, ref, def) {
    var srcs = [get(H, 'adv'), get(H, 'meta.adv'), get(H, 'advOverrides'), get(H, 'meta.advUsed')];
    for (var i = 0; i < srcs.length; i++) if (srcs[i] && num(srcs[i][ref]) !== null) return num(srcs[i][ref]);
    return def;
  }
  function getMods(values) {
    if (Intake && typeof Intake.modifiers === 'function') { try { return Intake.modifiers(values || {}); } catch (e) { } }
    return { emergencyMonthsAdd: 0, insurance: { light: 'na', reasons: [] }, school: { needed: false, text: '' }, housingConfidenceDelta: 0, carMust: null, preferRobust: 'baseBest', notes: [] };
  }
  function annualIncome(H, values) {
    var m = num(values && values.male_income), f = num(values && values.female_income);
    if (m === null && f === null) { m = num(get(H, 'inputs.male_income')); f = num(get(H, 'inputs.female_income')); }
    if (m === null && f === null) return null;
    return ((m || 0) + (f || 0)) * 12;
  }

  // ---------- 阈值 ----------
  var THRESHOLDS = [
    { id: 'emergency', label: '应急金可撑月数', unit: '月', dir: 'min', default: 6, warnBand: 0.25, scale: 6, adv: '约束规则!B4',
      rationale: '失业或大病时，不动用投资、不断供能撑的月数；收入不稳的家庭需要更多。', source: '模型 约束规则!B4（常见理财规划 3–6 个月，取上沿）',
      read: function (H) { var g = guard(H, function (k) { return k === 'emergency'; }); return g ? num(g.value) : null; } },
    { id: 'dti', label: '月还款/月收入（DTI）', unit: '比例', dir: 'max', default: 0.5, warnBand: 0.15, scale: 0.5, adv: '约束规则!B6',
      rationale: '全部月还款占到手收入的比例，超过一半后抗收入波动能力很弱。', source: '模型 约束规则!B6；银行审贷常用 50% 上限',
      read: function (H) { var g = guard(H, function (k) { return k === 'dti'; }); return g ? num(g.value) : null; } },
    { id: 'savings', label: '首年储蓄率', unit: '比例', dir: 'min', default: 0.15, warnBand: 0.3, scale: 0.15, adv: '约束规则!B10',
      rationale: '买房买车后第一年仍能存下的比例，太低说明月月光、没有缓冲。', source: '模型 约束规则!B10',
      read: function (H) { var g = guard(H, function (k) { return k === 'savings'; }); return g ? num(g.value) : null; } },
    { id: 'car_ratio', label: '用车现金成本/收入', unit: '比例', dir: 'max', default: 0.15, warnBand: 0.2, scale: 0.15, adv: '约束规则!B8',
      rationale: '油电、保险、停车、保养和车贷合计占收入比例。', source: '模型 约束规则!B8',
      read: function (H) { var g = guard(H, function (k) { return k === 'car_ratio' || k.indexOf('car_cost') >= 0; }); return g ? num(g.value) : null; } },
    { id: 'min_cash', label: '一生中最低现金余额', unit: '元', dir: 'min', default: 0, warnBand: 0.5, scale: 100000,
      rationale: '模拟期内账上现金的最低点；低于底线意味着某一年会周转不灵。', source: '引擎 guardrails 中流动性（liq）项',
      read: function (H) { var g = guard(H, function (k) { return (k.indexOf('liq') >= 0 || k === 'min_cash_life'); }); return g ? num(g.value) : null; } },
    { id: 'price_premium', label: '拟买价相对合理出价上限的溢价', unit: '比例', dir: 'max', default: 0, warnBand: 0.05, scale: 1,
      rationale: '拟买单价/出价上限−1；大于 0 表示按这个价买，长期净资产不如租房。', source: '引擎 thresholds.price_unit / price_cap_unit',
      read: function (H) { var p = num(get(H, 'thresholds.price_unit')), c = num(get(H, 'thresholds.price_cap_unit')); return (p === null || c === null || c <= 0) ? null : p / c - 1; } },
    { id: 'g_gap', label: '盈亏平衡房价增速 − 采用增速', unit: 'pp', dir: 'max', default: 0, warnBand: 0.5, scale: 0.01, rationale: '房价每年需要实际涨多少买房才不亏（g*），减去模型采用的增速；为正表示买房不利。', source: '引擎 thresholds.g_star / g_adopted',
      read: function (H) { var s = num(get(H, 'thresholds.g_star')), u = num(get(H, 'thresholds.g_adopted')); if (u === null) u = advUsed(H, '假设输入!B27', null); return (s === null || u === null) ? null : s - u; } },
    { id: 'car_price_income', label: '车价/家庭年收入', unit: '比例', dir: 'max', default: 0.5, warnBand: 0.2, scale: 0.5, adv: '约束规则!B12',
      rationale: '软指引：车价不宜超过家庭年收入的一半。', source: '模型 约束规则!B12',
      read: function (H, ctx) {
        var g = guard(H, function (k) { return k.indexOf('car_price') >= 0; }); if (g && num(g.value) !== null) return num(g.value);
        var price = num(get(H, 'decision.car.price')); if (get(H, 'decision.car.choice') === 'none') price = 0;
        var inc = annualIncome(H, ctx && ctx.values); return (price === null || inc === null || inc <= 0) ? null : price / inc;
      } },
    { id: 'drop_insolvent', label: '收入下降多少会资不抵债', unit: '比例', dir: 'min', default: 0.3, warnBand: 0.2, scale: 0.3,
      rationale: '收入永久下降超过这个比例，家庭会资不抵债；越大越抗风险。', source: '引擎 thresholds.drop_insolvent',
      read: function (H) { return num(get(H, 'thresholds.drop_insolvent')); } }
  ];
  var THR_BY_ID = {}; THRESHOLDS.forEach(function (t) { THR_BY_ID[t.id] = t; });

  function evalThresholds(H, values, overrides) {
    values = values || {}; overrides = overrides || {};
    var mods = getMods(values), ctx = { values: values, mods: mods };
    return THRESHOLDS.map(function (t) {
      var v = null; try { v = num(t.read(H, ctx)); } catch (e) { v = null; }
      var ovr = num(overrides[t.id]), thr, src;
      var g = null;
      if (['emergency', 'dti', 'savings', 'car_ratio'].indexOf(t.id) >= 0) g = guard(H, function (k) { return k === t.id; });
      if (t.id === 'min_cash') g = guard(H, function (k) { return (k.indexOf('liq') >= 0 || k === 'min_cash_life'); });
      if (ovr !== null) { thr = ovr; src = 'override'; }
      else if (g && num(g.threshold) !== null) { thr = num(g.threshold); src = 'engine'; }
      else if (t.id === 'min_cash' && num(values.keep_cash) !== null) { thr = num(values.keep_cash); src = 'values'; }
      else { thr = t.default; src = 'default'; }
      if (t.id === 'emergency' && ovr === null && mods.emergencyMonthsAdd) thr += mods.emergencyMonthsAdd;
      var needsRerun = ovr !== null && !!t.adv && ovr !== t.default;
      var out = { id: t.id, label: t.label, value: v, threshold: thr, margin: null, light: 'na', text: '', unit: t.unit, thresholdSource: src, needsRerun: needsRerun };
      if (v === null) { out.text = t.label + '：待补（引擎未给出该值或输入不全）'; return out; }
      var margin = t.dir === 'min' ? v - thr : thr - v;
      out.margin = margin;
      var band = (t.warnBand || 0) * Math.max(Math.abs(thr), t.scale || 1);
      out.light = margin < 0 ? 'fail' : (margin < band ? 'warn' : 'pass');
      var word = { pass: '通过', warn: '接近门槛', fail: '未通过' }[out.light];
      out.text = word + '：' + t.label + ' ' + fmt.byUnit(v, t.unit) + '（门槛 ' + (t.dir === 'min' ? '≥ ' : '≤ ') + fmt.byUnit(thr, t.unit) + '，余量 ' + (margin >= 0 ? '' : '-') + String(fmt.byUnit(Math.abs(margin), t.unit)).replace(/^\+/, '') + '）';
      if (t.id === 'emergency' && mods.emergencyMonthsAdd && ovr === null) out.text += '；已按家庭情况加 ' + mods.emergencyMonthsAdd + ' 个月';
      if (t.id === 'g_gap') out.text += v > 0 ? '；房价需每年实际多涨 ' + fmt.pp(v) + ' 买房才划算' : '；采用增速已高于盈亏平衡，买房有利';
      if (needsRerun) out.text += '（已改门槛，对应引擎引用 ' + t.adv + ' 需重算）';
      return out;
    });
  }

  // ---------- 宏观取值 ----------
  function S(macro, key) {
    var s = get(macro, 'series.' + key) || get(macro, key); if (!s) return null;
    // 适配 data/macro.json 实际结构：cpi.history[] → latest；home_price_70.chain.* → *_last
    if (key === 'cpi' && !s.latest && Array.isArray(s.history) && s.history.length) s = Object.assign({}, s, { latest: s.history[s.history.length - 1] });
    if (key === 'home_price_70' && s.chain) { s = Object.assign({}, s); ['sz_2nd', 'sz_new', 'cd_2nd', 'cd_new'].forEach(function (k) { if (!s[k + '_last'] && Array.isArray(s.chain[k])) s[k + '_last'] = s.chain[k]; }); }
    return s;
  }
  function pick(macro, key, path, toRatio, label) {
    var s = S(macro, key);
    if (!s || s.status === '待补') return { value: null, asof: s ? (s.asof || null) : null, url: s ? (s.url || null) : null, text: (label || key) + '：待补' + (s && s.note ? '（' + s.note + '）' : '') };
    var v = num(get(s, path));
    return { value: v === null ? null : (toRatio ? v / 100 : v), asof: s.asof || null, url: get(s, 'latest.url') || s.url || null, text: (label || s.label) + '：' + (v === null ? '待补' : (toRatio ? v.toFixed(2) + '%' : String(v))) + (s.asof ? '（' + s.asof + '）' : '') };
  }
  function lastOf(macro, key, arrName, field, label) {
    var s = S(macro, key), arr = s && Array.isArray(s[arrName]) ? s[arrName] : [];
    if (!s || s.status === '待补' || !arr.length) return { value: null, asof: null, url: s ? s.url || null : null, text: label + '：待补' };
    var last = arr[arr.length - 1], v = num(last[field]);
    var ratio = v === null ? null : (field === 'yoy' || field === 'mom' ? (v - 100) / 100 : v);
    return { value: ratio, asof: last.month || s.asof || null, url: s.url || null, text: label + '：' + (v === null ? '待补' : (field === 'chain' ? v : (ratio * 100).toFixed(1) + '%')) + '（' + (last.month || s.asof || '') + '）' };
  }
  function wageGrowth(macro) {
    var s = S(macro, 'cn_annual'), a = s && Array.isArray(s.wage_nonprivate) ? s.wage_nonprivate : [];
    if (a.length < 2) return { value: null, asof: null, url: null, text: '城镇非私营单位平均工资增速：待补' };
    var x = num(a[a.length - 1].v), y = num(a[a.length - 2].v);
    if (x === null || y === null || y <= 0) return { value: null, asof: null, url: null, text: '城镇非私营单位平均工资增速：待补' };
    var g = x / y - 1;
    return { value: g, asof: String(a[a.length - 1].year), url: a[a.length - 1].url || null, text: '城镇非私营单位平均工资增速（名义）：' + (g * 100).toFixed(1) + '%（' + a[a.length - 1].year + '）' };
  }
  function cpiYoy(macro) { var p = pick(macro, 'cpi', 'latest.cpi.yoy', true, 'CPI 同比'); return p.value; }
  function missing(text) { return { dir: 'missing', text: text, impact: [] }; }

  // ---------- 参数 ----------
  var PARAMS = [
    { id: 'g', label: '房价实际年增速 g', adv: '假设输入!B27',
      used: function (H) { var v = num(get(H, 'thresholds.g_adopted')); return v === null ? advUsed(H, '假设输入!B27', 0) : v; },
      derivation: '模型默认 0（房价与通胀同步），实际口径；盈亏平衡值 g* 由引擎求解。',
      macro: [
        { series: 'home_price_70', pick: function (m) { return lastOf(m, 'home_price_70', 'sz_2nd_last', 'yoy', '深圳二手住宅同比'); } },
        { series: 'home_price_70', pick: function (m) { return lastOf(m, 'home_price_70', 'sz_2nd_last', 'mom', '深圳二手住宅环比'); } },
        { series: 'home_price_70', pick: function (m) { return lastOf(m, 'home_price_70', 'sz_2nd_last', 'chain', '深圳二手住宅链式指数'); } },
        { series: 'home_price_70', pick: function (m) { return lastOf(m, 'home_price_70', 'cd_2nd_last', 'yoy', '成都二手住宅同比'); } }
      ],
      signal: function (used, mv) {
        var yoy = mv[0] && mv[0].value, cpi = mv._cpi;
        if (yoy === null || yoy === undefined || used === null) return missing('深圳房价数据待补');
        var real = yoy - (cpi || 0);
        var mom = mv[1] && mv[1].value;
        var t = '深圳二手房名义同比 ' + fmt.pct(yoy) + '，扣 CPI 后实际约 ' + fmt.pct(real) + '，模型采用 ' + fmt.pct(used);
        if (real < used - 0.01) return { dir: 'challenges', text: t + '；当前仍在下跌，采用值偏乐观（对买房有利的假设被挑战）' + (mom !== null && mom > 0 ? '，但环比已转正，跌势放缓' : ''), impact: ['housing', 'joint'], favors: 'rent' };
        if (real > used + 0.01) return { dir: 'challenges', text: t + '；近期实际涨幅高于假设，租房结论需复核', impact: ['housing'], favors: 'buy' };
        return { dir: 'supports', text: t + '；与假设基本一致', impact: ['housing'] };
      },
      breakeven: function (H) { return num(get(H, 'thresholds.g_star')); } },
    { id: 'R', label: '家庭资金名义收益率 R', adv: '资金配置!C6',
      used: function (H) { var v = num(get(H, 'meta.R_nom')); return v === null ? 0.0257 : v; },
      derivation: '资金配置!C17 由股票类收益（C6，默认 6%）与存款/债券等加权得出，只读；实际 r = (1+R)/(1+π)−1。',
      macro: [
        { series: 'cgb', pick: function (m) { return pick(m, 'cgb', 'latest.y10', true, '10年国债收益率'); } },
        { series: 'cgb', pick: function (m) { return pick(m, 'cgb', 'latest.y1', true, '1年国债收益率'); } },
        { series: 'deposit_rate', pick: function (m) { return pick(m, 'deposit_rate', 'latest.y3', true, '存款挂牌利率'); } },
        { series: 'us_rates', pick: function (m) { return pick(m, 'us_rates', 'latest.DGS10.value', true, '美国10年国债（全球背景，仅参考）'); } }
      ],
      signal: function (used, mv) {
        var y10 = mv[0] && mv[0].value;
        if (y10 === null || y10 === undefined || used === null) return missing('国债收益率待补');
        var sp = used - y10, t = '模型 R ' + fmt.pct(used, 2) + '，10年国债 ' + fmt.pct(y10, 2) + '，风险溢价 ' + fmt.pp(sp);
        if (sp > 0.015) return { dir: 'challenges', text: t + '；溢价偏高，依赖股票表现；若收益不及预期，租房省下的钱增值更少，会削弱租房优势', impact: ['housing'] };
        if (sp < 0) return { dir: 'challenges', text: t + '；R 低于无风险利率，可能低估租房投资收益', impact: ['housing'] };
        return { dir: 'supports', text: t + '；溢价合理（存款利率待补）', impact: ['housing'] };
      },
      breakeven: function () { return null; } },
    { id: 'pi', label: '长期通胀 π', adv: '假设输入!B42',
      used: function (H) { var v = num(get(H, 'meta.pi')); return v === null ? advUsed(H, '假设输入!B42', 0.02) : v; },
      derivation: '模型 2%（央行目标附近），用于把名义值折成 2026 年价。',
      macro: [
        { series: 'cpi', pick: function (m) { return pick(m, 'cpi', 'latest.cpi.yoy', true, 'CPI 同比'); } },
        { series: 'cpi', pick: function (m) { return pick(m, 'cpi', 'latest.core.yoy', true, '核心 CPI 同比'); } },
        { series: 'us_rates', pick: function (m) { return pick(m, 'us_rates', 'latest.T10YIE.value', true, '美国10年通胀预期（背景）'); } }
      ],
      signal: function (used, mv) {
        var c = mv[0] && mv[0].value, core = mv[1] && mv[1].value;
        if (c === null || c === undefined || used === null) return missing('CPI 待补');
        var t = 'CPI ' + fmt.pct(c) + '、核心 ' + fmt.pct(core) + '，模型 π ' + fmt.pct(used);
        if (used - c > 0.0075) return { dir: 'challenges', text: t + '；实际通胀明显偏低，房贷的实际负担比模型重（低通胀不帮还债）', impact: ['housing', 'joint'], favors: 'rent' };
        if (c - used > 0.0075) return { dir: 'challenges', text: t + '；通胀高于假设', impact: ['housing'] };
        return { dir: 'supports', text: t + '；基本一致', impact: ['housing'] };
      },
      breakeven: function () { return null; } },
    { id: 'mortgage', label: '商业房贷利率', adv: '假设输入!B12',
      used: function (H) { return advUsed(H, '假设输入!B12', 0.0305); },
      derivation: '5年期 LPR 减 45bp（当前首套房常见加点）。',
      macro: [
        { series: 'lpr', pick: function (m) { return pick(m, 'lpr', 'latest.lpr5y', true, '5年期 LPR'); } },
        { series: 'lpr', pick: function (m) { return pick(m, 'lpr', 'latest.lpr1y', true, '1年期 LPR'); } }
      ],
      signal: function (used, mv) {
        var l5 = mv[0] && mv[0].value;
        if (l5 === null || l5 === undefined || used === null) return missing('LPR 待补');
        var implied = l5 - 0.0045, d = used - implied, t = '5Y LPR ' + fmt.pct(l5, 2) + '，减 45bp = ' + fmt.pct(implied, 2) + '，模型 ' + fmt.pct(used, 2);
        if (Math.abs(d) <= 0.001) return { dir: 'supports', text: t + '；一致', impact: ['housing'] };
        return { dir: 'challenges', text: t + '；偏差 ' + fmt.pp(d) + (d < 0 ? '，模型利率偏低，买房成本被低估' : '，模型利率偏高'), impact: ['housing', 'joint'] };
      },
      breakeven: function (H) { return num(get(H, 'thresholds.rate_star')); } },
    { id: 'income_growth', label: '收入增长（男方第1段）', adv: '生命周期参数!C8',
      used: function (H) { return advUsed(H, '生命周期参数!C8', 0.03); },
      derivation: '男方第1段 3%、第2段 1%，女方第1段 2%，实际口径。',
      macro: [
        { series: 'income', pick: function (m) { return pick(m, 'income', 'latest.urban_real', true, '城镇居民可支配收入实际增速'); } },
        { series: 'income', pick: function (m) { return pick(m, 'income', 'latest.urban_nominal', true, '城镇居民可支配收入名义增速'); } },
        { series: 'cn_annual', pick: wageGrowth },
        { series: 'unemployment', pick: function (m) { return pick(m, 'unemployment', 'latest.national', true, '城镇调查失业率'); } }
      ],
      signal: function (used, mv) {
        var r = mv[0] && mv[0].value, u = mv[3] && mv[3].value;
        if (r === null || r === undefined || used === null) return missing('收入增速待补');
        var t = '城镇居民收入实际增速 ' + fmt.pct(r) + '，模型 ' + fmt.pct(used) + (u !== null && u !== undefined ? '，失业率 ' + fmt.pct(u) : '');
        if (used > r + 0.005 || (u !== null && u !== undefined && u >= 0.055)) return { dir: 'challenges', text: t + '；收入增长假设偏乐观，月供压力可能比模型大', impact: ['housing', 'joint', 'emergency'] };
        return { dir: 'supports', text: t + '；假设不激进', impact: ['housing', 'joint'] };
      },
      breakeven: function () { return null; } },
    { id: 'rent_growth', label: '租金年增长', adv: '假设输入!B30',
      used: function (H) { return advUsed(H, '假设输入!B30', 0.01); },
      derivation: '模型 1%/年。',
      macro: [
        { series: 'cpi', pick: function (m) { return pick(m, 'cpi', 'latest.rent.yoy', true, 'CPI 租赁房房租同比（全国）'); } },
        { series: 'rent_index_sz', pick: function (m) { return pick(m, 'rent_index_sz', 'latest.yoy', true, '深圳住房租金指数'); } }
      ],
      signal: function (used, mv) {
        var r = mv[0] && mv[0].value;
        if (r === null || r === undefined || used === null) return missing('房租数据待补');
        var t = '全国房租同比 ' + fmt.pct(r) + '，模型 ' + fmt.pct(used) + '（深圳租金指数待补）';
        if (used > r + 0.01) return { dir: 'challenges', text: t + '；房租实际在降，模型高估了未来租房成本，对"租房"结论反而是额外支持', impact: ['housing'], favors: 'rent' };
        return { dir: 'supports', text: t, impact: ['housing'] };
      },
      breakeven: function () { return null; } },
    { id: 'residual', label: '纯电车5年残值率', adv: '车辆参数!D14',
      used: function (H) { return advUsed(H, '车辆参数!D14', 0.35); },
      derivation: '纯电 35%、燃油 45%（行业二手车保值率经验值）。',
      macro: [
        { series: 'cpi', pick: function (m) { return pick(m, 'cpi', 'latest.car.yoy', true, 'CPI 小汽车同比'); } },
        { series: 'used_car', pick: function (m) { return pick(m, 'used_car', 'latest.ev5y', true, '二手车保值率'); } }
      ],
      signal: function (used, mv) {
        var c = mv[0] && mv[0].value;
        if (c === null || c === undefined) return missing('小汽车价格待补');
        var t = '新车价格同比 ' + fmt.pct(c) + '（二手车保值率待补）';
        if (c < -0.01) return { dir: 'challenges', text: t + '；新车持续降价会压低二手残值，用车总成本可能高于模型', impact: ['car'], favors: 'none' };
        return { dir: 'neutral', text: t, impact: [] };
      },
      breakeven: function () { return null; } },
    { id: 'elec', label: '家充电价', adv: '约束规则!B28',
      used: function (H) { return advUsed(H, '约束规则!B28', 0.6); },
      derivation: '居民谷电+峰电加权约 0.6 元/kWh。',
      macro: [{ series: 'cpi', pick: function (m) { return pick(m, 'cpi', 'latest.utilities.yoy', true, 'CPI 水电燃料同比'); } }],
      signal: function (used, mv) {
        var c = mv[0] && mv[0].value;
        if (c === null || c === undefined) return missing('水电燃料价格待补');
        return Math.abs(c) > 0.03 ? { dir: 'challenges', text: '水电燃料同比 ' + fmt.pct(c) + '，电价变动明显', impact: ['car'] } : { dir: 'neutral', text: '水电燃料同比 ' + fmt.pct(c) + '，电价稳定', impact: [] };
      },
      breakeven: function () { return null; } },
    { id: 'fuel', label: '油价', adv: '车辆参数!B22',
      used: function (H) { return advUsed(H, '车辆参数!B22', 8); },
      derivation: '92# 汽油约 8 元/L。',
      macro: [{ series: 'cpi', pick: function (m) { return pick(m, 'cpi', 'latest.energy_vehicle.yoy', true, 'CPI 交通工具用能源同比'); } }],
      signal: function (used, mv) {
        var c = mv[0] && mv[0].value;
        if (c === null || c === undefined) return missing('交通能源价格待补');
        if (c > 0.05) return { dir: 'challenges', text: '交通能源同比 ' + fmt.pct(c) + '，油价上涨，燃油车成本高于模型（进一步支持纯电）', impact: ['car'], favors: 'ev' };
        return { dir: 'neutral', text: '交通能源同比 ' + fmt.pct(c), impact: [] };
      },
      breakeven: function () { return null; } }
  ];
  var PARAM_BY_ID = {}; PARAMS.forEach(function (p) { PARAM_BY_ID[p.id] = p; });

  function evalParam(p, H, macro) {
    var used = null; try { used = num(p.used(H)); } catch (e) { used = null; }
    var mv = p.macro.map(function (m) { try { return m.pick(macro || {}); } catch (e) { return { value: null, asof: null, url: null, text: m.series + '：待补' }; } });
    mv._cpi = cpiYoy(macro || {});
    var sig; try { sig = p.signal(used, mv); } catch (e) { sig = missing('信号计算失败'); }
    if (!sig) sig = missing('无信号');
    var be = null; try { be = num(p.breakeven(H)); } catch (e) { be = null; }
    var list = mv.slice(0, p.macro.length).map(function (x, i) { return { series: p.macro[i].series, value: x.value, asof: x.asof, url: x.url, text: x.text }; });
    return { used: used, macro: list, signal: sig, breakeven: be };
  }

  function paramTable(H, macro, sens) {
    sens = (sens && sens.params) ? sens.params : (sens || {});
    var ALIAS = { income_growth: 'income', rent_growth: 'rentg', fuel: 'oil' };
    return PARAMS.map(function (p) {
      var e = evalParam(p, H, macro), s0 = sens[p.id] || sens[ALIAS[p.id]] || null, s = null;
      if (s0) {
        var house = s0.kind !== 'car', mk = house ? 'buyVsRent2059' : 'carVsNone2059';
        var side = function (o) { return o ? { dNW2059vsRent: num(o[mk]), carNPV: num(o.carNPV), choice: house ? o.housing : (o.car + ':' + o.power) } : null; };
        s = { delta: s0.delta, breakeven: s0.breakeven, beNote: s0.beNote, metric: s0.metric, base: num(get(sens, '__base.' + mk)), plus: side(s0.plus), minus: side(s0.minus) };
      }
      var be = e.breakeven;
      if (be === null && s) be = num(s.breakeven);
      var sensitivity = null;
      if (s) {
        sensitivity = {
          delta: num(s.delta), metric: s.metric,
          dNW2059: { plus: num(get(s, 'plus.dNW2059vsRent')), minus: num(get(s, 'minus.dNW2059vsRent')) },
          carNPV: { plus: num(get(s, 'plus.carNPV')), minus: num(get(s, 'minus.carNPV')) },
          flips: !!(get(s, 'plus.choice') && get(s, 'minus.choice') && get(s, 'plus.choice') !== get(s, 'minus.choice'))
        };
      }
      return { id: p.id, label: p.label, adv: p.adv, used: e.used, derivation: p.derivation, macro: e.macro, breakeven: be, distance: (be !== null && e.used !== null) ? be - e.used : null, sensitivity: sensitivity, sensMeta: s ? { metric: s.metric, beNote: s.beNote } : null, signal: e.signal };
    });
  }

  function macroSignals(H, macro) {
    var items = PARAMS.map(function (p) { var e = evalParam(p, H, macro); return { param: p.id, label: p.label, dir: e.signal.dir, text: e.signal.text, impact: e.signal.impact || [], favors: e.signal.favors || null }; });
    var contradictions = items.filter(function (i) { return i.dir === 'challenges' && i.impact.length > 0; });
    var cnt = { supports: 0, challenges: 0, neutral: 0, missing: 0 };
    items.forEach(function (i) { cnt[i.dir] = (cnt[i.dir] || 0) + 1; });
    var summary = '宏观对照：' + cnt.supports + ' 项支持假设，' + contradictions.length + ' 项挑战结论，' + cnt.missing + ' 项数据待补。' +
      (contradictions.length ? '需关注：' + contradictions.map(function (c) { return c.label; }).join('、') + '。' : '当前宏观数据未动摇主要结论。') + '（美国利率仅作背景）';
    return { items: items, contradictions: contradictions, summary: summary };
  }

  // ---------- 结论 ----------
  function levelOf(s) { return s >= 70 ? '高' : (s >= 45 ? '中' : '低'); }
  function thrMap(thr) { var m = {}; (thr || []).forEach(function (t) { m[t.id] = t; }); return m; }
  function catalogue(H, kws) {
    var c = get(H, 'hedging.catalogue'); if (!Array.isArray(c)) return [];
    return c.map(function (x) { return typeof x === 'string' ? x : (x && (x.label || x.text)) || ''; })
      .filter(function (l) { return l && kws.some(function (k) { return l.indexOf(k) >= 0; }); }).slice(0, 4);
  }
  var VERDICT_TAG = {};
  function scoreConf(base, ids, thrM, paramIds, signals, comp, concId, extra) {
    var reasons = [], s = base;
    ids.forEach(function (id) {
      var t = thrM[id]; if (!t) return;
      if (t.light === 'warn') { s -= 5; reasons.push('−5：' + t.label + '接近门槛'); }
      if (t.light === 'fail') { s -= 10; reasons.push('−10：' + t.label + '未通过'); }
    });
    ((signals && signals.contradictions) || []).forEach(function (c) {
      if (paramIds.indexOf(c.param) < 0 || c.impact.indexOf(concId) < 0) return;
      var tag = VERDICT_TAG[concId === 'joint' ? 'housing' : concId];
      if (c.favors && tag && (c.favors === tag)) { s += 4; reasons.push('+4：宏观偏离模型默认，但方向支持本结论（' + c.label + '）'); }
      else { s -= 8; reasons.push('−8：宏观挑战 ' + c.label); }
    });
    var miss = 0;
    ((comp && comp.missing) || []).forEach(function (m) { if ((m.affects || []).indexOf(concId) >= 0) miss += m.pending ? 6 : 4; });
    miss = Math.min(24, miss);
    if (miss) { s -= miss; reasons.push('−' + miss + '：相关信息未填/待确认'); }
    (extra || []).forEach(function (e) { if (e.d) { s += e.d; reasons.push((e.d > 0 ? '+' : '') + e.d + '：' + e.t); } });
    s = Math.round(clamp(isFinite(s) ? s : 0, 0, 100));
    return { level: levelOf(s), score: s, reasons: reasons };
  }
  function macroSplit(signals, paramIds) {
    var r = { supports: [], challenges: [] };
    ((signals && signals.items) || []).forEach(function (i) {
      if (paramIds.indexOf(i.param) < 0) return;
      if (i.dir === 'supports') r.supports.push(i.text);
      if (i.dir === 'challenges') {
        var tag = VERDICT_TAG[(i.impact || []).indexOf('car') >= 0 ? 'car' : 'housing'];
        if (i.favors && tag && i.favors === tag) r.supports.push('〔偏离模型默认，但方向支持本结论〕' + i.text);
        else r.challenges.push(i.text);
      }
    });
    return r;
  }

  function conclusions(H, values, thr, params, signals, completeness) {
    values = values || {};
    var mods = getMods(values), T = thrMap(thr || evalThresholds(H, values, {}));
    var comp = completeness || (Intake ? Intake.completeness(values) : { missing: [] });
    var dec = get(H, 'decision') || {}, hs = dec.housing || {}, car = dec.car || {}, joint = dec.joint || {};
    var robustKey = mods.preferRobust || 'baseBest';
    var robustOpt = get(H, 'hedging.robust.' + robustKey) || joint.robustOptionId || null;
    if (robustOpt && typeof robustOpt === 'object') robustOpt = robustOpt.optionId || robustOpt.id || null;
    var optId = joint.optionId || '';
    var out = [];

    // 住房
    var pu = num(get(H, 'thresholds.price_unit')), cap = num(get(H, 'thresholds.price_cap_unit'));
    var gs = num(get(H, 'thresholds.g_star')), gu = num(get(H, 'thresholds.g_adopted')); if (gu === null) gu = 0;
    var gd = gs === null ? 0 : Math.abs(gs - gu), prem = (pu !== null && cap) ? pu / cap - 1 : 0;
    var hBase = 45 + Math.min(30, gd * 1500) + Math.min(15, Math.abs(prem) * 30);
    var isRent = hs.choice === 'rent', hExtra = [];
    VERDICT_TAG = { housing: isRent ? 'rent' : 'buy', car: (car.choice === 'none') ? 'none' : (car.powerName === '纯电' ? 'ev' : 'ice') };
    if (gs !== null && ((isRent && gs < gu) || (!isRent && gs > gu))) hExtra.push({ d: -10, t: '盈亏平衡增速与结论方向不一致' });
    var rHouse = robustOpt ? String(robustOpt).split('|')[0] : null, bHouse = String(optId).split('|')[0];
    if (rHouse && bHouse && rHouse !== bHouse) hExtra.push({ d: -10, t: '稳健方案（' + robustKey + '）住房选择与基准不同' });
    if (mods.housingConfidenceDelta) hExtra.push({ d: mods.housingConfidenceDelta, t: '家庭流动性/学区修正' });
    if (isRent) ['price_premium', 'g_gap'].forEach(function (id) { if (T[id] && T[id].light === 'fail') hExtra.push({ d: 5, t: T[id].label + '未通过 → 支持“不按此价买”' }); });
    var hThr = isRent ? ['drop_insolvent'] : ['price_premium', 'g_gap', 'drop_insolvent', 'dti'], hPar = ['g', 'R', 'pi', 'mortgage', 'rent_growth', 'income_growth'];
    var verdictH = isRent
      ? '现在租房，不按 ' + fmt.yuan(pu) + ' 元/m² 买' + (cap ? '（合理出价上限约 ' + fmt.yuan(cap) + '）' : '')
      : (pu !== null && cap !== null && pu > cap ? '可以买，但出价压到 ' + fmt.yuan(cap) + ' 元/m² 以内' : '可以按 ' + fmt.yuan(pu) + ' 元/m² 买');
    var whyH = [];
    if (hs.reason) whyH.push(hs.reason);
    if (gs !== null) whyH.push('房价每年需实际上涨 ' + fmt.pct(gs, 2) + ' 买房才不亏，模型采用 ' + fmt.pct(gu, 2));
    if (T.drop_insolvent && T.drop_insolvent.value !== null) whyH.push('收入永久下降超过 ' + fmt.pct(T.drop_insolvent.value) + ' 才会资不抵债');
    if (mods.school.needed) whyH.push(mods.school.text);
    out.push({
      id: 'housing', verdict: verdictH,
      do: isRent ? '续签 2–3 年租约锁定租金；把首付款放在稳健资产里；若房价跌到 ' + fmt.yuan(cap) + ' 元/m² 以下或 g 前景转好，再重算。' : '谈价目标 ≤ ' + fmt.yuan(cap) + ' 元/m²，首付后账上保留应急金，优先公积金贷款。',
      why: whyH, restsOn: { thresholds: hThr, params: hPar }, macro: macroSplit(signals, hPar),
      hedges: catalogue(H, ['房', '租', '利率', '首付']).concat(isRent ? ['签长租约或租金涨幅上限条款', '首付款分散存放，保留随时可买的能力'] : ['配足定期寿险覆盖贷款余额', '固定/浮动利率择优，可提前还款']),
      confidence: scoreConf(hBase, hThr, T, hPar, signals, comp, 'housing', hExtra)
    });

    // 车
    var cThr = ['car_ratio', 'car_price_income'], cPar = ['residual', 'elec', 'fuel'], cExtra = [];
    var noCar = car.choice === 'none';
    if (joint.robustCar && car.choice && joint.robustCar !== car.choice) cExtra.push({ d: -10, t: '稳健方案建议的车选择（' + joint.robustCar + '）与基准不同' });
    if (mods.carMust === false && !noCar) cExtra.push({ d: -10, t: '你们表示用车不是刚需' });
    if (mods.carMust === true) cExtra.push({ d: 5, t: '已确认用车是刚需' });
    var cBase = noCar ? 65 : (get(H, 'decision.car.reason') && String(car.reason).indexOf('可行') >= 0 ? 65 : 55);
    out.push({
      id: 'car',
      verdict: noCar ? '暂不买车' : '买 ' + fmt.wan(car.price) + ' ' + (car.powerName || '') + '车，' + (num(car.loan) ? '贷款 ' + fmt.wan(car.loan) : '全款'),
      do: noCar ? '用公共交通/网约车，按年复核通勤需求。' : '预算不超过 ' + fmt.wan(car.price) + (car.powerName === '纯电' ? '；先确认小区能装家充' : '') + '；若并非刚需，可先不买。',
      why: [car.reason || '引擎未给出车辆理由'].concat(mods.carMust === null ? ['是否刚需尚未确认'] : []),
      restsOn: { thresholds: cThr, params: cPar }, macro: macroSplit(signals, cPar),
      hedges: catalogue(H, ['车', '充电', '油']).concat(['优先买保值率高的车型', '车险按需选择，不加不必要附加险']),
      confidence: scoreConf(cBase, cThr, T, cPar, signals, comp, 'car', cExtra)
    });

    // 联合
    var st = joint.status || 'na', jBase = st === 'green' ? 75 : (st === 'yellow' ? 55 : (st === 'red' ? 35 : 45));
    var jThr = ['savings', 'min_cash', 'emergency', 'dti', 'drop_insolvent'], jPar = ['income_growth', 'pi'], jExtra = [];
    if (robustOpt && optId && robustOpt !== optId) jExtra.push({ d: -10, t: '稳健方案为 ' + robustOpt + '，与基准 ' + optId + ' 不同' });
    var checks = joint.checks || {}, failed = Object.keys(checks).filter(function (k) { return checks[k] === false; });
    if (failed.length) jExtra.push({ d: -5 * failed.length, t: '联合检查未通过：' + failed.join('、') });
    var jWhy = ['联合方案状态：' + ({ green: '绿', yellow: '黄', red: '红' }[st] || '未知')];
    if (robustOpt) jWhy.push('稳健方案（' + robustKey + '）：' + robustOpt);
    if (mods.preferRobust && mods.preferRobust !== 'baseBest') jWhy.push('按你们的风险偏好，优先参考稳健方案');
    out.push({
      id: 'joint',
      verdict: (joint.label || '组合方案') + (st === 'green' ? '，整体可行' : (st === 'red' ? '，存在硬约束不通过' : '，需谨慎')),
      do: robustOpt && optId && robustOpt !== optId ? '基准方案可执行，但若担心坏情景，选稳健方案 ' + robustOpt + '。' : '按该组合执行，每年复核一次收入与房价。',
      why: jWhy, restsOn: { thresholds: jThr, params: jPar }, macro: macroSplit(signals, jPar),
      hedges: catalogue(H, ['收入', '组合', '现金']).concat(['大额支出分阶段做，保留回头余地']),
      confidence: scoreConf(jBase, jThr, T, jPar, signals, comp, 'joint', jExtra)
    });

    // 应急金
    var em = T.emergency || {}, eThr = ['emergency', 'min_cash'];
    var eBase = em.light === 'pass' ? 75 : (em.light === 'warn' ? 55 : (em.light === 'fail' ? 40 : 45));
    var gap = (em.value !== null && em.threshold !== null && em.value !== undefined) ? Math.max(0, em.threshold - em.value) : null;
    out.push({
      id: 'emergency',
      verdict: em.light === 'na' || em.light === undefined ? '应急金：待补' : (gap ? '应急金不足，还差约 ' + fmt.num(gap, 1) + ' 个月' : '应急金够用（' + fmt.num(em.value, 1) + ' 个月）'),
      do: gap ? '先把 ' + fmt.num(em.threshold, 0) + ' 个月支出放进活期/货基，再做大额决策。' : '应急金放在随时可取的账户，不要挪作首付。',
      why: [em.text || '待补'].concat(mods.emergencyMonthsAdd ? ['收入不稳定，门槛已上调 ' + mods.emergencyMonthsAdd + ' 个月'] : []),
      restsOn: { thresholds: eThr, params: ['income_growth'] }, macro: macroSplit(signals, ['income_growth']),
      hedges: catalogue(H, ['应急', '现金', '失业']).concat(['保留一张可用信用额度作为最后备份']),
      confidence: scoreConf(eBase, eThr, T, ['income_growth'], signals, comp, 'emergency', [])
    });

    // 保险
    var ins = mods.insurance || { light: 'na', reasons: [] };
    var med = num(values.medical), mm = num(get(H, 'thresholds.medical_max.' + optId));
    var iWhy = (ins.reasons || []).slice();
    if (mm !== null) iWhy.push('当前方案可承受一次性大病/意外支出约 ' + fmt.wan(mm));
    if (med !== null && mm !== null && med > mm) iWhy.push('你们设定的大病金额 ' + fmt.wan(med) + ' 超过可承受上限');
    var iLight = (med !== null && mm !== null && med > mm) ? 'fail' : ins.light;
    out.push({
      id: 'insurance',
      verdict: iLight === 'fail' ? '保障缺口明显，先补保险' : (iLight === 'warn' ? '保障基本有，但有缺口' : (iLight === 'pass' ? '保障基本到位' : '保险情况待补')),
      do: iLight === 'pass' ? '每年复核保额是否覆盖负债和 5 年支出。' : '优先补齐：百万医疗 → 重疾险（保额≈3–5 年收入）→ 定期寿险（覆盖房贷余额+子女教育）。',
      why: iWhy.length ? iWhy : ['保险信息未填'],
      restsOn: { thresholds: ['drop_insolvent'], params: [] }, macro: { supports: [], challenges: [] },
      hedges: catalogue(H, ['保险', '医疗', '重疾', '寿险']),
      confidence: scoreConf(iLight === 'na' ? 40 : 70, ['drop_insolvent'], T, [], signals, comp, 'insurance', [])
    });
    return out;
  }

  return {
    fmt: fmt, THRESHOLDS: THRESHOLDS, PARAMS: PARAMS,
    evalThresholds: evalThresholds, paramTable: paramTable,
    macroSignals: macroSignals, conclusions: conclusions,
    _util: { num: num, get: get, guard: guard }
  };
});
