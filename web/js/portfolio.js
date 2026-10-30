/**
 * portfolio.js — 我的组合（持仓追踪）
 *
 * 数据模型（localStorage key: qdii-portfolio-v1）：
 *   { version: 1, cash: number, positions: [{ code, shares, avgCost, platform }] }
 *
 * 本地种子文件：web/portfolio/portfolio.json（整目录 gitignore，不提交）。
 * 首次访问（localStorage 为空）且文件存在时，以文件为种子写入 localStorage；
 * 之后一律以 localStorage 为准（编辑持久化、不丢改动）。
 * 部署到 GitHub Pages 时该文件不存在，访客自然落到 localStorage。
 *
 * 现值计算：场内 ETF 用 etf_price，场外用 nav（复用 main.js 的 window.STATE）。
 */
(function () {
  const KEY = 'qdii-portfolio-v1';
  const SEED_URL = './portfolio/portfolio.json';
  const PLATFORMS = ['支付宝', '天天基金', '理财通', '基金公司App', '券商App', '其他'];

  let state = null;
  let fundIndex = {};
  let editingCode = null;  // 非 null 时处于编辑态
  let formVisible = false;
  let tradeVisible = false;
  let tradeSide = 'buy';
  let filterType = 'all';  // all | offshore | etf

  function emptyPortfolio() {
    return { version: 1, cash: 0, realizedPnl: 0, positions: [], activity: [] };
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return (v && Array.isArray(v.positions)) ? v : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocal(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
  }

  async function readSeed() {
    try {
      const res = await fetch(SEED_URL, { cache: 'no-store' });
      if (!res.ok) return null;
      const v = await res.json();
      return (v && Array.isArray(v.positions)) ? v : null;
    } catch (_) {
      return null;
    }
  }

  function buildFundIndex() {
    const st = window.STATE || {};
    const idx = {};
    for (const cat of ['sp500', 'nasdaq_passive', 'active', 'global_index', 'global_other', 'etf']) {
      const src = st.data && st.data[cat];
      if (!src) continue;
      for (const s of (src.series || [])) {
        for (const sh of (s.shares || [])) {
          idx[String(sh.code)] = {
            code: sh.code,
            name: sh.name,
            display_name: s.display_name,
            category: cat,
            isEtf: cat === 'etf',
            nav: sh.nav,
            etf_price: sh.etf_price,
            currency: sh.currency,
          };
        }
      }
    }
    return idx;
  }

  function priceOf(f) {
    if (!f) return null;
    if (f.isEtf) return f.etf_price != null ? f.etf_price : f.nav;
    return f.nav;
  }

  function computeRows(p) {
    return (p.positions || []).map((pos) => {
      const f = fundIndex[String(pos.code)];
      const price = priceOf(f);
      const shares = Number(pos.shares) || 0;
      const avgCost = Number(pos.avgCost) || 0;
      const cost = shares * avgCost;
      const value = price != null ? shares * price : null;
      const pnl = value != null ? value - cost : null;
      const pnlPct = cost > 0 && pnl != null ? pnl / cost * 100 : null;
      return { pos, fund: f, price, shares, avgCost, cost, value, pnl, pnlPct };
    });
  }

  function money(n) {
    return n == null ? '--' : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    return n == null ? '--' : (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function cls(n) {
    return n == null ? '' : (n > 0 ? 'up' : n < 0 ? 'down' : 'text-stone-400');
  }

  function renderOverview(p, rows) {
    const cost = rows.reduce((a, r) => a + r.cost, 0);
    const value = rows.reduce((a, r) => a + (r.value != null ? r.value : r.cost), 0) + (Number(p.cash) || 0);
    const pnl = rows.reduce((a, r) => a + (r.pnl != null ? r.pnl : 0), 0);
    const pnlPct = cost > 0 ? pnl / cost * 100 : null;
    const realized = Number(p.realizedPnl) || 0;
    const totalPnl = pnl + realized;
    return `
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4">
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div class="text-[11px] text-stone-500 dark:text-stone-400">总金额（含现金）</div>
          <div class="text-lg sm:text-xl font-bold num mt-0.5" data-count="${value}" data-count-fmt="money">¥${money(value)}</div>
        </div>
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div class="text-[11px] text-stone-500 dark:text-stone-400">本金</div>
          <div class="text-lg sm:text-xl font-bold num mt-0.5" data-count="${cost}" data-count-fmt="money">¥${money(cost)}</div>
        </div>
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div class="text-[11px] text-stone-500 dark:text-stone-400">持有收益</div>
          <div class="text-lg sm:text-xl font-bold num mt-0.5 ${cls(pnl)}" data-count="${pnl}" data-count-fmt="money">${money(pnl)}</div>
        </div>
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div class="text-[11px] text-stone-500 dark:text-stone-400">已实现盈亏</div>
          <div class="text-lg sm:text-xl font-bold num mt-0.5 ${cls(realized)}" data-count="${realized}" data-count-fmt="money">${money(realized)}</div>
        </div>
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div class="text-[11px] text-stone-500 dark:text-stone-400">累计盈亏</div>
          <div class="text-lg sm:text-xl font-bold num mt-0.5 ${cls(totalPnl)}" data-count="${totalPnl}" data-count-fmt="money">${money(totalPnl)}</div>
        </div>
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div class="text-[11px] text-stone-500 dark:text-stone-400">收益率</div>
          <div class="text-lg sm:text-xl font-bold num mt-0.5 ${cls(pnlPct)}" data-count="${pnlPct}" data-count-fmt="pct">${pct(pnlPct)}</div>
        </div>
      </div>`;
  }

  function renderAllocation(rows) {
    const byCat = {};
    for (const r of rows) {
      if (!r.fund) continue;
      const label = r.fund.isEtf ? '场内 ETF' : (r.fund.display_name || r.fund.name);
      byCat[label] = (byCat[label] || 0) + (r.value != null ? r.value : r.cost);
    }
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
    if (!entries.length) return '';
    return `
      <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3 mb-4">
        <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">资产配比</div>
        <div class="space-y-1.5">
          ${entries.map(([label, v]) => {
            const w = v / total * 100;
            return `
              <div class="flex items-center gap-2">
                <div class="text-xs text-stone-500 dark:text-stone-400 w-32 truncate flex-shrink-0">${label}</div>
                <div class="flex-1 h-2 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
                  <div class="h-full rounded-full bg-indigo-400 dark:bg-indigo-500" style="width:${w.toFixed(1)}%"></div>
                </div>
                <div class="text-xs num w-12 text-right flex-shrink-0">${w.toFixed(1)}%</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderRows(p, rows) {
    if (!rows.length) {
      return `
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-10 text-center text-stone-400 dark:text-stone-500 text-sm">
          还没有持仓。点右上角「添加持仓」，录入基金和「本金 / 总金额 / 持有收益」中的两个即可开始追踪。
        </div>`;
    }
    const body = rows.map((r, i) => {
      const name = r.fund ? (r.fund.isEtf ? r.fund.name : r.fund.display_name) : r.pos.code;
      const code = r.pos.code;
      const plat = r.pos.platform ? `<span class="platform-tag">${r.pos.platform}</span>` : '';
      return `
        <tr class="border-b border-stone-100 dark:border-stone-700/50">
          <td class="py-2.5 px-3">
            <div class="font-medium truncate">${name}</div>
            <div class="text-xs text-stone-500 dark:text-stone-400 num mt-0.5">${code} ${plat}</div>
            <div class="text-[11px] text-stone-400 dark:text-stone-500 num mt-0.5">${money(r.shares)} 份，成本 ${money(r.avgCost)}，现价 ${money(r.price)}</div>
          </td>
          <td class="py-2.5 px-3 text-right num">¥${money(r.cost)}</td>
          <td class="py-2.5 px-3 text-right num font-medium">${money(r.value)}</td>
          <td class="py-2.5 px-3 text-right num ${cls(r.pnl)}">${money(r.pnl)}</td>
          <td class="py-2.5 px-3 text-right num ${cls(r.pnlPct)}">${pct(r.pnlPct)}</td>
          <td class="py-2.5 px-3 text-right whitespace-nowrap">
            <button type="button" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline" data-edit="${i}">编辑</button>
            <button type="button" class="text-xs text-rose-600 dark:text-rose-400 hover:underline ml-2" data-del="${i}">删除</button>
          </td>
        </tr>`;
    }).join('');
    return `
      <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-x-auto mb-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
              <th class="text-left py-2 px-3 font-medium">基金</th>
              <th class="text-right py-2 px-3 font-medium">本金</th>
              <th class="text-right py-2 px-3 font-medium">总金额</th>
              <th class="text-right py-2 px-3 font-medium">持有收益</th>
              <th class="text-right py-2 px-3 font-medium">盈亏%</th>
              <th class="text-right py-2 px-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function renderForm(p) {
    const editing = editingCode != null;
    const pos = editing ? (p.positions || []).find(x => x.code === editingCode) : null;
    const opts = PLATFORMS.map(x => `<option value="${x}"${pos && pos.platform === x ? ' selected' : ''}>${x}</option>`).join('');
    const principal = pos ? (Number(pos.shares) * Number(pos.avgCost)) : '';
    const curNav = pos ? priceOf(fundIndex[pos.code]) : null;
    const total = (pos && curNav != null) ? Number(pos.shares) * curNav : '';
    const gain = (principal !== '' && total !== '') ? total - principal : '';
    return `
      <div id="portfolio-form" class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3 mb-4">
        <div class="text-sm font-medium mb-2">${editing ? '编辑持仓' : '添加持仓'}</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <input id="pf-code" list="pf-fund-list" placeholder="基金代码 / 名称" value="${pos ? pos.code : ''}" class="col-span-2 sm:col-span-1 px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="pf-principal" type="number" step="any" placeholder="本金（投入）" value="${principal !== '' ? Number(principal).toFixed(2) : ''}" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="pf-total" type="number" step="any" placeholder="总金额（市值）" value="${total !== '' ? Number(total).toFixed(2) : ''}" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="pf-gain" type="number" step="any" placeholder="持有收益" value="${gain !== '' ? Number(gain).toFixed(2) : ''}" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <select id="pf-platform" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm">${opts}</select>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button type="button" id="pf-save" class="px-6 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">确认</button>
          <button type="button" id="pf-cancel" class="px-4 py-2 rounded-md border border-stone-300 dark:border-stone-600 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">取消</button>
        </div>
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mt-1.5">本金 + 持有收益 = 总金额。填任意两个，第三个自动算；份额、成本价按当前净值自动填充。</div>
        <datalist id="pf-fund-list"></datalist>
      </div>`;
  }

  function renderActions(p) {
    const cash = Number(p.cash) || 0;
    return `
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" id="pf-add-btn" class="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">＋ 添加持仓</button>
        <button type="button" id="pf-trade-btn" class="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">⇄ 记录交易</button>
        <label class="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
          现金
          <input id="pf-cash" type="number" step="any" value="${cash}" class="w-32 px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm num" />
          元
        </label>
      </div>`;
  }

  function renderTradeForm() {
    return `
      <div id="trade-form" class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3 mb-4">
        <div class="text-sm font-medium mb-2">记录交易</div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div class="flex rounded-md border border-stone-300 dark:border-stone-600 overflow-hidden">
            <button type="button" id="trd-buy" class="flex-1 px-2 py-1.5 text-sm ${tradeSide === 'buy' ? 'bg-emerald-600 text-white' : 'text-stone-500 dark:text-stone-400'}">买入</button>
            <button type="button" id="trd-sell" class="flex-1 px-2 py-1.5 text-sm ${tradeSide === 'sell' ? 'bg-rose-600 text-white' : 'text-stone-500 dark:text-stone-400'}">卖出</button>
          </div>
          <input id="trd-code" list="pf-fund-list" placeholder="基金代码 / 名称" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="trd-amount" type="number" step="any" min="0" placeholder="${tradeSide === 'buy' ? '买入金额' : '卖出金额'}" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="trd-nav" type="number" step="any" min="0" placeholder="净值（可选）" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="trd-fee" type="number" step="any" min="0" placeholder="手续费（可选）" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
          <input id="trd-date" type="date" value="${todayStr()}" class="px-2 py-1.5 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-sm" />
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button type="button" id="trd-save" class="px-6 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">确认</button>
          <button type="button" id="trd-cancel" class="px-4 py-2 rounded-md border border-stone-300 dark:border-stone-600 text-sm hover:bg-stone-100 dark:hover:bg-stone-700">取消</button>
        </div>
        <div class="text-[11px] text-stone-400 dark:text-stone-500 mt-1.5">买入：金额 ÷ 净值 → 份额；卖出：金额 ÷ 净值 → 份额，按平均成本算已实现盈亏（净值默认当前净值）。</div>
      </div>`;
  }

  function renderActivity(p) {
    const acts = (p.activity || []).slice(-8).reverse();
    if (!acts.length) return '';
    const rows = acts.map(a => {
      const f = fundIndex[String(a.code)];
      const name = f ? (f.isEtf ? f.name : f.display_name) : a.code;
      const side = a.side === 'buy' ? '<span class="up">买入</span>' : '<span class="down">卖出</span>';
      return `<div class="flex items-center justify-between gap-3 py-1.5 border-b border-stone-100 dark:border-stone-700/50 last:border-0">
        <div class="min-w-0">
          <div class="text-xs truncate">${side} ${name}</div>
          <div class="text-[11px] text-stone-400 dark:text-stone-500 num">${a.date || ''}，${money(a.qty)} 份 @ ${money(a.price)}${a.fee ? '，费 ' + money(a.fee) : ''}</div>
        </div>
        <div class="text-xs num whitespace-nowrap">${money(a.amount)}</div>
      </div>`;
    }).join('');
    return `
      <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3 mb-4">
        <div class="text-xs font-medium text-stone-500 dark:text-stone-400 mb-2">最近交易</div>
        ${rows}
      </div>`;
  }

  function renderFilter(rows) {
    const offCount = rows.filter(r => r.fund && !r.fund.isEtf).length;
    const etfCount = rows.filter(r => r.fund && r.fund.isEtf).length;
    const opts = [
      { key: 'all', label: `全部 ${rows.length}` },
      { key: 'offshore', label: `场外基金 ${offCount}` },
      { key: 'etf', label: `场内 ETF ${etfCount}` },
    ];
    return `
      <div class="flex flex-wrap gap-2 mb-3">
        ${opts.map(o => `<button type="button" class="chip${filterType === o.key ? ' chip-active' : ''}" data-pf-filter="${o.key}">${o.label}</button>`).join('')}
      </div>`;
  }

  function render(animate) {
    const root = document.getElementById('portfolio-root');
    const countEl = document.getElementById('count-portfolio');
    if (!root) return;
    fundIndex = buildFundIndex();
    const p = state || emptyPortfolio();
    const rows = computeRows(p);
    const filteredRows = filterType === 'all'
      ? rows
      : rows.filter(r => r.fund && r.fund.isEtf === (filterType === 'etf'));

    root.innerHTML = `
      ${renderOverview(p, rows)}
      ${renderFilter(rows)}
      ${renderAllocation(filteredRows)}
      ${renderForm(p)}
      ${tradeVisible ? renderTradeForm() : ''}
      ${renderActions(p)}
      ${renderRows(p, filteredRows)}
      ${renderActivity(p)}`;

    if (animate) {
      root.querySelectorAll('[data-count]').forEach((el) => {
        const to = Number(el.dataset.count);
        if (!isFinite(to)) return;
        const fmt = el.dataset.countFmt === 'pct'
          ? function (v) { return pct(v); }
          : function (v) { return money(v); };
        animateCount(el, to, { fmt });
      });
    }

    if (countEl) countEl.textContent = `${filteredRows.length} 只持仓`;
    bindEvents(p);
    fillDatalist();
  }

  function fillDatalist() {
    const dl = document.getElementById('pf-fund-list');
    if (!dl) return;
    const arr = Object.values(fundIndex);
    dl.innerHTML = arr.map(f => `<option value="${f.code}">${f.name}</option>`).join('');
  }

  function bindEvents(p) {
    const form = document.getElementById('portfolio-form');
    const addBtn = document.getElementById('pf-add-btn');
    const saveBtn = document.getElementById('pf-save');
    const cancelBtn = document.getElementById('pf-cancel');
    const cashInput = document.getElementById('pf-cash');

    if (addBtn) addBtn.onclick = () => { editingCode = null; formVisible = true; render(); };
    if (cancelBtn) cancelBtn.onclick = () => { editingCode = null; formVisible = false; render(); };
    if (saveBtn) saveBtn.onclick = () => savePosition(p);
    if (cashInput) cashInput.onchange = () => {
      p.cash = Number(cashInput.value) || 0;
      writeLocal(p);
      render();
    };
    const tradeBtn = document.getElementById('pf-trade-btn');
    const tradeForm = document.getElementById('trade-form');
    const trdBuy = document.getElementById('trd-buy');
    const trdSell = document.getElementById('trd-sell');
    const trdSave = document.getElementById('trd-save');
    const trdCancel = document.getElementById('trd-cancel');
    if (tradeBtn) tradeBtn.onclick = () => { tradeVisible = true; render(); };
    if (trdCancel) trdCancel.onclick = () => { tradeVisible = false; render(); };
    if (trdBuy) trdBuy.onclick = () => { tradeSide = 'buy'; render(); };
    if (trdSell) trdSell.onclick = () => { tradeSide = 'sell'; render(); };
    if (trdSave) trdSave.onclick = () => applyTrade(p);
    if (tradeForm) tradeForm.style.display = tradeVisible ? '' : 'none';
    form.style.display = formVisible ? '' : 'none';

    // 本金 / 总金额 / 持有收益：填任意两个，第三个自动填充
    const principalInput = document.getElementById('pf-principal');
    const totalInput = document.getElementById('pf-total');
    const gainInput = document.getElementById('pf-gain');
    function autofill() {
      const a = principalInput && principalInput.value !== '' ? Number(principalInput.value) : null;
      const b = totalInput && totalInput.value !== '' ? Number(totalInput.value) : null;
      const c = gainInput && gainInput.value !== '' ? Number(gainInput.value) : null;
      if (a !== null && b !== null && c === null) gainInput.value = (b - a).toFixed(2);
      else if (a !== null && c !== null && b === null) totalInput.value = (a + c).toFixed(2);
      else if (b !== null && c !== null && a === null) principalInput.value = (b - c).toFixed(2);
    }
    if (principalInput) principalInput.oninput = autofill;
    if (totalInput) totalInput.oninput = autofill;
    if (gainInput) gainInput.oninput = autofill;

    const root = document.getElementById('portfolio-root');
    root.querySelectorAll('[data-pf-filter]').forEach(btn => {
      btn.onclick = () => { filterType = btn.dataset.pfFilter; render(); };
    });
    root.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => {
        const r = computeRows(p)[Number(btn.dataset.edit)];
        if (!r) return;
        editingCode = r.pos.code;
        formVisible = true;
        render();
      };
    });
    root.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = () => {
        const r = computeRows(p)[Number(btn.dataset.del)];
        if (!r) return;
        p.positions = (p.positions || []).filter(x => x.code !== r.pos.code);
        writeLocal(p);
        editingCode = null;
        render();
      };
    });
  }

  function savePosition(p) {
    const codeInput = document.getElementById('pf-code');
    const principalInput = document.getElementById('pf-principal');
    const totalInput = document.getElementById('pf-total');
    const gainInput = document.getElementById('pf-gain');
    const platformInput = document.getElementById('pf-platform');
    const code = (codeInput.value || '').trim();
    const m = code.match(/(\d{6})/);
    const resolved = m ? m[1] : code;
    if (!fundIndex[resolved]) { alert('未找到该基金代码，请输入 6 位基金代码'); return; }
    let principal = principalInput.value !== '' ? Number(principalInput.value) : null;
    let total = totalInput.value !== '' ? Number(totalInput.value) : null;
    const gain = gainInput.value !== '' ? Number(gainInput.value) : null;
    if (principal === null && total !== null && gain !== null) principal = total - gain;
    if (total === null && principal !== null && gain !== null) total = principal + gain;
    if (principal === null || total === null) { alert('请至少填写 本金 / 总金额 / 持有收益 中的两个'); return; }
    if (!(total > 0)) { alert('总金额需大于 0'); return; }
    const curNav = priceOf(fundIndex[resolved]);
    if (!(curNav > 0)) { alert('当前净值暂不可用'); return; }
    const shares = total / curNav;
    const avgCost = principal / shares;

    const item = { code: resolved, shares, avgCost, platform: platformInput.value };
    const list = (p.positions || []).filter(x => x.code !== resolved);
    list.push(item);
    p.positions = list;
    writeLocal(p);
    editingCode = null;
    formVisible = false;
    render();
  }

  function todayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function applyTrade(p) {
    const codeInput = document.getElementById('trd-code');
    const amountInput = document.getElementById('trd-amount');
    const navInput = document.getElementById('trd-nav');
    const feeInput = document.getElementById('trd-fee');
    const dateInput = document.getElementById('trd-date');
    const code = (codeInput.value || '').trim();
    const m = code.match(/(\d{6})/);
    const resolved = m ? m[1] : code;
    if (!fundIndex[resolved]) { alert('未找到该基金代码，请输入 6 位基金代码'); return; }
    const amount = Number(amountInput.value);
    if (!(amount > 0)) { alert('请填写金额'); return; }
    const price = navInput.value ? Number(navInput.value) : priceOf(fundIndex[resolved]);
    if (!(price > 0)) { alert('当前净值暂不可用，请填写净值'); return; }
    const fee = feeInput.value ? Number(feeInput.value) : 0;
    const qty = amount / price;

    const list = (p.positions || []).slice();
    const idx = list.findIndex(x => x.code === resolved);
    const rec = { date: (dateInput && dateInput.value) || todayStr(), code: resolved, side: tradeSide, qty, price, fee, amount };

    if (tradeSide === 'buy') {
      const newCost = amount + fee;
      if (idx >= 0) {
        const pos = list[idx];
        pos.avgCost = (pos.shares * pos.avgCost + newCost) / (pos.shares + qty);
        pos.shares += qty;
      } else {
        list.push({ code: resolved, shares: qty, avgCost: newCost / qty, platform: '' });
      }
    } else {
      if (idx < 0) { alert('没有该基金的持仓可卖出'); return; }
      const pos = list[idx];
      const sellQty = Math.min(qty, pos.shares);
      const realized = (price - pos.avgCost) * sellQty - fee;
      p.realizedPnl = (Number(p.realizedPnl) || 0) + realized;
      pos.shares -= sellQty;
      if (pos.shares <= 1e-9) list.splice(idx, 1);
    }

    p.positions = list;
    p.activity = p.activity || [];
    p.activity.push(rec);
    writeLocal(p);
    tradeVisible = false;
    render();
  }

  async function init() {
    let p = readLocal();
    if (!p) {
      p = await readSeed();
      if (p) writeLocal(p);
    }
    p = p || emptyPortfolio();
    p.realizedPnl = Number(p.realizedPnl) || 0;
    p.activity = Array.isArray(p.activity) ? p.activity : [];
    state = p;
    render();
  }

  window.renderPortfolio = function () { render(true); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
