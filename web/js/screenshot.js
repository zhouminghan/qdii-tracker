/**
 * screenshot.js — 可定制截图导出模块
 * 依赖：utils.js（formatLimit / buyStatusClass / chgCls / chgArrow）
 * API：window.openScreenshotModal(tab, seriesList, groups)
 */
;(function () {
  'use strict';

  // ==================== 列定义 ====================
  const SCREENSHOT_COLS = {
    offshore: [
      { key: 'name',              label: '基金名称', locked: true },
      { key: 'code',              label: '代码' },
      { key: 'buy_status',        label: '申购状态', sortable: true },
      { key: 'chg_1m',            label: '近1月' },
      { key: 'chg_ytd',           label: '今年来' },
      { key: 'chg_1y',            label: '近1年' },
      { key: 'chg_since_inception', label: '成立来' },
      { key: 'total_fee',         label: '综合费率' },
    ],
    etf: [
      { key: 'name',         label: '基金名称', locked: true },
      { key: 'code',         label: '代码' },
      { key: 'buy_status',   label: '申购状态', sortable: true },
      { key: 'etf_price',    label: '最新价' },
      { key: 'etf_premium',  label: '溢价率' },
      { key: 'chg_1m',       label: '近1月' },
      { key: 'chg_ytd',      label: '今年来' },
      { key: 'chg_1y',       label: '近1年' },
      { key: 'total_fee',    label: '综合费率' },
    ],
  };

  // 默认选中列 + 排序（手机端精简）
  const DEFAULTS = {
    offshore: { cols: ['name','buy_status'], sort: 'buy_status', dir: 'desc' },
    etf:      { cols: ['name','buy_status'], sort: 'buy_status', dir: 'desc' },
  };

  // ==================== 状态 ====================
  let ssState = {
    tab: null,
    sp500: [],
    nasdaq: [],
    activeCols: [],
    sortKey: null,
    sortDir: 'desc',
    phoneMode: true,
    groupFilter: 'all',
    styleMode:   'cute',
    layoutMode:  'dense',   // 'dense' | 'balanced' | 'sparse'
  };

  // ==================== 数据展平（每系列仅取默认份额）====================
  function flattenByGroup(groups, targetKey) {
    const shares = [];
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].key !== targetKey) continue;
      const items = groups[i].items;
      for (let j = 0; j < items.length; j++) {
        const s = items[j];
        const defCode = s.default_share_code;
        const sh = s.shares.find(function (x) { return x.code === defCode; }) || s.shares[0];
        if (!sh || sh.currency === '美元') continue;
        shares.push({ ...sh, _seriesName: s.display_name || s.name });
      }
    }
    return shares;
  }

  // ==================== html-to-image 延迟加载 ====================
  let _htmlToImage = null;
  function loadHtmlToImage() {
    if (_htmlToImage) return Promise.resolve(_htmlToImage);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
      s.onload = function () { _htmlToImage = window.htmlToImage; resolve(_htmlToImage); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ==================== 公共 API ====================
  window.openScreenshotModal = function (tab, _seriesList, groups) {
    var cols = SCREENSHOT_COLS[tab];
    if (!cols) return;
    var d = DEFAULTS[tab];

    ssState.tab = tab;
    ssState.sp500 = flattenByGroup(groups, 'sp500');
    ssState.nasdaq = flattenByGroup(groups, 'nasdaq_passive');
    ssState.activeCols = d.cols;
    ssState.sortKey = d.sort;
    ssState.sortDir = d.dir;

    ssState.groupFilter = 'nasdaq';
    ssState.styleMode = 'cute';
    ssState.layoutMode = 'dense';
    var gf = document.getElementById('ss-group-filter');
    gf.querySelectorAll('.ss-chip-btn').forEach(function (b) { b.classList.remove('active'); });
    gf.querySelector('[data-val=\"nasdaq\"]').classList.add('active');
    var sf = document.getElementById('ss-style-filter');
    sf.querySelectorAll('.ss-chip-btn').forEach(function (b) { b.classList.remove('active'); });
    sf.querySelector('[data-val=\"cute\"]').classList.add('active');
    var lf = document.getElementById('ss-layout-filter');
    lf.querySelectorAll('.ss-chip-btn').forEach(function (b) { b.classList.remove('active'); });
    lf.querySelector('[data-val=\"dense\"]').classList.add('active');
    renderColumnPanel(cols);
    renderTemplate();
    document.getElementById('ss-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  window.closeScreenshotModal = function () {
    document.getElementById('ss-modal').classList.add('hidden');
    document.body.style.overflow = '';
  };

  // ==================== 列选择器 ====================
  function renderColumnPanel(cols) {
    var html = '';
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      var checked = ssState.activeCols.indexOf(c.key) !== -1;
      var disabled = c.locked ? ' disabled' : '';
      var lockedMark = c.locked ? ' <span style="color:#a8a29e;font-size:9px">·必选</span>' : '';
      html += '<label class="ss-col-item' + (checked ? ' checked' : '') + '">' +
        '<input type="checkbox" data-key="' + c.key + '"' +
        (checked ? ' checked' : '') + disabled + '>' +
        '<span>' + c.label + lockedMark + '</span>' +
        '</label>';
    }
    document.getElementById('ss-col-list').innerHTML = html;

    // 绑定事件
    var inputs = document.querySelectorAll('#ss-col-list input[type=checkbox]');
    for (var j = 0; j < inputs.length; j++) {
      inputs[j].addEventListener('change', onColToggle);
    }
  }

  function onColToggle(e) {
    var key = e.target.dataset.key;
    if (e.target.checked) {
      if (ssState.activeCols.indexOf(key) === -1) ssState.activeCols.push(key);
    } else {
      var idx = ssState.activeCols.indexOf(key);
      if (idx !== -1) ssState.activeCols.splice(idx, 1);
    }
    renderTemplate();
  }

  // ==================== 排序 ====================
  function sortShares(arr) {
    var key = ssState.sortKey;
    var dir = ssState.sortDir;

    if (key === 'buy_status') {
      // 按申购金额/限购程度排序：暂停=0，限大额=daily_limit，开放=极大值
      arr.sort(function (a, b) {
        var va = getBuySortValue(a), vb = getBuySortValue(b);
        return dir === 'desc' ? vb - va : va - vb;
      });
      return;
    }

    arr.sort(function (a, b) {
      var va = getSortValue(a, key), vb = getSortValue(b, key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return dir === 'desc' ? vb - va : va - vb;
    });
  }

  // 申购状态排序：暂停=-1 < 限大额(无额)=0 < 限大额=实际额度 < 开放=1e9
  function getBuySortValue(sh) {
    var st = sh.buy_status || '';
    if (st.includes('暂停')) return -1;
    if (st.includes('限')) {
      return (sh.daily_limit && sh.daily_limit > 0) ? sh.daily_limit : 0;
    }
    return 1e9; // 开放申购
  }

  function getSortValue(sh, key) {
    switch (key) {
      case 'daily_limit': return sh.daily_limit || 0;
      case 'nav':         return sh.nav;
      case 'etf_price':   return sh.etf_price;
      case 'etf_premium': return sh.etf_premium;
      case 'chg_1m': case 'chg_ytd': case 'chg_1y':
      case 'chg_since_inception': return sh[key];
      case 'total_fee':   return (sh.mgmt_fee || 0) + (sh.custody_fee || 0) + (sh.sale_service_fee || 0);
      default: return sh[key];
    }
  }

  function onThSortClick(key) {
    if (ssState.sortKey === key) {
      // 同列再次点击：切换方向
      ssState.sortDir = ssState.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      ssState.sortKey = key;
    }
    renderTemplate();
  }

  // ==================== 模板渲染 ====================
  function renderMktHeader() {
    var mkt = window.__mktData || {};
    var symbols = [
      { key: 'usINX',    label: '标普500',  digits: 2 },
      { key: 'usIXIC',   label: '纳指综合',  digits: 2 },
      { key: 'usNDX',    label: '纳指100',   digits: 2 },
      { key: 'fxUSDCNY', label: '美元/人民币', digits: 4 },
    ];

    function card(sym) {
      var d = mkt[sym.key] || {};
      var p = d.price, pct = d.changePct, chg = d.change;
      if (p == null) return '<div class="ss-mkt-card"><div class="ss-mkt-label">' + sym.label + '</div><div class="ss-mkt-price ss-muted">—</div></div>';
      if (pct == null) pct = 0;
      if (chg == null) chg = 0;
      var up = pct > 0, flat = Math.abs(pct) < 0.005;
      var cls = flat ? '' : (up ? 'up' : 'down');
      var arrow = flat ? '—' : (up ? '↑' : '↓');
      var sign = up ? '+' : '';
      var priceStr = p.toLocaleString('en-US', { minimumFractionDigits: sym.digits, maximumFractionDigits: sym.digits });
      return '<div class="ss-mkt-card">' +
        '<div class="ss-mkt-label">' + sym.label + '</div>' +
        '<div class="ss-mkt-price">' + priceStr + '</div>' +
        '<div class="ss-mkt-chg ' + cls + '">' + arrow + ' ' + sign + pct.toFixed(2) + '%</div>' +
        '<div class="ss-mkt-chg ' + cls + ' ss-mkt-pts">' + sign + chg.toFixed(sym.digits) + '</div>' +
        '</div>';
    }

    var now = new Date();
    var days = ['日','一','二','三','四','五','六'];
    var dateStr = now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 周' + days[now.getDay()];

    return '<div class="ss-date-header">' + dateStr + '</div>' +
      '<div class="ss-mkt-header">' +
      symbols.map(card).join('') +
      '</div>';
  }

  function renderFundTable(label, shares) {
    var cols = SCREENSHOT_COLS[ssState.tab];
    var selected = cols.filter(function (c) { return ssState.activeCols.indexOf(c.key) !== -1; });
    sortShares(shares);
    if (shares.length === 0) return '';

    // 表头
    var thead = '<tr>';
    for (var i = 0; i < selected.length; i++) {
      var c = selected[i];
      var sortable = c.sortable;
      var isCur = sortable && ssState.sortKey === c.key;
      var arrow = isCur ? (ssState.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      var curCls = isCur ? ' ss-th-active' : '';
      // 列宽：基金名称优先，申购状态收缩
      var colW = '';
      if (selected.length === 2) {
        colW = c.key === 'name' ? 'style="width:65%"' : 'style="width:35%"';
      } else if (selected.length === 3) {
        colW = c.key === 'name' ? 'style="width:50%"' : (c.key === 'buy_status' ? 'style="width:25%"' : 'style="width:25%"');
      }
      if (sortable) {
        thead += '<th class="ss-th-sort' + curCls + '" data-sort-key="' + c.key + '" ' + colW + '>' +
          c.label + '<span class="ss-th-arrow">' + arrow + '</span></th>';
      } else {
        thead += '<th ' + colW + '>' + c.label + '</th>';
      }
    }
    thead += '</tr>';

    // 表体
    var tbody = '';
    for (var j = 0; j < shares.length; j++) {
      var sh = shares[j];
      tbody += '<tr>';
      for (var k = 0; k < selected.length; k++) {
        var ckey = selected[k].key;
        var tdCls = '';
        if (isNumericCol(ckey)) tdCls = ' num';
        if (ckey === 'buy_status') tdCls = ' ss-td-status';
        tbody += '<td class="' + tdCls + '">' + cellValue(sh, ckey) + '</td>';
      }
      tbody += '</tr>';
    }

    // 双表结构：表头固定 + 表体滚动
    return '<div class="ss-section">' +
      '<div class="ss-section-title">' + label + ' · 申购 <span class="ss-section-count">' + shares.length + ' 只</span>' +
      (arguments[2] || '') + '</div>' +
      '<div class="ss-tbl-wrap">' +
      '<table class="ss-tbl-head"><thead>' + thead + '</thead></table>' +
      '<div class="ss-tbl-body"><table><tbody>' + tbody + '</tbody></table></div>' +
      '</div></div>';
  }

  function renderTemplate() {
    var phone = ssState.phoneMode;
    var f = ssState.groupFilter;
    var extraCls = ' ss-style-' + ssState.styleMode + ' ss-layout-' + ssState.layoutMode;
    var wrapOpen = phone ? '<div class="ss-phone-wrap' + extraCls + '">' : '';
    var wrapClose = phone ? '</div>' : '';
    var html = wrapOpen + renderMktHeader();
    var limitHtml = '';
    var allShares = [];
    if (f === 'all' || f === 'nasdaq') allShares = allShares.concat(ssState.nasdaq);
    if (f === 'all' || f === 'sp500')  allShares = allShares.concat(ssState.sp500);
    var totalLimit = 0;
    for (var x = 0; x < allShares.length; x++) {
      var st = allShares[x].buy_status || '';
      if (st.includes('限') && allShares[x].daily_limit > 0) totalLimit += allShares[x].daily_limit;
    }
    if (totalLimit > 0) {
      limitHtml = '<span class="ss-limit-inline">当日最多 ¥' + formatLimit(totalLimit) + '</span>';
    }
    if (f === 'all' || f === 'nasdaq') html += renderFundTable('纳斯达克100', ssState.nasdaq, limitHtml);
    else if (f === 'sp500') html += renderFundTable('标普500', ssState.sp500, limitHtml);
    if (f === 'all') html += renderFundTable('标普500', ssState.sp500);
    html += '<div class="ss-save-bar"><button class="ss-save-btn" onclick="downloadScreenshotPNG()">保存图片</button></div>';
    html += wrapClose;

    document.getElementById('ss-preview').innerHTML = html;

    // 列头点击排序
    document.querySelectorAll('#ss-preview th.ss-th-sort').forEach(function (th) {
      th.addEventListener('click', function () {
        onThSortClick(th.dataset.sortKey);
      });
    });

    // 手机/桌面切换按钮状态
    var phoneBtn = document.getElementById('ss-phone-btn');
    var deskBtn  = document.getElementById('ss-desk-btn');
    if (phoneBtn && deskBtn) {
      if (phone) { phoneBtn.classList.add('active'); deskBtn.classList.remove('active'); }
      else       { deskBtn.classList.add('active'); phoneBtn.classList.remove('active'); }
    }
  }

  window.togglePhoneMode = function (mode) {
    ssState.phoneMode = mode;
    renderTemplate();
  };

  function isNumericCol(key) {
    return ['nav','etf_price','etf_premium','chg_1m','chg_ytd','chg_1y',
            'chg_since_inception','daily_limit','total_fee'].indexOf(key) !== -1;
  }

  function cellValue(sh, key) {
    switch (key) {
      case 'name':
        return sh._seriesName || sh.name || '';
      case 'code':
        return sh.code || '';
      case 'share_class':
        return '<span class="ss-badge">' + (sh.share_class || '—') + '</span>';
      case 'buy_status':
        return statusBadgeHtml(sh);
      case 'daily_limit':
        if (sh.buy_status && sh.buy_status.includes('限') && sh.daily_limit > 0) {
          return '¥' + formatLimit(sh.daily_limit);
        }
        return '—';
      case 'nav':
        return sh.nav != null ? sh.nav.toFixed(4) : '—';
      case 'etf_price':
        return sh.etf_price != null ? sh.etf_price.toFixed(3) : '—';
      case 'etf_premium':
        return pctHtml(sh.etf_premium);
      case 'chg_1m': case 'chg_ytd': case 'chg_1y':
      case 'chg_since_inception':
        return pctHtml(sh[key]);
      case 'total_fee': {
        var fee = (sh.mgmt_fee || 0) + (sh.custody_fee || 0) + (sh.sale_service_fee || 0);
        return fee > 0 ? fee.toFixed(2) + '%' : '—';
      }
      default:
        return sh[key] != null ? String(sh[key]) : '—';
    }
  }

  function statusBadgeHtml(sh) {
    var st = sh.buy_status || '';
    if (!st || sh.currency === '美元') return '<span class="ss-muted">—</span>';
    if (st.includes('暂停'))       return '<span class="ss-badge ss-badge-paused">暂停</span>';
    if (st.includes('限') && sh.daily_limit > 0) return '<span class="ss-badge ss-badge-limit">限 ¥' + formatLimit(sh.daily_limit) + '</span>';
    if (st.includes('限') && !sh.daily_limit)    return '<span class="ss-muted">—</span>';
    return '<span class="ss-badge ss-badge-open">' + st + '</span>';
  }

  function pctHtml(v) {
    if (v == null) return '<span class="ss-muted">—</span>';
    var cls = chgCls(v);
    var sign = v > 0 ? '+' : '';
    var arrow = chgArrow(v);
    return '<span class="' + cls + '">' + arrow + sign + v.toFixed(2) + '%</span>';
  }

  // ==================== 下载 PNG ====================
  window.downloadScreenshotPNG = async function () {
    var preview = document.getElementById('ss-preview');
    if (!preview) return;

    var btn = document.getElementById('ss-download-btn');
    if (!btn) return;
    btn.textContent = '生成中...';
    btn.disabled = true;

    try {
      var lib = await loadHtmlToImage();
      var dataUrl = await lib.toPng(preview, {
        backgroundColor: '#fffbf7',
        pixelRatio: 2,
        filter: function (node) {
          return !(node.classList && node.classList.contains('ss-save-bar'));
        },
      });
      var a = document.createElement('a');
      a.href = dataUrl;
      var dateStr = new Date().toISOString().slice(0, 10);
      a.download = '纳斯达克100-标普500-' + dateStr + '.png';
      a.click();
    } catch (e) {
      console.error('Screenshot failed:', e);
      alert('截图失败，请重试');
    } finally {
      btn.textContent = '保存图片';
      btn.disabled = false;
    }
  };

  // ==================== 初始化 ====================
  // 分类 chip 切换（事件委托）
  document.getElementById('ss-group-filter').addEventListener('click', function (e) {
    var btn = e.target.closest('.ss-chip-btn');
    if (!btn) return;
    ssState.groupFilter = btn.dataset.val;
    this.querySelectorAll('.ss-chip-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderTemplate();
  });

  // 风格切换
  document.getElementById('ss-style-filter').addEventListener('click', function (e) {
    var btn = e.target.closest('.ss-chip-btn');
    if (!btn) return;
    ssState.styleMode = btn.dataset.val;
    this.querySelectorAll('.ss-chip-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderTemplate();
  });

  // 布局切换
  document.getElementById('ss-layout-filter').addEventListener('click', function (e) {
    var btn = e.target.closest('.ss-chip-btn');
    if (!btn) return;
    ssState.layoutMode = btn.dataset.val;
    this.querySelectorAll('.ss-chip-btn').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    renderTemplate();
  });

  // 点击 Modal 背景关闭
  document.getElementById('ss-modal').addEventListener('click', function (e) {
    if (e.target === this) window.closeScreenshotModal();
  });

  // ESC 关闭
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeScreenshotModal();
  });

})();
