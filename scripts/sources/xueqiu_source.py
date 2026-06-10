"""
雪球数据源：基金基础信息 + 费率详情。
从 enrich_data.py 提取。
"""
import re

import akshare as ak

from core.utils import to_float, parse_scale


def fetch_basic_info(code: str):
    """逐只获取规模、基金经理、成立时间（雪球接口）。原逻辑来自 enrich_data.py。"""
    try:
        df = ak.fund_individual_basic_info_xq(symbol=code)
        info = dict(zip(df["item"], df["value"]))
        return {
            "scale": parse_scale(info.get("最新规模")),
            "scale_raw": str(info.get("最新规模") or ""),
            "established": str(info.get("成立时间") or ""),
            "manager": str(info.get("基金经理") or ""),
            "fund_company": str(info.get("基金公司") or ""),
            "fund_type_xq": str(info.get("基金类型") or ""),
            "full_name": str(info.get("基金全称") or ""),
        }
    except Exception as e:
        return {"scale": None, "scale_raw": "", "established": "", "manager": "", "error": str(e)[:100]}


def fetch_fee_detail(code: str):
    """逐只获取费率详情（买入规则/卖出规则/免费持有天数）。原逻辑来自 enrich_data.py。"""
    try:
        df = ak.fund_individual_detail_info_xq(symbol=code)
        buy_rules = []
        sell_rules = []
        mgmt_fee = None
        custody_fee = None
        for _, row in df.iterrows():
            ftype = str(row.get("费用类型", "")).strip()
            cond = str(row.get("条件或名称", "")).strip()
            fee = to_float(row.get("费用"))
            if ftype == "买入规则":
                buy_rules.append({"condition": cond, "rate": fee})
            elif ftype == "卖出规则":
                sell_rules.append({"condition": cond, "rate": fee})
            elif ftype == "其他费用":
                if "管理" in cond:
                    mgmt_fee = fee
                elif "托管" in cond:
                    custody_fee = fee

        # 提取"满多少天免手续费"
        free_hold_days = None
        for rule in sell_rules:
            if rule["rate"] == 0:
                m = re.search(r"(\d+(?:\.\d+)?)\s*天\s*<=?\s*持有", rule["condition"])
                if m:
                    days = float(m.group(1))
                    if free_hold_days is None or days < free_hold_days:
                        free_hold_days = int(days)

        # 首档买入费率（最常用）
        first_buy_rate = buy_rules[0]["rate"] if buy_rules else None
        # 最高卖出费率（持有最短时）
        max_sell_rate = max((r["rate"] for r in sell_rules), default=None)

        return {
            "buy_rules": buy_rules,
            "sell_rules": sell_rules,
            "mgmt_fee": mgmt_fee,
            "custody_fee": custody_fee,
            "free_hold_days": free_hold_days,
            "first_buy_rate": first_buy_rate,
            "max_sell_rate": max_sell_rate,
        }
    except Exception as e:
        return {"buy_rules": [], "sell_rules": [], "error": str(e)[:100]}
