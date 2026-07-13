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
      // 净值列：日期内联到列名后，避免两行表头导致整行过高
      if (c.key === 'nav' && navHeaderDate) {
        inner = c.label + '<span class="ss-th-nav-date">·' + navHeaderDate.slice(5) + '</span>' + '<span class="ss-th-arrow">' + arrow + '</span>';
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
      if (f !== cat.id) continue;
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
    var kind = classifyBuyStatus(sh);
    if (kind === 'none' || kind === 'limited_no_amount') return '<span class="ss-muted">—</span>';
    if (kind === 'paused') return '<span class="ss-badge ss-badge-paused">暂停</span>';
    if (kind === 'limited') return '<span class="ss-badge ss-badge-limit">限 ¥' + formatLimit(sh.daily_limit) + '</span>';
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
  // 实现说明：不直接修改可见的 .ss-phone-wrap（曾经用 position:absolute+z-index:99999 把它挪到
  // (0,0) 再截图再挪回来，两次样式切换在屏幕上会有明显的"跳动/闪烁"），
  // 改为克隆节点、把克隆体固定在 (0,0) 但 z-index:-1（沉到截图弹窗的半透明遮罩之下，
  // 肉眼不可见，但仍在正常布局坐标内，html-to-image 能正确渲染），截完直接丢弃克隆体，
  // 全程不触碰可见 DOM，杜绝闪烁。
  // 注：曾尝试把克隆体挪到视口外（left:-99999px）离屏截图，实测 html-to-image 渲染结果为
  // 空白（很可能是其内部依赖 viewport 范围内的坐标/getBoundingClientRect 采样），故弃用该方案。
  async function snapPng() {
    var preview = document.getElementById('ss-preview');
    var original = preview.querySelector('.ss-phone-wrap') || preview;

    var clone = original.cloneNode(true);
    // position:absolute + z-index:-1 在 #ss-preview(position:relative) 内定位，
    // 始终藏在预览内容后面（不会随页面滚动而闪现于半透明遮罩之上）
    clone.style.position = 'absolute';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.zIndex = '-1';
    clone.style.margin = '0';
    clone.style.minHeight = '0';
    // 克隆体必须挂在 #ss-preview 下（而非 document.body），否则 .ss-preview td / 
    // .ss-preview table 等父级选择器不生效，clone 的 computedStyle 会丢失
    // white-space:nowrap / border-spacing:0 / border-collapse:separate，
    // 导致表头和表体列宽不一致（表格错位）
    preview.appendChild(clone);

    // html-to-image 对 backdrop-filter 支持不佳（会渲染成纯色块），截图前在克隆体上关闭
    // .ss-phone-wrap 外框的 box-shadow 在保存图片的圆角上显脏影，截图前也关掉
    var blurs = clone.querySelectorAll('*');
    for (var i = 0; i < blurs.length; i++) {
      var el = blurs[i];
      var bf = getComputedStyle(el).backdropFilter;
      var wbf = getComputedStyle(el).webkitBackdropFilter;
      if (bf && bf !== 'none') el.style.backdropFilter = 'none';
      if (wbf && wbf !== 'none') el.style.webkitBackdropFilter = 'none';
    }
    clone.style.boxShadow = 'none';

    // 截前临时切到亮色模式，保证保存的图片始终是亮色调（不受页面暗色主题影响）
    var wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    try {
      var lib = await loadHtmlToImage();
      var dataUrl = await lib.toPng(clone, { backgroundColor: '#fffbf7', pixelRatio: 2 });
      return dataUrl;
    } finally {
      if (wasDark) document.documentElement.classList.add('dark');
      preview.removeChild(clone);
    }
  }

  window.downloadScreenshotPNG = async function () {
    var preview = document.getElementById('ss-preview');
    if (!preview) return;
    var btn = document.getElementById('ss-download-btn');
    if (!btn) return;
    btn.textContent = '生成中...';
    btn.disabled = true;

    try {
      var dataUrl = await snapPng();
      var cat = SS_CATEGORIES.find(function (c) { return c.id === ssState.groupFilter; });
      var dateStr = new Date().toISOString().slice(0, 10);
      var fname = (cat ? cat.fileLabel : '美股基金') + '-' + dateStr + '.png';

      if (navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        var resp = await fetch(dataUrl);
        var blob = await resp.blob();
        var file = new File([blob], fname, { type: 'image/png' });
        await navigator.share({ files: [file] });
      } else {
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = fname;
        a.click();
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
