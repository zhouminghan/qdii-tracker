"""
扫描所有 QDII 基金，按板块自动分类
- 板块 1: 标普 500 指数基金（场外）
- 板块 2: 纳斯达克 100 指数基金（场外）
- 板块 3: 美股主动基金（场外）
- 板块 4: 场内 ETF（单独分类）

v2 改动：
- ETF 场内基金单独归类（板块 4）
- 份额类型识别扩展到 I/H/Q/R/F 等机构/特殊份额
- 人民币/美元份额归为同一系列
- 排除"中概"等非纯美股基金
"""
import json
import re
from datetime import datetime
from pathlib import Path

import akshare as ak
from timezone_utils import beijing_now_iso


# ============================================================
# 分类规则
# ============================================================

EXCLUDE_KEYWORDS = [
    "债", "货币", "原油", "石油", "黄金", "白银", "商品", "大宗",
    "日本", "日经", "德国", "法国", "英国", "欧洲", "香港", "恒生",
    "港股", "H股", "中证", "上证", "深证", "A股",
    "印度", "越南", "东南亚", "亚太", "新兴市场", "金砖",
    "房地产", "不动产", "REITs", "reits", "REIT",
    "美元债",
    "国债", "短债",
    "标普油气", "标普消费", "标普医疗", "标普生物", "标普科技",
    "标普红利", "标普信息", "标普港股", "标普中国", "标普等权重",  # 等权重也剔除
    "纳指科技", "纳指生物", "纳指医药",
    "农业", "医药", "生物科技", "新能源", "汽车", "基建", "消费",
    # v2 新增：中概/港美股混合
    "中概", "中国互联网", "中国科技",
    # v18 新增：
    # 医疗/健康类主题基金（主投海外药企，不是美股宽基/科技方向）
    "医疗", "健康",
    # 名字含"海外中国"/"中国海外"的实为港股/中概主动基金（不属于美股主动）
    "海外中国", "中国海外",
    # 注意：美元现汇/美元现钞/美元A/美元C/美元汇 是份额类别，不是基金类别，
    # 同系列的人民币/美元份额应归为一组，不再排除。
    # "美元债"保留排除（美元债基金，资产类型不同）
]


SP500_KEYWORDS = ["标普500", "标普 500"]
NASDAQ_KEYWORDS = ["纳斯达克100", "纳指100", "纳斯达克 100", "纳指 100"]
NASDAQ_GENERAL_KEYWORDS = ["纳斯达克", "纳指"]

US_ACTIVE_KEYWORDS = [
    "美国", "美股", "北美",
    "全球", "海外", "世界",
    "科技", "互联网",
]

# v19 新增：美股主动基金白名单（精选 18 只重仓美股的主动 QDII）
# 命中任一关键词的基金归入 "active"（美股主动）；
# 其他满足 US_ACTIVE_KEYWORDS 的 QDII 归入 "global_other"（全球/其他 QDII）
# 白名单由用户根据实际持仓判断（Top10 重仓美股或七巨头相关）
ACTIVE_WHITELIST_KEYWORDS = [
    "华宝纳斯达克精选",
    "浦银安盛全球智能科技",
    "广发全球精选",
    "嘉实全球产业升级",
    "嘉实美国成长",
    "易方达标普信息科技",
    "易方达全球成长精选",
    "国富全球科技",
    "建信新兴市场",
    "汇添富全球移动互联",
    "华夏全球科技先锋",
    "银华海外数字经济",
    "长城全球新能源车",
    "华宝海外新能源汽车",
    "华宝海外科技",
    "华宝致远",
    "景顺长城纳斯达克科技",
    "天弘全球高端制造",
    "华夏移动互联",
]


def is_qdii(name: str, fund_type: str) -> bool:
    if "QDII" in fund_type:
        return True
    if "(QDII" in name or "（QDII" in name:
        return True
    if "指数型-海外股票" in fund_type:
        return True
    return False


