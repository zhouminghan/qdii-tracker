"""
同花顺数据源：申购状态「单日购买上限」补数。

天天基金 fund_purchase_em 对部分新增份额（D/F/I 类等）返回「限大额」但
日累计限定金额=0，无法展示具体额度。同花顺 myfund 接口的 money 字段（万元）
可补足该缺口，例如 022525 返回 0.0100（=100 元）。
"""
import json

from core.constants import HEADERS_FUND
from core.utils import to_float, requests_get

THS_MYFUND_URL = "https://fund.10jqka.com.cn/data/client/myfund/{code}"

THS_HEADERS = dict(HEADERS_FUND)
THS_HEADERS["Referer"] = "https://fund.10jqka.com.cn/"

# 美元份额的单日上限超过 100 万美元时，视为同花顺数据滞后（例如 000906/013404
# 仍停留在机构级旧额度），跳过补数，避免把过期金额当零售额度展示。
_USD_LIMIT_CAP = 1_000_000

# 人工确认的申购额度：这些代码在天天基金与同花顺都拿不到正确值（同花顺滞后或
# 口径打架），直接在代码里指定，避免每次增量更新都对其做无效 HTTP 查询。
# value 单位跟随份额币种（人民币=元、美元=美元）。
_MANUAL_LIMIT_OVERRIDE = {
    "000906": (280.0, "广发基金公告 2026-10-29：美元A 限 280 美元"),
    "013404": (75.0, "大成基金公告 2026-10-16：美元A 限 75 美元"),
    "015545": (75.0, "大成基金公告 2026-10-16：美元C 限 75 美元"),
}


def fetch_purchase_ths(code: str):
    """抓同花顺 myfund 接口，返回 {'ths_sgstat': str, 'daily_limit': float|None}。

    daily_limit 单位：份额计价币种（人民币份额为元、美元份额为美元）；
    同花顺 money 字段为「万」，此处 ×10000 转换。
    开放申购 / 无数据 / 解析失败时 daily_limit=None。
    """
    url = THS_MYFUND_URL.format(code=code)
    r = requests_get(url, headers=THS_HEADERS)
    if r is None:
        return None
    try:
        payload = json.loads(r.text)
    except (json.JSONDecodeError, TypeError):
        return None
    items = payload.get("data") or []
    if not isinstance(items, list) or not items:
        return None
    item = items[0]
    if not isinstance(item, dict):
        return None
    money_wan = to_float(item.get("money"))
    limit = round(money_wan * 10000, 2) if money_wan is not None and money_wan > 0 else None
    return {
        "ths_sgstat": str(item.get("sgstat", "") or "").strip(),
        "daily_limit": limit,
    }


def apply_ths_limit_fallback(share: dict) -> bool:
    """天天基金额度缺失时，用同花顺补 daily_limit。

    仅对申购状态含「限」的基金生效（人民币/美元份额均适用）。人工覆盖表优先命中
    且不联网；其余缺失额度的代码才查询同花顺。返回是否真的写入了额度。
    不覆盖 buy_status（天天基金仍是主数据源）。
    """
    code = share.get("code", "")
    status = share.get("buy_status", "") or ""
    if not code or "限" not in status:
        return False

    manual = _MANUAL_LIMIT_OVERRIDE.get(code)
    if manual:
        if share.get("daily_limit") != manual[0]:
            share["daily_limit"] = manual[0]
            return True
        return False

    limit = share.get("daily_limit")
    if limit is not None and limit > 0:
        return False
    info = fetch_purchase_ths(code)
    if not info or info.get("daily_limit") is None:
        return False
    if share.get("currency") == "美元" and info["daily_limit"] > _USD_LIMIT_CAP:
        return False
    share["daily_limit"] = info["daily_limit"]
    return True


def merge_purchase_info(share: dict, purchase_info: dict) -> None:
    """合并天天基金申购数据；其 daily_limit 为 0/缺失时保留已有额度。

    天天基金对 D/F/I/美元份额常返回 0（=未知），而同花顺补数依赖网络。若某天
    同花顺不可达，直接用 share.update() 会把已补额度重置回 0，造成每日回退。
    """
    info = dict(purchase_info or {})
    limit = info.get("daily_limit")
    if (limit is None or limit <= 0) and (share.get("daily_limit") or 0) > 0:
        info.pop("daily_limit", None)
    share.update(info)
