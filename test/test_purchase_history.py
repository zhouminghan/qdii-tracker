"""申购历史边界逻辑的回归测试（fill.py 的纯函数部分）。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.fill import _normalize_purchase_state, _compact_history, _update_history, merge_share_data


def _rmb(code="016055"):
    return {"code": code, "currency": "人民币", "buy_status": "暂停申购", "daily_limit": 100.0}


def test_normalize_paused_share_limit_to_none():
    sh = _rmb()
    _normalize_purchase_state(sh)
    assert sh["daily_limit"] is None


def test_normalize_paused_usd_share_limit_to_none():
    # 美元份额同样要把暂停/封闭态的 0.0/0.01 噪音归一到 None，避免 verify_purchase 门禁误报
    sh = {"code": "013425", "currency": "美元", "buy_status": "暂停申购", "daily_limit": 0.0}
    _normalize_purchase_state(sh)
    assert sh["daily_limit"] is None


def test_normalize_historical_paused_limit_regardless_of_current_status():
    sh = {
        "code": "008763",
        "currency": "人民币",
        "buy_status": "限大额",
        "daily_limit": 1000.0,
        "buy_status_history": [
            {"date": "2026-08-29", "buy_status": "暂停申购", "daily_limit": 100.0},
            {"date": "2026-09-03", "buy_status": "限大额", "daily_limit": 500.0},
        ],
    }
    _normalize_purchase_state(sh)
    assert sh["daily_limit"] == 1000.0  # 当前限大额不被归一
    assert sh["buy_status_history"][0]["daily_limit"] is None  # 历史暂停额度归一
    assert sh["buy_status_history"][1]["daily_limit"] == 500.0


def test_compact_removes_consecutive_duplicates():
    sh = {
        "buy_status_history": [
            {"date": "2026-08-29", "buy_status": "暂停申购", "daily_limit": None},
            {"date": "2026-09-02", "buy_status": "暂停申购", "daily_limit": None},
            {"date": "2026-09-03", "buy_status": "限大额", "daily_limit": 500.0},
        ]
    }
    _compact_history(sh)
    assert [h["date"] for h in sh["buy_status_history"]] == ["2026-08-29", "2026-09-03"]


def test_compact_keeps_limit_changes():
    sh = {
        "buy_status_history": [
            {"date": "2026-09-03", "buy_status": "限大额", "daily_limit": 500.0},
            {"date": "2026-09-19", "buy_status": "限大额", "daily_limit": 1000.0},
        ]
    }
    _compact_history(sh)
    assert len(sh["buy_status_history"]) == 2


def test_update_history_does_not_append_paused_limit_noise():
    sh = _rmb()
    sh["buy_status_history"] = [
        {"date": "2026-07-11", "buy_status": "暂停申购", "daily_limit": 100.0}
    ]
    # 暂停态 daily_limit 从 100 变为 None，仅是噪音，不应追加新条目
    sh["daily_limit"] = None
    _update_history(sh, "2026-09-08")
    assert len(sh["buy_status_history"]) == 1


def test_update_history_appends_limit_change_when_limited():
    sh = {
        "code": "008763",
        "currency": "人民币",
        "buy_status": "限大额",
        "daily_limit": 1000.0,
        "buy_status_history": [
            {"date": "2026-09-03", "buy_status": "限大额", "daily_limit": 500.0}
        ],
    }
    _update_history(sh, "2026-09-19")
    assert len(sh["buy_status_history"]) == 2
    assert sh["buy_status_history"][-1]["daily_limit"] == 1000.0


def test_update_history_skips_etf():
    etf = {"code": "513500", "currency": "人民币", "buy_status": "暂停申购", "daily_limit": None}
    _update_history(etf, "2026-09-08")
    assert "buy_status_history" not in etf


def test_update_history_tracks_usd():
    usd = {"code": "016055", "currency": "美元", "buy_status": "暂停申购", "daily_limit": None}
    _update_history(usd, "2026-09-08")
    assert usd["buy_status_history"] == [
        {"date": "2026-09-08", "buy_status": "暂停申购", "daily_limit": None}
    ]


def test_merge_share_data_overwrites_stale_chg():
    # 非排名份额（D/F/I/美元）只靠 pzd 刷新收益；旧值必须被覆盖，不能冻结
    share = {"code": "023402", "nav_date": "2026-10-20", "chg_1y": 67.61, "chg_ytd": 39.58, "chg_since_inception": 63.64}
    pzd = {"nav_date": "2026-10-27", "nav": 5.6559, "chg_1m": -11.87, "chg_1y": 17.42, "chg_ytd": 22.08, "chg_since_inception": 37.73}
    merge_share_data(share, pzd)
    assert share["chg_1y"] == 17.42
    assert share["chg_1m"] == -11.87
    assert share["chg_ytd"] == 22.08
    assert share["chg_since_inception"] == 37.73


def test_merge_share_data_does_not_overwrite_when_nav_stale():
    # 防回退：pzd 净值比本地旧时，不覆盖已有收益，只补空白
    share = {"code": "270023", "nav_date": "2026-10-27", "chg_1y": 18.05}
    pzd = {"nav_date": "2026-10-20", "nav": 5.0, "chg_1y": 99.0}
    merge_share_data(share, pzd)
    assert share["chg_1y"] == 18.05
