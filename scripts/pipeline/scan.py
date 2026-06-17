"""
扫描所有 QDII 基金，按板块自动分类。
原 scan_funds.py 逻辑搬迁，import core+sources。
"""
import json
import re

import akshare as ak
from timezone_utils import beijing_now_iso
from core.constants import CATEGORIES, DATA_DIR, CATEGORY_LABELS
from core.config_loader import get_config
from sources.akshare_source import fetch_fund_names

# ============================================================
# 分类规则 — 从 config/funds.json（SSOT）加载
# ============================================================
_CFG = get_config()
_CLS = _CFG["classify"]

EXCLUDE_KEYWORDS = _CLS["exclude_keywords"]
SP500_KEYWORDS = _CLS["sp500_keywords"]
NASDAQ_KEYWORDS = _CLS["nasdaq_keywords"]
NASDAQ_GENERAL_KEYWORDS = _CLS["nasdaq_general_keywords"]
US_ACTIVE_KEYWORDS = _CLS["us_active_keywords"]
ACTIVE_WHITELIST_KEYWORDS = _CLS["active_whitelist"]


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
    if code.startswith("159") or code.startswith("513") or code.startswith("510"):
        return True
    if "ETF联接" in name or "ETF 联接" in name:
        return False
    if re.search(r"ETF(国泰|华夏|南方|嘉实|易方达|广发|华安|博时|大成|天弘|摩根|汇添富|招商|华泰柏瑞|万家|宝盈|建信|鹏华|工银|富国|华宝|景顺|兴业)?$", name):
        return True
    return False


def extract_etf_target(name: str) -> str:
    """
    场内 ETF 的跟踪标的分类。
    返回: 'sp500' | 'nasdaq100' | 'us50' | 'other'
    """
    if "标普500" in name:
        return "sp500"
    if "纳指科技" in name or "纳斯达克科技" in name:
        return "nasdaq100"
    if "纳指生物" in name or "纳斯达克生物" in name:
        return "nasdaq100"
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


# 手动白名单/黑名单
FORCE_INCLUDE_CODES = _CLS["force_include"]
FORCE_EXCLUDE_CODES = set(_CLS["force_exclude"])


def classify_fund(code: str, name: str, fund_type: str) -> str:
    """返回: 'sp500' | 'nasdaq_passive' | 'active' | 'global_other' | 'etf' | 'exclude'"""
    if code in FORCE_EXCLUDE_CODES:
        return "exclude"
    if code in FORCE_INCLUDE_CODES:
        return FORCE_INCLUDE_CODES[code]
    if not is_qdii(name, fund_type):
        return "exclude"
    for kw in EXCLUDE_KEYWORDS:
        if kw in name:
            return "exclude"
    is_etf_fund = is_etf(code, name)
    if any(kw in name for kw in SP500_KEYWORDS):
        return "etf" if is_etf_fund else "sp500"
    if any(kw in name for kw in NASDAQ_KEYWORDS):
        return "etf" if is_etf_fund else "nasdaq_passive"
    if any(kw in name for kw in NASDAQ_GENERAL_KEYWORDS):
        if is_etf_fund:
            return "etf"
        return _active_or_other(name)
    for kw in US_ACTIVE_KEYWORDS:
        if kw in name:
            if is_etf_fund:
                return "etf"
            return _active_or_other(name)
    return "exclude"


# ============================================================
# 基金系列识别
# ============================================================

# companies 未配置时从 company_brand 自动提取（兜底）
FUND_COMPANIES = _CFG.get("companies", list(_CFG.get("company_brand", {}).keys()))
COMPANY_DISPLAY_ALIAS = _CFG.get("company_alias", {})

SHARE_CLASS_PATTERN = re.compile(r"([ABCDEFHIQR])\s*$")


