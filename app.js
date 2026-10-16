// app.js
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const errBox = $('err');
  function showErr(e) { errBox.textContent += (e && e.stack ? e.stack : String(e)) + '\n'; }
  window.addEventListener('error', ev => showErr(ev.error || ev.message));

  // ---------- helpers ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isErr = v => v != null && typeof v === 'object' && 'code' in v;
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const empty = v => v == null || v === '';
  function colName(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  function colIdx(c) { let n = 0; for (const ch of c) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
  const nf = (d) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const NF0 = nf(0), NF1 = nf(1), NF2 = nf(2);
  function errHtml(v) { return '<span class="muted">' + esc(v.code || '#ERR') + '</span>'; }
  function fmtBasic(v) {
    if (empty(v)) return '<span class="muted">—</span>';
    if (isErr(v)) return errHtml(v);
    if (typeof v === 'boolean') return v ? '是' : '否';
    if (typeof v === 'string') return esc(v);
    if (typeof v === 'number') {
      if (!isFinite(v)) return '<span class="muted">—</span>';
      const a = Math.abs(v);
      const s = a >= 1000 ? NF0.format(v) : (a >= 1 || a === 0 ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(v) : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(v));
      return v < 0 ? '<span class="neg">' + s + '</span>' : s;
    }
    return esc(String(v));
  }
  function fmt(v, kind) {
    if (typeof v !== 'number' || !isFinite(v)) return fmtBasic(v);
    let s;
    switch (kind) {
      case 'yuan': s = NF0.format(v) + ' 元'; break;
      case 'yuanN': s = NF0.format(v); break;
      case 'wan': s = NF1.format(v / 1e4) + ' 万元'; break;
      case 'wanN': s = NF1.format(v / 1e4); break;
      case 'w1': s = NF1.format(v); break;
      case 'pct': s = NF2.format(v * 100) + '%'; break;
      case 'm2': s = NF0.format(v) + ' 元/m²'; break;
      case 'mon': s = NF1.format(v) + ' 个月'; break;
      case 'x': s = NF2.format(v); break;
      default: return fmtBasic(v);
    }
    return v < 0 ? '<span class="neg">' + s + '</span>' : s;
  }
  const PCT_UNITS = ['%', '年利率', '占房价', '概率', '占月缴存', '占房价/年'];
  const isPctUnit = u => typeof u === 'string' && (PCT_UNITS.includes(u.trim()) || u.trim() === '%');
  const PT = { A: '燃油', B: '插混/增程', C: '纯电', D: '油电HEV' };
  const COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8', '#fff176', '#90a4ae', '#f06292'];
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

  // ---------- models ----------
  const A = ModelA.createModel(); A.warm();
  const B = ModelB.createModel(); B.warm();
  const gA = r => { try { return A.get(r); } catch (e) { return { code: '#ERR' }; } };
  const gB = r => { try { return B.get(r); } catch (e) { return { code: '#ERR' }; } };
  const SCEN = ['乐观', '基准', '基准·低R', '压力·房价持平', '压力·组合'];
  const SHEETS = SCEN.map(s => '现金流_' + s);

  const state = { scen: 1, loan: 0, link: 'none', ptab: 0, dtab: 0, fam: null };
  let updaters = [];

  // ---------- linkage ----------
  const LINK_REFS = ['家庭参数!J5', '家庭参数!J6', '家庭参数!J7', '家庭参数!J9', '家庭参数!J10', '家庭参数!J11', '家庭参数!J12', '家庭参数!J14', '家庭参数!J20'];
  function linkMap() {
    if (state.link === 'none') return [];
    const n = r => { const v = gA(r); return v; };
    const add = (a, b) => (num(a) != null && num(b) != null) ? a + b : null;
    const mul = (a, k) => num(a) != null ? a * k : null;
    const L = [
      { ref: '家庭参数!J5', label: '城市', src: '固定', val: '深圳' },
      { ref: '家庭参数!J6', label: '家庭年收入（到手现金）', src: '(假设输入!B6+B7)×12', val: mul(add(n('假设输入!B6'), n('假设输入!B7')), 12) },
      { ref: '家庭参数!J7', label: '成人数', src: '固定', val: 2 }
    ];
    if (state.link === 'buy') {
      L.push({ ref: '家庭参数!J9', label: '年房租', src: '买房=0', val: 0 });
      L.push({ ref: '家庭参数!J10', label: '年房贷', src: '可负担上限!B15×12', val: mul(n('可负担上限!B15'), 12) });
      L.push({ ref: '家庭参数!J14', label: '现有储蓄', src: '可负担上限!B19', val: n('可负担上限!B19') });
      L.push({ ref: '家庭参数!J20', label: '机会成本利率', src: '合理价格!B5（房贷利率）', val: n('合理价格!B5') });
    } else {
      L.push({ ref: '家庭参数!J9', label: '年房租', src: '现金流_基准!V6', val: n('现金流_基准!V6') });
      L.push({ ref: '家庭参数!J10', label: '年房贷', src: '租房=0', val: 0 });
      L.push({ ref: '家庭参数!J14', label: '现有储蓄', src: '假设输入!B10', val: n('假设输入!B10') });
      L.push({ ref: '家庭参数!J20', label: '机会成本利率', src: '资金配置!C17 (R)', val: n('资金配置!C17') });
    }
    L.push({ ref: '家庭参数!J11', label: '子女支出', src: '现金流_基准!K6', val: n('现金流_基准!K6') });
    L.push({ ref: '家庭参数!J12', label: '夫妻基础支出', src: '现金流_基准!J6', val: n('现金流_基准!J6') });
    return L;
  }
  function applyLink(m) {
    LINK_REFS.forEach(r => m.set(r, ModelB.inputs[r]));
    linkMap().forEach(x => { if (x.val != null && !isErr(x.val)) m.set(x.ref, x.val); });
  }

  function recompute() {
    try {
      A.warm();
      applyLink(B);
      B.warm();
      renderAll();
    } catch (e) { showErr(e); }
  }

  // ---------- tabs ----------
  function makeTabs(el, names, sel, onSel) {
    el.innerHTML = '';
    el.setAttribute('role', 'tablist');
    names.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = 'lx-tab'; b.textContent = n; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      b.onclick = () => { [...el.children].forEach((c, j) => c.setAttribute('aria-selected', j === i ? 'true' : 'false')); onSel(i); };
      el.appendChild(b);
    });
  }

  // ---------- parameter fields ----------
  function field(which, ref, label, unit, note, compact) {
    const MI = which === 'A' ? ModelA : ModelB, m = which === 'A' ? A : B;
    const get = which === 'A' ? gA : gB;
    const linked = which === 'B' && state.link !== 'none' && LINK_REFS.includes(ref);
    const wrap = document.createElement(compact ? 'span' : 'div');
    if (!compact) wrap.className = 'pitem';
    let html = '';
    if (!compact) html += '<div class="pl" title="' + esc(label || ref) + '">' + esc(label || ref) + ' <span class="muted" style="font-size:10px">' + esc(ref) + '</span></div>';
    html += compact ? '' : '<div class="pr">';
    const isInput = ref in MI.inputs;
    const def = MI.inputs[ref];
    let kind;
    if (!isInput) kind = 'formula';
    else if (linked) kind = 'linked';
    else if (ref === '家庭参数!J5') kind = 'city';
    else if (ref === '家庭参数!J8' || ref === '家庭参数!J15') kind = 'bool';
    else if (typeof def === 'string') kind = 'text';
    else kind = 'num';
    if (kind === 'formula' || kind === 'linked') html += '<input readonly class="ro">' + (kind === 'formula' ? '<span class="badge">公式</span>' : '<span class="badge link">来自住房模型</span>');
    else if (kind === 'city') html += '<select><option>深圳</option><option>成都</option></select>';
    else if (kind === 'bool') html += '<select><option value="0">0 否</option><option value="1">1 是</option></select>';
    else if (kind === 'text') html += '<span class="todo">' + esc(def) + '</span>';
    else html += '<input type="number" step="any">';
    if (unit && !compact) html += '<span class="u">' + esc(unit) + '</span>';
    if (!compact) html += '<span class="pct"></span>';
    if (!compact) html += '</div>';
    const noteS = note == null ? '' : String(note);
    if (!compact && noteS) html += '<div class="pn" title="' + esc(noteS) + '">' + (/待核实/.test(noteS) ? '<span class="todo">待核实</span> ' : '') + (/待填/.test(noteS) ? '<span class="todo">待填</span> ' : '') + esc(noteS) + '</div>';
    wrap.innerHTML = html;
    const inp = wrap.querySelector('input,select'); if (inp) inp.dataset.ref = ref;
    const pctEl = wrap.querySelector('.pct');
    const pct = isPctUnit(unit);
    const upd = () => {
      const v = get(ref);
      if (inp && document.activeElement !== inp) {
        if (inp.classList.contains('ro')) inp.value = isErr(v) ? v.code : (num(v) != null ? +v.toPrecision(12) : (empty(v) ? '' : String(v)));
        else if (inp.tagName === 'SELECT') inp.value = String(v);
        else inp.value = empty(v) ? '' : (num(v) != null ? v : '');
      }
      if (pctEl) pctEl.textContent = (pct && num(v) != null) ? NF2.format(v * 100) + '%' : '';
    };
    upd(); updaters.push(upd);
    if (inp && !inp.readOnly) {
      const apply = () => {
        let val;
        if (kind === 'city') val = inp.value;
        else if (kind === 'bool') val = +inp.value;
        else { if (inp.value === '') val = def; else { val = parseFloat(inp.value); if (!isFinite(val)) return; } }
        m.set(ref, val); recompute();
      };
      inp.addEventListener('change', apply);
      if (kind === 'num') inp.addEventListener('input', debounce(apply, 250));
    }
    return wrap;
  }

  function paramGrid(items) {
    const g = document.createElement('div'); g.className = 'pgrid';
    items.forEach(it => g.appendChild(it)); return g;
  }
  function paramMatrix(which, sheet, rows, cols, headerRow, headers, labelCol) {
    const get = which === 'A' ? gA : gB;
    const t = document.createElement('table'); t.className = 'ptab';
    const hd = headers || cols.map(c => get(sheet + '!' + c + headerRow));
    t.innerHTML = '<thead><tr><th>参数</th>' + hd.map(h => '<th>' + fmtBasic(h) + '</th>').join('') + '<th>备注</th></tr></thead>';
    const tb = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      const lab = get(sheet + '!' + (labelCol || 'A') + r);
      tr.innerHTML = '<td>' + fmtBasic(lab) + '</td>';
      cols.forEach(c => { const td = document.createElement('td'); td.appendChild(field(which, sheet + '!' + c + r, '', '', '', true)); tr.appendChild(td); });
      const noteCell = document.createElement('td'); noteCell.className = 'muted';
      tr.appendChild(noteCell);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    const w = document.createElement('div'); w.className = 'tblwrap'; w.appendChild(t); return w;
  }

  const PTABS = ['住房参数', '情景参数', '资金配置', '购车·家庭', '购车·规则', '车辆参数'];
  function renderParams() {
    updaters = [];
    const body = $('pbody'); body.innerHTML = '';
    const t = state.ptab;
    if (t === 0) {
      const items = [];
      const HDR = [5, 11, 18, 26, 33, 41, 55, 80];
      for (let r = 5; r <= 81; r++) {
        const lab = gA('假设输入!A' + r);
        if (HDR.includes(r)) { if (!empty(lab)) { const d = document.createElement('div'); d.className = 'psec'; d.textContent = String(lab); items.push(d); } continue; }
        if (r < 6 || empty(lab)) continue;
        items.push(field('A', '假设输入!B' + r, String(lab), gA('假设输入!C' + r), gA('假设输入!D' + r)));
      }
      body.appendChild(paramGrid(items));
    } else if (t === 1) {
      body.appendChild(paramMatrix('A', '生命周期参数', d3.range(5, 29), ['B', 'C', 'D', 'E', 'F'], 4, SCEN));
    } else if (t === 2) {
      const items = [];
      [6, 7, 8, 13, 14, 15, 16].forEach(r => {
        const lab = fmtPlain(gA('资金配置!A' + r));
        items.push(field('A', '资金配置!B' + r, lab + '（' + fmtPlain(gA('资金配置!B' + (r < 13 ? 5 : 12))) + '）', '', ''));
        items.push(field('A', '资金配置!C' + r, lab + '（' + fmtPlain(gA('资金配置!C' + (r < 13 ? 5 : 12))) + '）', '', ''));
      });
      items.push(field('A', '资金配置!C17', 'R（方案B 加权收益）', '', '公式，自动计算'));
      body.appendChild(paramGrid(items));
    } else if (t === 3) {
      const items = [];
      for (let r = 5; r <= 20; r++) items.push(field('B', '家庭参数!J' + r, fmtPlain(gB('家庭参数!A' + r)), '', ''));
      body.appendChild(paramGrid(items));
    } else if (t === 4) {
      const items = [];
      for (let r = 4; r <= 36; r++) { const lab = gB('约束规则!A' + r); if (empty(lab) && !(('约束规则!B' + r) in ModelB.inputs)) continue; items.push(field('B', '约束规则!B' + r, fmtPlain(lab), '', gB('约束规则!C' + r))); }
      'BCDEFGHI'.split('').forEach((c, i) => items.push(field('B', '约束规则!' + c + '38', '车价档位 ' + (i + 1), '元', '')));
      body.appendChild(paramGrid(items));
    } else if (t === 5) {
      body.appendChild(paramMatrix('B', '车辆参数', d3.range(4, 18), ['B', 'C', 'D', 'E'], 3, ['A 燃油', 'B 插混/增程', 'C 纯电', 'D 油电HEV']));
      body.appendChild(paramGrid([19, 20].map(r => field('B', '车辆参数!B' + r, fmtPlain(gB('车辆参数!A' + r)), '', gB('车辆参数!F' + r)))));
    }
    if (t === 5 || t === 1) { // fill notes column for matrices
      const sheet = t === 1 ? null : '车辆参数';
      if (sheet) body.querySelectorAll('table.ptab tbody tr').forEach((tr, i) => { const n = gB(sheet + '!F' + (4 + i)); tr.lastChild.innerHTML = empty(n) ? '' : '<span title="' + esc(n) + '">' + esc(String(n).slice(0, 40)) + '</span>'; });
    }
  }
  function fmtPlain(v) { if (empty(v)) return ''; if (isErr(v)) return v.code; return String(v); }

  function renderLinkTable() {
    const L = linkMap();
    if (!L.length) { $('linkTbl').innerHTML = ''; return; }
    $('linkTbl').innerHTML = '<div class="tblwrap" style="max-height:200px"><table><thead><tr><th>联动映射：购车字段</th><th>目标单元格</th><th>来源</th><th>值</th></tr></thead><tbody>' +
      L.map(x => '<tr><td>' + esc(x.label) + '</td><td>' + esc(x.ref) + '</td><td>' + esc(x.src) + '</td><td>' + (x.val == null ? '<span class="todo">待补</span>' : fmtBasic(x.val)) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  // ---------- KPIs ----------
  function tile(k, v, ref, cls) {
    return '<div class="lx-tile"><div class="k">' + esc(k) + '</div><div class="big ' + (cls || '') + '">' + v + '</div><div class="ref">' + esc(ref) + '</div></div>';
  }
  function labelA(ref) { const [s, c] = ref.split('!'); const r = c.replace(/[A-Z]+/, ''); return fmtPlain(gA(s + '!A' + r)); }
  function renderKPIs() {
    const ta = [
      ['结论!B6', 'm2'], ['结论!B7', 'm2'], ['结论!B8', 'm2'], ['结论!B9', 'pct'], ['结论!B10', 'pct'],
      ['结论!B12', 'wan'], ['结论!B13', 'wan'], ['结论!B14', 'wan'], ['结论!B23', 'm2'], ['结论!B24', 'wan'],
      ['结论!B25', ''], ['结论!B26', ''], ['可负担上限!B15', 'yuan'], ['可负担上限!B19', 'wan'], ['可负担上限!B25', ''], ['资金配置!C17', 'pct']
    ];
    $('tilesA').innerHTML = ta.map(([r, k]) => {
      const v = gA(r); let cls = '';
      if (typeof v === 'string') cls = /不通过|超|否/.test(v) ? 'bad' : (/通过|是|内/.test(v) ? 'ok' : '');
      if (r === '资金配置!C17') return tile('R（方案B 收益）', fmt(v, k), r);
      return tile(labelA(r) || r, fmt(v, k), r, cls);
    }).join('');
    const tb = [];
    for (let r = 4; r <= 22; r++) {
      const ref = '推荐结果!B' + r; const lab = fmtPlain(gB('推荐结果!A' + r)); const v = gB(ref);
      if (empty(lab) && empty(v)) continue;
      let h;
      if (r === 12) h = esc(PT[v] || fmtPlain(v) || '—');
      else if (r === 13) h = v === 0 ? '全款' : v === 1 ? '贷款' : fmtBasic(v);
      else if (r === 11 || r === 6 || r === 7 || r === 8 || r === 5) h = typeof v === 'number' ? fmt(v, 'wan') : fmtBasic(v);
      else if (r === 14 || r === 16 || r === 20 || r === 21) h = fmt(v, r === 16 || r === 21 ? 'yuan' : 'wan');
      else if (r === 15 || r === 19) h = fmt(v, 'pct');
      else if (r === 18) h = fmt(v, 'mon');
      else h = fmtBasic(v);
      tb.push(tile(lab || ref, h, ref, typeof v === 'string' && /不|无/.test(v) ? 'warn' : ''));
    }
    $('tilesB').innerHTML = tb.join('');
  }
  function renderTake() {
    const cap = gA('结论!B23'), over = gA('结论!B9'), inL = gA('结论!B26'), d59 = gA('结论!B12');
    const price = gB('推荐结果!B11'), pt = gB('推荐结果!B12'), st = gB('推荐结果!B10');
    const sp = (h) => '<span class="v">' + h + '</span>';
    let s = '住房：出价上限单价 ' + sp(fmt(cap, 'm2')) + '，拟买价相对合理价 ' + sp(fmt(over, 'pct')) + '，' + sp(fmtBasic(inL)) +
      '；基准情景下 2059 年买−租净资产差 ' + sp(fmt(d59, 'wan')) + '。购车：';
    if (num(price) != null && price > 0) s += '推荐 ' + sp(fmt(price, 'wan')) + ' 的 ' + sp(esc(PT[pt] || fmtPlain(pt))) + (gB('推荐结果!B13') === 1 ? '（贷款）' : '（全款）');
    else s += sp('暂无推荐方案');
    s += '，状态 ' + sp(fmtBasic(st)) + (state.link !== 'none' ? '（已与住房' + (state.link === 'buy' ? '买房' : '租房') + '情景联动）' : '') + '。';
    $('take').innerHTML = s;
  }

  // ---------- chart ----------
  function legend(id, series) {
    $(id).innerHTML = series.map(s => '<span class="lx-li"><span class="lx-sw" style="background:' + s.color + (s.dash ? ';opacity:.6' : '') + '"></span>' + esc(s.name) + '</span>').join('');
  }
  function lineChart(id, xs, series, o) {
    o = o || {};
    const el = $(id); el.innerHTML = '';
    legend(o.lg, series);
    const W = Math.max(el.clientWidth || 600, 260), H = o.h || 290, m = { t: 12, r: 14, b: 30, l: 58 };
    const all = [];
    series.forEach(s => s.v.forEach(v => { if (v != null && isFinite(v)) all.push(v); }));
    if (o.refY != null) all.push(o.refY);
    if (o.zero) all.push(0);
    if (!all.length || !xs.length) { el.innerHTML = '<div class="muted" style="padding:30px">待补</div>'; return; }
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H);
    const x = d3.scaleLinear().domain([0, Math.max(1, xs.length - 1)]).range([m.l + (o.pad || 0), W - m.r - (o.pad || 0)]);
    const ext = d3.extent(all); if (ext[0] === ext[1]) { ext[0] -= 1; ext[1] += 1; }
    const y = d3.scaleLinear().domain(ext).nice().range([H - m.b, m.t]);
    const yf = o.yfmt || (v => NF0.format(v));
    const g = svg.append('g').attr('class', 'lx-grid');
    y.ticks(5).forEach(t => {
      g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--cds-chart-grid)');
      svg.append('text').attr('class', 'lx-tick').attr('x', m.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').attr('fill', 'var(--cds-chart-axis)').attr('font-size', 11).text(yf(t));
    });
    const step = Math.max(1, Math.ceil(xs.length / Math.max(2, (W - m.l) / 64)));
    xs.forEach((v, i) => {
      if (i % step && i !== xs.length - 1) return;
      svg.append('text').attr('class', 'lx-tick').attr('x', x(i)).attr('y', H - 10).attr('text-anchor', 'middle').attr('fill', 'var(--cds-chart-axis)').attr('font-size', 11).text(o.xfmt ? o.xfmt(v) : fmtPlain(v));
    });
    if (o.zero && y.domain()[0] <= 0 && y.domain()[1] >= 0) svg.append('line').attr('class', 'lx-zero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
    if (o.refY != null) {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(o.refY)).attr('y2', y(o.refY)).attr('stroke', 'var(--color-warn)').attr('stroke-dasharray', '4 4');
      svg.append('text').attr('x', W - m.r).attr('y', y(o.refY) - 4).attr('text-anchor', 'end').attr('fill', 'var(--color-warn)').attr('font-size', 11).text(o.refLabel || '');
    }
    const line = d3.line().defined(d => d != null && isFinite(d)).x((d, i) => x(i)).y(d => y(d));
    series.forEach(s => {
      svg.append('path').attr('class', 'lx-line').attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.w || 2)
        .attr('stroke-dasharray', s.dash ? '6 4' : null).attr('opacity', s.op || 1).attr('d', line(s.v));
      if (s.pts) s.v.forEach((v, i) => {
        if (v == null || !isFinite(v)) return;
        const p = s.pts[i] || {};
        svg.append('circle').attr('cx', x(i)).attr('cy', y(v)).attr('r', p.rec ? 7 : 4)
          .attr('fill', p.hollow ? 'var(--color-bg)' : s.color).attr('stroke', p.rec ? '#fff' : s.color).attr('stroke-width', p.rec ? 2.5 : 1.5);
      });
    });
    const vl = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    const tip = document.createElement('div'); tip.className = 'lx-tip'; el.appendChild(tip);
    const tf = o.tfmt || (v => NF1.format(v) + ' 万元');
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', ev => {
        const [mx] = d3.pointer(ev);
        const i = Math.max(0, Math.min(xs.length - 1, Math.round(x.invert(mx))));
        vl.attr('x1', x(i)).attr('x2', x(i)).attr('opacity', .6);
        tip.innerHTML = '<div class="lx-tip-h">' + esc(o.xfmt ? o.xfmt(xs[i]) : fmtPlain(xs[i])) + '</div>' +
          series.map(s => '<div class="lx-tip-r"><span class="lx-tip-n"><span class="sw" style="background:' + s.color + '"></span>' + esc(s.name) + '</span> <span class="lx-tip-v">' +
            (s.v[i] == null || !isFinite(s.v[i]) ? '—' : tf(s.v[i])) + (s.pts && s.pts[i] && s.pts[i].hollow ? ' (不可行)' : '') + '</span></div>').join('');
        tip.style.display = 'block';
        const px = x(i) + 12; tip.style.left = (px + 180 > W ? x(i) - 190 : px) + 'px'; tip.style.top = m.t + 'px';
      })
      .on('mouseleave', () => { vl.attr('opacity', 0); tip.style.display = 'none'; });
  }

  const YEARS = d3.range(5, 61);
  const colVals = (sheet, col, k) => YEARS.map(r => { const v = num(gA(sheet + '!' + col + r)); return v == null ? null : v / (k || 1e4); });
  function renderCharts() {
    const xs = YEARS.map(r => gA(SHEETS[state.scen] + '!A' + r));
    const sh = SHEETS[state.scen];
    lineChart('chA1', xs, [
      { name: '买：净资产', color: COLORS[0], v: colVals(sh, 'T') },
      { name: '租：净资产', color: COLORS[2], dash: true, v: colVals(sh, 'AA') }
    ], { lg: 'lgA1', zero: true });
    lineChart('chA2', xs, SHEETS.map((s, i) => {
      const t = colVals(s, 'T'), a = colVals(s, 'AA');
      return { name: SCEN[i], color: COLORS[i], w: i === state.scen ? 3 : 1.6, v: t.map((v, j) => v != null && a[j] != null ? v - a[j] : null) };
    }), { lg: 'lgA2', zero: true });
    lineChart('chA3', xs, [
      { name: '买：期末现金', color: COLORS[0], v: colVals(sh, 'R') },
      { name: '租：期末现金', color: COLORS[2], dash: true, v: colVals(sh, 'Z') }
    ], { lg: 'lgA3', zero: true });
    // B1
    const tiers = 'BCDEFGHI'.split('').map(c => gB('约束规则!' + c + '38'));
    const recIdx = num(gB('推荐结果!B9')); const recRow = recIdx ? 4 + recIdx : -1;
    const groups = {};
    for (let r = 5; r <= 68; r++) {
      const pt = gB('方案评估!B' + r), ln = gB('方案评估!C' + r);
      if (ln !== state.loan && Number(ln) !== state.loan) continue;
      (groups[pt] = groups[pt] || []).push(r);
    }
    const seriesB = Object.keys(PT).filter(k => groups[k]).map((k, i) => {
      const rows = groups[k];
      const v = tiers.map((t, ti) => {
        let r = rows.find(rr => gB('方案评估!A' + rr) === t); if (r == null) r = rows[ti];
        return r;
      });
      return {
        name: PT[k], color: COLORS[i],
        v: v.map(r => r == null ? null : (num(gB('方案评估!N' + r)) == null ? null : gB('方案评估!N' + r) / 1e4)),
        pts: v.map(r => r == null ? {} : ({ hollow: Number(gB('方案评估!Y' + r)) !== 1, rec: r === recRow }))
      };
    });
    const ref = num(gB('方案评估!E70'));
    lineChart('chB1', tiers, seriesB, { lg: 'lgB1', pad: 16, refY: ref == null ? null : ref / 1e4, refLabel: '不买车 NPV', xfmt: v => num(v) != null ? NF0.format(v / 1e4) + '万' : fmtPlain(v) });
    const rB = d3.range(5, 20);
    const cv = c => rB.map(r => { const v = num(gB('对家庭财务的影响!' + c + r)); return v == null ? null : v / 1e4; });
    lineChart('chB2', rB.map(r => gB('对家庭财务的影响!A' + r)), [
      { name: fmtPlain(gB('对家庭财务的影响!B4')) || '不买车净资产', color: COLORS[6], dash: true, v: cv('B') },
      { name: fmtPlain(gB('对家庭财务的影响!C4')) || '推荐方案净资产', color: COLORS[0], v: cv('C') },
      { name: fmtPlain(gB('对家庭财务的影响!D4')) || '差额', color: COLORS[3], v: cv('D') }
    ], { lg: 'lgB2', zero: true });
  }

  // ---------- tables ----------
  function table(headers, rows, rowCls) {
    return '<table><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r, i) => '<tr' + (rowCls && rowCls[i] ? ' class="' + rowCls[i] + '"' : '') + '>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  function heat(id, rows, hdrRow, sheet, mode, pref) {
    const cols = 'BCDEFGHI'.split('');
    const hd = ['R \\ g'].concat(cols.map(c => fmt(gA(sheet + '!' + c + hdrRow), 'pct')));
    const vals = []; rows.forEach(r => cols.forEach(c => { const v = num(gA(sheet + '!' + c + r)); if (v != null) vals.push(v); }));
    const maxAbs = d3.max(vals, v => Math.abs(v)) || 1;
    const body = rows.map(r => {
      const tds = cols.map(c => {
        const v = gA(sheet + '!' + c + r);
        let bg = 'transparent', txt;
        if (num(v) == null) { txt = fmtBasic(v); if (v === '∞') bg = 'rgba(60,170,90,.7)'; }
        else if (mode === 'price') {
          const ok = num(pref) != null ? v >= pref : false;
          const a = num(pref) ? Math.min(1, Math.abs(v / pref - 1) * 2) * .7 + .15 : .3;
          bg = ok ? 'rgba(60,170,90,' + a + ')' : 'rgba(210,70,70,' + a + ')';
          txt = NF0.format(v);
        } else {
          const a = Math.min(1, Math.abs(v) / maxAbs) * .7 + .12;
          bg = v >= 0 ? 'rgba(60,170,90,' + a + ')' : 'rgba(210,70,70,' + a + ')';
          txt = NF1.format(v);
        }
        return '<td class="c" style="background:' + bg + '">' + txt + '</td>';
      }).join('');
      return '<tr><th>' + fmt(gA(sheet + '!A' + r), 'pct') + '</th>' + tds + '</tr>';
    }).join('');
    $(id).innerHTML = '<table class="heat"><thead><tr>' + hd.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table>';
  }
  function renderSens() {
    const pref = gA('假设输入!B20');
    heat('heatA', [20, 21, 22, 23], 19, '合理价格', 'price', pref);
    heat('heatB', [28, 29, 30, 31], 27, '合理价格', 'price', pref);
    heat('heatH', [5, 6, 7, 8], 4, '持有期买vs租', 'diff');
    $('noteHB').innerHTML = '绿=≥拟买单价 ' + fmt(pref, 'm2') + '，红=低于。' + esc(fmtPlain(gA('合理价格!A34')));
    $('noteHH').textContent = fmtPlain(gA('持有期买vs租!A10'));
  }
  let liveTimer;
  function renderSensLive() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      try {
        const S = ModelB.createModel();
        const base = [];
        for (const r in ModelB.inputs) { const v = gB(r); if (v !== ModelB.inputs[r] && !isErr(v)) base.push([r, v]); }
        const cur = r => num(gB(r));
        const cases = [
          ['基准（当前参数）', []],
          ['收入 −20%', [['家庭参数!J6', cur('家庭参数!J6') * 0.8]]],
          ['收入 +20%', [['家庭参数!J6', cur('家庭参数!J6') * 1.2]]],
          ['储蓄 −50%', [['家庭参数!J14', cur('家庭参数!J14') * 0.5]]],
          ['储蓄 +50%', [['家庭参数!J14', cur('家庭参数!J14') * 1.5]]],
          ['年里程 ×1.5', [['家庭参数!J16', cur('家庭参数!J16') * 1.5]]],
          ['机会成本利率 = 5%', [['家庭参数!J20', 0.05]]],
          ['车贷利率 = 6%', [['约束规则!B21', 0.06]]]
        ];
        const rows = cases.map(([name, ch]) => {
          S.reset(); base.forEach(([r, v]) => S.set(r, v));
          ch.forEach(([r, v]) => { if (v != null && isFinite(v)) S.set(r, v); });
          S.warm();
          const p = S.get('推荐结果!B11'), pt = S.get('推荐结果!B12');
          return [esc(name), typeof p === 'number' ? fmt(p, 'wan') : fmtBasic(p), esc(PT[pt] || fmtPlain(pt) || '—'), fmtBasic(S.get('推荐结果!B10')), fmt(S.get('推荐结果!B14'), 'wan')];
        });
        S.reset();
        $('sensLive').innerHTML = table(['情形', '推荐车价', '推荐动力', '状态', 'NPV'], rows, rows.map((r, i) => i === 0 ? 'rec' : ''));
      } catch (e) { $('sensLive').innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
    }, 60);
  }
  let staticInfo = null;
  function renderSensStatic() {
    if (!staticInfo) {
      let maxC = 0;
      for (let c = 0; c < 30; c++) { for (const r of [3, 4]) if (!empty(gB('敏感性!' + colName(c) + r))) maxC = c; }
      const fams = [];
      for (let r = 4; r <= 139; r++) { const f = gB('敏感性!A' + r); if (!empty(f) && !fams.includes(String(f))) fams.push(String(f)); }
      staticInfo = { maxC, fams };
      const def = fams.find(f => f === 'H3 双职有房贷1孩') || fams.find(f => /^H3/.test(f)) || fams[0];
      state.fam = def;
      $('sensFam').innerHTML = '<option value="__all">全部</option>' + fams.map(f => '<option' + (f === def ? ' selected' : '') + '>' + esc(f) + '</option>').join('');
      $('sensFam').onchange = e => { state.fam = e.target.value; renderSensStatic(); };
    }
    const cols = d3.range(0, staticInfo.maxC + 1).map(colName);
    const hdrRow = 3;
    const hd = cols.map(c => fmtBasic(gB('敏感性!' + c + hdrRow)));
    const rows = [];
    for (let r = 4; r <= 139; r++) {
      const f = gB('敏感性!A' + r);
      if (r === hdrRow) continue;
      if (state.fam !== '__all' && String(f) !== state.fam) continue;
      if (cols.every(c => empty(gB('敏感性!' + c + r)))) continue;
      rows.push(cols.map(c => fmtBasic(gB('敏感性!' + c + r))));
    }
    $('sensStatic').innerHTML = rows.length ? table(hd, rows) : '<span class="todo">待补</span>';
  }

  const DTABS = ['情景对比', '逐年现金流', '资不抵债', '购车方案评估', '家庭财务路径', '静态脚本求解结果'];
  function renderData() {
    const el = $('dbody'); const t = state.dtab;
    if (t === 0) {
      const cols = 'BCDEFGHIJK'.split('');
      const rows = d3.range(30, 41).map(r => [fmtBasic(gA('结论!A' + r))].concat(cols.map(c => { const v = gA('结论!' + c + r); return typeof v === 'number' && Math.abs(v) >= 1000 ? fmt(v, 'yuanN') : fmtBasic(v); })));
      el.innerHTML = table([fmtBasic(gA('结论!A29')) || '指标'].concat(cols.map(c => fmtBasic(gA('结论!' + c + '29')))), rows);
    } else if (t === 1) {
      const sh = SHEETS[state.scen]; const cols = d3.range(0, 27).map(colName);
      el.innerHTML = '<p class="note">情景：' + esc(SCEN[state.scen]) + '（单位：元）</p>' + table(cols.map(c => fmtBasic(gA(sh + '!' + c + '4')) || c),
        YEARS.map(r => cols.map((c, i) => { const v = gA(sh + '!' + c + r); return i === 0 ? fmtBasic(v) : (typeof v === 'number' && Math.abs(v) >= 100 ? fmt(v, 'yuanN') : fmtBasic(v)); })));
    } else if (t === 2) {
      el.innerHTML = table(['A', 'B', 'C', 'D'].map(c => fmtBasic(gA('结论!' + c + '43'))), d3.range(44, 50).map(r => 'ABCD'.split('').map(c => fmtBasic(gA('结论!' + c + r)))));
    } else if (t === 3) {
      const recIdx = num(gB('推荐结果!B9')); const recRow = recIdx ? 4 + recIdx : -1;
      const C = [['A', '档位', 'wan'], ['B', '动力'], ['C', '贷款'], ['N', 'NPV(含时间)', 'wan'], ['P', '现金NPV', 'wan'], ['T', '储蓄率', 'pct'], ['U', '应急金(月)', 'w1'], ['V', '债务收入比', 'pct'], ['W', '现金EAC/收入', 'pct'], ['Y', '可行'], ['Z', '稳健'], ['AA', 'ΔNW', 'wan'], ['AB', '未通过项']];
      const rows = [], cls = [];
      for (let r = 5; r <= 68; r++) {
        rows.push(C.map(([c, , k]) => {
          const v = gB('方案评估!' + c + r);
          if (c === 'B') return esc(PT[v] || fmtPlain(v));
          if (c === 'C') return v === 1 ? '贷款' : v === 0 ? '全款' : fmtBasic(v);
          if (c === 'Y' || c === 'Z') return v === 1 ? '<span class="ok">✓</span>' : v === 0 ? '<span class="bad">✗</span>' : fmtBasic(v);
          return k ? fmt(v, k) : fmtBasic(v);
        }));
        cls.push(r === recRow ? 'rec' : (Number(gB('方案评估!Y' + r)) === 1 ? '' : 'infeas'));
      }
      el.innerHTML = '<p class="note">不买车基准：' + fmtBasic(gB('方案评估!A70')) + ' · 现金现值 ' + fmt(gB('方案评估!C70'), 'wan') + ' · 含时间NPV ' + fmt(gB('方案评估!E70'), 'wan') +
        ' · 首年储蓄率 ' + fmt(gB('方案评估!G70'), 'pct') + ' · 应急金 ' + fmt(gB('方案评估!I70'), 'mon') + '</p>' + table(C.map(c => c[1]), rows, cls);
    } else if (t === 4) {
      el.innerHTML = table('ABCD'.split('').map(c => fmtBasic(gB('对家庭财务的影响!' + c + '4')) || c),
        d3.range(5, 20).map(r => 'ABCD'.split('').map((c, i) => { const v = gB('对家庭财务的影响!' + c + r); return i ? fmt(v, 'yuanN') : fmtBasic(v); })));
    } else if (t === 5) {
      const rowsN = [17, 19].concat(d3.range(60, 85));
      const cols = 'ABCDEF'.split('');
      el.innerHTML = '<p><span class="badge static">静态值（Excel 内脚本求解，不随参数变化）</span></p>' +
        table(cols, rowsN.map(r => cols.map(c => { const v = gA('结论!' + c + r); return typeof v === 'number' && Math.abs(v) >= 1000 ? fmt(v, 'yuanN') : fmtBasic(v); })).filter(r => r.some(x => x.indexOf('—') < 0)));
    }
  }

  function renderStaticInfo() {
    const todo = [];
    for (let r = 6; r <= 81; r++) {
      const b = gA('假设输入!B' + r), d = gA('假设输入!D' + r);
      if (/待核实|待填/.test(fmtPlain(b) + fmtPlain(d))) todo.push([esc(fmtPlain(gA('假设输入!A' + r))), fmtBasic(b) + ' <span class="muted">' + esc(fmtPlain(gA('假设输入!C' + r))) + '</span>', '<span class="todo">' + (/待填/.test(fmtPlain(b) + fmtPlain(d)) ? '待填' : '待核实') + '</span> ' + fmtBasic(d)]);
    }
    $('todoList').innerHTML = todo.length ? table(['项目', '值', '说明'], todo) : '<span class="muted">无</span>';
    const sm = [];
    for (let r = 1; r <= 37; r++) { const v = gB('说明!A' + r); if (!empty(v)) sm.push('<p>' + fmtBasic(v) + '</p>'); }
    $('shuoming').innerHTML = sm.join('') || '<span class="todo">待补</span>';
    const src = [];
    for (let r = 4; r <= 34; r++) {
      const a = gA('数据来源!A' + r), b = gA('数据来源!B' + r), c = gA('数据来源!C' + r);
      if (empty(a) && empty(b) && empty(c)) continue;
      const cs = fmtPlain(c);
      const link = /^https?:\/\//.test(cs) ? '<a href="' + esc(cs) + '" target="_blank" rel="noopener">' + esc(cs.length > 50 ? cs.slice(0, 50) + '…' : cs) + '</a>' : (empty(c) ? '<span class="todo">待补</span>' : esc(cs));
      src.push([fmtBasic(a), fmtBasic(b), link]);
    }
    $('sources').innerHTML = table(['数据', '数值', '链接'], src);
    const gt = [];
    for (let r = 1; r <= 36; r++) {
      const cells = [];
      for (let c = 0; c < 12; c++) { const v = gA('g判断!' + colName(c) + r); if (!empty(v)) cells.push('<span class="muted">' + colName(c) + '</span> ' + (typeof v === 'number' && Math.abs(v) < 1 ? fmt(v, 'pct') : fmtBasic(v))); }
      if (cells.length) gt.push([String(r), cells.join(' &nbsp;│&nbsp; ')]);
    }
    $('gtable').innerHTML = '<style>#gtable td{text-align:left;white-space:normal}</style>' + table(['行', '内容'], gt);
    const iss = Array.isArray(window.ISSUES) ? window.ISSUES : [];
    $('issues').innerHTML = iss.length ? iss.map(i => '<div class="issue"><b>' + esc(i && i.title || '—') + '</b><div class="muted">' + esc(i && i.detail || '') + '</div></div>').join('') : '<span class="muted">待补</span>';
  }

  function renderAll() {
    const steps = [renderKPIs, renderTake, () => updaters.forEach(u => u()), renderLinkTable, renderCharts, renderSens, renderSensLive, renderData];
    steps.forEach(f => { try { f(); } catch (e) { showErr(e); } });
  }

  // ---------- init ----------
  try {
    $('scenSel').innerHTML = SCEN.map((s, i) => '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' + s + '</option>').join('');
    $('scenSel').onchange = e => { state.scen = +e.target.value; renderCharts(); renderData(); };
    $('loanSel').onchange = e => { state.loan = +e.target.value; renderCharts(); };
    $('linkSel').onchange = e => { state.link = e.target.value; recompute(); renderParams(); renderAll(); };
    $('resetBtn').onclick = () => { A.reset(); B.reset(); recompute(); renderParams(); renderAll(); };
    makeTabs($('ptabs'), PTABS, 0, i => { state.ptab = i; renderParams(); });
    makeTabs($('dtabs'), DTABS, 0, i => { state.dtab = i; renderData(); });
    renderParams();
    recompute();
    try { renderSensStatic(); } catch (e) { showErr(e); }
    try { renderStaticInfo(); } catch (e) { showErr(e); }
    window.addEventListener('resize', debounce(() => { try { renderCharts(); } catch (e) { showErr(e); } }, 150));
  } catch (e) { showErr(e); }
})();