def is_etf(code: str, name: str) -> bool:
    """判断是否为场内 ETF（交易所交易基金）"""
    # 场内 ETF 代码规则：159xxx（深交所）/ 510xxx-513xxx（上交所）
    if code.startswith("159") or code.startswith("513") or code.startswith("510"):
        return True
    # 名字末尾是 "ETF国泰/华夏/..." 这种简写（场内 ETF 的特征）
    # 名字含 "ETF联接" 是场外基金，不在此范围
    if "ETF联接" in name or "ETF 联接" in name:
        return False
    # 名字以 ETF + 公司名 结尾（场内 ETF 的典型写法）
    if re.search(r"ETF(国泰|华夏|南方|嘉实|易方达|广发|华安|博时|大成|天弘|摩根|汇添富|招商|华泰柏瑞|万家|宝盈|建信|鹏华|工银|富国|华宝|景顺|兴业)?$", name):
        return True
    return False


def extract_etf_target(name: str) -> str:
    """
    场内 ETF 的跟踪标的分类。
    返回: 'sp500' | 'nasdaq100' | 'us50' | 'other'

    note: 'nasdaq100' 这个 key 是历史命名（最早只识别 NDX），实际涵盖整个
    纳斯达克家族指数（NDX/NDXT 等）。前端 ETF_GROUPS 的 label 已不再写"100"。
    若未来要把 NDXT（纳指科技）单拆，把"纳指科技/纳斯达克科技"分支返回值
    改成 "nasdaq_tech" 即可，并同步前端 ETF_GROUPS 新增分组。
    """
    if "标普500" in name:
        return "sp500"
    # 纳指科技 / 纳斯达克科技：归口到 nasdaq 家族（与 NDX 并列展示）
    # 保留独立分支：① 命中顺序明确 ② 未来要单拆 NDXT 时直接改返回值即可
    if "纳指科技" in name or "纳斯达克科技" in name:
        return "nasdaq100"
    # 纳指生物科技 / 纳斯达克生物技术（NBI 指数）：同样归口 nasdaq 家族
    # 单独列分支：① 与"纳指科技"同等处理 ② 未来要单拆 NBI 时直接改返回值
    if "纳指生物" in name or "纳斯达克生物" in name:
        return "nasdaq100"
    # 纳斯达克ETF 和 纳斯达克100ETF 都跟踪纳斯达克100
    if "纳斯达克100" in name or "纳指100" in name:
        return "nasdaq100"
    if "纳斯达克" in name or "纳指" in name:
        return "nasdaq100"
    if "美国50" in name:
        return "us50"
    return "other"


def _active_or_other(name: str) -> str:
    """判断 QDII 主动/全球基金应归入 active（白名单）还是 global_other（其他）"""
    for kw in ACTIVE_WHITELIST_KEYWORDS:
        if kw in name:
            return "active"
    return "global_other"


def classify_fund(code: str, name: str, fund_type: str) -> str:
    """返回: 'sp500' | 'nasdaq_passive' | 'active' | 'global_other' | 'etf' | 'exclude'"""
    # 黑名单：手动指定排除（优先级最高，用于名字无特征但持仓偏离美股方向的基金）
    if code in FORCE_EXCLUDE_CODES:
        return "exclude"

    # 白名单：手动指定归属（绕过 EXCLUDE_KEYWORDS 过滤）
    # 用于规则误伤的、名字不含识别关键词但确实是美股方向的 QDII
    if code in FORCE_INCLUDE_CODES:
        return FORCE_INCLUDE_CODES[code]

    if not is_qdii(name, fund_type):
        return "exclude"

    for kw in EXCLUDE_KEYWORDS:
        if kw in name:
            return "exclude"

    # 先判断是否场内 ETF
    is_etf_fund = is_etf(code, name)

    # 标普500
    if any(kw in name for kw in SP500_KEYWORDS):
        return "etf" if is_etf_fund else "sp500"

    # 纳指100（指数型）
    if any(kw in name for kw in NASDAQ_KEYWORDS):
        return "etf" if is_etf_fund else "nasdaq_passive"

    # 纳指（不带100，可能是主动）
    if any(kw in name for kw in NASDAQ_GENERAL_KEYWORDS):
        if is_etf_fund:
            return "etf"
        return _active_or_other(name)

    # 其他美股方向（通常主动）
    for kw in US_ACTIVE_KEYWORDS:
        if kw in name:
            if is_etf_fund:
                return "etf"
            return _active_or_other(name)

    return "exclude"


