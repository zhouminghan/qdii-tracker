"""public_catalog 公共目录契约测试。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from core.constants import CATEGORIES
from pipeline.public_catalog import build_catalog


def _write_catalog_fixture(root: Path, *, missing_nav: bool = False, closed: bool = False):
    series = []
    for category in CATEGORIES:
        shares = [{
            "code": "000001",
            "name": "测试基金",
            "nav": None if missing_nav else 1.23,
            "nav_date": "2026-11-12",
            "buy_status": "封闭期" if closed else "开放申购",
        }]
        if category == "etf":
            shares[0]["etf_price"] = None if missing_nav else 1.25
        series.append({
            "series_id": f"test-{category}",
            "display_name": f"测试 {category}",
            "company": "测试",
            "default_share_code": "000001",
            "series_scale": 10,
            "shares": shares,
        })
        (root / f"{category}.json").write_text(
            json.dumps({"series": series}, ensure_ascii=False),
            encoding="utf-8",
        )
        series = []
    (root / "meta.json").write_text(
        json.dumps({"generated_at": "2026-11-14T00:00:00+08:00", "schema_version": 1}),
        encoding="utf-8",
    )


def _write_limit_fixture(root: Path):
    for category in CATEGORIES:
        series = []
        if category == "sp500":
            series = [{
                "series_id": "series-a-c",
                "display_name": "A/C 限购测试",
                "company": "测试",
                "default_share_code": "000001",
                "series_scale": 10,
                "shares": [
                    {
                        "code": "000001",
                        "name": "A 类",
                        "share_class": "A",
                        "currency": "人民币",
                        "nav": 1.0,
                        "nav_date": "2026-11-12",
                        "buy_status": "限大额",
                        "daily_limit": 100000,
                    },
                    {
                        "code": "000002",
                        "name": "C 类",
                        "share_class": "C",
                        "currency": "人民币",
                        "nav": 1.0,
                        "nav_date": "2026-11-12",
                        "buy_status": "限大额",
                        "daily_limit": 100000,
                    },
                ],
            }]
        elif category == "nasdaq_passive":
            series = [{
                "series_id": "series-single",
                "display_name": "单份额限购测试",
                "company": "测试",
                "default_share_code": "000003",
                "series_scale": 5,
                "shares": [{
                    "code": "000003",
                    "name": "单份额",
                    "share_class": "A",
                    "currency": "人民币",
                    "nav": 1.0,
                    "nav_date": "2026-11-12",
                    "buy_status": "限大额",
                    "daily_limit": 10,
                }],
            }]
        (root / f"{category}.json").write_text(
            json.dumps({"series": series}, ensure_ascii=False),
            encoding="utf-8",
        )
    (root / "meta.json").write_text(
        json.dumps({"generated_at": "2026-11-14T00:00:00+08:00", "schema_version": 1}),
        encoding="utf-8",
    )


def test_build_catalog_envelope(tmp_path):
    _write_catalog_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {"测试": {"color": "#000", "letter": "测"}}},
    )
    assert catalog["schema_version"] == 1
    assert catalog["status"] == "ok"
    assert catalog["data"]["summary"]["series_count"] == len(CATEGORIES)
    assert catalog["data"]["company_brands"]["测试"]["letter"] == "测"
    assert catalog["quality"]["missing_nav"] == 0


def test_missing_prices_are_reported_as_degraded(tmp_path):
    _write_catalog_fixture(tmp_path, missing_nav=True)
    catalog = build_catalog(data_dir=tmp_path, config={"company_brand": {}})
    assert catalog["status"] == "degraded"
    assert catalog["quality"]["missing_nav"] == len(CATEGORIES)
    assert catalog["quality"]["expected_no_nav"] == 0
    assert len(catalog["quality"]["warnings"]) == len(CATEGORIES)


def test_closed_period_without_nav_is_not_degraded(tmp_path):
    _write_catalog_fixture(tmp_path, missing_nav=True, closed=True)
    catalog = build_catalog(data_dir=tmp_path, config={"company_brand": {}})
    assert catalog["status"] == "ok"
    assert catalog["quality"]["missing_nav"] == 0
    assert catalog["quality"]["expected_no_nav"] == len(CATEGORIES)


def test_limit_scope_defaults_to_unknown_for_multiple_shares(tmp_path):
    _write_limit_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": []},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert [share["limit_scope"] for share in shares] == ["unknown", "unknown"]
    assert catalog["quality"]["limit_scope"]["unknown"] == 2

    single = catalog["data"]["categories"]["nasdaq_passive"]["series"][0]["shares"][0]
    assert single["limit_scope"] == "share"


def test_limit_scope_override_marks_shared_group_once(tmp_path):
    _write_limit_fixture(tmp_path)
    entry = {
        "series_id": "series-a-c",
        "share_codes": ["000001", "000002"],
        "limit_scope": "series_shared",
        "limit_group_id": "group-a-c-cny",
        "limit_currency": "人民币",
        "limit_source": "基金公司公告",
        "limit_source_url": "https://example.com/notice",
        "limit_effective_date": "2026-11-01",
        "limit_verified_at": "2026-11-17",
        "limit_confidence": "official",
    }
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": [entry]},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert all(share["limit_scope"] == "series_shared" for share in shares)
    assert all(share["limit_group_id"] == "group-a-c-cny" for share in shares)
    assert all(share["limit_source"] == "基金公司公告" for share in shares)
    assert catalog["quality"]["limit_scope"]["series_shared"] == 2


def test_limit_scope_can_mark_only_one_share_as_applicable(tmp_path):
    _write_limit_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": [{
            "series_id": "series-a-c",
            "share_codes": ["000001"],
            "limit_scope": "share",
            "limit_source": "基金公司公告",
        }]},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert [share["limit_scope"] for share in shares] == ["share", "unknown"]
    assert shares[0]["limit_source"] == "基金公司公告"
    assert "limit_source" not in shares[1]


def test_invalid_limit_scope_is_downgraded_with_warning(tmp_path):
    _write_limit_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": [{
            "series_id": "series-a-c",
            "share_codes": ["000001"],
            "limit_scope": "guessed",
        }]},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert shares[0]["limit_scope"] == "unknown"
    assert any("limit_scope 无效" in warning for warning in catalog["quality"]["warnings"])


def test_limit_scope_can_mark_only_c_share(tmp_path):
    _write_limit_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": [{
            "series_id": "series-a-c",
            "share_codes": ["000002"],
            "limit_scope": "share",
        }]},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert [share["limit_scope"] for share in shares] == ["unknown", "share"]


def test_expired_limit_evidence_is_downgraded(tmp_path):
    _write_limit_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        generated_at="2026-11-17T00:00:00+08:00",
        limit_config={"entries": [{
            "series_id": "series-a-c",
            "share_codes": ["000001", "000002"],
            "limit_scope": "series_shared",
            "limit_effective_date": "2026-10-01",
            "limit_expires_at": "2026-10-31",
            "limit_verified_at": "2026-10-01",
        }]},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert all(share["limit_scope"] == "unknown" for share in shares)
    assert all(share["limit_status"] == "expired" for share in shares)
    assert catalog["quality"]["limit_scope"]["series_shared"] == 0
    assert any("额度核验记录已失效" in warning for warning in catalog["quality"]["warnings"])


def test_public_notice_group_is_applied_as_shared_limit(tmp_path):
    _write_limit_fixture(tmp_path)
    notices = {"groups": [{
        "series_id": "series-a-c",
        "share_codes": ["000001", "000002"],
        "limit_scope": "series_shared",
        "limit_group_id": "notice-AN123",
        "limit_source": "基金公告（东方财富公告库）",
        "limit_source_url": "https://example.com/notice",
        "limit_effective_date": "2026-10-29",
        "limit_verified_at": "2026-11-17",
        "limit_confidence": "official",
        "limit_channels": [{
            "channel": "代销机构",
            "amount": 500,
            "currency": "人民币",
            "includes_installment": True,
            "effective_date": "2026-10-29",
        }],
    }]}
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": []},
        limit_notices=notices,
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert all(share["limit_scope"] == "series_shared" for share in shares)
    assert all(share["limit_group_id"] == "notice-AN123" for share in shares)
    assert shares[0]["limit_channels"][0]["amount"] == 500


def test_manual_limit_scope_wins_over_notice_group(tmp_path):
    _write_limit_fixture(tmp_path)
    catalog = build_catalog(
        data_dir=tmp_path,
        config={"company_brand": {}},
        limit_config={"entries": [{
            "series_id": "series-a-c",
            "share_codes": ["000001"],
            "limit_scope": "share",
        }]},
        limit_notices={"groups": [{
            "series_id": "series-a-c",
            "share_codes": ["000001", "000002"],
            "limit_scope": "series_shared",
            "limit_group_id": "notice-AN123",
        }]},
    )
    shares = catalog["data"]["categories"]["sp500"]["series"][0]["shares"]
    assert shares[0]["limit_scope"] == "share"
    assert shares[1]["limit_scope"] == "series_shared"
