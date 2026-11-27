"""ndx_pe 指标口径与失败回退单测。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import pipeline.ndx_pe as ndx_pe


def test_snapshot_contract_names_ndx_ttm_month_end():
    payload = ndx_pe._with_contract({
        "pe": 35.09,
        "date": "2026-09-30",
        "source": "Siblis Research",
        "source_frequency": "daily",
    })
    assert payload["index"] == "Nasdaq-100"
    assert payload["index_symbol"] == "^NDX"
    assert payload["pe_type"] == "TTM"
    assert payload["frequency"] == "monthly"
    assert payload["observation_period"] == "month_end"
    assert "source_frequency" not in payload
    assert "月末快照" in payload["note"]


def test_build_keeps_old_pe_when_source_fails(monkeypatch, tmp_path):
    output = tmp_path / "ndx-pe.json"
    previous = {
        "generated_at": "2026-11-10T00:00:00+08:00",
        "schema_version": 1,
        "pe": 35.09,
        "date": "2026-09-30",
        "source": "Siblis Research",
    }
    output.write_text(json.dumps(previous), encoding="utf-8")
    monkeypatch.setattr(ndx_pe, "OUTPUT_FP", output)
    monkeypatch.setattr(ndx_pe, "fetch_latest", lambda: (_ for _ in ()).throw(RuntimeError("network")))

    payload = ndx_pe.build()
    assert payload["pe"] == 35.09
    assert payload["date"] == "2026-09-30"
    assert payload["pe_type"] == "TTM"
    assert payload["index"] == "Nasdaq-100"


def test_fetch_latest_rejects_nonpositive_value(monkeypatch):
    class Response:
        def json(self):
            return {"data": [{"value": 0, "trading_day (EOD)": "2026-09-30"}]}

    monkeypatch.setattr(ndx_pe, "requests_get", lambda *args, **kwargs: Response())
    try:
        ndx_pe.fetch_latest()
    except ValueError as error:
        assert "non-positive" in str(error)
    else:
        raise AssertionError("expected ValueError")