# ============================================================
# 手动白名单：规则误伤但确实是美股方向的 QDII 基金
# ============================================================
# 说明：
#   key 是基金代码，value 是目标分类（一般都是 active）
#   出现在这里的代码会绕过 EXCLUDE_KEYWORDS 过滤，直接归入指定分类
#   典型场景：
#     - 名字被 "新能源/汽车/新兴市场/标普信息" 等行业词误伤
#     - 名字不含美股识别词（如 "华宝致远"）但实际重仓美股
FORCE_INCLUDE_CODES = {
    # 易方达标普信息科技指数（标普 500 信息技术行业指数，美股宽基的细分）
    "161128": "active",  # A(人民币)
    "012868": "active",  # C(人民币)
    "003721": "active",  # A(美元现汇)
    "012869": "active",  # C(美元现汇)

    # 建信新兴市场混合（实际投全球 / 美股为主的主动基金）
    "539002": "active",  # A
    "018147": "active",  # C

    # 长城全球新能源车股票发起式（美股电车产业链主动）
    "501226": "active",  # A
    "018036": "active",  # C

    # 华宝海外新能源汽车股票发起式（美股电车产业链主动）
    "017144": "active",  # A
    "017145": "active",  # C

    # 华宝致远混合（重仓美股的主动 QDII，但名字无识别关键词）
    "008253": "active",  # A
    "008254": "active",  # C

    # 华夏移动互联混合（重仓美股科技，但名字不含"全球/美国/科技"等关键词）
    "002891": "active",  # 人民币
    "002892": "active",  # 美元现汇
    "002893": "active",  # 美元现钞

    # 鹏华全球高收益债（160644，全球/其他 QDII，名字不触发关键词）
    "160644": "global_other",

    # 广发全球稳健配置混合（QDII 全球基金，4 个 share 合并到同一 series：RMB A/C + USD A/C）
    # 名字"全球稳健配置"不触发美股识别词，显式归入 global_other
    "019230": "global_other",  # A(人民币)
    "019231": "global_other",  # C(人民币)
    "019232": "global_other",  # A(美元)
    "019233": "global_other",  # C(美元)

    # v20 新增：亚太市场基金（日本/越南/印度），归入 global_other
    "007280": "global_other",  # 摩根日本精选股票 A
    "008763": "global_other",  # 天弘越南市场股票 A
    "006105": "global_other",  # 宏利印度机会股票 A

    # v22 新增：v20 系列遗漏的 C/D/美元份额，与同 series 主代码合并展示
    "019449": "global_other",  # 摩根日本精选股票 C（A 类 007280 的姊妹份额）
    "008764": "global_other",  # 天弘越南市场股票 C（A 类 008763 的姊妹份额）
    "022524": "global_other",  # 天弘越南市场股票 D（A 类 008763 的姊妹份额，新份额）
    "026015": "global_other",  # 宏利印度机会股票 C（A 类 006105 的姊妹份额）
    "006792": "global_other",  # 鹏华港美互联股票 美元现汇（人民币 160644 的姊妹份额）

    # v21 新增：全球非美指数基金（被 EXCLUDE_KEYWORDS 中"日经/韩"等过滤），归入 global_index
    "020712": "global_index",  # 华安日经225ETF联接 A
    "020713": "global_index",  # 华安日经225ETF联接 C
    "019454": "global_index",  # 华泰柏瑞中韩半导体ETF联接 A
    "019455": "global_index",  # 华泰柏瑞中韩半导体ETF联接 C
    "022681": "global_index",  # 华泰柏瑞中韩半导体ETF联接 I
}


# ============================================================
# 手动黑名单：名字不触发 EXCLUDE_KEYWORDS 但持仓实际偏离美股方向
# ============================================================
# 说明：
#   这些基金名字很普通（"全球稳健配置"、"全球成长"等），规则无法识别，
#   但从 Top10 持仓看实际重仓港股/A 股/医疗等非美股核心方向，
#   放在 active 里会让"美股主动"标签名不副实，所以显式排除
FORCE_EXCLUDE_CODES = {
    # 万家全球成长一年持有期混合（Top3 寒武纪/深信服，主要投 A 股科技）
    "012535", "012536",

    # 工银全球系列（持仓偏港股/A股，非纯美股方向）
    "486001", "486002", "009562", "009563",
}


