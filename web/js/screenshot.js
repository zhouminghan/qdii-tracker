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
      { key: 'buy_status',        label: '申购', sortable: true },
      { key: 'nav',               label: '净值', sortable: true },
      { key: 'chg_1m',            label: '近1月', sortable: true },
      { key: 'chg_ytd',           label: '今年来', sortable: true },
      { key: 'chg_1y',            label: '近1年', sortable: true },
      { key: 'chg_since_inception', label: '成立来', sortable: true },
    ],
    etf: [
      { key: 'name',         label: '基金名称', locked: true },
      { key: 'code',         label: '代码' },
      { key: 'buy_status',   label: '申购', sortable: true },
      { key: 'etf_price',    label: '最新价', sortable: true },
      { key: 'etf_premium',  label: '溢价率', sortable: true },
      { key: 'nav',          label: '净值', sortable: true },
      { key: 'chg_1m',       label: '近1月', sortable: true },
      { key: 'chg_ytd',      label: '今年来', sortable: true },
      { key: 'chg_1y',       label: '近1年', sortable: true },
    ],
  };

  // 默认选中列 + 排序（手机端精简）
  const DEFAULTS = {
    offshore: { cols: ['name','buy_status'], sort: 'buy_status', dir: 'desc' },
    etf:      { cols: ['name','buy_status'], sort: 'buy_status', dir: 'desc' },
  };

  // 分类清单：key 对应 ssState 字段名 / chip data-val / 下载文件名
  const SS_CATEGORIES = [
    { id: 'nasdaq',  label: '纳斯达克100', fileLabel: '纳斯达克100', field: 'nasdaq',       srcKey: 'nasdaq_passive' },
    { id: 'sp500',   label: '标普500',      fileLabel: '标普500',     field: 'sp500',        srcKey: 'sp500' },
    { id: 'active',  label: '美股主动',      fileLabel: '美股主动',     field: 'activeFund',   srcKey: 'active' },
    { id: 'gidx',    label: '全球指数',      fileLabel: '全球指数',     field: 'globalIndex',  srcKey: 'global_index' },
    { id: 'goth',    label: '全球/其他',     fileLabel: '全球-其他',    field: 'globalOther',  srcKey: 'global_other' },
  ];

  // ==================== 状态 ====================
  let ssState = {
    tab: null,
    sp500: [],
    nasdaq: [],
    activeFund: [],
    globalIndex: [],
    globalOther: [],
    activeCols: [],
    sortKey: null,
    sortDir: 'desc',
    groupFilter: 'all',
    styleMode:   'cute',
    layoutMode:  'dense',
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

  // JSZip 延迟加载（全部模式打包下载用）
  let _jsZip = null;
  function loadJSZip() {
    if (_jsZip) return Promise.resolve(_jsZip);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
      s.onload = function () { _jsZip = window.JSZip; resolve(_jsZip); };
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
    for (var ci = 0; ci < SS_CATEGORIES.length; ci++) {
      ssState[SS_CATEGORIES[ci].field] = flattenByGroup(groups, SS_CATEGORIES[ci].srcKey);
    }
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
      if (c.locked) continue; // 必选列不显示开关
      var checked = ssState.activeCols.indexOf(c.key) !== -1;
      html += '<label class="ss-col-item' + (checked ? ' checked' : '') + '">' +
        '<input type="checkbox" data-key="' + c.key + '"' +
        (checked ? ' checked' : '') + '>' +
        '<span>' + c.label + '</span>' +
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
  // ==================== 内层1：市场指标块（日期 + 4个卡片）====================
  function renderMktBlock() {
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

    return '<div class="ss-inner ss-mkt-block">' +
      '<div class="ss-date-header">' + dateStr + '</div>' +
      '<div class="ss-mkt-header">' + symbols.map(card).join('') + '</div>' +
      '</div>';
  }

  function renderFundTable(label, shares, limitLabel, navHeaderDate) {
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
      // 表头对齐跟随数据列：数字列右对齐，状态列居中，其他左对齐
      var alignCls = '';
      if (c.key === 'buy_status') alignCls = ' ss-th-status';
      else if (isNumericCol(c.key)) alignCls = ' ss-th-num';
      var colW = '';
      if (selected.length <= 3) {
        colW = c.key === 'name' ? 'style="width:50%"' : (c.key === 'buy_status' ? 'style="width:25%"' : 'style="width:25%"');
      }
      var inner = c.label + '<span class="ss-th-arrow">' + arrow + '</span>';
      // 净值列：表头加日期副标题
      if (c.key === 'nav' && navHeaderDate) {
        inner = c.label + '<div class="ss-th-nav-date">' + navHeaderDate.slice(5) + '</div>' + '<span class="ss-th-arrow">' + arrow + '</span>';
      }
      if (sortable) {
        thead += '<th class="ss-th-sort' + curCls + alignCls + '" data-sort-key="' + c.key + '" ' + colW + '>' + inner + '</th>';
      } else {
        thead += '<th class="' + alignCls.trim() + '" ' + colW + '>' + inner + '</th>';
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

    // 单表结构：thead+tbody 同表，列宽自然对齐
    return '<div class="ss-section">' +
      '<div class="ss-section-title">' + label + ' · ' + shares.length + ' 只' + (limitLabel || '') + '</div>' +
      '<div class="ss-tbl-wrap"><table class="ss-tbl"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table></div>' +
      '</div>';
  }

  function renderTemplate() {
    var f = ssState.groupFilter;
    var extraCls = ' ss-style-' + ssState.styleMode + ' ss-layout-' + ssState.layoutMode;
    function calcLimit(shares) {
      var total = 0;
      for (var i = 0; i < shares.length; i++) {
        var st = shares[i].buy_status || '';
        if (st.includes('限') && shares[i].daily_limit > 0) total += shares[i].daily_limit;
      }
      return total;
    }
    function calcNavHeaderDate(shares) {
      var counts = {};
      for (var i = 0; i < shares.length; i++) {
        var d = shares[i].nav_date;
        if (!d) continue;
        counts[d] = (counts[d] || 0) + 1;
      }
      var best = '', bestN = 0;
      for (var d in counts) {
        if (counts[d] > bestN || (counts[d] === bestN && d > best)) { best = d; bestN = counts[d]; }
      }
      return best;
    }
    function limitLabel(v) { return v > 0 ? '<span class="ss-limit-inline">当日最多 ¥' + formatLimit(v) + '</span>' : ''; }

    var sectionsHtml = '';
    for (var ci = 0; ci < SS_CATEGORIES.length; ci++) {
      var cat = SS_CATEGORIES[ci];
      if (f !== 'all' && f !== cat.id) continue;
      var shares = ssState[cat.field];
      var lmt = calcLimit(shares);
      var navDate = calcNavHeaderDate(shares);
      sectionsHtml += renderFundTable(cat.label, shares, limitLabel(lmt), navDate);
    }

    var cardHtml =
      '<div class="ss-phone-wrap' + extraCls + '">' +
        renderMktBlock() +
        '<div class="ss-inner ss-table-block">' + sectionsHtml + '</div>' +
      '</div>';

    document.getElementById('ss-preview').innerHTML = cardHtml;

    // 列头点击排序
    document.querySelectorAll('#ss-preview th.ss-th-sort').forEach(function (th) {
      th.addEventListener('click', function () {
        onThSortClick(th.dataset.sortKey);
      });
    });

    // 弹窗宽度跟随 wrap 同步：table-layout:auto 的表格宽度由父容器约束（父未撑开时 tbl.scrollWidth 不可信），
    // 故不能直接读 wrap.scrollWidth。改为量出每个 .ss-tbl / .ss-mkt-header 因收缩溢出的差值（scrollWidth - 可用宽度），
    // 取最大差值补偿到 wrap 当前宽度上，弹窗才能撑到真正容纳表格内容所需的宽度。
    requestAnimationFrame(function () {
      var modal = document.querySelector('.ss-modal-dialog');
      var wrap = document.querySelector('#ss-preview .ss-phone-wrap');
      if (!modal || !wrap) return;

      var maxDelta = 0;
      document.querySelectorAll('#ss-preview .ss-tbl').forEach(function (tbl) {
        var tblWrap = tbl.closest('.ss-tbl-wrap') || tbl.parentElement;
        var delta = tbl.scrollWidth - tblWrap.clientWidth;
        if (delta > maxDelta) maxDelta = delta;
      });
      var mktHeader = document.querySelector('#ss-preview .ss-mkt-header');
      if (mktHeader) {
        var mktDelta = mktHeader.scrollWidth - mktHeader.clientWidth;
        if (mktDelta > maxDelta) maxDelta = mktDelta;
      }

      var previewPadX = 32; // .ss-preview { padding: 24px 16px } 左右各 16px
      var neededWrapW = wrap.offsetWidth + Math.max(0, maxDelta);
      var maxW = window.innerWidth - 32; // 16px*2 padding of #ss-modal
      var target = Math.min(Math.max(neededWrapW + previewPadX + 4, 320), maxW);
      modal.style.width = target + 'px';
    });
  }

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
      case 'nav': {
        // 净值列：price + dailyChange（日期在表头）
        var nv = sh.nav != null ? sh.nav.toFixed(4) : null;
        if (nv == null) return '<div class="ss-muted">—</div>';
        var chg = sh.daily_change;
        var chgStr = chg != null
          ? '<span class="' + chgCls(chg) + '">' + chgArrow(chg) + (chg > 0 ? '+' : '') + chg.toFixed(2) + '%</span>'
          : '<span class="ss-muted">--</span>';
        return '<div class="ss-nav-price">' + nv + '</div>' +
          '<div class="ss-nav-chg">' + chgStr + '</div>';
      }
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

  // ==================== 保存图片 ====================
  // 提取单张截图的核心逻辑（不含保存/下载，返回 dataUrl）
  async function snapPng() {
    var preview = document.getElementById('ss-preview');
    var target = preview;
    var wrap = preview.querySelector('.ss-phone-wrap');
    var wrapSavedMinH = null, wrapSavedPos = null, wrapSavedTop = null, wrapSavedLeft = null, wrapSavedZ = null;
    if (wrap) {
      target = wrap;
      wrapSavedMinH = wrap.style.minHeight;
      wrap.style.minHeight = '0';
      wrapSavedPos = wrap.style.position;
      wrapSavedTop = wrap.style.top;
      wrapSavedLeft = wrap.style.left;
      wrapSavedZ = wrap.style.zIndex;
      wrap.style.position = 'absolute';
      wrap.style.top = '0';
      wrap.style.left = '0';
      wrap.style.zIndex = '99999';
    }

    var blurs = target.querySelectorAll('*');
    var restored = [];
    for (var i = 0; i < blurs.length; i++) {
      var el = blurs[i];
      var bf = el.style.backdropFilter || getComputedStyle(el).backdropFilter;
      var wbf = el.style.webkitBackdropFilter || getComputedStyle(el).webkitBackdropFilter;
      if (bf && bf !== 'none') { restored.push({el:el, prop:'backdropFilter', val:bf}); el.style.backdropFilter = 'none'; }
      if (wbf && wbf !== 'none') { restored.push({el:el, prop:'webkitBackdropFilter', val:wbf}); el.style.webkitBackdropFilter = 'none'; }
    }

    var lib = await loadHtmlToImage();
    var dataUrl = await lib.toPng(target, { backgroundColor: '#fffbf7', pixelRatio: 2 });

    if (wrap) {
      wrap.style.minHeight = wrapSavedMinH;
      wrap.style.position = wrapSavedPos;
      wrap.style.top = wrapSavedTop;
      wrap.style.left = wrapSavedLeft;
      wrap.style.zIndex = wrapSavedZ;
    }
    for (var r = 0; r < restored.length; r++) {
      restored[r].el.style[restored[r].prop] = restored[r].val;
    }
    return dataUrl;
  }

  // 生成全部 5 张图（逐一渲染 snap，收集 dataUrls）
  async function snapAllCategories(btn) {
    var cats = SS_CATEGORIES;
    var results = [];
    for (var ci = 0; ci < cats.length; ci++) {
      btn.textContent = '生成中 (' + (ci + 1) + '/' + cats.length + ')...';
      ssState.groupFilter = cats[ci].id;
      renderTemplate();
      await new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); });
      var dataUrl = await snapPng();
      results.push({ fileLabel: cats[ci].fileLabel, dataUrl: dataUrl });
    }
    ssState.groupFilter = 'all';
    renderTemplate();
    return results;
  }

  // dataUrl → Blob
  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var bytes = atob(parts[1]);
    var arr = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // 桌面端：打成 zip 一次下载
  async function downloadZip(results, dateStr) {
    var JSZip = await loadJSZip();
    var zip = new JSZip();
    for (var i = 0; i < results.length; i++) {
      zip.file(results[i].fileLabel + '-' + dateStr + '.png', dataUrlToBlob(results[i].dataUrl));
    }
    var blob = await zip.generateAsync({ type: 'blob' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '美股基金汇总-' + dateStr + '.zip';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // 桌面端：单张下载
  function downloadOnePng(dataUrl, filename) {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  // 移动端：逐张分享
  async function shareOnePng(dataUrl, filename) {
    var resp = await fetch(dataUrl);
    var blob = await resp.blob();
    var file = new File([blob], filename, { type: 'image/png' });
    await navigator.share({ files: [file] });
  }

  window.downloadScreenshotPNG = async function () {
    var preview = document.getElementById('ss-preview');
    if (!preview) return;
    var btn = document.getElementById('ss-download-btn');
    if (!btn) return;
    btn.disabled = true;
    var isMobile = navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    try {
      var dateStr = new Date().toISOString().slice(0, 10);
      var isAll = ssState.groupFilter === 'all';

      if (isAll) {
        btn.textContent = '生成中...';
        var results = await snapAllCategories(btn);
        if (isMobile) {
          for (var i = 0; i < results.length; i++) {
            btn.textContent = '保存 (' + (i + 1) + '/' + results.length + ')...';
            await shareOnePng(results[i].dataUrl, results[i].fileLabel + '-' + dateStr + '.png');
          }
        } else {
          btn.textContent = '打包中...';
          await downloadZip(results, dateStr);
        }
        btn.textContent = '完成';
      } else {
        btn.textContent = '生成中...';
        var cat = SS_CATEGORIES.find(function (c) { return c.id === ssState.groupFilter; });
        var dataUrl = await snapPng();
        var fname = (cat ? cat.fileLabel : '美股基金') + '-' + dateStr + '.png';
        if (isMobile) await shareOnePng(dataUrl, fname);
        else downloadOnePng(dataUrl, fname);
      }
    } catch (e) {
      if (e.name === 'AbortError') { /* 用户取消分享 */ }
      else { console.error('截图失败:', e); alert('截图失败，请重试'); }
    } finally {
      btn.textContent = '保存';
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
