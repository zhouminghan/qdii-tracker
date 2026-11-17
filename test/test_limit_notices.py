"""limit_notices 公告口径解析测试。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from datetime import date

from pipeline.limit_notices import (
    _candidate_notices,
    _declares_separate_share_limits,
    extract_shared_evidence,
)


SHARES = [
    {"code": "016701", "share_class": "A", "currency": "人民币"},
    {"code": "016702", "share_class": "C", "currency": "人民币"},
]


def test_extracts_channel_specific_shared_limits():
    text = """
    自 2026 年 10 月 29 日起，如单日每个基金账户通过代销机构累计申购（含定期定额投资）
    本基金 A 类基金份额、C 类基金份额的合计金额超过 500 元，管理人有权拒绝。
    如单日每个直销机构的个人投资者基金账户累计申购本基金 A 类基金份额、C 类基金份额的
    合计金额超过 10 万元，管理人有权拒绝。
    """
    codes, channels, ambiguous = extract_shared_evidence(text, SHARES, date(2026, 10, 29))
    assert codes == ["016701", "016702"]
    assert ambiguous is False
    assert channels == [
        {
            "channel": "代销机构",
            "amount": 500.0,
            "currency": "人民币",
            "includes_installment": True,
            "effective_date": "2026-10-29",
            "share_codes": ["016701", "016702"],
        },
        {
            "channel": "直销个人",
            "amount": 100000.0,
            "currency": "人民币",
            "includes_installment": False,
            "effective_date": "2026-10-29",
            "share_codes": ["016701", "016702"],
        },
    ]


def test_does_not_treat_single_share_or_similar_amount_as_shared():
    text = "自2026年10月1日起，单个基金账户申购A类基金份额超过500元时，管理人有权拒绝。"
    codes, channels, _ambiguous = extract_shared_evidence(text, SHARES)
    assert codes == []
    assert channels == []


def test_ignores_separate_class_limits_and_non_shared_channel_wording():
    shares = [
        {"code": "501226", "share_class": "A", "currency": "人民币"},
        {"code": "018036", "share_class": "C", "currency": "人民币"},
    ]
    text = (
        "单日每个基金账户对A类基金份额的累计申购金额不得超过50万元、"
        "对C类基金份额的累计申购金额不得超过1万元，"
        "通过电子交易平台申购的限额不与其他销售渠道合并计算。"
    )
    codes, channels, _ambiguous = extract_shared_evidence(text, shares, date(2026, 10, 21))
    assert codes == []
    assert channels == []


def test_detects_notice_wide_disclaimer_that_shares_are_separate():
    assert _declares_separate_share_limits("不同份额的申请将单独计算限额。") is True
    assert _declares_separate_share_limits(
        "A类、C类基金份额的合计金额超过500元。"
    ) is False


def test_selects_only_the_currency_named_by_the_amount():
    shares = [
        {"code": "000001", "share_class": "A", "currency": "人民币"},
        {"code": "000002", "share_class": "C", "currency": "人民币"},
        {"code": "000003", "share_class": "A", "currency": "美元"},
        {"code": "000004", "share_class": "C", "currency": "美元"},
    ]
    text = "A类基金份额、C类基金份额的合计申购金额超过500元。"
    codes, channels, ambiguous = extract_shared_evidence(text, shares, date(2026, 10, 1))
    assert codes == ["000001", "000002"]
    assert channels
    assert channels[0]["currency"] == "人民币"
    assert ambiguous is False


def test_extracts_multiple_currency_limits_from_one_clause():
    shares = [
        {"code": "000001", "share_class": "A", "currency": "人民币"},
        {"code": "000002", "share_class": "C", "currency": "人民币"},
        {"code": "000003", "share_class": "A", "currency": "美元"},
        {"code": "000004", "share_class": "A", "currency": "美元"},
    ]
    text = (
        "A（人民币）或C的合计申购金额不超过5,000元，"
        "A（美元现汇）或A（美元现钞）的合计申购金额不超过700美元。"
    )
    _codes, channels, ambiguous = extract_shared_evidence(text, shares, date(2026, 1, 21))
    assert ambiguous is False
    assert [(item["currency"], item["amount"]) for item in channels] == [
        ("人民币", 5000.0),
        ("美元", 700.0),
    ]
    assert channels[0]["share_codes"] == ["000001", "000002"]
    assert channels[1]["share_codes"] == ["000003", "000004"]


def test_keeps_personal_and_institutional_channels_separate():
    shares = [
        {"code": "000001", "share_class": "A", "currency": "人民币"},
        {"code": "000002", "share_class": "C", "currency": "人民币"},
    ]
    text = (
        "A类人民币份额、C类人民币份额调整个人投资者单日单个基金账户"
        "合计申购业务限额为600,000.00元。"
        "A类人民币份额、C类人民币份额调整机构投资者单日单个基金账户"
        "申购该类份额的业务限额为6,000,000.00元。"
    )
    _codes, channels, _ambiguous = extract_shared_evidence(text, shares, date(2026, 5, 29))
    assert [(item["channel"], item["amount"]) for item in channels] == [
        ("个人投资者", 600000.0),
        ("机构投资者", 6000000.0),
    ]


def test_candidate_notices_skips_trade_status_tables_and_old_items():
    notices = [
        {"TITLE": "旗下基金交易状态表", "PUBLISHDATEDesc": "2026-11-17"},
        {"TITLE": "调整大额申购(含定期定额投资)业务的公告", "PUBLISHDATEDesc": "2026-10-29"},
        {"TITLE": "调整大额申购业务的公告", "PUBLISHDATEDesc": "2024-01-01"},
    ]
    out = _candidate_notices(notices, date(2025, 6, 1))
    assert [item["PUBLISHDATEDesc"] for item in out] == ["2026-10-29"]
