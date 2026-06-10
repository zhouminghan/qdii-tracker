"""
共享常量：分类、路径、请求头、标签映射。
所有脚本统一从此模块导入，不再硬编码。
"""
from pathlib import Path

# ============================================================
# 项目路径
# ============================================================
ROOT_DIR = Path(__file__).parent.parent.parent  # qdii-tracker/
SCRIPTS_DIR = ROOT_DIR / "scripts"
DATA_DIR = ROOT_DIR / "web" / "data"
CONFIG_DIR = ROOT_DIR / "config"
HOLDINGS_DIR = DATA_DIR / "holdings"

# ============================================================
# 分类（唯一的定义处，其他地方全部 import）
# ============================================================
CATEGORIES = ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]

# 场外分类（不含 etf）
OFFSHORE_CATEGORIES = ["sp500", "nasdaq_passive", "active", "global_index", "global_other"]

# ============================================================
# 分类标签映射（原 scan_funds.py 的 label_map）
# ============================================================
CATEGORY_LABELS = {
    "sp500": "板块1 · 标普500 指数（场外）",
    "nasdaq_passive": "板块2 · 纳指100 指数（场外）",
    "active": "板块3 · 美股主动（场外·白名单精选）",
    "global_index": "板块4 · 全球非美指数（场外·白名单）",
    "global_other": "板块5 · 全球/其他 QDII（场外）",
    "etf": "板块6 · 场内 ETF",
    "exclude": "已排除",
}

# ============================================================
# 请求头（原各脚本中 LSJZ_HEADERS / HEADERS）
# ============================================================
HEADERS_EASTMONEY = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://fundf10.eastmoney.com/",
}

HEADERS_FUND = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://fund.eastmoney.com/",
}

# ============================================================
# fill_missing.py 的字段常量
# ============================================================
# ETF 的这些字段不应被 pingzhongdata 覆盖
ETF_SKIP_FIELDS = {"nav", "nav_date", "daily_change"}

# 这些字段每天都会变，必须强制覆盖
ALWAYS_OVERWRITE_FIELDS = {"nav", "nav_date", "daily_change"}

# ============================================================
# 份额排序优先级（原 enrich_data.py 的 share_sort_key）
# ============================================================
CURRENCY_RANK = {"人民币": 0, "美元": 1, "欧元": 2, "港币": 3}

SHARE_CLASS_RANK = {
    "A": 1, "A(美钞)": 1.5, "A(美汇)": 1.6,
    "B": 2,
    "C": 3,
    "D": 4, "E": 5, "F": 6,
    "H": 7, "I": 8, "Q": 9, "R": 10,
    "LOF": 20, "FOF": 21, "默认": 30,
    # 后端收费份额排末尾（坑，避免误买）
    "A(后端)": 50, "B(后端)": 51, "C(后端)": 52,
}