# ============================================================
# 基金系列识别
# ============================================================

FUND_COMPANIES = [
    "易方达", "华夏", "南方", "嘉实", "广发", "华安", "博时", "大成",
    "天弘", "摩根", "汇添富", "招商", "华泰柏瑞", "万家", "宝盈",
    "建信", "国泰", "浦银安盛", "富国", "华宝", "景顺长城",
    "鹏华", "工银", "交银", "农银", "中银", "民生加银", "上投摩根",
    "德邦", "海富通", "兴业", "兴银", "汇丰晋信", "长城", "长信",
    "中欧", "融通", "新华", "泰达宏利", "国投瑞银", "景顺", "嘉合",
    "中信保诚", "国海富兰克林", "国富",  # 国富是国海富兰克林的天天基金简称
    "宏利", "信达澳亚", "同泰", "平安",
    "银华", "华润元大", "金鹰", "上银", "创金合信",
]

# 基金公司显示名（遇到简称映射回正式名）
COMPANY_DISPLAY_ALIAS = {
    "国富": "国海富兰克林",
}

# 份额类型（按长度降序，避免 AA 匹配到 A）
SHARE_CLASS_PATTERN = re.compile(r"([ABCDEFHIQR])\s*$")


def make_display_name(share_name: str) -> str:
    """
    从基金简称生成展示名称：去除份额字母、(QDII) 括号、币种、末尾空白
    例如 "国富全球科技互联混合(QDII)人民币A" → "国富全球科技互联混合"
    "广发纳斯达克100ETF联接(QDII)人民币A" → "广发纳斯达克100ETF联接"
    """
    name = str(share_name).strip()
    # 去括号及其内容
    name = re.sub(r"\([^)]*\)", "", name)
    name = re.sub(r"（[^）]*）", "", name)
    # 去币种（含摩根系的"美钞/美汇"特殊写法 + 独立"现汇/现钞"）
    name = re.sub(r"(人民币|美元现汇|美元现钞|美现汇|美现钞|美元|美钞|美汇|现汇|现钞|欧元|港币|港元)", "", name)
    # 去尾部份额字母（A/B/C/D/E/F/H/I/Q/R），允许前面有空格
    name = re.sub(r"\s*[ABCDEFHIQR]\s*$", "", name)
    # 去末尾残留的"汇"/"钞"（如"美元汇"去掉"美元"后剩"汇"）
    name = re.sub(r"[汇钞]$", "", name.strip())
    # 去后端/发起式等
    name = re.sub(r"\(?后端\)?", "", name)
    name = re.sub(r"发起(式)?", "", name)
    # 规范纳指 → 纳斯达克（让显示一致）
    name = re.sub(r"纳指100", "纳斯达克100", name)
    name = re.sub(r"(?<!纳斯达克)纳指(?!\d)", "纳斯达克", name)
    # 清空白
    name = re.sub(r"\s+", "", name).strip()
    return name


