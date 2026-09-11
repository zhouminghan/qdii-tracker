    // 以下纯常量已抽到 web/js/config.js（普通 script，全局作用域）：
    //   DATA_CATEGORIES / RENDER_TABS / OFFSHORE_GROUPS / OFFSHORE_STARRED / SHARE_CLASS_ORDER
    //   COMPANY_BRAND / ETF_GROUPS / PASSIVE_HOLDINGS_OVERRIDE
    //   GROUP_META / GROUP_NOTICE / TREND_RANGES / SUBTITLE_BY_TAB
    // 可变状态仍留在本块（STATE/SORT_STATE/CHIP_STATE/TREND_STATE/DETAIL_REFRESH_TIMER）

    const STATE = {
      data: {},
      stocks: {},  // 持仓 Top10 实时行情缓存：code -> { price, change_pct, market }
    };

    // 排序状态（仅作用于大分类外层行；子分类是父行展开内嵌表，不独立排序）
    // key 取自 default share 上的字段：
    //   series_scale / nav / chg_1m / chg_ytd / chg_1y / chg_since_inception / buy_status
    // dir: 'desc'（默认大→小）/ 'asc'
    const SORT_STATE = {
      offshore: { key: 'series_scale', dir: 'desc' },
      etf:      { key: 'series_scale', dir: 'desc' },
    };

    // 以下工具函数已抽到 web/js/utils.js（普通 script，全局作用域）：
    //   shareSort / buyStatusRank / getOffshoreDisplayValues / getSeriesDisplayNavDate / getSortValue / sortSeries
    //   pickRepresentativeDate / pickGroupHeaderDate / pickMaxDate / pickTabNavHeaderDate / shouldHideRowNavDate / syncRowNavDateVisibility / renderRowNavDateHtml
    //   getLogo / adjustColor
    //   isTradingDay / fmtMD / getLocalParts / getMarketSession / detectMarketPrefix
    //   cleanCondition / formatHoldDays / parseSellRuleLowerDays
    //   changeCell / buyStatusClass / formatLimit
    //   fmtPct / fmtMoney / fmtMV

    // ==================== 数据加载 ====================
    // 版本号策略：先拉 meta.json（绕缓存），用其 generated_at 当所有数据文件的 query 版本号
    //   · 数据没变 → query 一致 → 浏览器/Pages CDN 缓存命中，秒开
    //   · Actions 推了新数据 → meta.generated_at 变 → query 变 → 自动失效
    // 比单纯用 Date.now() 更友好（既破旧缓存又能享受 CDN 加速）
    async function fetchDataVersion() {
      try {
        const meta = await (await fetch(`./data/meta.json?t=${Date.now()}`)).json();
        return { meta, ver: encodeURIComponent(meta.generated_at || Date.now()) };
      } catch (_) {
        return { meta: null, ver: String(Date.now()) };
      }
    }

    // ==================== 数据陈旧兜底 ====================
    // 首屏拿到 meta.generated_at 后判断是否陈旧。
    // why：部署链路若意外断裂（CDN/部署失败），用户打开页面看到旧数据。
    //      浏览器侧显示可见提示，避免被旧数据误导。
    // 判定逻辑：
    //   · 周末不检测（美股无交易，数据本就不更新）
    //   · 工作日：算"最近一个已完成 run"的完成日凌晨 00:00（北京）作为 expected_min
    //     run 在工作日 22:00 启动、次日 ~04:00 前完成并写 generated_at
    //     generated_at 早于 expected_min - 6h（容忍 run 提前完成）→ 陈旧
    //   why 不用固定 age 阈值：周末 gap 使周一数据天然 age≈56h，固定阈值会误报或漏报；
    //       按"预期更新点"判断才能区分"周一正常的周五数据"与"周二该更新却没更新"
    function getDataFreshnessState(generatedAtStr) {
      if (!generatedAtStr) return { stale: false };
      const gen = new Date(generatedAtStr);
      if (isNaN(gen.getTime())) return { stale: false };
      const nowMs = Date.now();
      // 北京时间字段（UTC+8）
      const nowBj = new Date(nowMs + 8 * 3600 * 1000);
      const bjY = nowBj.getUTCFullYear();
      const bjM = nowBj.getUTCMonth();
      const bjD = nowBj.getUTCDate();
      const bjDay = nowBj.getUTCDay();   // 0=周日 ... 6=周六
      if (bjDay === 0 || bjDay === 6) return { stale: false };  // 周末不检测
      // 找"最近一个已完成 run"的完成日凌晨 00:00（北京）
      let expectedMinMs = null;
      for (let daysBack = 0; daysBack <= 7; daysBack++) {
        const runDay = new Date(Date.UTC(bjY, bjM, bjD - daysBack));
        const runWd = runDay.getUTCDay();
        if (runWd === 0 || runWd === 6) continue;  // 周末不跑 run
        // 完成时间 = runDay 次日 04:00 北京（Date.UTC 小时 -4 自动规范化为前一日 20:00 UTC）
        const completionMs = Date.UTC(bjY, bjM, bjD - daysBack + 1, -4, 0, 0);
        if (completionMs <= nowMs) {
          // 预期 generated_at 不早于 runDay 次日 00:00 北京（小时 -8 → 前一日 16:00 UTC）
          expectedMinMs = Date.UTC(bjY, bjM, bjD - daysBack + 1, -8, 0, 0);
          break;
        }
      }
      if (expectedMinMs == null) return { stale: false };
      // 容忍 run 实际完成时间偏早（generated_at 可能略早于预期日凌晨）
      const lowerBound = expectedMinMs - 6 * 3600 * 1000;
      if (gen.getTime() < lowerBound) {
        const ageH = Math.round((nowMs - gen.getTime()) / 3600000);
        return { stale: true, ageH };
      }
      return { stale: false };
    }

    function renderStalenessBanner(generatedAtStr) {
      const sub = document.getElementById('page-subtitle');
      if (!sub) return;
      let banner = document.getElementById('staleness-banner');
      const st = getDataFreshnessState(generatedAtStr);
      if (!st.stale) {
        if (banner) banner.remove();
        return;
      }
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'staleness-banner';
        banner.className = 'mt-3 rounded-xl px-4 py-3 text-xs border border-amber-300 bg-amber-50 text-amber-900 dark:bg-stone-900/50 dark:border-stone-700 dark:text-amber-200';
        sub.parentNode.insertBefore(banner, sub.nextSibling);
      }
      banner.innerHTML = `⚠️ 数据可能陈旧（最后更新约 ${st.ageH} 小时前），部署可能未成功。` +
        `<button type="button" onclick="if(typeof loadData==='function'){loadData()}else{location.reload()}" class="ml-2 underline font-medium">点此重试加载</button>` +
        ` 或 <a href="${location.pathname}" class="underline">硬刷新页面</a>。`;
    }

    async function loadData() {
      const { meta, ver } = await fetchDataVersion();
      STATE.dataVer = ver;
      STATE.metaGeneratedAt = meta?.generated_at || '';

      await Promise.all(DATA_CATEGORIES.map(async (cat) => {
        const res = await fetch(`./data/${cat}.json?v=${ver}`);
        STATE.data[cat] = await res.json();
      }));
      RENDER_TABS.forEach(renderCategory);
      // 纯静态模式：首屏数据全部来自 data/*.json（GitHub Actions 离线生成）
      // 陈旧兜底：loadData 同时被 offshore-live-nav.js 的 reloadData 复用，
      //           meta 刷新后会自动重算陈旧状态（清除或显示 banner），无需单独改 live-nav
      renderStalenessBanner(STATE.metaGeneratedAt);
    }

    // ==================== 动态拉取最新净值/行情 ====================
    // 当前架构：纯静态模式 —— 净值/估值/申购状态全部由 GitHub Actions 离线生成进 data/*.json
    // 仅以下两处仍走浏览器实时请求（按需触发，不影响首屏）：
    //   · fetchStocksLive    持仓 Top10 股票实时行情（详情 Modal 打开 + 5 分钟轮询）
    //   · fetchPzdHistory    历史净值走势（点击「📈 走势」按钮时）

    // 持仓股票批量行情：支持美股 / 港股 / A 股（腾讯一个接口通吃，仅前缀不同）
    //   · 美股：us{CODE}       例 usAAPL
    //   · 港股：hk{CODE}       例 hk00700  （5 位数字）
    //   · A 股：sh/sz{CODE}    例 sh600519 / sz000001
    //
    // 入参：codes = ['AAPL', '00700', '600519', ...]（原始代码，无前缀）
    // 返回：{ AAPL: {price, change_pct, market}, 00700: {...}, ... }
    // 失败的股票在返回值里不存在，调用方自行回退静态数据
    // detectMarketPrefix 已移到 web/js/utils.js

    async function fetchStocksLive(codes) {
      if (!codes.length) return {};
      const meta = {};  // code -> {prefix, market}
      const queries = [];
      for (const c of codes) {
        const m = detectMarketPrefix(c);
        meta[c] = m;
        queries.push(m.prefix + c);
      }

      return jsonpFetch(`https://qt.gtimg.cn/q=${queries.join(',')}&t=${Date.now()}`, {
        timeoutMs: 4000,
        failValue: {},
        onData: () => {
          const result = {};
          for (const c of codes) {
            const m = meta[c];
            const key = 'v_' + m.prefix + c;
            const raw = window[key];
            if (typeof raw === 'string' && raw) {
              const parts = raw.split('~');
              // parts[3]=最新价 parts[32]=涨跌幅（所有市场通用）
              const price = parseFloat(parts[3]);
              const chgPct = parseFloat(parts[32]);
              if (!isNaN(price) || !isNaN(chgPct)) {
                result[c] = {
                  price: isNaN(price) ? null : price,
                  change_pct: isNaN(chgPct) ? null : chgPct,
                  market: m.market,
                };
              }
            }
          }
          return result;
        },
      });
    }

    // 是否「A 股交易日」（粗判：周一~周五 = 交易日，周末 = 非交易日）
    // 用途：详情页持仓股票 5 分钟轮询时，非交易日跳过
    // 边角情况：法定假日（如劳动节）也是非交易日；本地无节假日表，不细究
    // isTradingDay / fmtMD / getLocalParts / getMarketSession 已移到 web/js/utils.js

    // 注：基金数据更新时间不再做全局展示——
    //   · 每只基金的「净值日」列已表达单条新鲜度，全局时间冗余
    //   · 顶部只保留「📡 行情」状态，避免与实时行情时间混淆


    // ETF 分组配置（按跟踪标的）
    // why nasdaq 用 'nasdaq100' 作 key 是历史原因（最早只有 NDX）；
    // 实际涵盖 纳指100(NDX) + 纳指科技(NDXT) 等纳斯达克家族指数，故 label 不再写「100」。
    // ETF_GROUPS 与 PASSIVE_HOLDINGS_OVERRIDE 已移到 web/js/config.js

    function buildCategoryViewModel(tab) {
      const isEtf = tab === 'etf';
      const isOffshore = tab === 'offshore';
      const showHoldings = isOffshore;

      let groups;
      if (isOffshore) {
        groups = OFFSHORE_GROUPS.map(g => {
          const src = STATE.data[g.key];
          const items = (src?.series || []).map(s => ({ ...s, starred: OFFSHORE_STARRED.has(s.default_share_code) }));
          return { ...g, items, sourceCat: g.key, isActive: (g.key === 'active' || g.key === 'global_other') };
        }).filter(g => g.items.length);
      } else if (isEtf) {
        const src = STATE.data.etf;
        const byTarget = {};
        for (const s of src.series) {
          const t = (s.etf_target === 'sp500' || s.etf_target === 'nasdaq100') ? s.etf_target : 'global_other';
          (byTarget[t] = byTarget[t] || []).push(s);
        }
        for (const key in byTarget) {
          byTarget[key].sort((a, b) => (a.starred && !b.starred ? -1 : !a.starred && b.starred ? 1 : (b.series_scale || 0) - (a.series_scale || 0)));
        }
        groups = ETF_GROUPS.map(g => ({ ...g, items: byTarget[g.key] || [], sourceCat: 'etf', isActive: false })).filter(g => g.items.length);
      }

      const sortConf = SORT_STATE[tab] || { key: 'series_scale', dir: 'desc' };
      groups.forEach(g => { g.items = sortSeries(g.items, sortConf.key, sortConf.dir); });

      let totalSeries = 0, totalShares = 0, totalScale = 0;
      groups.forEach(g => {
        totalSeries += g.items.length;
        g.items.forEach(s => { totalShares += s.shares.length; totalScale += (s.series_scale || 0); });
      });

      const activeGroupKey = (CHIP_STATE[tab] && groups.some(g => g.key === CHIP_STATE[tab])) ? CHIP_STATE[tab] : (groups[0]?.key || '');
      const activeGroup = groups.find(g => g.key === activeGroupKey);
      const latestNavDate = pickGroupHeaderDate(activeGroup?.items || [], isEtf);

      return { groups, sortConf, totalSeries, totalShares, totalScale, latestNavDate, isEtf, isOffshore, showHoldings };
    }

    function renderCategory(tab) {
      const vm = buildCategoryViewModel(tab);
      const container = document.getElementById(`table-${tab}`);
      const { groups, sortConf, totalSeries, totalShares, totalScale, latestNavDate, isEtf, isOffshore, showHoldings } = vm;

      document.getElementById(`count-${tab}`).textContent =
        `${totalSeries} 个系列 · ${totalShares} 只份额 · 总规模 ${totalScale.toFixed(0)} 亿`;

      const navHeaderSub = fmtMD(latestNavDate);
      STATE._navDate = STATE._navDate || {};
      STATE._navDate[tab] = latestNavDate;

      // 列数（用于分组标题行 colspan，当前已被 chips 取代，仅作语义标注保留）
      // 场外 = 10 + 1(估值) + 1(申购) + 走势 + 持仓 = 13
      // ETF  = 10 + 1(溢价率) + 走势 + 持仓 = 12（无估值、无申购）
      const colspan = isEtf ? 12 : 12;  // 留作未来 fallback 用，渲染逻辑不依赖此值

      const pieces = [];
      for (const group of groups) {
        // Chips 已承载分组标识，不再渲染组内大紫条
        // 同一组内所有 series 用该组的 isActive 判断是否显示"持仓"按钮
        pieces.push(group.items.map(s => {
          return renderSeries(s, group.isActive, isEtf, showHoldings, group.key);
        }).join(''));
      }
      const bodyHtml = pieces.join('');

      // 排序图标 helper：当前排序列 → 显示 ↓/↑；非当前列 → 显示淡色双向箭头 ⇅
      const sortIcon = (key) => {
        if (sortConf.key !== key) {
          return '<span class="ml-0.5 text-stone-300 dark:text-stone-600">⇅</span>';
        }
        return sortConf.dir === 'desc'
          ? '<span class="ml-0.5 text-indigo-500">↓</span>'
          : '<span class="ml-0.5 text-indigo-500">↑</span>';
      };
      const sortableTh = (key, label, align = 'right', extra = '') => `
        <th class="text-${align} py-3 px-3 font-medium cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 select-none" data-sort-key="${key}" title="点击按${label}排序">
          ${label}${sortIcon(key)}${extra}
        </th>`;

      // 估值列已移除
      const estimateHeaderHtml = '';

      // 「净值」列头：场外 QDII / 场内 ETF 共用结构
      //   · 标题：场外 = "净值"，ETF = "最新价"
      //   · 副标 = nav_date（MM-DD 格式）
      //   · 整列可点击 → 按当日涨跌幅排序（不是按净值数字本身）
      const delayTip = !isEtf
        ? '<span class="ml-1 text-stone-400 dark:text-stone-500" title="QDII 净值通常在 T+1~T+2 个工作日披露，日期滞后于海外交易日属正常。">ⓘ</span>'
        : '';
      const priceHeaderHtml = `
              <th class="text-right py-3 px-3 font-medium cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700 select-none" data-sort-key="nav" title="点击按当日涨跌排序">
                <div>${isEtf ? '最新价' : '净值'}${delayTip}${sortIcon('nav')}</div>
                ${navHeaderSub ? `<div class="nav-date-sub text-[10px] text-stone-400 font-normal mt-0.5">${navHeaderSub}</div>` : `<div class="nav-date-sub text-[10px] text-stone-400 font-normal mt-0.5"></div>`}
              </th>`;

      // 「溢价率」列头：仅 ETF 显示，可点击排序（按 etf_premium 数值降序为默认）
      // 排序 key 用 'etf_premium'，由 sortableTh 自动接入现有排序逻辑（compareByKey 已支持任意数值字段，详见 SORT 注释）
      // 设计要点：
      //   · 排序点击区只包裹"溢价率 + sortIcon"，ⓘ 图标独立成块（避免点 ⓘ 触发排序）
      //   · ⓘ hover 气泡用 .group + group-hover:block 实现纯 CSS 显示，不引第三方库
      //   · 气泡用 absolute right-0 防止超出表格右边界；z-50 防被相邻列遮挡
      //   · pointer-events-none 让气泡本身不再触发 hover-out（鼠标停留在气泡上时不会闪烁）
      const premiumHeaderHtml = isEtf ? `
              <th class="text-right py-3 px-3 font-medium select-none">
                <div class="inline-flex items-center justify-end gap-1.5">
                  <span class="cursor-pointer hover:text-stone-900 dark:hover:text-stone-200" data-sort-key="etf_premium" title="点击按溢价率排序">溢价率${sortIcon('etf_premium')}</span>
                  <span class="group relative inline-block cursor-help" tabindex="0">
                    <svg class="w-3.5 h-3.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-colors" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
                    </svg>
                    <div class="hidden group-hover:block group-focus-within:block absolute right-0 top-full mt-2 z-50 w-72 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg p-3 text-left text-xs text-stone-700 dark:text-stone-300 font-normal normal-case pointer-events-none">
                      <div class="font-semibold text-stone-800 dark:text-stone-200 mb-1.5">📌 溢价率</div>
                      <div class="mb-2 font-mono text-stone-600 dark:text-stone-400">(场内价 − 净值) ÷ 净值 × 100%</div>
                      <div class="space-y-1 text-stone-600 dark:text-stone-400 leading-relaxed">
                        <div>· <b class="text-stone-700 dark:text-stone-300">场内价</b>：盘中实时价（每分钟刷新）</div>
                        <div>· <b class="text-stone-700 dark:text-stone-300">净值</b>：上一交易日收盘净值（T-1）</div>
                      </div>
                      <div class="mt-2 pt-2 border-t border-stone-100 dark:border-stone-700 text-stone-500 dark:text-stone-400 leading-relaxed">⚠️ 溢价 &gt;3% 通常是 QDII 限购引发的资金抢筹信号，回归净值时高位买入会亏损</div>
                    </div>
                  </span>
                </div>
              </th>` : '';

      container.innerHTML = `
        <table class="w-full text-sm">
          <thead class="bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 text-xs">
            <tr>
              <th class="text-left py-3 px-3 font-medium w-8"></th>
              <th class="text-left py-3 px-3 font-medium">基金系列</th>
              ${sortableTh('series_scale', '规模', 'right')}
              ${estimateHeaderHtml}
              ${priceHeaderHtml}
              ${premiumHeaderHtml}
              ${sortableTh('chg_1m', '近1月')}
              ${sortableTh('chg_ytd', '今年来')}
              ${sortableTh('chg_1y', '近1年')}
              ${isEtf ? '' : sortableTh('chg_since_inception', '成立来')}
              ${isEtf ? '' : sortableTh('buy_status', '申购', 'center')}
              ${isEtf ? '' : '<th class="text-center py-3 px-3 font-medium">类型</th>'}
              <th class="text-center py-3 px-3 font-medium">走势</th>
              <th class="text-center py-3 px-3 font-medium">持仓</th>
            </tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
        </table>
      `;

      // 绑定排序点击（th 整体或 th 内嵌的 ↓/↑ span 都触发）
      container.querySelectorAll('[data-sort-key]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const key = el.dataset.sortKey;
          const cur = SORT_STATE[tab];
          if (cur.key === key) {
            // 同列再次点击：切换方向
            cur.dir = cur.dir === 'desc' ? 'asc' : 'desc';
          } else {
            // 切换到新列：默认 desc
            cur.key = key;
            cur.dir = 'desc';
          }
          renderCategory(tab);
        });
      });

      container.querySelectorAll('.series-row').forEach(row => {
        // ETF 行不需要展开（因为只有一只份额）
        if (row.dataset.isEtf === '1') return;
        row.addEventListener('click', () => toggleSeries(row));
      });

      // 渲染分组筛选 Chips + 分享按钮
      renderChips(tab, groups);
      renderShareBtn(tab, groups);
      // 申购 tooltip 绑定（仅场外）
      if (!isEtf) initBuyTooltips(container);
    }

    function renderShareBtn(tab, groups) {
      if (tab === 'etf') return;  // 分享按钮仅场外基金显示
      var bar = document.getElementById(tab + '-chips');
      if (!bar) return;
      if (document.getElementById('ss-btn-' + tab)) return;
      var btn = document.createElement('button');
      btn.id = 'ss-btn-' + tab;
      btn.className = 'chip ss-share-btn';
      btn.textContent = '📤 分享';
      btn.onclick = function () {
        var allSeries = [];
        for (var i = 0; i < groups.length; i++) {
          for (var j = 0; j < groups[i].items.length; j++) {
            allSeries.push(groups[i].items[j]);
          }
        }
        window.openScreenshotModal(tab, allSeries, groups);
      };
      // 分享按钮视觉隔离：插入 flex spacer 推到最右
      var spacer = document.createElement('span');
      spacer.style.flex = '1';
      bar.appendChild(spacer);
      bar.appendChild(btn);
    }

    // ==================== 通用分组筛选 Chips ====================
    // 每个 tab 的筛选状态
    const CHIP_STATE = {};

    function renderChips(tab, groups) {
      const chipsBox = document.getElementById(`${tab}-chips`);
      if (!chipsBox) return;
      if (!groups.length) { chipsBox.innerHTML = ''; return; }

      // 恢复上次 chip 选中状态（若首次则默认第一个）
      const savedKey = CHIP_STATE[tab];
      const defaultKey = (savedKey && groups.some(g => g.key === savedKey)) ? savedKey : groups[0].key;
      const chips = groups.map(g =>
        `<button type="button" class="chip${g.key === defaultKey ? ' chip-active' : ''}" data-filter="${g.key}" aria-pressed="${g.key === defaultKey ? 'true' : 'false'}">${g.label}  <span class="chip-count">${g.items.length}</span></button>`
      );
      chipsBox.innerHTML = chips.join('');
      chipsBox.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', () => {
          chipsBox.querySelectorAll('.chip').forEach(b => {
            b.classList.remove('chip-active');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('chip-active');
          btn.setAttribute('aria-pressed', 'true');
          applyChipFilter(tab, groups, btn.dataset.filter);
        });
      });
      // 应用当前筛选
      applyChipFilter(tab, groups, defaultKey);
    }

    function applyChipFilter(tab, groups, filter) {
      CHIP_STATE[tab] = filter;
      const table = document.getElementById(`table-${tab}`);
      if (!table) return;

      const currentGroup = groups.find(g => g.key === filter);

      // series 行：控制显隐
      // 展开行（share-rows）：不匹配时强制隐藏并重置状态；匹配时清 inline display，让 .hidden 类主宰
      table.querySelectorAll('tr.series-row').forEach(tr => {
        const match = (tr.dataset.group === filter);
        tr.style.display = match ? '' : 'none';
        const id = tr.dataset.seriesId;
        const detail = table.querySelector(`.share-rows[data-parent="${id}"]`);
        if (!detail) return;
        if (match) {
          detail.style.display = '';
        } else {
          detail.style.display = 'none';
          detail.classList.add('hidden');
          const arrow = tr.querySelector('.arrow');
          if (arrow) arrow.style.transform = '';
        }
      });

      // 更新计数：当前筛选组
      if (!currentGroup) return;
      let visibleSeries = currentGroup.items.length;
      let visibleShares = 0, visibleScale = 0;
      currentGroup.items.forEach(s => {
        visibleShares += s.shares.length;
        visibleScale += (s.series_scale || 0);
      });
      const countEl = document.getElementById(`count-${tab}`);
      if (countEl) {
        countEl.textContent =
          `${visibleSeries} 个系列 · ${visibleShares} ${tab === 'etf' ? '只 ETF' : '只份额'} · 总规模 ${visibleScale.toFixed(0)} 亿`;
      }

      // 切组时重算当前分组表头日期，并同步更新副标与行内日期显隐。
      const isEtf = tab === 'etf';
      const headerDate = pickGroupHeaderDate(currentGroup.items, isEtf);
      STATE._navDate = STATE._navDate || {};
      STATE._navDate[tab] = headerDate;
      const navSub = table.querySelector('.nav-date-sub');
      if (navSub) navSub.textContent = fmtMD(headerDate || '');
      syncRowNavDateVisibility(table, headerDate);

      // 更新区域标题 & 副标题（随 Chip 动态变化）
      const meta = (GROUP_META[tab] || {})[filter];
      if (meta) {
        const titleEl = document.getElementById(`${tab}-title`);
        const subEl = document.getElementById(`${tab}-subtitle`);
        if (titleEl) titleEl.textContent = meta.title;
        if (subEl) subEl.textContent = meta.subtitle.replace('{count}', currentGroup.items.length);
      }
      // 更新分组级风险/说明横幅（无配置则自动隐藏）
      renderGroupNotice(tab, filter);
    }

    // 每个 Tab 下各分组的「标题 + 副标题」文案（按 tab 隔离，避免同 key 在场内外撞车）
    // subtitle 中 {count} 会在渲染时被替换为该组实际系列数
    // GROUP_META 与 GROUP_NOTICE 已移到 web/js/config.js

    // 渲染分组级风险提示横幅（无配置则隐藏容器）
    function renderGroupNotice(tab, filter) {
      const el = document.getElementById(`${tab}-notice`);
      if (!el) return; // 该 tab 没有 notice 容器（如 etf）
      const cfg = (GROUP_NOTICE[tab] || {})[filter];
      if (!cfg || !cfg.items || !cfg.items.length) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
      }
      // 配色：sky=中性提示（被动指数小风险），amber=黄色提醒（限购/误差等可控风险），rose=红色警告（深坑）
      const palette = {
        sky:   { bg: 'bg-sky-50/70 dark:bg-stone-900/50',   border: 'border-sky-200 dark:border-stone-700',   text: 'text-sky-900 dark:text-stone-300',   icon: '📌' },
        amber: { bg: 'bg-amber-50/70 dark:bg-stone-900/50', border: 'border-amber-200 dark:border-stone-700', text: 'text-amber-900 dark:text-stone-300', icon: '⚠️' },
        rose:  { bg: 'bg-rose-50/70 dark:bg-stone-900/50',  border: 'border-rose-200 dark:border-stone-700',  text: 'text-rose-900 dark:text-stone-300',  icon: '🚨' },
      }[cfg.tone] || { bg: 'bg-stone-50 dark:bg-stone-900/50', border: 'border-stone-200 dark:border-stone-700', text: 'text-stone-700 dark:text-stone-300', icon: '📌' };
      // 计算日限额汇总（所有场外分组：只统计默认份额、跳过暂停的基金）
      let limitSummary = '';
      if (tab === 'offshore') {
        const src = STATE.data[filter];
        if (src?.series) {
          let totalLimit = 0, openCount = 0;
          for (const s of src.series) {
            const def = s.shares.find(sh => sh.code === s.default_share_code) || s.shares[0];
            if (!def?.buy_status) continue;
            if (def.buy_status.includes('暂停')) continue; // 暂停不计入
            if (def.daily_limit > 0) { totalLimit += def.daily_limit; }
            else if (def.buy_status.includes('开放') && !def.daily_limit) { openCount++; }
          }
          const parts = [];
          if (totalLimit > 0) parts.push(`当前每日可购买 <b class="text-indigo-600 dark:text-indigo-400">¥${formatLimit(totalLimit)}</b>`);
          if (openCount > 0) parts.push(`${openCount} 只开放申购`);
          if (parts.length) limitSummary = parts.join(' + ');
        }
      }
      el.classList.remove('hidden');
      const limitLi = limitSummary
        ? `<li class="flex gap-2"><span class="flex-shrink-0">💰</span><span>${limitSummary}</span></li>`
        : '';
      el.innerHTML = `
        <div class="${palette.bg} border ${palette.border} rounded-xl px-4 py-3 text-xs ${palette.text}">
          <ul class="space-y-1.5 leading-relaxed">
            ${cfg.items.map(it => `<li class="flex gap-2"><span class="flex-shrink-0">${palette.icon}</span><span>${it}</span></li>`).join('')}
            ${limitLi}
          </ul>
        </div>
      `;
    }

    function renderSeries(series, isActive, isEtf, showHoldings, groupKey) {
      // showHoldings: 当前表格是否存在"持仓"列（决定 colspan 和是否渲染持仓按钮）
      // isActive: 这只基金是不是主动基金（决定要不要显示基金经理、是否渲染持仓按钮）
      // groupKey: 分组键，打到 DOM data-group 上，供 Chips 筛选使用
      if (showHoldings === undefined) showHoldings = isActive;
      const grpAttr = groupKey ? ` data-group="${groupKey}"` : '';
      // v3: 选第一个"人民币A类"或"人民币+最早字母份额"作为外层默认
      // 这里采用 enrich_data.py 里算好的 default_share_code
      const defCode = series.default_share_code;
      const def = series.shares.find(s => s.code === defCode) || series.shares[0];

      const seriesScale = series.series_scale
        ? (series.series_scale >= 100
            ? `${series.series_scale.toFixed(0)}亿`
            : `${series.series_scale.toFixed(2)}亿`)
        : '--';

      // 外层行展示（大分类）：
      //   · 场内 ETF —— etf_price + etf_change_pct（腾讯行情实时）
      //   · 场外 QDII —— nav + daily_change；15:00~24:00 可能被 _live_* overlay 临时覆盖
      const offshoreDisp = isEtf ? null : getOffshoreDisplayValues(def);
      let price, dailyChange, rowNavDate, rowIsLive;
      if (isEtf) {
        price = def.etf_price?.toFixed(3) ?? def.nav?.toFixed(4) ?? '--';
        dailyChange = def.etf_change_pct != null ? def.etf_change_pct : def.daily_change;
        rowNavDate = def._live_etf_date || def.nav_date || '';
        rowIsLive = false;
      } else {
        price = offshoreDisp?.price != null ? offshoreDisp.price.toFixed(4) : '--';
        dailyChange = offshoreDisp?.dailyChange ?? null;
        rowNavDate = offshoreDisp?.navDate || '';
        rowIsLive = !!offshoreDisp?.isLive;
      }

      // 走势 td（所有基金都有）+ 持仓 td
      // 持仓列三态：
      //   1) isActive=true                   → 📊 持仓 按钮（拉 holdings/{code}.json）
      //   2) PASSIVE_HOLDINGS_OVERRIDE 命中  → 按 type 走特殊渲染（按钮 / 母 ETF 徽章）
      //   3) 其他被动指数                    → 占位 "—"
      const trendTd = `<td class="py-3 px-3 text-center">${trendBtn(defCode)}</td>`;
      const override = PASSIVE_HOLDINGS_OVERRIDE[defCode];
      let holdingsTd;
      if (isActive || (override && override.type === 'active')) {
        // 真实持仓按钮：override.type='active' 用于"分类被动但实为主动管理"的基金（如 Smart Beta）
        holdingsTd = `<td class="py-3 px-3 text-center">${holdingsBtn(defCode)}</td>`;
      } else {
        holdingsTd = '<td class="py-3 px-3 text-center text-stone-300 dark:text-stone-600">—</td>';
      }

      // 展开后的子表格 colspan（ETF=10，场外=14）
      const expandColspan = isEtf ? 10 : 14;

      return `
        <tr class="series-row border-b border-stone-100 dark:border-stone-700/50 ${isEtf ? '' : 'hover:bg-stone-50 dark:hover:bg-stone-700/30 cursor-pointer'} transition" data-series-id="${series.series_id}" data-is-etf="${isEtf ? '1' : '0'}"${grpAttr}>
          <td class="py-3 px-3 text-stone-400 dark:text-stone-500">
            ${isEtf ? '' : `<svg class="arrow w-4 h-4 inline transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>`}
          </td>
          <td class="py-3 px-3">
            <div class="flex items-center gap-3">
              ${getLogo(series.company)}
              <div class="min-w-0">
                <div class="font-medium truncate">${series.starred ? '⭐ ' : ''}${isEtf ? def.name : series.display_name}</div>
                <div class="text-xs text-stone-500 dark:text-stone-400 num mt-0.5">
                  ${def.code}${isEtf ? '' : ' · ' + def.share_class + (def.currency === '美元' ? ' · 美元' : '')}
                  <span class="badge ${isEtf ? 'badge-qdii' : 'badge-qdii'} ml-1">${isEtf ? 'ETF' : 'QDII'}</span>
                </div>
                ${isActive && def.manager ? `<div class="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 truncate">👤 ${def.manager}</div>` : ''}
              </div>
            </div>
          </td>
          <td class="py-3 px-3 text-right num font-medium">${seriesScale}</td>
          <td class="py-3 px-3 text-right num">
            <div class="font-medium">${price}</div>
            <div class="text-xs ${dailyChange > 0 ? 'up' : dailyChange < 0 ? 'down' : 'text-stone-400'}">${dailyChange == null ? '--' : (dailyChange > 0 ? '+' : '') + dailyChange.toFixed(2) + '%'}</div>
            ${(() => {
              const nd = rowNavDate;
              const headerDate = (STATE._navDate || {})[isEtf ? 'etf' : 'offshore'] || '';
              return renderRowNavDateHtml(nd, headerDate, rowIsLive);
            })()}
          </td>
          ${(() => {
            // 「溢价率」独立列：仅 ETF 渲染。和最新价 td 解耦后，可单独排序、视觉上更整齐。
            // 数据来源：etf-premium.js 实时拉腾讯接口写回 def.etf_premium（每分钟更新）。
            // 数据未到 / 拉取失败 / 非 ETF 时显示「--」（仍占位以保证 colspan 对齐）。
            if (!isEtf) return '';
            if (def.etf_premium == null) {
              return '<td class="py-3 px-3 text-right num text-stone-300 dark:text-stone-600">--</td>';
            }
            const p = def.etf_premium;
            // why 取消多级色阶但保留单色红：调研支付宝实际做法 —— 溢价率统一用红色
            // （rose-600）单色显示，不分 >3% / 1~3% / 接近净值 / 折价 等等级。
            // 单色红比"灰色"更符合中国基金 App 的视觉语义（红 = 注意/警示），
            // 也与"红涨绿跌"的涨跌色不冲突（涨跌列由 changeCell 渲染，本列只展示溢价数值）。
            // 高溢价 / 折价的语义解释由表头 ⓘ 悬浮气泡 + 单元格原生 title 双层承担。
            const cls = 'text-rose-600 dark:text-rose-400';
            const sign = p > 0 ? '+' : '';
            const tip = p > 3 ? '高溢价，谨慎追高'
                      : p > 1 ? '溢价'
                      : p < -1 ? '折价'
                      : '接近净值';
            return `<td class="py-3 px-3 text-right num ${cls}" title="${tip} · (场内价 - 净值) / 净值">${sign}${p.toFixed(2)}%</td>`;
          })()}
          ${changeCell(def.chg_1m)}
          ${changeCell(def.chg_ytd)}
          ${changeCell(def.chg_1y)}
          ${isEtf ? '' : changeCell(def.chg_since_inception)}
          ${isEtf ? '' : `<td class="py-3 px-3 text-center">${statusBadge(def)}</td>`}
          ${isEtf ? '' : `<td class="py-3 px-3 text-center text-stone-500 dark:text-stone-400 num text-xs">${series.shares.length}</td>`}
          ${trendTd}
          ${holdingsTd}
        </tr>
        ${isEtf ? '' : `<tr class="share-rows hidden bg-stone-50/60 dark:bg-stone-900/60" data-parent="${series.series_id}">
          <td colspan="${expandColspan}" class="p-0">
            <div class="px-6 py-3 border-y border-stone-100 dark:border-stone-700/50 fade-in">
              <div class="text-xs text-stone-500 dark:text-stone-400 mb-2">${series.shares.length} 个份额（人民币优先，A类在前）：</div>
              <table class="w-full text-xs">
                <thead class="text-stone-500 dark:text-stone-400">
                  <tr>
                    <th class="text-left py-2 font-medium">代码</th>
                    <th class="text-left py-2 font-medium">份额名称</th>
                    <th class="text-center py-2 font-medium">币种</th>
                    <th class="text-right py-2 font-medium">规模</th>
                    <th class="text-right py-2 font-medium">
                      <div>净值</div>
                      ${def.nav_date ? `<div class="text-[10px] text-stone-400 dark:text-stone-500 font-normal mt-0.5">${fmtMD(def.nav_date)}</div>` : ''}
                    </th>
                    <th class="text-right py-2 font-medium">近1年</th>
                    ${isEtf ? '' : `
                      <th class="text-center py-2 font-medium">申购</th>
                    `}
                    <th class="text-right py-2 font-medium">买入费</th>
                    <th class="text-right py-2 font-medium">综合费率</th>
                    <th class="text-right py-2 font-medium">卖出规则</th>
                  </tr>
                </thead>
                <tbody>
                  ${shareSort(series.shares).map(sh => renderShare(sh, sh.code === defCode, isEtf)).join('')}
                </tbody>
              </table>
            </div>
          </td>
        </tr>`}
      `;
    }

    function renderShare(sh, isDefault, isEtf) {
      const curCls = sh.currency === '美元' ? 'badge-usd' : 'badge-cny';
      // 展开行始终显示真实净值 + 最近一次收盘的日涨跌（不展示盘中估值）
      const priceDisp = isEtf && sh.etf_price ? sh.etf_price.toFixed(3) : (sh.nav?.toFixed(4) ?? '--');
      const dailyChg = isEtf && sh.etf_change_pct != null ? sh.etf_change_pct : sh.daily_change;
      const chgCls = dailyChg > 0 ? 'up' : dailyChg < 0 ? 'down' : 'text-stone-400';
      const chgTxt = dailyChg == null ? '--' : (dailyChg > 0 ? '+' : '') + dailyChg.toFixed(2) + '%';

      return `
        <tr class="border-t border-stone-100 dark:border-stone-700/50">
          <td class="py-2 num">${sh.code}${isDefault ? '<span class="text-amber-500 dark:text-amber-400 ml-1">★</span>' : ''}</td>
          <td class="py-2 text-stone-600 dark:text-stone-300">${sh.name}</td>
          <td class="py-2 text-center">
            <span class="badge ${curCls}">${sh.currency === '美元' ? '$' : '¥'}</span>
          </td>
          <td class="py-2 text-right num">${sh.scale_raw || `<span class="text-stone-300 dark:text-stone-600" title="基金公司未单独披露此份额规模">—</span>`}</td>
          <td class="py-2 text-right num">
            <div>${priceDisp}</div>
            <div class="text-[11px] ${chgCls}">${chgTxt}</div>
          </td>
          ${changeCell(sh.chg_1y, true)}
          ${isEtf ? '' : `
            <td class="py-2 text-center">${statusBadge(sh)}</td>
          `}
          <td class="py-2 text-right">${renderBuyFee(sh)}</td>
          <td class="py-2 text-right">${(() => {
            const mgmt = sh.mgmt_fee || 0;
            const cust = sh.custody_fee || 0;
            const sale = sh.sale_service_fee || 0;
            const total = mgmt + cust + sale;
            if (total <= 0) return '—';
            const display = `${parseFloat(total.toFixed(2))}%/年`;
            const detail = `管理费 ${mgmt}% + 托管费 ${cust}%${sale ? ' + 销售服务费 ' + sale + '%' : ''}`;
            return `<span class="fee-tip" tabindex="0" aria-label="查看综合费率说明"><span class="num text-stone-500 dark:text-stone-400 text-[11px]">${display}</span><div class="fee-popover"><div class="font-medium text-stone-700 dark:text-stone-300 whitespace-nowrap">综合费率：${display}</div><div class="text-[11px] text-stone-500 dark:text-stone-400 mt-1 whitespace-nowrap">${detail}</div></div></span>`;
          })()}</td>
          <td class="py-2 text-right">${renderSellRule(sh)}</td>
        </tr>
      `;
    }

    // 清理 / 统一费率条件文本，让不同基金显示风格一致。
    // 处理顺序：① 文本式条件 → 标准式；② 去冗余 .0；③ 近似 1 年/2 年的天数归一化
    // cleanCondition / formatHoldDays 已移到 web/js/utils.js

    function renderBuyFee(sh) {
      const rate = sh.first_buy_rate;
      const rules = sh.buy_rules || [];
      if (rate === null || rate === undefined) {
        return sh.fee ? `<span class="num text-stone-500 dark:text-stone-400">${sh.fee}%</span>` : '--';
      }

      // 综合费率 tooltip（A 类和 C 类都显示）
      const mgmt = sh.mgmt_fee || 0;
      const custody = sh.custody_fee || 0;
      const saleFee = sh.sale_service_fee || 0;
      const isC = sh.share_class === 'C';
      const totalFee = mgmt + custody + saleFee;

      // A 类：综合费率 = 管理费 + 托管费（无销售服务费）
      // C 类：综合费率 = 管理费 + 托管费 + 销售服务费
      const totalNote = `${parseFloat(totalFee.toFixed(2))}%/年`;
      const detailNote = isC
        ? `管理费 ${mgmt}% + 托管费 ${custody}%${saleFee ? ' + 销售服务费 ' + saleFee + '%（按日从净值中扣取）' : ' + 销售服务费（待更新）'}`
        : `管理费 ${mgmt}% + 托管费 ${custody}%`;

      // 计算1折价（代销平台常规打1折）
      const discountRate = rate > 0 ? parseFloat((rate * 0.1).toFixed(2)) : 0;

      // 构建 tooltip 内容
      let popContent = '';
      if (rules.length > 1) {
        popContent += `
          <div class="font-semibold text-stone-700 mb-1">买入费率（代销1折）</div>
          <table>
            ${rules.map(r => `
              <tr>
                <td class="text-stone-600 whitespace-nowrap">${cleanCondition(r.condition)}</td>
                ${r.rate >= 100
                  ? `<td class="text-right num whitespace-nowrap pl-3 text-stone-400">${r.rate}元</td><td class="text-right num whitespace-nowrap font-medium pl-2">${r.rate}元</td>`
                  : r.rate === 0
                    ? `<td class="text-right num whitespace-nowrap pl-3 text-green-600 dark:text-green-400 font-medium" colspan="2">免费</td>`
                    : `<td class="text-right num whitespace-nowrap pl-3"><span class="line-through text-stone-400 dark:text-stone-500">${r.rate}%</span></td><td class="text-right num whitespace-nowrap text-emerald-600 dark:text-emerald-400 font-medium pl-2">${parseFloat((r.rate * 0.1).toFixed(2))}%</td>`
                }
              </tr>
            `).join('')}
          </table>
          <div class="text-[11px] text-stone-400 mt-1">* 代销平台（支付宝/天天基金）常享1折</div>`;
      }
      if (sh.mgmt_fee != null) {
        popContent += `
          <div class="text-stone-500 ${rules.length > 1 ? 'mt-2 pt-2 border-t border-stone-100' : ''}">
            <div class="font-medium text-stone-700 whitespace-nowrap">综合费率：${totalNote}</div>
            <div class="text-[11px] mt-1 whitespace-nowrap">${detailNote}</div>
          </div>`;
      }

      const popHtml = popContent ? `<div class="fee-popover">${popContent}</div>` : '';
      // 显示：上下排列，原价删除线在上，1折价在下
      let badge;
      if (rate === 0) {
        badge = '<span class="text-green-600 dark:text-green-400 num font-medium">免费</span>';
      } else if (discountRate > 0) {
        badge = `<span class="num"><div class="line-through text-stone-400 dark:text-stone-500 text-[10px]">${rate}%</div><div class="font-medium text-emerald-600 dark:text-emerald-400">${discountRate}%</div></span>`;
      } else {
        badge = `<span class="num font-medium">${rate}%</span>`;
      }
      return popHtml
        ? `<span class="fee-tip" tabindex="0" aria-label="查看买入费率与综合费率说明">${badge}${popHtml}</span>`
        : badge;
    }

    function renderSellRule(sh) {
      const freeDays = sh.free_hold_days;
      const rules = sh.sell_rules || [];
      if (!rules.length) return '--';

      // 生成卖出规则 tooltip
      const popHtml = `
        <div class="fee-popover">
          <div class="font-semibold text-stone-700 mb-1">卖出规则（持有期限）</div>
          <table>
            ${rules.map(r => {
              const isFree = r.rate === 0;
              return `
                <tr>
                  <td class="text-stone-600">${cleanCondition(r.condition)}</td>
                  <td class="text-right num font-medium ${isFree ? 'text-green-600 dark:text-green-400' : ''}">
                    ${isFree ? '免费' : r.rate + '%'}
                  </td>
                </tr>
              `;
            }).join('')}
          </table>
        </div>
      `;

      // 主展示统一为「持X免」格式，所有基金视觉一致；详细费率走 tooltip
      // 优先级：free_hold_days → sell_rules 末档（即最低费率档）的下界
      // - 末档 rate=0：标准免赎档
      // - 末档 rate>0（如华夏全球永不免赎）：用最低费率档下界做锚点，主显示仍为「持X免」
      //   不再展示 0.5% 等具体费率，避免出现「持X起Y%」破坏统一格式
      let displayDays = freeDays;
      if (displayDays == null) {
        const lastRule = rules[rules.length - 1];
        displayDays = parseSellRuleLowerDays(lastRule && lastRule.condition);
      }
      const freeLabel = displayDays != null
        ? `<span class="text-green-600 dark:text-green-400 font-medium">持${formatHoldDays(displayDays)}免</span>`
        : `<span class="text-stone-500 dark:text-stone-400">${rules[0].rate}%起</span>`;
      return `<span class="fee-tip">${freeLabel}${popHtml}</span>`;
    }

    // 从卖出规则的 condition 文本里解析"持有期限下界"（天）
    // 兼容：「7.0天<=持有期限」「7天<=持有期限」「365.0天<=持有期限<2.0年」
    // parseSellRuleLowerDays / changeCell / buyStatusClass / formatLimit 已移到 web/js/utils.js

    function statusBadge(sh) {
      const st = sh.buy_status || '';
      // 历史变更最多展示 8 条：此前只取 3 条，像「限购 1 万」这类短暂放宽
      // 又被后续几次调整挤出去，用户会误以为「没记录到」。
      const hist = (sh.buy_status_history || []).slice(-8).reverse();
      const histAttr = hist.length ? 'data-history=\'' + JSON.stringify(hist).replace(/'/g, '&#39;') + '\'' : '';
      const kind = classifyBuyStatus(sh);
      if (kind === 'none' || kind === 'limited_no_amount') return '<span class="text-stone-400 dark:text-stone-500 text-xs" ' + histAttr + '>—</span>';
      const cls = buyStatusClass(st);
      if (kind === 'paused') return '<span class="' + cls + ' buy-cell" ' + histAttr + '>暂停</span>';
      if (kind === 'limited') return '<span class="' + cls + ' buy-cell" ' + histAttr + '>限 ¥' + formatLimit(sh.daily_limit) + '</span>';
      return '<span class="' + cls + ' buy-cell" ' + histAttr + '>' + st + '</span>';
    }

    // ==================== 申购历史 tooltip ====================
    // 渲染策略：用 `position: fixed` + cell.getBoundingClientRect() 计算坐标，
    // 避免父容器 overflow / stacking context 截断（之前 absolute 在含 overflow-x:auto 的表格
    // 内会被裁切，且可能被表头视觉覆盖 — 详见 plan "全球指数基金浮层贴图问题"）。
    // auto-flip：弹层预估高度 + 间距 > 视口顶部可用空间 → 翻转到下方。
    // 视口顶部可用空间 = cell.top 与最近的 thead 底部之间的较小值（thead 才是真实遮挡源）。
    // 弹层用 pointer-events:none 不拦截 hover，移出 cell 即销毁。
    var TOOLTIP_ESTIMATED_HEIGHT = 130;
    var TOOLTIP_OFFSET = 8;
    function showBuyTip(el) {
      if (el.querySelector('.buy-hist-tip')) return;
      var tip = document.createElement('div'); tip.className = 'buy-hist-tip';
      var cellRect = el.getBoundingClientRect();
      var vh = window.innerHeight;
      // 计算视口顶部可用空间：取 cell.top 与最近 thead 底部 之间的较小值
      var spaceAbove = cellRect.top;
      var thead = el.closest('table')?.querySelector('thead');
      if (thead) {
        var theadRect = thead.getBoundingClientRect();
        spaceAbove = Math.min(spaceAbove, cellRect.top - theadRect.bottom);
      }
      var isBelow = spaceAbove < TOOLTIP_ESTIMATED_HEIGHT + TOOLTIP_OFFSET;
      // 用 fixed 定位：右对齐到 cell 右边
      tip.style.right = (window.innerWidth - cellRect.right) + 'px';
      if (isBelow) {
        tip.style.top = (cellRect.bottom + TOOLTIP_OFFSET) + 'px';
        tip.classList.add('buy-hist-tip-below');
      } else {
        tip.style.bottom = (vh - cellRect.top + TOOLTIP_OFFSET) + 'px';
      }
      var raw = el.dataset.history;
      var histData = [];
      if (raw) { try { histData = JSON.parse(raw); } catch(_) { histData = []; } }
      if (!histData || !histData.length) {
        tip.innerHTML = '<div class="tip-header">申购变更记录</div><div class="tip-empty">暂无历史记录</div>';
      } else {
        // statusBadge 已按「最新在前」写入，这里仅反转为时间正序
        histData = histData.reverse();
        var rows = '';
        for (var hi = 0; hi < histData.length; hi++) {
          var h = histData[hi];
          var s = h.buy_status || '';
          var cls, label;
          if (s.includes('暂停')) { cls = 'tip-badge-paused'; label = '暂停'; }
          else if (s.includes('限') && h.daily_limit > 0) { cls = 'tip-badge-limit'; label = '限 ¥' + formatLimit(h.daily_limit); }
          else { cls = 'tip-badge-open'; label = s; }
          rows += '<div class="tip-row"><span class="tip-date">' + h.date + '</span><span class="tip-badge ' + cls + '">' + label + '</span></div>';
        }
        tip.innerHTML = '<div class="tip-header">申购变更 · 最近' + histData.length + '次</div>' + rows;
      }
      document.body.appendChild(tip);
    }
    function hideBuyTip(el) { var tip = document.querySelector('.buy-hist-tip'); if (tip) tip.remove(); }
    function initBuyTooltips(container) {
      container.querySelectorAll('.buy-cell').forEach(function(cell) {
        cell.addEventListener('mouseenter', function() { showBuyTip(cell); });
        cell.addEventListener('mouseleave', function() { hideBuyTip(cell); });
      });
    }
    function toggleSeries(row) {
      const id = row.dataset.seriesId;
      const detail = document.querySelector(`.share-rows[data-parent="${id}"]`);
      const arrow = row.querySelector('.arrow');
      if (detail.classList.contains('hidden')) {
        detail.classList.remove('hidden');
        arrow.style.transform = 'rotate(90deg)';
      } else {
        detail.classList.add('hidden');
        arrow.style.transform = '';
      }
    }

    // ==================== 详情页 / 持仓 ====================

    function holdingsBtn(code) {
      // 只有抓到持仓数据的基金才显示按钮（前端运行时会校验）
      return `<button type="button" class="holdings-btn text-xs px-2.5 py-1 rounded-md border dark:border-stone-700 bg-indigo-50 dark:bg-stone-900/50 text-indigo-600 dark:text-stone-300 hover:bg-indigo-100 dark:hover:bg-stone-700 transition font-medium"
                data-code="${code}" aria-label="查看 ${code} 持仓详情"
                onclick="event.stopPropagation(); openDetail('${code}', event);">
                📊 持仓
              </button>`;
    }

    function trendBtn(code) {
      // 走势按钮：所有 6 位代码的场外基金都能拉 pingzhongdata
      return `<button type="button" class="trend-btn text-xs px-2.5 py-1 rounded-md border dark:border-stone-700 bg-emerald-50 dark:bg-stone-900/50 text-emerald-700 dark:text-stone-300 hover:bg-emerald-100 dark:hover:bg-stone-700 transition font-medium"
                data-code="${code}" aria-label="查看 ${code} 历史走势"
                onclick="event.stopPropagation(); openTrend('${code}', event);">
                📈 走势
              </button>`;
    }

    // ESC 关闭：嵌套 modal 栈（trendModal 优先），按一次关一层
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const trendM = document.getElementById('trendModal');
      const detailM = document.getElementById('detailModal');
      if (trendM && !trendM.classList.contains('hidden')) {
        closeTrend();
      } else if (detailM && !detailM.classList.contains('hidden')) {
        closeDetail();
      }
    });

    // 点击遮罩区域关闭（点到内容卡片不关闭，只点背景才关闭）
    document.getElementById('detailModal').addEventListener('click', e => {
      if (e.target.id === 'detailModal' || e.target.classList.contains('modal-overlay')) {
        closeDetail();
      }
    });

    // 各板块的副标题文案
    // SUBTITLE_BY_TAB 已移到 web/js/config.js

    // 根据当前 Tab 显示 / 隐藏知识卡片
    function updateKnowledgeCards(tab) {
      document.querySelectorAll('#knowledge-cards details[data-for-tabs]').forEach(card => {
        const tabs = (card.dataset.forTabs || '').split(',').map(s => s.trim());
        card.style.display = tabs.includes(tab) ? '' : 'none';
      });
    }

    function switchTab(tab) {
      // 只在带 data-category 的业务 section 之间切换；
      // #market-overview（市场参照系）无该属性，始终保持可见。
      document.querySelectorAll('main > section[data-category]').forEach(sec => {
        const isCurrent = sec.dataset.category === tab;
        sec.style.display = isCurrent ? '' : 'none';
        sec.setAttribute('aria-hidden', isCurrent ? 'false' : 'true');
      });
      document.querySelectorAll('.tab-btn').forEach(btn => {
        const isCurrent = btn.dataset.tab === tab;
        btn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
        btn.setAttribute('tabindex', isCurrent ? '0' : '-1');
      });
      updateKnowledgeCards(tab);
      // 更新副标题
      const sub = document.getElementById('page-subtitle');
      if (sub && SUBTITLE_BY_TAB[tab]) sub.textContent = SUBTITLE_BY_TAB[tab];
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
        btn.classList.add('tab-active');
        switchTab(btn.dataset.tab);
      });
    });

    // 初始化：默认「场外」Tab
    switchTab('offshore');

    loadData();

    // 暴露给外部 ES module + 独立脚本（render-trend.js / render-modal.js 通过 window 访问）
    window.STATE = STATE;
    window.renderCategory = renderCategory;
    window.fetchStocksLive = fetchStocksLive;
    window.loadData = loadData;
    window.loadData = loadData;
