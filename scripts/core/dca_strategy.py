"""
scripts/core/dca_strategy.py — VIX & PE 阶梯定投实操矩阵（纯逻辑，前后端一致）

输入 CNN 恐慌贪婪指数（0-100）、VIX、纳指 PE，输出当前所处阶梯、
对应操作与策略，并给出 VIX 匹配度与估值提示。规则与产品白皮书 3.4.2 对齐：

  - 0-25   极度恐慌  VIX>30     黄金坑策略：大胆加仓 / 倍定投
  - 25-45  恐惧      VIX 25-30  低位定投：正常定投 / 小幅加仓
  - 45-55  中性      VIX 15-25  常态定投：维持规律定投
  - 55-75  贪婪      VIX 12-20  风险预警：停止加仓，保持观望
  - 75-100 极度贪婪  VIX<15     泡沫高危：卖出 / 买入对冲

与前端 web/js/dca-strategy.js 保持同一套规则，改动时两边同步。
"""

BANDS = [
    {
        "key": "extreme_fear",
        "lo": 0,
        "hi": 25,
        "label": "极度恐慌",
        "action": "黄金坑策略",
        "strategy": "大胆加仓 / 倍定投",
        "vix_lo": 30,
        "vix_hi": None,
        "vix_text": "VIX > 30",
        "tone": "green",
    },
    {
        "key": "fear",
        "lo": 25,
        "hi": 45,
        "label": "恐惧",
        "action": "低位定投",
        "strategy": "正常定投 / 小幅加仓",
        "vix_lo": 25,
        "vix_hi": 30,
        "vix_text": "VIX 25-30",
        "tone": "green",
    },
    {
        "key": "neutral",
        "lo": 45,
        "hi": 55,
        "label": "中性",
        "action": "常态定投",
        "strategy": "维持规律定投",
        "vix_lo": 15,
        "vix_hi": 25,
        "vix_text": "VIX 15-25",
        "tone": "amber",
    },
    {
        "key": "greed",
        "lo": 55,
        "hi": 75,
        "label": "贪婪",
        "action": "风险预警",
        "strategy": "停止加仓，保持观望",
        "vix_lo": 12,
        "vix_hi": 20,
        "vix_text": "VIX 12-20",
        "tone": "amber",
    },
    {
        "key": "extreme_greed",
        "lo": 75,
        "hi": 100,
        "label": "极度贪婪",
        "action": "泡沫高危",
        "strategy": "卖出 / 买入对冲",
        "vix_lo": None,
        "vix_hi": 15,
        "vix_text": "VIX < 15",
        "tone": "red",
    },
]


def _to_float(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def pe_label(pe):
    """按纳指 PE 给估值提示。"""
    pe = _to_float(pe)
    if pe is None:
        return "暂无 PE 数据"
    if pe >= 35:
        return "估值偏高，注意回撤风险"
    if pe >= 25:
        return "估值中性，控制节奏"
    return "估值偏低，长期赔率改善"


def _band_of(fear_greed):
    fg = _clamp(_to_float(fear_greed) if _to_float(fear_greed) is not None else 50, 0, 100)
    for b in BANDS[:-1]:
        if b["lo"] <= fg < b["hi"]:
            return b
    return BANDS[-1]


def strategy_of(fear_greed, vix, pe=None):
    """返回当前阶梯、操作、策略与 VIX/PE 提示。"""
    band = _band_of(fear_greed)
    vix_f = _to_float(vix)
    pe_f = _to_float(pe)

    matched = True
    note = None
    if vix_f is not None:
        lo, hi = band["vix_lo"], band["vix_hi"]
        if lo is not None and vix_f < lo:
            matched = False
            note = f"VIX {vix_f:.1f} 低于该阶梯的 {band['vix_text']}，恐慌情绪偏弱。"
        if hi is not None and vix_f > hi:
            matched = False
            note = f"VIX {vix_f:.1f} 高于该阶梯的 {band['vix_text']}，波动风险偏高。"
    else:
        matched = False
        note = "暂无 VIX 数据。"

    return {
        "key": band["key"],
        "label": band["label"],
        "action": band["action"],
        "strategy": band["strategy"],
        "vix_text": band["vix_text"],
        "vix_matched": matched,
        "tone": band["tone"],
        "pe_label": pe_label(pe_f),
        "note": note,
    }