def extract_company_and_series(full_name: str) -> tuple[str, str]:
    """
    从基金简称提取（基金公司, 产品系列名）。
    v3 改动：
    - 规范化"纳指"→"纳斯达克"，让不同写法归为同系列
    - 规范化"联接"前后的空格
    - 去除 "人民币"/"美元"/"欧元" 后缀
    v7 改动：
    - 场内 ETF 命名倒置（"纳指ETF广发"），支持后缀匹配公司名
    """
    company = ""
    # 优先前缀匹配（普通场外基金，如"华夏标普500..."）
    for c in sorted(FUND_COMPANIES, key=len, reverse=True):
        if full_name.startswith(c):
            company = c
            break

    # 前缀没匹配，尝试后缀匹配（场内 ETF 格式：xxxETF广发 / xxxETF华夏）
    if not company:
        # 清理无关尾缀后再匹配
        tail = re.sub(r"(发起|联接|QDII|\([^)]*\)|（[^）]*）|[A-Z]$)", "", full_name).strip()
        for c in sorted(FUND_COMPANIES, key=len, reverse=True):
            if tail.endswith(c):
                company = c
                break

    remaining = full_name[len(company):] if (company and full_name.startswith(company)) else full_name

    # 去除所有括号内容
    remaining = re.sub(r"\([^)]*\)", "", remaining)
    remaining = re.sub(r"（[^）]*）", "", remaining)

    # 去除货币标识（让人民币/美元/美钞/美汇份额合并到同系列）
    remaining = re.sub(r"人民币", "", remaining)
    remaining = re.sub(r"美元现汇", "", remaining)
    remaining = re.sub(r"美元现钞", "", remaining)
    remaining = re.sub(r"美现汇", "", remaining)
    remaining = re.sub(r"美现钞", "", remaining)
    remaining = re.sub(r"美元", "", remaining)
    remaining = re.sub(r"美钞", "", remaining)
    remaining = re.sub(r"美汇", "", remaining)
    remaining = re.sub(r"欧元", "", remaining)
    remaining = re.sub(r"现汇", "", remaining)
    remaining = re.sub(r"现钞", "", remaining)

    # 【v3 新增】"纳指"规范化为"纳斯达克"
    remaining = re.sub(r"纳指100", "纳斯达克100", remaining)
    remaining = re.sub(r"(?<!纳斯达克)纳指(?!\d)", "纳斯达克", remaining)

    # 去除结构标识
    remaining = re.sub(r"发起(式)?", "", remaining)

    # 去除末尾份额字母
    remaining = re.sub(r"\s*[ABCDEFHIQR]\s*$", "", remaining)

    # 去掉末尾单独的"汇"/"钞"字（部分基金用"联接汇"表示美元份额，须在去份额字母后处理）
    remaining = re.sub(r"[汇钞]$", "", remaining.strip())

    # 去除尾部非主题说明
    remaining = re.sub(r"\(后端\)", "", remaining)
    remaining = re.sub(r"后端", "", remaining)

    # 清理空白
    remaining = re.sub(r"\s+", "", remaining)
    remaining = remaining.strip()

    return (company or "其他", remaining or full_name)


def extract_share_class(full_name: str) -> str:
    """提取份额类型：A/B/C/D/E/F/H/I/Q/R / LOF / FOF / 默认"""
    upper = full_name.upper()
    if "LOF" in upper:
        # LOF 本身可能带 A/C 份额（广发纳指ETF联接A也是 LOF），要看更具体
        # 移除 LOF 括号后再判断
        pass
    if "FOF" in upper:
        return "FOF"

    # 去除括号内容和货币标识后再看末尾
    stripped = re.sub(r"\([^)]*\)", "", full_name)
    stripped = re.sub(r"（[^）]*）", "", stripped)
    # 注意：长匹配放前面，避免"美元"先匹配导致"美元现汇"被截断
    stripped = re.sub(r"人民币|美元现汇|美元现钞|美现汇|美现钞|美元|美钞|美汇|欧元|港币|港元|后端", "", stripped)
    stripped = stripped.strip()

    m = SHARE_CLASS_PATTERN.search(stripped)
    if m:
        letter = m.group(1)
        # v8 改进：若名称里含"后端"，标记为"X(后端)"以区分同系列的前端/后端份额
        if re.search(r"后端", full_name):
            return f"{letter}(后端)"
        return letter

    # v7 特殊情况：摩根系"美钞"/"美汇"没有份额字母，但本质是 A 类（与人民币 A 并列）
    # 为区分两种交易货币形式，保留 A(美钞) / A(美汇) 标识
    if re.search(r"美现钞|美钞", full_name):
        return "A(美钞)"
    if re.search(r"美现汇|美汇", full_name):
        return "A(美汇)"

    if "LOF" in upper:
        return "LOF"
    return "默认"


def extract_currency(full_name: str) -> str:
    """
    提取份额币种：人民币/美元/欧元/港币
    v7: 识别摩根系的特殊命名"美钞"（美元现钞）、"美汇"（美元汇款）→ 都归为美元
    """
    # 美元（含美钞、美汇、美元现钞、美元汇款等各种写法）
    if re.search(r"美元|美钞|美汇|美现汇|美现钞", full_name):
        return "美元"
    if "欧元" in full_name:
        return "欧元"
    if re.search(r"港币|港元", full_name):
        return "港币"
    return "人民币"


