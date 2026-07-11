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
    let DETAIL_REFRESH_TIMER = null;  // 持仓弹窗自动刷新定时器
    let LAST_FOCUS = null;            // 打开弹窗前的焦点元素

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

      return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = `https://qt.gtimg.cn/q=${queries.join(',')}&t=${Date.now()}`;
        s.async = true;
        const timer = setTimeout(() => { s.remove(); resolve({}); }, 4000);
        s.onload = () => {
          clearTimeout(timer);
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
          s.remove();
          resolve(result);
        };
        s.onerror = () => { clearTimeout(timer); s.remove(); resolve({}); };
        document.head.appendChild(s);
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

    function renderCategory(tab) {
      const container = document.getElementById(`table-${tab}`);
      const isEtf = tab === 'etf';
      const isOffshore = tab === 'offshore';

      // 「场外」表头要不要加持仓列：只要包含 active 组就加
      const showHoldings = isOffshore;  // 场外含主动基金，统一加持仓列

      // 收集要渲染的 series 分组
      let groups;
      let totalSeries = 0, totalShares = 0, totalScale = 0;

      if (isOffshore) {
        // 场外 = sp500 + nasdaq_passive + active + global_index + global_other 五个分组
        groups = OFFSHORE_GROUPS.map(g => {
          const src = STATE.data[g.key];
          const items = (src?.series || []).map(s => ({
            ...s,
            starred: OFFSHORE_STARRED.has(s.default_share_code),
          }));
          return {
            ...g,
            items,
            sourceCat: g.key,
            // active 和 global_other 都是主动型 —— 显示基金经理、展示持仓按钮
            isActive: (g.key === 'active' || g.key === 'global_other'),
          };
        }).filter(g => g.items.length);
      } else if (isEtf) {
        // ETF 按 etf_target 分组：sp500/nasdaq100 单独，其余（含 us50、other、空值）归入 global_other
        const src = STATE.data.etf;
        const byTarget = {};
        for (const s of src.series) {
          const raw = s.etf_target;
          const t = (raw === 'sp500' || raw === 'nasdaq100') ? raw : 'global_other';
          (byTarget[t] = byTarget[t] || []).push(s);
        }
        for (const key in byTarget) {
          // 组内排序：starred 置顶，其余按规模降序
          byTarget[key].sort((a, b) => {
            if (a.starred && !b.starred) return -1;
            if (!a.starred && b.starred) return 1;
            return (b.series_scale || 0) - (a.series_scale || 0);
          });
        }
        groups = ETF_GROUPS
          .map(g => ({ ...g, items: byTarget[g.key] || [], sourceCat: 'etf', isActive: false }))
          .filter(g => g.items.length);
      }

      // 应用排序（每个分组内独立排序，不跨组）
      const sortConf = SORT_STATE[tab] || { key: 'series_scale', dir: 'desc' };
      groups.forEach(g => {
        g.items = sortSeries(g.items, sortConf.key, sortConf.dir);
      });

      // 统计
      groups.forEach(g => {
        totalSeries += g.items.length;
        g.items.forEach(s => {
          totalShares += s.shares.length;
          totalScale += (s.series_scale || 0);
        });
      });
      document.getElementById(`count-${tab}`).textContent =
        `${totalSeries} 个系列 · ${totalShares} 只份额 · 总规模 ${totalScale.toFixed(0)} 亿`;

      // 表头净值日期：按当前可见分组计算代表日期（众数，并列取更晚日期）。
      // 默认分组 = 当前 CHIP_STATE 命中的组；若不存在则回退首组。
      const activeGroupKey = (CHIP_STATE[tab] && groups.some(g => g.key === CHIP_STATE[tab])) ? CHIP_STATE[tab] : (groups[0]?.key || '');
      const activeGroup = groups.find(g => g.key === activeGroupKey);
      const latestNavDate = pickGroupHeaderDate(activeGroup?.items || [], isEtf);
      const navHeaderSub = fmtMD(latestNavDate);
      // 按 tab 存储，供 renderSeries 判断行内是否需要重复显示日期
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
      btn.className = 'chip';
      btn.style.cssText = 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;';
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
      // 计算日限额汇总（仅场外被动分组：sp500 / nasdaq_passive / global_index）
      let limitSummary = '';
      if (tab === 'offshore' && ['sp500', 'nasdaq_passive', 'global_index'].includes(filter)) {
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
          if (totalLimit > 0) parts.push(`当前每日可购买 <b class="text-red-600 dark:text-red-400">¥${formatLimit(totalLimit)}</b>`);
          if (openCount > 0) parts.push(`${openCount} 只开放申购`);
          if (parts.length) limitSummary = parts.join(' + ');
        }
      }
      el.classList.remove('hidden');
      const limitLi = limitSummary
        ? `<li class="flex gap-2"><span class="flex-shrink-0">💰</span><span><b>${limitSummary}</b></span></li>`
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

      // 展开后的子表格 colspan（ETF=9，场外=12）
      const expandColspan = isEtf ? 10 : 13;

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
      const hist = (sh.buy_status_history || []).slice(-3).reverse();
      const histAttr = hist.length ? 'data-history=\'' + JSON.stringify(hist).replace(/'/g, '&#39;') + '\'' : '';
  if (!st) return '<span class="text-stone-400 dark:text-stone-500 text-xs" ' + histAttr + '>—</span>';
  if (sh.currency === '美元') return '<span class="text-stone-400 dark:text-stone-500 text-xs" ' + histAttr + '>—</span>';
      const cls = buyStatusClass(st);
      if (st.includes('暂停')) return '<span class="' + cls + ' buy-cell" ' + histAttr + '>暂停</span>';
      if (st.includes('限') && sh.daily_limit > 0) return '<span class="' + cls + ' buy-cell" ' + histAttr + '>限 ¥' + formatLimit(sh.daily_limit) + '</span>';
      if (st.includes('限') && !sh.daily_limit) return '<span class="text-stone-400 dark:text-stone-500 text-xs" ' + histAttr + '>—</span>';
      return '<span class="' + cls + ' buy-cell" ' + histAttr + '>' + st + '</span>';
    }

    // ==================== 申购历史 tooltip ====================
    function showBuyTip(el) {
      if (el.querySelector('.buy-hist-tip')) return;
      var tip = document.createElement('div'); tip.className = 'buy-hist-tip';
      var raw = el.dataset.history;
      var histData = [];
      if (raw) { try { histData = JSON.parse(raw); } catch(_) { histData = []; } }
      if (!histData || !histData.length) {
        tip.innerHTML = '<div class="tip-header">申购变更记录</div><div class="tip-empty">暂无历史记录</div>';
      } else {
        histData = histData.slice(-3).reverse();
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
      el.style.position = 'relative'; el.appendChild(tip);
    }
    function hideBuyTip(el) { var tip = el.querySelector('.buy-hist-tip'); if (tip) tip.remove(); el.style.position = ''; }
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

    async function openDetail(code, evt) {
      if (evt) evt.stopPropagation();

      // 找到这只基金所在的系列
      // 扩大到全部场外分类：除主动/全球其他外，sp500/nasdaq_passive/global_index 也可能含 Smart Beta
      // 等"分类被动但实为主动管理"的基金（例如 096001 大成标普500等权重），它们也走真实持仓按钮
      let series = null, share = null;
      for (const cat of ['active', 'global_other', 'sp500', 'nasdaq_passive', 'global_index']) {
        const d = STATE.data[cat];
        if (!d) continue;
        for (const s of d.series) {
          const sh = s.shares.find(x => x.code === code);
          if (sh) { series = s; share = sh; break; }
        }
        if (series) break;
      }
      if (!series) {
        alert('未找到基金数据');
        return;
      }

      // 打开 Modal
      const modal = document.getElementById('detailModal');
      LAST_FOCUS = document.activeElement;
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const closeBtn = document.getElementById('detail-close');
        if (closeBtn) closeBtn.focus();
      });

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

          // 🟢 动态刷新 Top10 股票"当日涨跌"——按各股票所在市场分别拉腾讯行情
          try {
            const codes = (holdings.holdings || [])
              .map(h => h.stock_code)
              .filter(Boolean);
            if (codes.length) {
              const live = await fetchStocksLive(codes);
              for (const [c, r] of Object.entries(live)) {
                const existing = STATE.stocks[c] || {};
                STATE.stocks[c] = {
                  ...existing,
                  code: c,
                  market: r.market || existing.market,
                  price: r.price != null ? r.price : existing.price,
                  change_pct: r.change_pct != null ? r.change_pct : existing.change_pct,
                };
              }
              // 行情已更新 → 详情页持仓 Top10 的「当日涨跌」会在下次 renderDetailHoldings 时使用
            }
          } catch (_) { /* 静默降级 */ }

          renderDetailHoldings(holdings, _detailCode);
        } catch (e) {
          document.getElementById('detail-holdings').innerHTML =
            `<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">暂无持仓数据（可能是新基金或季报未披露）</div>`;
        }
      }

      await loadHoldings();

      // 自动刷新：盘中时每 5 分钟刷新持仓行情
      if (DETAIL_REFRESH_TIMER) clearInterval(DETAIL_REFRESH_TIMER);
      DETAIL_REFRESH_TIMER = setInterval(() => {
        // Modal 已关闭 → 停止刷新
        if (document.getElementById('detailModal').classList.contains('hidden')) {
          clearInterval(DETAIL_REFRESH_TIMER);
          DETAIL_REFRESH_TIMER = null;
          return;
        }
        // 非交易日或页面不可见 → 跳过本轮
        if (!isTradingDay() || document.hidden) return;
        loadHoldings();
      }, 5 * 60 * 1000);
    }

    function closeDetail() {
      document.getElementById('detailModal').classList.add('hidden');
      document.body.style.overflow = '';
      // 停止持仓自动刷新
      if (DETAIL_REFRESH_TIMER) {
        clearInterval(DETAIL_REFRESH_TIMER);
        DETAIL_REFRESH_TIMER = null;
      }
      if (LAST_FOCUS && typeof LAST_FOCUS.focus === 'function') {
        LAST_FOCUS.focus();
      }
    }

    // ==================== 历史净值走势 ====================
    // 数据来源：fund.eastmoney.com/pingzhongdata/{code}.js（JSONP）
    //   · Data_netWorthTrend: [{x: ts_ms, y: 单位净值, equityReturn: 日涨跌%}, ...]
    //   · 数据从基金成立日起算（多则 10+ 年），可支持 1 月 ~ 全部 各档区间筛选
    // TREND_RANGES 已移到 web/js/config.js
    const TREND_STATE = { code: null, fullSeries: null, range: '3m', expanded: false };

    async function fetchPzdHistory(code) {
      // 重用 pingzhongdata 接口；返回 [{date, nav, change}, ...] 升序
      return new Promise((resolve) => {
        // 清掉旧全局变量，避免上一次成功的数据污染本次请求（尤其本次失败时）
        try { delete window.Data_netWorthTrend; } catch (_) { window.Data_netWorthTrend = undefined; }
        try { delete window.fS_code; } catch (_) { window.fS_code = undefined; }

        const s = document.createElement('script');
        s.src = `https://fund.eastmoney.com/pingzhongdata/${code}.js?rt=${Date.now()}`;
        s.async = true;
        const timer = setTimeout(() => { s.remove(); resolve(null); }, 8000);
        s.onload = () => {
          clearTimeout(timer);
          s.remove();
          // 校验 fS_code 与请求 code 一致，防止缓存/CDN 返回错误基金的数据
          if (window.fS_code && String(window.fS_code) !== String(code)) {
            resolve(null);
            return;
          }
          // pingzhongdata 是脚本直接给全局变量赋值，读 window.Data_netWorthTrend
          const arr = window.Data_netWorthTrend;
          if (!Array.isArray(arr) || !arr.length) { resolve(null); return; }
          const out = arr.map(p => ({
            date: new Date(p.x),
            nav: parseFloat(p.y),
            change: p.equityReturn != null ? parseFloat(p.equityReturn) : null,
          })).filter(p => Number.isFinite(p.nav));
          resolve(out);
        };
        s.onerror = () => { clearTimeout(timer); s.remove(); resolve(null); };
        document.head.appendChild(s);
      });
    }

    function filterTrendRange(series, rangeKey) {
      if (!series?.length) return [];
      if (rangeKey === 'all') return series;
      const last = series[series.length - 1].date;
      let start;
      if (rangeKey === 'ytd') {
        start = new Date(last.getFullYear(), 0, 1);
      } else {
        const r = TREND_RANGES.find(x => x.key === rangeKey);
        if (!r || !r.days) return series;
        start = new Date(last.getTime() - r.days * 86400 * 1000);
      }
      return series.filter(p => p.date >= start);
    }

    function renderTrendChart() {
      // 每次重渲染图表（首次/区间切换）都把列表收回为 5 条预览
      TREND_STATE.expanded = false;
      const wrap = document.getElementById('trend-chart');
      const recent = document.getElementById('trend-recent');
      const data = filterTrendRange(TREND_STATE.fullSeries, TREND_STATE.range);
      if (!data.length) {
        wrap.innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">所选区间无数据</div>';
        recent.innerHTML = '';
        return;
      }

      // ===== Y 轴模式（基金 vs 指数）=====
      // 'pct'   : 基金（默认）—— Y 轴是相对区间起点的累计涨跌幅 %，多档对比尺度一致
      // 'value' : 指数 / 汇率 —— Y 轴是绝对值（点位 51000.0 / 汇率 6.7662），符合行情看盘直觉
      // why 不让指数也走 pct：道琼斯/汇率有公认的"绝对值阅读习惯"（例如汇率 6.7 vs 7.2），
      //   折成 % 反而失去了"实际位置"信息；基金净值则是另一回事——每只基金净值起点不同，
      //   用 % 才能横向对比。所以这里是有意分两条路。
      const yMode = TREND_STATE.yMode === 'value' ? 'value' : 'pct';
      // 数字精度：指数 2 位、汇率 4 位、基金净值 4 位（默认）
      const digits = Number.isInteger(TREND_STATE.digits) ? TREND_STATE.digits : 4;
      // tooltip / 列表里"净值"那一行的 label——指数模式称"点位"，汇率称"汇率"，否则保持"净值"
      const navLabel = TREND_STATE.navLabel || '净值';

      const baseNav = data[0].nav;
      const pts = data.map(p => ({
        date: p.date,
        nav: p.nav,
        change: p.change,                        // 当日涨跌（来自 pzd / 日 K）
        ret: (p.nav / baseNav - 1) * 100,        // 累计涨跌 %（两种模式都计算，hover 时仍展示）
      }));

      // SVG 尺寸（PAD_L 改为动态：根据 Y 轴最长标签估算所需宽度）
      // why 不固定 50：基金 "+1.5%" 短，50 够；但指数 "51,032.46" 9 字符 ×6px ≈ 54px 已溢出 PAD_L
      //   导致首位字符（如"5"）被 SVG viewBox 左侧裁掉。这里按实际标签长度倒算 PAD_L。
      const W = 720, H = 260, PAD_R = 16, PAD_T = 16, PAD_B = 28;
      // value 模式直接用 nav 作 Y；pct 模式用 ret
      const ys = yMode === 'value' ? pts.map(p => p.nav) : pts.map(p => p.ret);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const padY = (maxY - minY) * 0.08 || (yMode === 'value' ? Math.max(minY * 0.001, 0.01) : 0.5);
      const lo = minY - padY, hi = maxY + padY;

      // Y 轴标签格式化：pct 模式 "+1.5%"；value 模式千分位 + digits 位小数
      const fmtAxis = (v) => {
        if (yMode === 'value') {
          return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
        }
        return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
      };
      // 动态 PAD_L：取 5 道刻度中最长标签的字符数，按 10px font-size 下 ≈ 6.2px/char 估算
      // 再加 12px 余量（标签到坐标轴的 6px gap + 缓冲），并夹在 [44, 88] 之间避免极端值
      let maxLabelLen = 0;
      for (let i = 0; i <= 4; i++) {
        const v = lo + (hi - lo) * (i / 4);
        maxLabelLen = Math.max(maxLabelLen, fmtAxis(v).length);
      }
      const PAD_L = Math.min(88, Math.max(44, Math.ceil(maxLabelLen * 6.2) + 12));

      const xOf = (i) => PAD_L + (W - PAD_L - PAD_R) * (i / Math.max(1, pts.length - 1));
      const yOf = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - lo) / (hi - lo));

      const totalChg = pts[pts.length - 1].ret;  // 区间累计涨跌幅 %（两种模式都用它判断颜色）
      // A 股口径：红涨 / 绿跌（与表格 .up/.down 类一致）
      const upColor = '#dc2626';   // red-600
      const downColor = '#16a34a'; // green-600
      const lineColor = totalChg >= 0 ? upColor : downColor;

      // 折线 path：value 模式用 nav，pct 模式用 ret
      const yField = yMode === 'value' ? 'nav' : 'ret';
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p[yField]).toFixed(1)}`).join(' ');
      const area = `${path} L${xOf(pts.length - 1).toFixed(1)},${yOf(lo).toFixed(1)} L${xOf(0).toFixed(1)},${yOf(lo).toFixed(1)} Z`;

      // 0% 基准线：仅 pct 模式有意义（"涨跌平衡线"）；value 模式不画，因为 0 通常不在 lo~hi 区间
      const zeroY = (yMode === 'pct' && 0 >= lo && 0 <= hi) ? yOf(0) : null;

      // 5 道横向网格（fmtAxis 已在前面定义，用于 PAD_L 计算 + 此处渲染）
      const gridLines = [];
      const gridLabels = [];
      for (let i = 0; i <= 4; i++) {
        const v = lo + (hi - lo) * (i / 4);
        const y = yOf(v);
        gridLines.push(`<line class="trend-grid-line" x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="#e7e5e4" stroke-dasharray="2 3"/>`);
        gridLabels.push(`<text class="trend-grid-text" x="${PAD_L - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#a8a29e" text-anchor="end">${fmtAxis(v)}</text>`);
      }

      const fmtD = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const fmtFullD = (d) => `${d.getFullYear()}-${fmtD(d)}`;
      // X 轴标签格式：根据区间跨度决定日期粒度（模仿苹果股票 App）
      //   ≤1年  → M月D日（如 5月7日）
      //   1~3年 → YYYY年M月（如 2025年7月）
      //   >3年  → YYYY   （如 2022）
      const spanDays = (pts[pts.length - 1].date - pts[0].date) / 864e5;
      let fmtXLabel;
      if (spanDays > 365 * 3) {
        fmtXLabel = (d) => `${d.getFullYear()}`;
      } else if (spanDays > 365) {
        fmtXLabel = (d) => `${d.getFullYear()}年${d.getMonth() + 1}月`;
      } else {
        fmtXLabel = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
      }
      // X 轴刻度数量（苹果风格：所有区间都放足够多的刻度）
      //   ≤30天  → 5 个（1月）
      //   30~180天 → 5 个（3月/6月）
      //   180天~3年 → 5~6 个（1年/2年）
      //   >3年   → 6 个（5年/10年/全部）
      const xTickCount = spanDays > 365 * 3 ? 6 : 5;
      const xLabels = [];
      for (let t = 0; t < xTickCount; t++) {
        const i = t === 0 ? 0 : t === xTickCount - 1 ? pts.length - 1 : Math.round(pts.length * t / (xTickCount - 1));
        xLabels.push({ i, label: fmtXLabel(pts[i].date) });
      }

      // 区间累计涨跌：A 股口径（红涨绿跌），与全站 .up/.down 一致
      const totalChgCls = totalChg > 0 ? 'up' : totalChg < 0 ? 'down' : 'text-stone-400';
      const totalChgStr = `${totalChg >= 0 ? '+' : ''}${totalChg.toFixed(2)}%`;
      // value 模式额外展示"首末值"，让用户一眼看出"6.7662 → 6.7245"这种绝对变化
      const fmtVal = (v) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
      const headExtra = yMode === 'value'
        ? `<span class="text-xs text-stone-500 dark:text-stone-400 ml-2 num">${fmtVal(pts[0].nav)} → <span class="text-stone-700 dark:text-stone-300 font-medium">${fmtVal(pts[pts.length - 1].nav)}</span></span>`
        : '';

      wrap.innerHTML = `
        <div class="flex items-baseline justify-between flex-wrap gap-2 mb-2">
          <div class="text-sm text-stone-500 dark:text-stone-400">区间累计 <span class="font-bold ${totalChgCls} num text-base ml-1">${totalChgStr}</span>${headExtra}</div>
          <div class="text-xs text-stone-400 dark:text-stone-500 num">${fmtFullD(pts[0].date)} ~ ${fmtFullD(pts[pts.length - 1].date)} · ${pts.length} 个交易日</div>
        </div>
        <div class="relative" id="trend-chart-inner">
          <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:auto; display:block;" id="trend-svg">
            <defs>
              <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.18"/>
                <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
              </linearGradient>
            </defs>
            ${gridLines.join('')}
            ${gridLabels.join('')}
            ${zeroY != null ? `<line class="trend-zero-line" x1="${PAD_L}" y1="${zeroY.toFixed(1)}" x2="${W - PAD_R}" y2="${zeroY.toFixed(1)}" stroke="#a8a29e" stroke-width="0.6" stroke-dasharray="3 3"/>` : ''}
            <path d="${area}" fill="url(#trend-grad)" />
            <path d="${path}" fill="none" stroke="${lineColor}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
            ${xLabels.map(l => `<text class="trend-grid-text" x="${xOf(l.i).toFixed(1)}" y="${H - 8}" font-size="10" fill="#a8a29e" text-anchor="middle">${l.label}</text>`).join('')}
            <!-- crosshair（默认隐藏，hover 时显示） -->
            <g id="trend-cursor" style="display:none;">
              <line id="trend-cursor-line" y1="${PAD_T}" y2="${H - PAD_B}" stroke="#525252" stroke-width="0.8" stroke-dasharray="2 2"/>
              <circle id="trend-cursor-dot" r="3.5" fill="${lineColor}" stroke="${document.documentElement.classList.contains('dark') ? '#292524' : '#fff'}" stroke-width="1.5"/>
            </g>
          </svg>
          <!-- tooltip：浅色卡片，文字直接用全站 .up/.down（红涨绿跌）保持一致 -->
          <div id="trend-tooltip" class="absolute pointer-events-none hidden bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 shadow-md text-xs whitespace-nowrap" style="transition:opacity .12s; min-width:160px;"></div>
        </div>
      `;

      // 最近净值列表：默认 5 条预览，点「加载更多」展开为完整列表（带滚动）
      // 切换区间时强制收回，因为基准点变了，区间累计也跟着变
      renderTrendList(pts);

      // ===== Hover 交互 =====
      const svg = document.getElementById('trend-svg');
      const wrapInner = document.getElementById('trend-chart-inner');
      const cursor = document.getElementById('trend-cursor');
      const cursorLine = document.getElementById('trend-cursor-line');
      const cursorDot = document.getElementById('trend-cursor-dot');
      const tooltip = document.getElementById('trend-tooltip');

      function findIndex(viewX) {
        // viewX 是 SVG viewBox 坐标系下的 x；二分查最接近的 i
        let lo = 0, hi = pts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (xOf(mid) < viewX) lo = mid + 1;
          else hi = mid;
        }
        // 在 lo 和 lo-1 之间选更近的
        if (lo > 0 && Math.abs(xOf(lo - 1) - viewX) < Math.abs(xOf(lo) - viewX)) return lo - 1;
        return lo;
      }

      function onMove(e) {
        const rect = svg.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        // 屏幕像素 → viewBox 坐标
        const viewX = (clientX - rect.left) * (W / rect.width);
        if (viewX < PAD_L || viewX > W - PAD_R) {
          cursor.style.display = 'none';
          tooltip.classList.add('hidden');
          return;
        }
        const i = findIndex(viewX);
        const p = pts[i];
        const cx = xOf(i), cy = yOf(p[yField]);
        cursor.style.display = '';
        cursorLine.setAttribute('x1', cx.toFixed(1));
        cursorLine.setAttribute('x2', cx.toFixed(1));
        cursorDot.setAttribute('cx', cx.toFixed(1));
        cursorDot.setAttribute('cy', cy.toFixed(1));

        // tooltip 显示（浅色卡片 + .up/.down 保持站点统一红涨绿跌口径）
        const chgTxt = p.change == null ? '--' : `${p.change > 0 ? '+' : ''}${p.change.toFixed(2)}%`;
        const chgCls = p.change == null ? 'text-stone-400' : p.change > 0 ? 'up' : p.change < 0 ? 'down' : 'text-stone-400';
        const retCls = p.ret > 0 ? 'up' : p.ret < 0 ? 'down' : 'text-stone-400';
        const retTxt = `${p.ret >= 0 ? '+' : ''}${p.ret.toFixed(2)}%`;
        // value 模式 nav 用 千分位+digits；pct 模式（基金）继续用 4 位定点
        const navTxt = yMode === 'value' ? fmtVal(p.nav) : p.nav.toFixed(4);
        tooltip.innerHTML = `
          <div class="font-semibold text-stone-900 dark:text-stone-100 num">${fmtFullD(p.date)}</div>
          <div class="mt-1.5 flex justify-between gap-4"><span class="text-stone-500 dark:text-stone-400">${navLabel}</span><span class="num font-medium text-stone-900 dark:text-stone-100">${navTxt}</span></div>
          <div class="mt-0.5 flex justify-between gap-4"><span class="text-stone-500 dark:text-stone-400">日涨跌</span><span class="num font-medium ${chgCls}">${chgTxt}</span></div>
          <div class="mt-0.5 flex justify-between gap-4 pt-1 border-t border-stone-100 dark:border-stone-700"><span class="text-stone-500 dark:text-stone-400">区间累计</span><span class="num font-bold ${retCls}">${retTxt}</span></div>
        `;
        tooltip.classList.remove('hidden');
        // tooltip 定位（基于内层 wrap 的相对坐标）
        const wrapRect = wrapInner.getBoundingClientRect();
        // 屏幕坐标转 wrap 内坐标
        const localX = (cx / W) * rect.width;
        const localY = (cy / H) * rect.height;
        // 默认放在数据点右侧；超出右边界时切到左侧
        const ttW = tooltip.offsetWidth || 160;
        const ttH = tooltip.offsetHeight || 80;
        let tx = localX + 12;
        if (tx + ttW > rect.width) tx = localX - ttW - 12;
        let ty = localY - ttH / 2;
        if (ty < 0) ty = 4;
        if (ty + ttH > rect.height) ty = rect.height - ttH - 4;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
      }
      function onLeave() {
        cursor.style.display = 'none';
        tooltip.classList.add('hidden');
      }
      svg.addEventListener('mousemove', onMove);
      svg.addEventListener('mouseleave', onLeave);
      svg.addEventListener('touchstart', onMove, { passive: true });
      svg.addEventListener('touchmove', onMove, { passive: true });
      svg.addEventListener('touchend', onLeave);
    }

    // 渲染走势 modal 底部的「最近净值」列表
    //   · 默认显示 5 条预览 + 「加载更多」按钮
    //   · 点击「加载更多」展开为完整历史（按日期降序，最新在最上），带 max-height 滚动
    //   · 数据来自当前区间已计算好的 pts（含 ret 字段），无需再请求接口
    function renderTrendList(pts) {
      const recent = document.getElementById('trend-recent');
      if (!recent) return;
      const expanded = TREND_STATE.expanded;
      const all = pts.slice().reverse();  // 最新在前
      const view = expanded ? all : all.slice(0, 5);
      const fmtFullD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // 与 renderTrendChart 同口径：value 模式（指数/汇率）千分位+digits；pct 模式（基金）4 位定点
      // navLabel：基金 = "净值"，指数 = "点位"，汇率 = "汇率"——表头第二列直接复用
      const yMode = TREND_STATE.yMode === 'value' ? 'value' : 'pct';
      const digits = Number.isInteger(TREND_STATE.digits) ? TREND_STATE.digits : 4;
      const navLabel = TREND_STATE.navLabel || '单位净值';
      const fmtNav = (v) => yMode === 'value'
        ? v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
        : v.toFixed(4);

      const rows = view.map(p => {
        const chgCls = p.change == null ? 'text-stone-400' : p.change > 0 ? 'up' : p.change < 0 ? 'down' : '';
        const chgTxt = p.change == null ? '--' : `${p.change > 0 ? '+' : ''}${p.change.toFixed(2)}%`;
        const retCls = p.ret > 0 ? 'up' : p.ret < 0 ? 'down' : 'text-stone-400';
        const retTxt = `${p.ret > 0 ? '+' : ''}${p.ret.toFixed(2)}%`;
        return `<tr class="border-t border-stone-100 dark:border-stone-700/50">
          <td class="py-2 px-3 num">${fmtFullD(p.date)}</td>
          <td class="py-2 px-3 text-right num font-medium">${fmtNav(p.nav)}</td>
          <td class="py-2 px-3 text-right num ${chgCls}">${chgTxt}</td>
          <td class="py-2 px-3 text-right num ${retCls}">${retTxt}</td>
        </tr>`;
      }).join('');

      const tableHtml = `
        <table class="w-full">
          <thead class="bg-stone-50 dark:bg-stone-900 text-stone-500 dark:text-stone-400 ${expanded ? 'sticky top-0 z-10' : ''}">
            <tr>
              <th class="text-left py-2 px-3 font-medium">日期</th>
              <th class="text-right py-2 px-3 font-medium">${navLabel}</th>
              <th class="text-right py-2 px-3 font-medium">日涨跌</th>
              <th class="text-right py-2 px-3 font-medium">区间累计</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;

      // 加载更多/收起按钮（仅当总条数 > 5 才显示）
      const showToggle = all.length > 5;
      let toggleHtml = '';
      if (showToggle) {
        if (!expanded) {
          toggleHtml = `
            <button id="trend-list-more"
                    class="w-full py-2.5 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition border-t border-stone-100 dark:border-stone-700/50 flex items-center justify-center gap-1">
              <span>加载全部历史净值（共 ${all.length} 条）</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>`;
        } else {
          toggleHtml = `
            <button id="trend-list-more"
                    class="w-full py-2.5 text-xs text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition border-t border-stone-100 dark:border-stone-700/50 sticky bottom-0 bg-white dark:bg-stone-800 flex items-center justify-center gap-1">
              <span>收起（仅看最近 5 条）</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/>
              </svg>
            </button>`;
        }
      }

      // 展开模式下加最大高度 + 滚动
      if (expanded) {
        recent.innerHTML = `
          <div class="max-h-[420px] overflow-y-auto text-xs">${tableHtml}</div>
          ${toggleHtml}
        `;
      } else {
        recent.innerHTML = `${tableHtml}${toggleHtml}`;
      }

      const btn = document.getElementById('trend-list-more');
      if (btn) {
        btn.addEventListener('click', () => {
          TREND_STATE.expanded = !TREND_STATE.expanded;
          renderTrendList(pts);
        });
      }
    }

    function renderTrendRanges() {
      const box = document.getElementById('trend-ranges');
      box.innerHTML = TREND_RANGES.map(r => `
        <button data-range="${r.key}" class="px-3 py-1.5 rounded-md text-xs border dark:border-stone-700 transition ${TREND_STATE.range === r.key ? 'bg-stone-900 dark:bg-stone-700 text-white dark:text-stone-200 border-transparent dark:border-stone-600' : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'}">
          ${r.label}
        </button>
      `).join('');
      box.querySelectorAll('button[data-range]').forEach(btn => {
        btn.addEventListener('click', () => {
          TREND_STATE.range = btn.dataset.range;
          renderTrendRanges();
          renderTrendChart();
        });
      });
    }

    async function openTrend(code, evt) {
      if (evt) evt.stopPropagation();
      // 找基金信息（场外 5 个 cat + ETF）
      let series = null, share = null;
      for (const cat of ['sp500', 'nasdaq_passive', 'active', 'global_index', 'global_other', 'etf']) {
        const d = STATE.data[cat];
        if (!d) continue;
        for (const s of d.series) {
          const sh = s.shares.find(x => x.code === code);
          if (sh) { series = s; share = sh; break; }
        }
        if (series) break;
      }
      const modal = document.getElementById('trendModal');
      LAST_FOCUS = document.activeElement;
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const closeBtn = document.getElementById('trend-close');
        if (closeBtn) closeBtn.focus();
      });
      document.getElementById('trend-title').textContent = series?.display_name || share?.name || `基金 ${code}`;
      document.getElementById('trend-subtitle').innerHTML = `
        <span class="num">${code}</span>
        ${share?.share_class ? ` · ${share.share_class}` : ''}
        ${share?.nav != null ? ` · 当前净值 <span class="font-medium num text-stone-700 dark:text-stone-300">${share.nav.toFixed(4)}</span>` : ''}
        ${share?.nav_date ? ` <span class="text-stone-400">(${share.nav_date})</span>` : ''}
      `;
      document.getElementById('trend-chart').innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">⏳ 拉取历史净值中...</div>';
      document.getElementById('trend-recent').innerHTML = '';
      TREND_STATE.code = code;
      TREND_STATE.fullSeries = null;
      TREND_STATE.range = '3m';
      TREND_STATE.expanded = false;
      // 防污染：上次可能是指数 modal（market-trend.js 设了 yMode='value'），这里强制回到基金口径
      // 三个字段缺省值 = 基金原行为：累计涨跌幅% / 净值 4 位定点 / 列名"单位净值"
      TREND_STATE.yMode = 'pct';
      TREND_STATE.digits = 4;
      TREND_STATE.navLabel = '单位净值';
      renderTrendRanges();

      const data = await fetchPzdHistory(code);
      if (!data || !data.length) {
        document.getElementById('trend-chart').innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">无法拉取历史净值（数据源临时不可用）</div>';
        return;
      }
      TREND_STATE.fullSeries = data;
      renderTrendChart();
    }

    function closeTrend() {
      document.getElementById('trendModal').classList.add('hidden');
      document.body.style.overflow = '';
      if (LAST_FOCUS && typeof LAST_FOCUS.focus === 'function') {
        LAST_FOCUS.focus();
      }
    }
    // 点 trendModal 背景关闭
    // why 双层判断：trendModal 内部还套了一层全屏 .modal-overlay div（见 HTML 行 452），
    //   用户点击空白区域时，e.target 实际命中的是 .modal-overlay 而不是 trendModal 本身。
    //   仅判 e.target === m 永远 false → 此前外部点击关不掉 modal。
    //   与下方 detailModal 的关闭逻辑（行 ~2355）保持同款实现：modalRoot 或 .modal-overlay 都触发关闭。
    document.addEventListener('click', (e) => {
      const m = document.getElementById('trendModal');
      if (!m || m.classList.contains('hidden')) return;
      if (e.target.id === 'trendModal' || e.target.classList.contains('modal-overlay')) {
        closeTrend();
      }
    });

    function renderDetailBasic(series, share) {
      // 标题
      document.getElementById('detail-title').textContent = series.display_name;
      document.getElementById('detail-subtitle').innerHTML = `
        <span class="num">${share.code}</span> · ${share.share_class}${share.currency === '美元' ? ' · 美元' : ''}
        <span class="badge badge-qdii ml-1">QDII</span>
        ${share.manager ? `<span class="text-stone-500 dark:text-stone-400 ml-2">基金经理 <span class="text-stone-900 dark:text-stone-200 font-medium">${share.manager}</span></span>` : ''}
      `;

      // 顶部信息卡片
      const infoCards = [
        { label: '基金规模', value: share.scale_raw || '--', sub: series.company },
        { label: '成立时间', value: share.established || '--', sub: '至今' },
        { label: '单位净值', value: share.nav?.toFixed(4) ?? '--', sub: share.nav_date || '' },
        { label: '日涨跌', value: fmtPct(share.daily_change), sub: '当日', isChange: true, chgVal: share.daily_change },
        { label: '成立来收益', value: fmtPct(share.chg_since_inception), sub: '累计', isChange: true, chgVal: share.chg_since_inception },
        { label: '日买入限额', value: share.purchase_state === '暂停申购' ? '—' : fmtMoney(share.daily_limit), sub: share.purchase_state || '' },
      ];
      document.getElementById('detail-info').innerHTML = infoCards.map(c => `
        <div class="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-4">
          <div class="text-xs text-stone-500 dark:text-stone-400">${c.label}</div>
          <div class="text-xl font-bold mt-1 ${c.isChange ? (c.chgVal > 0 ? 'up' : c.chgVal < 0 ? 'down' : '') : ''} num">${c.value}</div>
          <div class="text-xs text-stone-400 dark:text-stone-500 mt-1">${c.sub}</div>
        </div>
      `).join('');

      // 业绩表现
      const perfItems = [
        { label: '近1月', value: share.chg_1m },
        { label: '近3月', value: share.chg_3m },
        { label: '近6月', value: share.chg_6m },
        { label: '今年来', value: share.chg_ytd },
        { label: '近1年', value: share.chg_1y },
        { label: '近3年', value: share.chg_3y },
        { label: '近5年', value: share.chg_5y },
        { label: '成立来', value: share.chg_since_inception },
      ];
      document.getElementById('detail-perf').innerHTML = perfItems.map(p => `
        <div class="text-center p-3 rounded-lg bg-stone-50 dark:bg-stone-800">
          <div class="text-xs text-stone-500 dark:text-stone-400 mb-1">${p.label}</div>
          <div class="font-bold num ${p.value > 0 ? 'up' : p.value < 0 ? 'down' : ''}">${fmtPct(p.value)}</div>
        </div>
      `).join('');

      // 费率结构
      const feeItems = [];
      if (share.first_buy_rate != null) {
        feeItems.push({ label: '首档买入费', value: share.first_buy_rate === 0 ? '免费' : `${share.first_buy_rate}%` });
      }
      if (share.free_hold_days != null) {
        feeItems.push({ label: '免赎回费持有天数', value: `${share.free_hold_days} 天`, highlight: true });
      }
      if (share.mgmt_fee != null) {
        feeItems.push({ label: '管理费（年）', value: `${share.mgmt_fee}%` });
      }
      if (share.custody_fee != null) {
        feeItems.push({ label: '托管费（年）', value: `${share.custody_fee}%` });
      }
      document.getElementById('detail-fee').innerHTML = feeItems.map(f => `
        <div class="flex justify-between py-2 border-b border-stone-100 dark:border-stone-700/50 last:border-0">
          <span class="text-sm text-stone-500 dark:text-stone-400">${f.label}</span>
          <span class="text-sm font-medium num ${f.highlight ? 'text-indigo-600 dark:text-indigo-400' : ''}">${f.value}</span>
        </div>
      `).join('') || '<div class="text-sm text-stone-400 dark:text-stone-500 text-center py-4">暂无费率数据</div>';

      // 估值信息已整合到持仓汇总条中
    }

    function renderDetailHoldings(data, fundCode) {
      const container = document.getElementById('detail-holdings');
      if (!data.holdings || data.holdings.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-stone-400 dark:text-stone-500 text-sm">暂无持仓数据</div>';
        return;
      }

      // 持仓头部汇总条
      const summaryHtml = `
        <div class="grid grid-cols-3 gap-2 mb-4">
          <div class="bg-indigo-50 dark:bg-stone-900/50 rounded-lg p-3 text-center">
            <div class="text-xs text-indigo-600 dark:text-stone-400">持仓只数</div>
            <div class="text-xl font-bold text-indigo-900 dark:text-stone-200 num mt-1">${data.holdings_count} 只</div>
          </div>
          <div class="bg-emerald-50 dark:bg-stone-900/50 rounded-lg p-3 text-center">
            <div class="text-xs text-emerald-600 dark:text-stone-400">Top10 总占比</div>
            <div class="text-xl font-bold text-emerald-900 dark:text-stone-200 num mt-1">${data.total_weight}%</div>
          </div>
          <div class="bg-amber-50 dark:bg-stone-900/50 rounded-lg p-3 text-center">
            <div class="text-xs text-amber-600 dark:text-stone-400">重仓股（>5%）</div>
            <div class="text-xl font-bold text-amber-900 dark:text-stone-200 num mt-1">${data.heavy_count} 只</div>
          </div>
        </div>
      `;

      // 最大权重用于做条形图
      const maxW = Math.max(...data.holdings.map(h => h.weight || 0));

      // 持仓行的「市场状态点」逻辑
      const listHtml = `
        <div class="text-xs text-stone-500 dark:text-stone-400 mb-2 flex justify-between flex-wrap gap-2">
          <span>${data.latest_quarter || '最新季报'} · 当日涨跌按持仓股票所属市场分别取实时行情</span>
          <span class="text-stone-400 dark:text-stone-500">
            <span class="mkt-dot open"></span>盘中实时
            <span class="ml-2"><span class="mkt-dot closed"></span>已收盘</span>
            <span class="ml-2 text-stone-300 dark:text-stone-600">·</span>
            <span class="ml-2">持仓截至 ${(data.fetched_at || '').slice(0, 10)}</span>
          </span>
        </div>
        <table class="w-full text-sm">
          <thead class="text-xs text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
            <tr>
              <th class="text-left py-2 font-medium w-8">#</th>
              <th class="text-left py-2 font-medium">股票名称</th>
              <th class="text-left py-2 font-medium">代码</th>
              <th class="text-right py-2 font-medium">占净值比</th>
              <th class="text-right py-2 font-medium">当日涨跌</th>
              <th class="text-right py-2 font-medium">持仓市值</th>
              <th class="w-32"></th>
            </tr>
          </thead>
          <tbody>
            ${data.holdings.map((h, i) => {
              const stock = STATE.stocks?.[h.stock_code];
              const chg = stock?.change_pct;
              const market = stock?.market || (/^\d{5}$/.test(h.stock_code) ? 'HK' : /^\d{6}$/.test(h.stock_code) ? 'A' : 'US');
              const sess = getMarketSession(market);
              const dotTitle = sess === 'open' ? `${market} 市场盘中实时` : `${market} 市场已收盘 · 显示最近成交`;
              const dot = `<span class="mkt-dot ${sess}" title="${dotTitle}"></span>`;
              const chgInner = chg == null
                ? '<span class="text-stone-300 dark:text-stone-600">--</span>'
                : `<span class="${chg > 0 ? 'up' : chg < 0 ? 'down' : ''}">${chg > 0 ? '+' : ''}${chg.toFixed(2)}%</span>`;
              const chgCell = `${dot}${chgInner}`;

              return `
                <tr class="border-b border-stone-50 dark:border-stone-700/50 hover:bg-stone-50/50 dark:hover:bg-stone-700/30">
                  <td class="py-2.5 text-stone-400 dark:text-stone-500 num">${h.rank || (i + 1)}</td>
                  <td class="py-2.5">
                    <span class="font-medium">${h.stock_name}</span>
                    ${stock ? `<span class="badge ml-1 ${stock.market === 'US' ? 'badge-qdii' : stock.market === 'HK' ? 'badge-usd' : 'badge-cny'}" style="font-size:9px;">${stock.market}</span>` : ''}
                  </td>
                  <td class="py-2.5 text-xs text-stone-500 dark:text-stone-400 num">${h.stock_code}</td>
                  <td class="py-2.5 text-right num font-bold">${h.weight?.toFixed(2)}%</td>
                  <td class="py-2.5 text-right num text-sm">${chgCell}</td>
                  <td class="py-2.5 text-right num text-stone-500 dark:text-stone-400 text-xs">${fmtMV(h.market_value)}</td>
                  <td class="py-2.5 pl-3">
                    <div class="h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                      <div class="h-full bg-gradient-to-r from-indigo-400 to-indigo-600" style="width: ${((h.weight || 0) / maxW * 100)}%"></div>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      container.innerHTML = summaryHtml + listHtml;
    }

    // 工具：格式化
    // fmtPct / fmtMoney / fmtMV 已移到 web/js/utils.js

    // ESC 关闭：trendModal 优先（可能从 detailModal 中嵌套打开），关闭最上层 modal
    // why 不一次关两个：用户期望"按一次 ESC 关一层"，与 macOS/iOS 弹层堆栈惯例一致
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

    // 暴露给外部 ES module（market-indices.js / etf-premium.js / market-trend.js 通过 window 访问）
    // why：<script type="module"> 有独立作用域，无法直接访问本块内的 const STATE 等
    window.STATE = STATE;
    window.renderCategory = renderCategory;
    window.loadData = loadData;
    // 走势 modal 内部状态机 + 渲染函数 —— 让 market-trend.js 复用同一套图表/列表/区间 chips
    // why 不复制一份到 market-trend：DOM 是单例（trendModal 全局只有一个），
    //     状态机也只有一份，复用反而比重复实现更安全（避免两侧渲染逻辑漂移）
    window.TREND_STATE = TREND_STATE;
    window.renderTrendChart = renderTrendChart;
    window.renderTrendRanges = renderTrendRanges;
