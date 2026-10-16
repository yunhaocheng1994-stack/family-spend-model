(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Intake = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var x = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
    return isFinite(x) ? x : null;
  }
  function pct(v) { var x = num(v); return x === null ? null : x / 100; }
  function b01(v) { if (v === null || v === undefined || v === '') return null; return (v === true || v === 1 || v === '1' || v === 'true' || v === '是') ? 1 : 0; }
  function isTrue(v) { return b01(v) === 1; }
  function isFalse(v) { return b01(v) === 0; }

  var SECTIONS = [
    { id: 'income', label: '收入稳不稳', help: '两个人每月到手多少、工作稳不稳，决定能扛多大的月供。' },
    { id: 'assets', label: '家里有多少钱', help: '能随时动用的钱，以及公积金、已有房产。' },
    { id: 'debt', label: '已经欠的钱', help: '房贷以外的消费贷、车贷、信用卡分期等。' },
    { id: 'spending', label: '每月花销', help: '不含房租/房贷的日常生活支出。' },
    { id: 'home', label: '想买/想租的房子', help: '目标房子的面积、单价，和同类房子的租金。' },
    { id: 'family', label: '家庭计划', help: '孩子、父母、上学，这些是未来最大的固定开销。' },
    { id: 'insurance', label: '保险', help: '一场大病会不会把买房计划打乱。' },
    { id: 'mobility', label: '工作/城市流动性', help: '几年内会不会换城市、换工作？买房最怕被"锁住"。' },
    { id: 'car', label: '通勤/用车', help: '车到底是不是刚需，开多少、能不能在家充电。' },
    { id: 'risk', label: '风险偏好', help: '你更怕"少赚"，还是更怕"出事扛不住"？' },
    { id: 'horizon', label: '规划期限', help: '打算住多久、按多少年来算账。' }
  ];

  function F(o) {
    o.type = o.type || 'number';
    o.unit = o.unit || '';
    o.help = o.help || '';
    o.pending = !!o.pending;
    o.affects = o.affects || [];
    o.maps = o.maps || {};
    if (!('default' in o)) o.default = null;
    return o;
  }

  var FIELDS = [
    // 收入
    F({ key: 'male_income', section: 'income', label: '男方每月到手收入', help: '扣完五险一金和个税后实际到账的钱。', unit: '元/月', affects: ['housing', 'car', 'joint', 'emergency', 'robust'], maps: { inputs: 'male_income' } }),
    F({ key: 'female_income', section: 'income', label: '女方每月到手收入', help: '同上，没有收入填 0。', unit: '元/月', affects: ['housing', 'car', 'joint', 'emergency', 'robust'], maps: { inputs: 'female_income' } }),
    F({ key: 'industry', section: 'income', label: '主要收入人的行业', type: 'select', options: ['公务员/事业单位', '国企/央企', '外企/大厂', '民营企业', '自由职业/个体'], help: '行业越周期性，越要多备应急钱。', affects: ['emergency', 'robust', 'housing'], maps: {} }),
    F({ key: 'contract', section: 'income', label: '劳动合同类型', type: 'select', options: ['无固定期限', '固定期限', '劳务派遣', '无合同/灵活就业'], affects: ['emergency', 'robust', 'housing'], maps: {} }),
    F({ key: 'second_earner', section: 'income', label: '另一半也有稳定收入吗', type: 'bool', help: '双收入家庭一方失业时还能撑住月供。', affects: ['emergency', 'robust'], maps: {} }),
    F({ key: 'bonus_share', section: 'income', label: '奖金/提成占年收入比例', unit: '%', help: '奖金越多，收入波动越大。', affects: ['emergency', 'robust'], maps: {} }),
    F({ key: 'growth_m', section: 'income', label: '男方前些年收入年涨幅（扣通胀）', unit: '%', default: 3, help: '模型默认 3%。', affects: ['housing', 'joint'], maps: { adv: '生命周期参数!C8', transform: pct } }),
    F({ key: 'growth_m2', section: 'income', label: '男方后期收入年涨幅（扣通胀）', unit: '%', default: 1, affects: ['housing', 'joint'], maps: { adv: '生命周期参数!C10', transform: pct } }),
    F({ key: 'growth_f', section: 'income', label: '女方前些年收入年涨幅（扣通胀）', unit: '%', default: 2, affects: ['housing', 'joint'], maps: { adv: '生命周期参数!C18', transform: pct } }),
    F({ key: 'shock_age', section: 'income', label: '男方可能遭遇职业冲击的年龄', unit: '岁', default: 0, help: '如"35 岁危机"，填 0 表示不考虑。', affects: ['robust', 'housing', 'emergency'], maps: { adv: '生命周期参数!C14' } }),
    F({ key: 'shock_cut', section: 'income', label: '冲击后收入永久下调', unit: '%', default: null, affects: ['robust', 'housing'], maps: { adv: '生命周期参数!C15', transform: pct } }),
    F({ key: 'shock_months', section: 'income', label: '冲击时失业月数', unit: '月', default: null, affects: ['robust', 'emergency'], maps: { adv: '生命周期参数!C16' } }),
    F({ key: 'leave_age', section: 'income', label: '女方离职带娃的起始年龄', unit: '岁', default: 0, help: '不离职填 0。', affects: ['housing', 'joint', 'robust'], maps: { adv: '生命周期参数!C23' } }),
    F({ key: 'leave_years', section: 'income', label: '女方离职年数', unit: '年', default: null, affects: ['housing', 'joint', 'robust'], maps: { adv: '生命周期参数!C24' } }),
    // 资产
    F({ key: 'cash', section: 'assets', label: '活期/现金', unit: '元', help: '随时能取出来的钱。', affects: ['housing', 'joint', 'emergency'], maps: { inputs: 'cash', transform: function (v, vals) { var c = num(v), d = num(vals.deposit), s = num(vals.funds); if (c === null && d === null && s === null) return null; return (c || 0) + (d || 0) + (s || 0); } } }),
    F({ key: 'deposit', section: 'assets', label: '定期存款/大额存单', unit: '元', help: '会合并进现金送给模型（假设提前支取损失很小）。', affects: ['housing', 'emergency'], maps: {} }),
    F({ key: 'funds', section: 'assets', label: '基金/股票市值', unit: '元', help: '会合并进现金；但股市下跌时不宜当应急金。', affects: ['housing', 'emergency'], maps: {} }),
    F({ key: 'stock_return', section: 'assets', label: '股票类资产长期年化收益', unit: '%', default: 6, affects: ['housing', 'robust'], maps: { adv: '资金配置!C6', transform: pct } }),
    F({ key: 'male_hpf', section: 'assets', label: '男方公积金每月缴存（个人+单位）', unit: '元/月', affects: ['housing'], maps: { inputs: 'male_hpf' } }),
    F({ key: 'female_hpf', section: 'assets', label: '女方公积金每月缴存（个人+单位）', unit: '元/月', affects: ['housing'], maps: { inputs: 'female_hpf' } }),
    F({ key: 'hpf_balance', section: 'assets', label: '公积金账户余额（两人合计）', unit: '元', help: '用于判断首付能否提取，模型暂不直接使用。', affects: ['housing'], maps: {} }),
    F({ key: 'own_property', section: 'assets', label: '名下已有房产吗', type: 'bool', help: '影响首套/二套认定与首付比例。', affects: ['housing'], maps: {} }),
    F({ key: 'keep_cash', section: 'assets', label: '无论如何都要留的钱', unit: '元', help: '买房后账上最少留多少。', affects: ['housing', 'emergency', 'joint'], maps: { inputs: 'keep_cash' } }),
    // 负债
    F({ key: 'other_debt', section: 'debt', label: '房贷以外的欠款余额', unit: '元', help: '消费贷、车贷、信用卡分期合计。', affects: ['joint', 'emergency'], maps: {} }),
    F({ key: 'other_debt_monthly', section: 'debt', label: '这些欠款每月还多少', unit: '元/月', help: '会加进每月花销送给模型。', affects: ['joint', 'housing', 'emergency'], maps: {} }),
    // 支出
    F({ key: 'living', section: 'spending', label: '每月生活花销（不含房租/房贷）', unit: '元/月', affects: ['housing', 'car', 'joint', 'emergency'], maps: { inputs: 'living', transform: function (v, vals) { var l = num(v); if (l === null) return null; return l + (num(vals.other_debt_monthly) || 0); } } }),
    // 房子
    F({ key: 'area', section: 'home', label: '目标房子面积', unit: 'm²', affects: ['housing', 'joint'], maps: { inputs: 'area' } }),
    F({ key: 'price', section: 'home', label: '目标房子单价', unit: '元/m²', affects: ['housing', 'joint'], maps: { inputs: 'price' } }),
    F({ key: 'rent', section: 'home', label: '同类房子租金', unit: '元/m²/月', affects: ['housing', 'joint'], maps: { inputs: 'rent' } }),
    F({ key: 'mortgage_rate', section: 'home', label: '商业房贷利率', unit: '%', default: 3.05, help: '目前约为 5 年期 LPR 3.5% 减 0.45%。', affects: ['housing', 'joint'], maps: { adv: '假设输入!B12', transform: pct } }),
    F({ key: 'hpf_rate', section: 'home', label: '公积金贷款利率', unit: '%', default: 2.85, affects: ['housing'], maps: { adv: '假设输入!B13', transform: pct } }),
    F({ key: 'pay_cap', section: 'home', label: '月供最多占收入', unit: '%', default: 40, affects: ['housing', 'joint'], maps: { adv: '假设输入!B16', transform: pct } }),
    F({ key: 'rent_growth', section: 'home', label: '房租每年涨多少', unit: '%', default: 1, affects: ['housing'], maps: { adv: '假设输入!B30', transform: pct } }),
    // 家庭
    F({ key: 'child1', section: 'family', label: '老大出生年（已有或计划）', unit: '年', help: '不打算要填空。', affects: ['housing', 'joint', 'emergency'], maps: { inputs: 'child1' } }),
    F({ key: 'child2', section: 'family', label: '老二出生年（计划）', unit: '年', affects: ['housing', 'joint', 'emergency'], maps: { inputs: 'child2' } }),
    F({ key: 'parent_age', section: 'family', label: '父母中年龄最大的一位', unit: '岁', affects: ['joint', 'emergency', 'insurance'], maps: { inputs: 'parent_age' } }),
    F({ key: 'care_parents', section: 'family', label: '需要给父母养老钱吗', type: 'bool', affects: ['joint', 'emergency'], maps: { inputs: 'care_parents', transform: b01 } }),
    F({ key: 'parent_pension', section: 'family', label: '父母有退休金/养老金吗', type: 'bool', affects: ['emergency', 'insurance'], maps: {} }),
    F({ key: 'parent_health', section: 'family', label: '父母身体状况', type: 'select', options: ['健康', '有慢性病', '需要照护'], affects: ['emergency', 'insurance'], maps: {} }),
    F({ key: 'school_need', section: 'family', label: '孩子上学一定要进某个学区吗', type: 'bool', help: '学区是很多家庭"必须买"的主要原因。', affects: ['housing'], maps: {} }),
    // 保险
    F({ key: 'med_ins', section: 'insurance', label: '医疗保障', type: 'select', options: ['仅社保医保', '医保+百万医疗险', '医保+中高端医疗'], affects: ['insurance', 'emergency'], maps: {} }),
    F({ key: 'ci_ins', section: 'insurance', label: '两人都有重疾险吗', type: 'bool', help: '重疾险赔一笔钱，用来弥补生病期间收入损失。', affects: ['insurance', 'robust'], maps: {} }),
    F({ key: 'life_ins', section: 'insurance', label: '主要收入人有定期寿险吗', type: 'bool', help: '有房贷时，寿险保额最好覆盖剩余贷款。', affects: ['insurance', 'housing'], maps: {} }),
    F({ key: 'medical', section: 'insurance', label: '按一次大病/意外自付多少来测试', unit: '元', pending: true, help: '扣掉保险报销后，家里要自己掏的钱。', affects: ['insurance', 'emergency', 'robust'], maps: { inputs: 'medical' } }),
    // 流动性
    F({ key: 'job_mobility', section: 'mobility', label: '换工作/外派的可能性', type: 'select', options: ['低', '中', '高'], affects: ['housing', 'robust'], maps: {} }),
    F({ key: 'city_move_years', section: 'mobility', label: '多少年内可能换城市', unit: '年', help: '不会换城市就留空或填 99。', affects: ['housing', 'robust'], maps: {} }),
    // 车
    F({ key: 'car_city', section: 'car', label: '用车城市', type: 'select', options: ['深圳', '成都'], default: '深圳', affects: ['car'], maps: { inputs: 'car_city' } }),
    F({ key: 'km', section: 'car', label: '每年大概开多少公里', unit: 'km/年', pending: true, help: '模型沿用了示例值，请按实际确认。', affects: ['car', 'joint'], maps: { inputs: 'km' } }),
    F({ key: 'charger', section: 'car', label: '小区能装家用充电桩吗', type: 'bool', pending: true, affects: ['car'], maps: { inputs: 'charger', transform: b01 } }),
    F({ key: 'car_count', section: 'car', label: '家里现在有几辆车', unit: '辆', affects: ['car'], maps: {} }),
    F({ key: 'car_need', section: 'car', label: '能满足需求的最低车价', unit: '元', pending: true, affects: ['car', 'joint'], maps: { inputs: 'car_need' } }),
    F({ key: 'car_must', section: 'car', label: '用车是刚需吗（通勤/接送没别的办法）', type: 'bool', pending: true, affects: ['car', 'joint'], maps: {} }),
    F({ key: 'car_loan_rate', section: 'car', label: '车贷年利率', unit: '%', default: 3.5, pending: true, affects: ['car'], maps: { adv: '约束规则!B21', transform: pct } }),
    F({ key: 'car_loan_years', section: 'car', label: '车贷期限', unit: '年', default: 3, affects: ['car'], maps: { adv: '约束规则!B20' } }),
    F({ key: 'elec_price', section: 'car', label: '家充电价', unit: '元/kWh', default: 0.6, affects: ['car'], maps: { adv: '约束规则!B28' } }),
    F({ key: 'gas_price', section: 'car', label: '油价', unit: '元/L', default: 8, affects: ['car'], maps: { adv: '车辆参数!B22' } }),
    // 风险
    F({ key: 'risk_pref', section: 'risk', label: '你们更接近哪种', type: 'select', options: ['保守：宁可少赚也不能出事', '平衡：别后悔太多就行', '进取：按最可能的情况拼收益'], affects: ['robust', 'housing', 'joint'], maps: {} }),
    F({ key: 'g_expect', section: 'risk', label: '房价每年实际涨幅预期（扣通胀）', unit: '%', default: 0, help: '模型默认 0%，即与物价同步。', affects: ['housing', 'robust'], maps: { adv: '假设输入!B27', transform: pct } }),
    F({ key: 'inflation', section: 'risk', label: '长期通胀', unit: '%', default: 2, affects: ['housing', 'car'], maps: { adv: '假设输入!B42', transform: pct } }),
    // 期限
    F({ key: 'hold_years', section: 'horizon', label: '买了打算住多少年', unit: '年', default: 20, affects: ['housing', 'robust'], maps: { adv: '假设输入!B29' } }),
    F({ key: 'emergency_months', section: 'horizon', label: '应急金至少够几个月', unit: '月', default: 6, affects: ['emergency', 'joint'], maps: { adv: '约束规则!B4' } })
  ];

  var BY_KEY = {};
  FIELDS.forEach(function (f) { BY_KEY[f.key] = f; });

  var AFFECT_TEXT = { housing: '买房还是租房', car: '买什么车', joint: '房车组合是否安全', emergency: '应急金够不够', insurance: '保险是否够用', robust: '坏情况下扛不扛得住' };

  function rawVal(values, key) {
    if (!values) return null;
    var v = values[key];
    return (v === undefined || v === '' || (typeof v === 'number' && !isFinite(v))) ? null : v;
  }
  function effVal(values, f) {
    var v = rawVal(values, f.key);
    return v === null ? f.default : v;
  }
  function confirmed(values, key) {
    if (!values) return false;
    if (values.confirmed && values.confirmed[key] === true) return true;
    return values[key + '__confirmed'] === true;
  }

  function completeness(values) {
    values = values || {};
    var missing = [], filled = 0;
    FIELDS.forEach(function (f) {
      var v = effVal(values, f);
      var ok = v !== null && v !== undefined && (!f.pending || confirmed(values, f.key));
      if (ok) filled++;
      else {
        var why = (f.pending ? (v !== null ? '目前是待确认值，' : '还没填，') : '还没填，') + '会影响：' + f.affects.map(function (a) { return AFFECT_TEXT[a] || a; }).join('、');
        missing.push({ key: f.key, label: f.label, affects: f.affects.slice(), pending: f.pending, whyText: why });
      }
    });
    var total = FIELDS.length;
    return { pct: total ? Math.round(filled / total * 100) : 0, filled: filled, total: total, missing: missing };
  }

  function toEngine(values) {
    values = values || {};
    var inputs = {}, adv = {};
    FIELDS.forEach(function (f) {
      var m = f.maps || {};
      if (!m.inputs && !m.adv) return;
      var v = effVal(values, f);
      var out;
      if (m.transform) out = m.transform(v, values);
      else if (f.type === 'number') out = num(v);
      else out = v;
      if (out === null || out === undefined || (typeof out === 'number' && !isFinite(out))) {
        if (m.inputs === 'medical') inputs.medical = null;
        return;
      }
      if (m.inputs) inputs[m.inputs] = out;
      if (m.adv) adv[m.adv] = out;
    });
    return { inputs: inputs, adv: adv };
  }

  function modifiers(values) {
    values = values || {};
    var r = { emergencyMonthsAdd: 0, insurance: { light: 'na', reasons: [] }, school: { needed: false, text: '' }, housingConfidenceDelta: 0, carMust: null, preferRobust: 'baseBest', notes: [] };
    var contract = rawVal(values, 'contract'), ind = rawVal(values, 'industry'), bonus = num(rawVal(values, 'bonus_share'));
    if (contract === '劳务派遣' || contract === '无合同/灵活就业' || ind === '自由职业/个体' || (bonus !== null && bonus >= 30)) {
      r.emergencyMonthsAdd += 3;
      r.notes.push('收入波动较大（合同/行业/奖金占比），应急金建议在门槛上再加 3 个月。');
    }
    if (isFalse(rawVal(values, 'second_earner'))) {
      r.emergencyMonthsAdd += 1;
      r.notes.push('只有一份稳定收入，应急金多备 1 个月。');
    }
    if (isTrue(rawVal(values, 'care_parents')) && isFalse(rawVal(values, 'parent_pension'))) {
      r.emergencyMonthsAdd += 2;
      r.notes.push('需赡养无养老金的父母，应急金再加 2 个月。');
    }
    var ci = rawVal(values, 'ci_ins'), med = rawVal(values, 'med_ins'), life = rawVal(values, 'life_ins');
    if (isFalse(ci)) { r.insurance.light = 'fail'; r.insurance.reasons.push('没有重疾险：大病期间收入中断无法覆盖。'); }
    if (med === '仅社保医保') { r.insurance.light = 'fail'; r.insurance.reasons.push('只有社保医保：大额自费药和住院费没有保障。'); }
    if (isFalse(life)) { if (r.insurance.light !== 'fail') r.insurance.light = 'warn'; r.insurance.reasons.push('主要收入人没有定期寿险，若背房贷风险偏高。'); }
    if (r.insurance.light === 'na' && ci !== null && med !== null) r.insurance.light = 'pass';
    var ph = rawVal(values, 'parent_health');
    if (ph === '需要照护' || ph === '有慢性病') { r.emergencyMonthsAdd += 1; r.notes.push('父母健康需关注，应急金多备 1 个月。'); }
    if (isTrue(rawVal(values, 'school_need'))) {
      r.school.needed = true;
      r.school.text = '要学区：深圳公办入学多按积分排序，租房（需租赁备案）积分通常低于自有住房，热门学校租房读公办概率偏低；成都多按"房户一致"划片。请先查目标学校近 3 年积分线，再决定是否为学区而买。';
      r.housingConfidenceDelta -= 5;
    }
    var mob = rawVal(values, 'job_mobility');
    if (mob === '高') { r.housingConfidenceDelta -= 15; r.notes.push('工作流动性高，买房后被"锁住"的代价大，买房结论置信度下调。'); }
    else if (mob === '中') r.housingConfidenceDelta -= 5;
    var mv = num(rawVal(values, 'city_move_years'));
    if (mv !== null && mv <= 5) { r.housingConfidenceDelta -= 10; r.notes.push(mv + ' 年内可能换城市，买卖房交易成本难摊薄。'); }
    var cm = rawVal(values, 'car_must');
    r.carMust = cm === null ? null : isTrue(cm);
    var rp = rawVal(values, 'risk_pref') || '';
    if (rp.indexOf('保守') === 0) { r.preferRobust = 'maximin'; r.notes.push('风险偏好保守：优先看"最坏情况最好"的方案（maximin）。'); }
    else if (rp.indexOf('平衡') === 0) r.preferRobust = 'minimaxRegret';
    else r.preferRobust = 'baseBest';
    return r;
  }

  return { SECTIONS: SECTIONS, FIELDS: FIELDS, byKey: BY_KEY, completeness: completeness, toEngine: toEngine, modifiers: modifiers, _num: num };
});