def make_display_name(share_name: str) -> str:
    name = str(share_name).strip()
    name = re.sub(r"\([^)]*\)", "", name)
    name = re.sub(r"（[^）]*）", "", name)
    name = re.sub(r"(人民币|美元现汇|美元现钞|美现汇|美现钞|美元|美钞|美汇|现汇|现钞|欧元|港币|港元)", "", name)
    name = re.sub(r"\s*[ABCDEFHIQR]\s*$", "", name)
    name = re.sub(r"[汇钞]$", "", name.strip())
    name = re.sub(r"\(?后端\)?", "", name)
    name = re.sub(r"发起(式)?", "", name)
    name = re.sub(r"纳指100", "纳斯达克100", name)
    name = re.sub(r"(?<!纳斯达克)纳指(?!\d)", "纳斯达克", name)
    name = re.sub(r"\s+", "", name).strip()
    return name


def extract_company_and_series(full_name: str) -> tuple[str, str]:
    company = ""
    for c in sorted(FUND_COMPANIES, key=len, reverse=True):
        if full_name.startswith(c):
            company = c
            break
    if not company:
        tail = re.sub(r"(发起|联接|QDII|\([^)]*\)|（[^）]*）|[A-Z]$)", "", full_name).strip()
        for c in sorted(FUND_COMPANIES, key=len, reverse=True):
            if tail.endswith(c):
                company = c
                break

    remaining = full_name[len(company):] if (company and full_name.startswith(company)) else full_name
    remaining = re.sub(r"\([^)]*\)", "", remaining)
    remaining = re.sub(r"（[^）]*）", "", remaining)
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
    remaining = re.sub(r"纳指100", "纳斯达克100", remaining)
    remaining = re.sub(r"(?<!纳斯达克)纳指(?!\d)", "纳斯达克", remaining)
    remaining = re.sub(r"发起(式)?", "", remaining)
    remaining = re.sub(r"\s*[ABCDEFHIQR]\s*$", "", remaining)
    remaining = re.sub(r"[汇钞]$", "", remaining.strip())
    remaining = re.sub(r"\(后端\)", "", remaining)
    remaining = re.sub(r"后端", "", remaining)
    remaining = re.sub(r"\s+", "", remaining)
    remaining = remaining.strip()
    return (company or "其他", remaining or full_name)


def extract_share_class(full_name: str) -> str:
    upper = full_name.upper()
    if "LOF" in upper:
        pass
    if "FOF" in upper:
        return "FOF"
    stripped = re.sub(r"\([^)]*\)", "", full_name)
    stripped = re.sub(r"（[^）]*）", "", stripped)
    stripped = re.sub(r"人民币|美元现汇|美元现钞|美现汇|美现钞|美元|美钞|美汇|欧元|港币|港元|后端", "", stripped)
    stripped = stripped.strip()
    m = SHARE_CLASS_PATTERN.search(stripped)
    if m:
        letter = m.group(1)
        if re.search(r"后端", full_name):
            return f"{letter}(后端)"
        return letter
    if re.search(r"美现钞|美钞", full_name):
        return "A(美钞)"
    if re.search(r"美现汇|美汇", full_name):
        return "A(美汇)"
    if "LOF" in upper:
        return "LOF"
    return "默认"


def extract_currency(full_name: str) -> str:
    if re.search(r"美元|美钞|美汇|美现汇|美现钞", full_name):
        return "美元"
    if "欧元" in full_name:
        return "欧元"
    if re.search(r"港币|港元", full_name):
        return "港币"
    return "人民币"


# ============================================================
# 增量合并
# ============================================================

SCAN_OWNED_SHARE_KEYS = {"code", "name", "share_class", "currency", "fund_type"}
SCAN_OWNED_SERIES_KEYS = {
    "series_id", "company", "company_display", "series_name",
    "display_name", "category", "etf_target", "shares",
}


def _load_existing_index(fp):
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
            series_by_id[sid] = s
        for sh in s.get("shares", []):
            code = sh.get("code")
            if code:
                shares_by_code[code] = sh
    return shares_by_code, series_by_id


def _new_series_sort_key(s: dict) -> tuple:
    shares = s.get("shares") or []
    rep_code = s.get("default_share_code") or (shares[0].get("code") if shares else "")
    return (-len(shares), rep_code or "")


def _merge_share(new_sh: dict, old_sh: dict) -> dict:
    merged = dict(old_sh)
    for k in SCAN_OWNED_SHARE_KEYS:
        if k in new_sh:
            merged[k] = new_sh[k]
    return merged


