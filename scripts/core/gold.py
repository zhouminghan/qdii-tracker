"""
scripts/core/gold.py — 黄金多市场折算与溢价（纯逻辑，前后端一致）

折合国内金价（元/克）= XAU/USD × USD/CNH ÷ 31.1034768（1 金衡盎司克数）。
溢价 = 上海金 Au99.99（元/克）− 折合国内金价。

与前端 web/js/gold-hub.js 保持同一套公式，改动时两边同步。
"""

OZ_TO_GRAM = 31.1034768


def gold_cny_per_gram(xau_usd, usd_cnh):
    """把伦敦金美元/盎司价折算为国内元/克。"""
    xau = float(xau_usd or 0)
    cny = float(usd_cnh or 0)
    return round(xau * cny / OZ_TO_GRAM, 2)


def gold_premium(au9999, converted):
    """计算上海金相对折算价的溢价（元/克）与溢价率（%）。"""
    au = float(au9999 or 0)
    cv = float(converted or 0)
    if cv <= 0:
        return {"premium_cny": None, "premium_pct": None}
    premium = au - cv
    return {
        "premium_cny": round(premium, 2),
        "premium_pct": round(premium / cv * 100.0, 3),
    }


def gold_panel(xau_usd, usd_cnh, au9999):
    """组装黄金面板数据（供前端直接消费的同一套口径）。"""
    converted = gold_cny_per_gram(xau_usd, usd_cnh)
    premium = gold_premium(au9999, converted)
    pct = premium.get("premium_pct")
    if pct is None:
        tone = "neutral"
    elif pct > 2:
        tone = "high"
    elif pct > 0:
        tone = "positive"
    elif pct < -2:
        tone = "low"
    else:
        tone = "negative"
    return {
        "converted_cny": converted,
        "premium_cny": premium.get("premium_cny"),
        "premium_pct": pct,
        "tone": tone,
    }
