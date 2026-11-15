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