def _merge_one_series(new_s: dict, old_s: dict, shares_by_code: dict) -> dict:
    merged = dict(old_s)
    merged.setdefault("shares", [])
    for k in SCAN_OWNED_SERIES_KEYS:
        if k == "shares":
            continue
        if k in new_s:
            merged[k] = new_s[k]
    new_shares_by_code = {sh["code"]: sh for sh in new_s["shares"]}
    old_shares_order = [sh.get("code") for sh in (old_s.get("shares") or []) if sh.get("code")]
    ordered_shares: list = []
    seen: set = set()
    for code in old_shares_order:
        if code in new_shares_by_code:
            ordered_shares.append(_merge_share(new_shares_by_code[code], shares_by_code.get(code, {})))
            seen.add(code)
    new_only_codes = sorted(c for c in new_shares_by_code if c not in seen)
    for code in new_only_codes:
        ordered_shares.append(_merge_share(new_shares_by_code[code], shares_by_code.get(code, {})))
    merged["shares"] = ordered_shares
    return merged


def _merge_series(new_series: list, shares_by_code: dict, series_by_id: dict) -> list:
    new_by_id = {s["series_id"]: s for s in new_series}
    ordered: list = []
    seen_ids: set = set()
    for sid in series_by_id:
        if sid in new_by_id:
            ordered.append(_merge_one_series(new_by_id[sid], series_by_id[sid], shares_by_code))
            seen_ids.add(sid)
    new_only = [s for s in new_series if s["series_id"] not in seen_ids]
    new_only.sort(key=_new_series_sort_key)
    for s in new_only:
        ordered.append(_merge_one_series(s, {}, shares_by_code))
    return ordered


# ============================================================
# 主流程
# ============================================================

def main():
    data_dir = DATA_DIR
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

    label_map = CATEGORY_LABELS
    print("\n📊 分类结果：")
    for cat in CATEGORIES + ["exclude"]:
        print(f"  {label_map[cat]}: {len(classified[cat]):4d} 只")

    print("\n🔍 各板块样例（前 5 只）：")
    for cat in CATEGORIES:
        print(f"\n  ◎ {label_map[cat]}")
        for item in classified[cat][:5]:
            extra = f" [{item.get('share_class')}/{item.get('currency')}]"
            print(f"    {item['code']} {item['name']}{extra}")

    print("\n🧩 按基金系列归组（基金公司 + 产品名，不分币种）...")
    series_map = {}
    for cat in CATEGORIES:
        for item in classified[cat]:
            key = f"{item['company']}::{item['series_name']}::{cat}"
            if key not in series_map:
                display_name = make_display_name(item["name"])
                company_display = COMPANY_DISPLAY_ALIAS.get(item["company"], item["company"])
                series_map[key] = {
                    "series_id": re.sub(r"[^\w]", "_", key),
                    "company": item["company"],
                    "company_display": company_display,
                    "series_name": item["series_name"],
                    "display_name": display_name,
                    "category": cat,
                    "etf_target": item.get("etf_target"),
                    "shares": [],
                }
            series_map[key]["shares"].append({
                "code": item["code"],
                "name": item["name"],
                "share_class": item["share_class"],
                "currency": item["currency"],
                "fund_type": item["fund_type"],
            })

    by_category = {cat: [] for cat in CATEGORIES}
    for s in series_map.values():
        by_category[s["category"]].append(s)

    print("\n📚 归组后板块系列数：")
    for cat in CATEGORIES:
        total = sum(len(s["shares"]) for s in by_category[cat])
        print(f"  {label_map[cat]}: {len(by_category[cat]):3d} 个系列（共 {total} 只份额）")

    now = beijing_now_iso()
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        shares_by_code, series_by_id = _load_existing_index(fp)
        old_top: dict = {}
        if fp.exists():
            try:
                with open(fp, encoding="utf-8") as f:
                    old_top = json.load(f)
            except (OSError, json.JSONDecodeError):
                old_top = {}
        merged = _merge_series(by_category[cat], shares_by_code, series_by_id)
        out = dict(old_top)
        out["generated_at"] = now
        out["category"] = cat
        out["label"] = label_map[cat]
        out["series_count"] = len(merged)
        out["series"] = merged
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
