// ==================== render-modal.js — 基金详情 Modal ====================
// 从 main.js 提取。持仓详情 Modal 的打开/关闭/渲染/自动刷新。
// 通过 window.STATE 访问全局数据，通过 window.openModal/closeModal 控制弹窗。

(function () {
  let modalLastFocus = null;
  let detailRefreshTimer = null;

  async function openDetail(code, evt) {
    if (evt) evt.stopPropagation();

    // 找到这只基金所在的系列（扩大到全部场外分类）
    let series = null, share = null;
    for (const cat of ['active', 'global_other', 'sp500', 'nasdaq_passive', 'global_index']) {
      const d = window.STATE.data[cat];
      if (!d) continue;
      for (const s of d.series) {
        const sh = s.shares.find(x => x.code === code);
        if (sh) { series = s; share = sh; break; }
      }
      if (series) break;
    }
    if (!series) { alert('未找到基金数据'); return; }

    modalLastFocus = window.openModal('detailModal', { closeBtnId: 'detail-close' });

    // 先填基础信息（来自列表数据）
    renderDetailBasic(series, share);

    // 持仓加载 + 自动刷新
    const _detailCode = code;
    const _detailSeries = series;
    const _detailShare = share;

    async function loadHoldings() {
      try {
        const res = await fetch(`./data/holdings/${_detailCode}.json`);
        if (!res.ok) throw new Error('持仓数据未抓取');
        const holdings = await res.json();

        // 动态刷新 Top10 股票"当日涨跌"
        try {
          const codes = (holdings.holdings || []).map(h => h.stock_code).filter(Boolean);
          if (codes.length) {
            const live = await window.fetchStocksLive(codes);
            for (const [c, r] of Object.entries(live)) {
              const existing = window.STATE.stocks[c] || {};
              window.STATE.stocks[c] = {
                ...existing, code: c,
                market: r.market || existing.market,
                price: r.price != null ? r.price : existing.price,
                change_pct: r.change_pct != null ? r.change_pct : existing.change_pct,
              };
            }
          }
        } catch (_) { /* 静默降级 */ }

        renderDetailHoldings(holdings, _detailCode);
      } catch (e) {
        document.getElementById('detail-holdings').innerHTML =
          '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">暂无持仓数据（可能是新基金或季报未披露）</div>';
      }
    }

    await loadHoldings();

    // 自动刷新：盘中时每 5 分钟刷新持仓行情
    if (detailRefreshTimer) clearInterval(detailRefreshTimer);
    detailRefreshTimer = setInterval(() => {
      if (document.getElementById('detailModal').classList.contains('hidden')) {
        clearInterval(detailRefreshTimer);
        detailRefreshTimer = null;
        return;
      }
      if (!window.isTradingDay || !window.isTradingDay() || document.hidden) return;
      loadHoldings();
    }, 5 * 60 * 1000);
  }

  function closeDetail() {
    window.closeModal('detailModal', modalLastFocus);
    if (detailRefreshTimer) {
      clearInterval(detailRefreshTimer);
      detailRefreshTimer = null;
    }
  }

  function renderDetailBasic(series, share) {
    document.getElementById('detail-title').textContent = series.display_name;
    document.getElementById('detail-subtitle').innerHTML =
      '<span class="num">' + share.code + '</span>，' + share.share_class +
      (share.currency === '美元' ? '，美元' : '') +
      '<span class="badge badge-qdii ml-1">QDII</span>' +
      (share.manager ? '<span class="text-stone-500 dark:text-stone-400 ml-2">基金经理 <span class="text-stone-900 dark:text-stone-200 font-medium">' + share.manager + '</span></span>' : '');

    // 顶部信息卡片
    var infoCards = [
      { label: '基金规模', value: share.scale_raw || '--', sub: series.company },
      { label: '成立时间', value: share.established || '--', sub: '至今' },
      { label: '单位净值', value: share.nav ? share.nav.toFixed(4) : '--', sub: share.nav_date || '' },
      { label: '日涨跌', value: fmtPct(share.daily_change), sub: '当日', isChange: true, chgVal: share.daily_change },
      { label: '成立来收益', value: fmtPct(share.chg_since_inception), sub: '累计', isChange: true, chgVal: share.chg_since_inception },
      { label: '日买入限额', value: (share.buy_status && share.buy_status.includes('暂停')) ? '—' : fmtMoney(share.daily_limit), sub: share.buy_status || '' },
    ];
    document.getElementById('detail-info').innerHTML = infoCards.map(function (c) {
      var cls = c.isChange ? (c.chgVal > 0 ? 'up' : c.chgVal < 0 ? 'down' : '') : '';
      return '<div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-4">' +
        '<div class="text-xs text-stone-500 dark:text-stone-400">' + c.label + '</div>' +
        '<div class="text-xl font-bold mt-1 ' + cls + ' num">' + c.value + '</div>' +
        '<div class="text-xs text-stone-400 dark:text-stone-500 mt-1">' + c.sub + '</div></div>';
    }).join('');

    // 业绩表现
    var perfItems = [
      { label: '近1月', value: share.chg_1m }, { label: '近3月', value: share.chg_3m },
      { label: '近6月', value: share.chg_6m }, { label: '今年来', value: share.chg_ytd },
      { label: '近1年', value: share.chg_1y }, { label: '近3年', value: share.chg_3y },
      { label: '近5年', value: share.chg_5y }, { label: '成立来', value: share.chg_since_inception },
    ];
    document.getElementById('detail-perf').innerHTML = perfItems.map(function (p) {
      return '<div class="text-center p-3 rounded-lg bg-stone-50 dark:bg-stone-800">' +
        '<div class="text-xs text-stone-500 dark:text-stone-400 mb-1">' + p.label + '</div>' +
        '<div class="font-bold num ' + (p.value > 0 ? 'up' : p.value < 0 ? 'down' : '') + '">' + fmtPct(p.value) + '</div></div>';
    }).join('');

    // 费率结构
    var feeItems = [];
    if (share.first_buy_rate != null) feeItems.push({ label: '首档买入费', value: share.first_buy_rate === 0 ? '免费' : share.first_buy_rate + '%' });
    if (share.free_hold_days != null) feeItems.push({ label: '免赎回费持有天数', value: share.free_hold_days + ' 天', highlight: true });
    if (share.mgmt_fee != null) feeItems.push({ label: '管理费（年）', value: share.mgmt_fee + '%' });
    if (share.custody_fee != null) feeItems.push({ label: '托管费（年）', value: share.custody_fee + '%' });
    document.getElementById('detail-fee').innerHTML = feeItems.map(function (f) {
      return '<div class="flex justify-between py-2 border-b border-stone-100 dark:border-stone-700/50 last:border-0">' +
        '<span class="text-sm text-stone-500 dark:text-stone-400">' + f.label + '</span>' +
        '<span class="text-sm font-medium num ' + (f.highlight ? 'text-indigo-600 dark:text-indigo-400' : '') + '">' + f.value + '</span></div>';
    }).join('') || '<div class="text-sm text-stone-400 dark:text-stone-500 text-center py-4">暂无费率数据</div>';
  }

  function renderDetailHoldings(data, fundCode) {
    var container = document.getElementById('detail-holdings');
    if (!data.holdings || data.holdings.length === 0) {
      container.innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">暂无持仓数据</div>';
      return;
    }

    var summaryHtml =
      '<div class="grid grid-cols-3 gap-2 mb-4">' +
      '<div class="bg-indigo-50 dark:bg-stone-900/50 rounded-lg p-3 text-center"><div class="text-xs text-indigo-600 dark:text-stone-400">持仓只数</div><div class="text-xl font-bold text-indigo-900 dark:text-stone-200 num mt-1">' + data.holdings_count + ' 只</div></div>' +
      '<div class="bg-emerald-50 dark:bg-stone-900/50 rounded-lg p-3 text-center"><div class="text-xs text-emerald-600 dark:text-stone-400">Top10 总占比</div><div class="text-xl font-bold text-emerald-900 dark:text-stone-200 num mt-1">' + data.total_weight + '%</div></div>' +
      '<div class="bg-amber-50 dark:bg-stone-900/50 rounded-lg p-3 text-center"><div class="text-xs text-amber-600 dark:text-stone-400">重仓股（>5%）</div><div class="text-xl font-bold text-amber-900 dark:text-stone-200 num mt-1">' + data.heavy_count + ' 只</div></div></div>';

    var maxW = Math.max.apply(null, data.holdings.map(function (h) { return h.weight || 0; }));

    var listHtml =
      '<div class="text-xs text-stone-500 dark:text-stone-400 mb-2 flex justify-between flex-wrap gap-2">' +
      '<span>' + (data.latest_quarter || '最新季报') + '，当日涨跌按持仓股票所属市场分别取实时行情</span>' +
      '<span class="text-stone-400 dark:text-stone-500"><span class="mkt-dot open"></span>盘中实时 <span class="ml-2"><span class="mkt-dot closed"></span>已收盘</span>' +
      '<span class="ml-2">持仓截至 ' + (data.fetched_at || '').slice(0, 10) + '</span></span></div>' +
      '<table class="w-full text-sm"><thead class="text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700"><tr>' +
      '<th class="text-left py-2 font-medium w-8">#</th><th class="text-left py-2 font-medium">股票名称</th><th class="text-left py-2 font-medium">代码</th>' +
      '<th class="text-right py-2 font-medium">占净值比</th><th class="text-right py-2 font-medium">当日涨跌</th>' +
      '<th class="text-right py-2 font-medium">持仓市值</th><th class="w-32"></th></tr></thead><tbody>' +
      data.holdings.map(function (h, i) {
        var stock = window.STATE.stocks && window.STATE.stocks[h.stock_code];
        var chg = stock ? stock.change_pct : null;
        var market = stock && stock.market ? stock.market : (/^\d{5}$/.test(h.stock_code) ? 'HK' : /^\d{6}$/.test(h.stock_code) ? 'A' : 'US');
        var sess = getMarketSession(market);
        var dotTitle = sess === 'open' ? market + ' 市场盘中实时' : market + ' 市场已收盘，显示最近成交';
        var dot = '<span class="mkt-dot ' + sess + '" title="' + dotTitle + '"></span>';
        var chgInner = chg == null
          ? '<span class="text-stone-300 dark:text-stone-600">--</span>'
          : '<span class="' + (chg > 0 ? 'up' : chg < 0 ? 'down' : '') + '">' + (chg > 0 ? '+' : '') + chg.toFixed(2) + '%</span>';
        return '<tr class="border-b border-stone-50 dark:border-stone-700/50 hover:bg-stone-50/50 dark:hover:bg-stone-700/30">' +
          '<td class="py-2.5 text-stone-400 dark:text-stone-500 num">' + (h.rank || (i + 1)) + '</td>' +
          '<td class="py-2.5"><span class="font-medium">' + h.stock_name + '</span>' +
          (stock ? '<span class="badge ml-1 ' + (stock.market === 'US' ? 'badge-qdii' : stock.market === 'HK' ? 'badge-usd' : 'badge-cny') + '" style="font-size:9px;">' + stock.market + '</span>' : '') + '</td>' +
          '<td class="py-2.5 text-xs text-stone-500 dark:text-stone-400 num">' + h.stock_code + '</td>' +
          '<td class="py-2.5 text-right num font-bold">' + (h.weight ? h.weight.toFixed(2) : '--') + '%</td>' +
          '<td class="py-2.5 text-right num text-sm">' + dot + chgInner + '</td>' +
          '<td class="py-2.5 text-right num text-stone-500 dark:text-stone-400 text-xs">' + fmtMV(h.market_value) + '</td>' +
          '<td class="py-2.5 pl-3"><div class="h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-indigo-400 to-indigo-600" style="width:' + ((h.weight || 0) / maxW * 100) + '%"></div></div></td></tr>';
      }).join('') + '</tbody></table>';

    container.innerHTML = summaryHtml + listHtml;
  }

  // 暴露到全局
  window.openDetail = openDetail;
  window.closeDetail = closeDetail;
})();