# ============================================================
# 增量合并：保留 fetch_nav 等下游脚本写入的运行时字段
# ============================================================
# scan_funds.py 只负责"分类与归组"，仅负责管理这些字段：
#   share 层: code / name / share_class / currency / fund_type
#   series 层: series_id / company / company_display / series_name /
#             display_name / category / etf_target / shares
# 其余字段（nav / chg_* / scale / buy_status / buy_rules / ... 以及 series 层
# 的 default_share_code / series_scale 等）由下游脚本（fetch_nav.py 等）
# 写入。本脚本写文件时必须按 code 合并旧数据，避免一覆盖把净值/规模/申购
# 状态等全清空。

# scan_funds 自己负责的字段（写入时直接以新值覆盖，其它字段从旧数据继承）
SCAN_OWNED_SHARE_KEYS = {"code", "name", "share_class", "currency", "fund_type"}
SCAN_OWNED_SERIES_KEYS = {
    "series_id", "company", "company_display", "series_name",
    "display_name", "category", "etf_target", "shares",
}


def _load_existing_index(fp: Path) -> tuple[dict, dict]:
    """
    读取旧 JSON，构建两份索引：
      - shares_by_code: { code: 旧 share dict }
      - series_by_id:   { series_id: 旧 series dict（**完整保留 shares 数组**） }
    旧文件不存在或解析失败时返回空索引（首次生成场景）。
    保留 shares 是为了让 ``_merge_one_series`` 沿用旧 share 的相对顺序，让顶层
    字段顺序里的 ``shares`` 占位仍在原位置（避免 default_share_code 等被挤到中间）。
    """
    shares_by_code: dict = {}
    series_by_id: dict = {}
    if not fp.exists():
        return shares_by_code, series_by_id
    try:
        with open(fp, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, json.JSONDecodeError):
        return shares_by_code, series_by_id
    for s in old.get("series", []):
        sid = s.get("series_id")
        if sid:
            series_by_id[sid] = s  # 完整保留，含 shares 占位
        for sh in s.get("shares", []):
            code = sh.get("code")
            if code:
                shares_by_code[code] = sh
    return shares_by_code, series_by_id


def _new_series_sort_key(s: dict) -> tuple:
    """
    新增 series 的稳定排序键（B 方案）：
      1. 份额数倒序（份额多的系列靠前）
      2. default_share_code 升序；缺失时退化为第一只 share 的 code
    code 是不可变的 6 位数字，跨次跑结果完全稳定。
    """
    shares = s.get("shares") or []
    rep_code = s.get("default_share_code") or (shares[0].get("code") if shares else "")
    return (-len(shares), rep_code or "")


def _merge_share(new_sh: dict, old_sh: dict) -> dict:
    """合并单只 share：旧字段打底（保留 nav/scale/buy_* 等运行时数据），scan 负责字段用新值覆盖。"""
    merged = dict(old_sh)  # 继承 nav / chg_* / scale / buy_* 等
    for k in SCAN_OWNED_SHARE_KEYS:
        if k in new_sh:
            merged[k] = new_sh[k]
    return merged


def _merge_one_series(new_s: dict, old_s: dict, shares_by_code: dict) -> dict:
    """
    合并单个 series：
      - 顶层字段：旧字段顺序打底（保留 default_share_code / series_scale 等的位置），
        scan 负责字段用新值覆盖；保证 ``shares`` key 留在旧文件中的原位置（旧文件
        没有时落到末尾）。
      - shares 数组（A+B）：旧 share 按旧顺序输出（已删除的旧 share 自动消失），
        新增 share 按 ``code`` 升序追加到末尾。
    """
    merged = dict(old_s)  # 继承顶层字段及其顺序
    # 兜底：旧 series 没有 shares 占位时，先放一个空 list 占位，确保后续赋值不会跳到末尾
    merged.setdefault("shares", [])
    for k in SCAN_OWNED_SERIES_KEYS:
        if k == "shares":
            continue  # shares 单独处理，避免顺序被打乱
        if k in new_s:
            merged[k] = new_s[k]

    # shares：A 方案保序 + B 方案稳定追加
    new_shares_by_code = {sh["code"]: sh for sh in new_s["shares"]}
    old_shares_order = [sh.get("code") for sh in (old_s.get("shares") or []) if sh.get("code")]

    ordered_shares: list = []
    seen: set = set()
    # A：旧 share 按旧顺序输出（已删除的自动消失）
    for code in old_shares_order:
        if code in new_shares_by_code:
            ordered_shares.append(_merge_share(new_shares_by_code[code], shares_by_code.get(code, {})))
            seen.add(code)
    # B：新增 share 按 code 升序追加
    new_only_codes = sorted(c for c in new_shares_by_code if c not in seen)
    for code in new_only_codes:
        ordered_shares.append(_merge_share(new_shares_by_code[code], shares_by_code.get(code, {})))

    merged["shares"] = ordered_shares
    return merged


def _merge_series(new_series: list, shares_by_code: dict, series_by_id: dict) -> list:
    """
    合并新归组结果与旧 JSON：
    1. 字段层：scan 只覆盖它负责的字段，其余（nav/scale/buy_* 等）从旧数据继承
    2. 顺序层（A+B 方案）：
       - 旧文件已存在的 series：沿用旧文件中的相对顺序（diff 最小化）
       - 新增的 series（旧索引里没有）：追加到末尾，组内按稳定键排序
    """
    new_by_id = {s["series_id"]: s for s in new_series}

    ordered: list = []
    seen_ids: set = set()

    # A：旧 series 按旧顺序输出（已被删除的旧 series 自动消失，不会写回）
    for sid in series_by_id:
        if sid in new_by_id:
            ordered.append(_merge_one_series(new_by_id[sid], series_by_id[sid], shares_by_code))
            seen_ids.add(sid)

    # B：新增 series 用稳定键排序后追加
    new_only = [s for s in new_series if s["series_id"] not in seen_ids]
    new_only.sort(key=_new_series_sort_key)
    for s in new_only:
        ordered.append(_merge_one_series(s, {}, shares_by_code))

    return ordered


# ============================================================
# 主流程
# ============================================================

def main():
    project_root = Path(__file__).parent.parent
    # 所有产物直接写 web/data/（前端消费目录）
    data_dir = project_root / "web" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    print("🔍 从 AKShare 获取全量基金名称表...")
    df_all = ak.fund_name_em()
    print(f"✅ 全部基金: {len(df_all)} 只")

    print("\n🔀 开始分类...")
    classified = {
        "sp500": [], "nasdaq_passive": [], "active": [], "global_index": [],
        "global_other": [], "etf": [], "exclude": [],
    }

    for _, row in df_all.iterrows():
        code = str(row["基金代码"]).strip()
        name = str(row["基金简称"]).strip()
        fund_type = str(row["基金类型"]).strip()

        category = classify_fund(code, name, fund_type)
        if category == "exclude":
            classified["exclude"].append({"code": code, "name": name})
            continue

        company, series = extract_company_and_series(name)
        share_class = extract_share_class(name)
        currency = extract_currency(name)

        record = {
            "code": code,
            "name": name,
            "fund_type": fund_type,
            "company": company,
            "series_name": series,
            "share_class": share_class,
            "currency": currency,
            "category": category,
            "etf_target": extract_etf_target(name) if category == "etf" else None,
        }
        classified[category].append(record)

    # 统计
    label_map = {
        "sp500": "板块1 · 标普500 指数（场外）",
        "nasdaq_passive": "板块2 · 纳指100 指数（场外）",
        "active": "板块3 · 美股主动（场外·白名单精选）",
        "global_index": "板块4 · 全球非美指数（场外·白名单）",
        "global_other": "板块5 · 全球/其他 QDII（场外）",
        "etf": "板块6 · 场内 ETF",
        "exclude": "已排除",
    }
    print("\n📊 分类结果：")
    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf", "exclude"]:
        print(f"  {label_map[cat]}: {len(classified[cat]):4d} 只")

    print("\n🔍 各板块样例（前 5 只）：")
    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]:
        print(f"\n  ◎ {label_map[cat]}")
        for item in classified[cat][:5]:
            extra = f" [{item.get('share_class')}/{item.get('currency')}]"
            print(f"    {item['code']} {item['name']}{extra}")

    # 归组（v2: 人民币/美元归同系列）
    print("\n🧩 按基金系列归组（基金公司 + 产品名，不分币种）...")
    series_map = {}
    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]:
        for item in classified[cat]:
            key = f"{item['company']}::{item['series_name']}::{cat}"
            if key not in series_map:
                # display_name 规则（v6）：从默认份额基金简称派生
                # 清洗：去掉份额字母（A/C/...）、(QDII)、币种（人民币/美元）、多余空格
                # 例如 "国富全球科技互联混合(QDII)人民币A" → "国富全球科技互联混合"
                display_name = make_display_name(item["name"])
                # 公司显示名（处理别名，如"国富"→"国海富兰克林"在卡片里展示）
                company_display = COMPANY_DISPLAY_ALIAS.get(item["company"], item["company"])
                series_map[key] = {
                    "series_id": re.sub(r"[^\w]", "_", key),
                    "company": item["company"],
                    "company_display": company_display,
                    "series_name": item["series_name"],
                    "display_name": display_name,
                    "category": cat,
                    "etf_target": item.get("etf_target"),  # 场内 ETF 的标的分类
                    "shares": [],
                }
            series_map[key]["shares"].append({
                "code": item["code"],
                "name": item["name"],
                "share_class": item["share_class"],
                "currency": item["currency"],
                "fund_type": item["fund_type"],
            })

    by_category = {"sp500": [], "nasdaq_passive": [], "active": [], "global_index": [], "global_other": [], "etf": []}
    for s in series_map.values():
        by_category[s["category"]].append(s)

    # 注：每个板块的 series 顺序由 _merge_series 决定（旧 series 沿用旧顺序，
    # 新增 series 按稳定键追加），这里不再预先排序。

    print("\n📚 归组后板块系列数：")
    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]:
        total = sum(len(s["shares"]) for s in by_category[cat])
        print(f"  {label_map[cat]}: {len(by_category[cat]):3d} 个系列（共 {total} 只份额）")

    # 保存（增量合并：保留 fetch_nav 等下游脚本写入的运行时字段）
    now = beijing_now_iso()
    # 顶层字段策略：scan 负责 generated_at / category / label / series_count /
    # series 这 5 项（每次重写）；其他字段（如 fetch_nav 写入的 total_scale /
    # enriched_at 等）从旧文件继承，避免被覆盖丢失。

    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]:
        fp = data_dir / f"{cat}.json"
        # 1) 读旧数据，按 code / series_id 建索引；并保留旧顶层字段（含其顺序）
        shares_by_code, series_by_id = _load_existing_index(fp)
        old_top: dict = {}
        if fp.exists():
            try:
                with open(fp, encoding="utf-8") as f:
                    old_top = json.load(f)
            except (OSError, json.JSONDecodeError):
                old_top = {}
        # 2) 合并：scan 负责的字段用新值，其余字段（净值/规模/申购等）继承旧值
        merged = _merge_series(by_category[cat], shares_by_code, series_by_id)
        # 3) 顶层字段合并：旧顶层字段顺序打底，scan 字段用新值覆盖
        out = dict(old_top)
        out["generated_at"] = now
        out["category"] = cat
        out["label"] = label_map[cat]
        out["series_count"] = len(merged)
        out["series"] = merged
        # 4) 写回（保持文件末尾换行，与旧版本风格一致）
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
            f.write("\n")

    meta = {
        "generated_at": now,
        "total_scanned": len(df_all),
        "sp500": {"series": len(by_category["sp500"]), "funds": len(classified["sp500"])},
        "nasdaq_passive": {"series": len(by_category["nasdaq_passive"]), "funds": len(classified["nasdaq_passive"])},
        "active": {"series": len(by_category["active"]), "funds": len(classified["active"])},
        "global_index": {"series": len(by_category["global_index"]), "funds": len(classified["global_index"])},
        "global_other": {"series": len(by_category["global_other"]), "funds": len(classified["global_other"])},
        "etf": {"series": len(by_category["etf"]), "funds": len(classified["etf"])},
        "excluded_count": len(classified["exclude"]),
    }
    with open(data_dir / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print("\n✅ 扫描完成！")


if __name__ == "__main__":
    main()
