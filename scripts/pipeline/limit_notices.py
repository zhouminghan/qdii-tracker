"""
scripts/pipeline/limit_notices.py - 扫描基金公告中的共用申购额度

数据来自东方财富/天天基金公开基金公告库。只把正文明确出现
「A类、C类等份额合计申购金额超过 X」的公告认定为 series_shared；
标题相似、金额相同或只列单一份额的公告不会自动推断。

输出：web/data/limit-notices.json
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from functools import lru_cache
from io import BytesIO
from typing import Any

import requests

from core.constants import CATEGORIES, DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json

NOTICE_API = "https://api.fund.eastmoney.com/f10/JJGG"
NOTICE_DETAIL = "https://data.eastmoney.com/notices/detail/{code}/{notice_id}.html"
NOTICE_CONTENT_API = "https://np-cnotice-stock.eastmoney.com/api/content/ann"
NOTICE_PDF = "https://pdf.dfcfw.com/pdf/H2_{notice_id}_1.pdf"
OUTPUT_FP = DATA_DIR / "limit-notices.json"
LOOKBACK_DAYS = 540
MAX_NOTICES_PER_SERIES = 4

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://fundf10.eastmoney.com/",
}

AMOUNT_RE = re.compile(r"(?:超过|不超过|大于|限额为)\s*(?:人民币)?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(万美元|美元|万元|元)")
CLASS_RE = re.compile(r"([A-Z])\s*类(?:基金份额)?")
CLASS_GROUP_RE = re.compile(r"([A-Z](?:\s*[、,/，和]\s*[A-Z])+)\s*(?:类)?(?:基金)?份额")
CODE_RE = re.compile(r"(?<!\d)(\d{6})(?!\d)")
DATE_RE = re.compile(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
SEPARATE_SHARES_RE = re.compile(
    r"(不同份额(?:的申请)?将单独计算限额|各类基金份额的申请金额每类单独计算)"
)


def _parse_jsonp(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("{") or text.startswith("["):
        return json.loads(text)
    start = text.find("(")
    end = text.rfind(")")
    if start < 0 or end <= start:
        raise ValueError("invalid JSONP response")
    return json.loads(text[start + 1:end])


@lru_cache(maxsize=256)
def fetch_notice_list(code: str, page_size: int = 100) -> list[dict[str, Any]]:
    """返回某基金代码最近的公告列表。"""
    callback = f"jQuery{int(time.time() * 1000)}"
    response = requests.get(
        NOTICE_API,
        params={
            "callback": callback,
            "fundcode": code,
            "pageIndex": 1,
            "pageSize": page_size,
            "type": 0,
        },
        headers={**HEADERS, "Referer": f"https://fundf10.eastmoney.com/jjgg_{code}.html"},
        timeout=20,
    )
    response.raise_for_status()
    payload = _parse_jsonp(response.text)
    data = payload.get("Data") or []
    return data if isinstance(data, list) else []


@lru_cache(maxsize=512)
def fetch_notice_text(code: str, notice_id: str) -> str:
    """读取公告详情正文。"""
    text = ""
    try:
        response = requests.get(
            NOTICE_CONTENT_API,
            params={
                "art_code": notice_id,
                "client_source": "web",
                "page_index": 1,
                "cb": "cb",
            },
            headers=HEADERS,
            timeout=20,
        )
        response.raise_for_status()
        payload = _parse_jsonp(response.text)
        text = str((payload.get("data") or {}).get("notice_content") or "")
    except Exception:  # noqa: BLE001
        text = ""
    if len(text) >= 50:
        return text

    # 部分公告没有正文 API，但官方 PDF 可直接下载。
    from pypdf import PdfReader

    pdf = requests.get(NOTICE_PDF.format(notice_id=notice_id), headers=HEADERS, timeout=30)
    pdf.raise_for_status()
    reader = PdfReader(BytesIO(pdf.content))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _parse_notice_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _channel_name(clause: str) -> str:
    if "代销" in clause:
        return "代销机构"
    if "直销" in clause and "个人投资者" in clause:
        return "直销个人"
    if "直销" in clause and "机构投资者" in clause:
        return "直销机构"
    if "直销" in clause:
        return "直销"
    if "个人投资者" in clause:
        return "个人投资者"
    if "机构投资者" in clause:
        return "机构投资者"
    return "公告口径"


def _amount_value(raw: str, unit: str) -> float:
    value = float(raw.replace(",", ""))
    return round(value * 10000, 2) if unit in {"万元", "万美元"} else round(value, 2)


def _currency_from_unit(unit: str) -> str:
    return "美元" if unit in {"万美元", "美元"} else "人民币"


def _effective_date(clause: str, fallback: date | None) -> str | None:
    matches = DATE_RE.findall(clause)
    if not matches:
        return fallback.isoformat() if fallback else None
    y, m, d = matches[-1]
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"


def _classes_in_clause(clause: str) -> set[str]:
    classes = set(CLASS_RE.findall(clause))
    for group in CLASS_GROUP_RE.findall(clause):
        classes.update(re.findall(r"[A-Z]", group))
    return classes


def _matching_codes(
    clause: str,
    shares: list[dict[str, Any]],
    preferred_currency: str | None = None,
) -> tuple[list[str], bool]:
    """从公告条款中找出适用份额；返回 (codes, ambiguous)。"""
    pool = shares
    if preferred_currency:
        pool = [item for item in shares if item.get("currency") == preferred_currency]
        if len(pool) < 2:
            return [], False

    all_codes = {str(item.get("code")) for item in pool if item.get("code")}
    explicit = [code for code in CODE_RE.findall(clause) if code in all_codes]
    if explicit:
        return list(dict.fromkeys(explicit)), False

    classes = _classes_in_clause(clause)

    candidates = [
        item for item in pool
        if str(item.get("share_class") or "")[:1] in classes
    ]
    if not candidates and preferred_currency and len(pool) >= 2 and len(classes) < 2:
        # PDF 表格常用 A（人民币）/C 或 A（美元现汇）/A（美元现钞）的写法，
        # 份额类别没有“类”字；同一币种内明确写合计时取同币种份额。
        candidates = pool

    codes = [str(item.get("code")) for item in candidates if item.get("code")]
    class_counts = {
        share_class: sum(1 for item in candidates if str(item.get("share_class") or "")[:1] == share_class)
        for share_class in classes
    }
    ambiguous = any(count > 1 for count in class_counts.values()) and preferred_currency is None
    return list(dict.fromkeys(codes)), ambiguous


def extract_shared_evidence(
    text: str,
    shares: list[dict[str, Any]],
    fallback_date: date | None = None,
) -> tuple[list[str], list[dict[str, Any]], bool]:
    """从公告正文提取共用额度条款。"""
    normalized = re.sub(r"[\r\n]+", "", text)
    normalized = re.sub(r"[ \t\u3000]+", " ", normalized)
    clauses = re.split(r"[。；;]", normalized)
    channels: list[dict[str, Any]] = []
    all_codes: list[str] = []
    ambiguous = False

    for clause in clauses:
        if "申购" not in clause:
            continue
        if "不与其他" in clause or "单独计算" in clause:
            continue
        amount_matches = list(AMOUNT_RE.finditer(clause))
        if not amount_matches:
            continue
        classes = _classes_in_clause(clause)
        has_shared_marker = "合计" in clause or "合并计算" in clause
        implied_shared = (
            len(amount_matches) == 1
            and len(classes) >= 2
            and "该类份额" in clause
            and ("限额" in clause or "不得超过" in clause)
        )
        if not has_shared_marker and not implied_shared:
            continue
        for amount_match in amount_matches:
            currency = _currency_from_unit(amount_match.group(2))
            codes, clause_ambiguous = _matching_codes(clause, shares, currency)
            if len(codes) < 2:
                continue
            ambiguous = ambiguous or clause_ambiguous
            channel = {
                "channel": _channel_name(clause),
                "amount": _amount_value(amount_match.group(1), amount_match.group(2)),
                "currency": currency,
                "includes_installment": "定期定额" in clause or "定投" in clause,
                "effective_date": _effective_date(clause, fallback_date),
                "share_codes": codes,
            }
            key = (
                channel["channel"],
                channel["amount"],
                channel["currency"],
                channel["includes_installment"],
                tuple(channel["share_codes"]),
            )
            if not any((
                item["channel"],
                item["amount"],
                item["currency"],
                item["includes_installment"],
                tuple(item["share_codes"]),
            ) == key for item in channels):
                channels.append(channel)
            all_codes.extend(codes)
    return list(dict.fromkeys(all_codes)), channels, ambiguous


def _candidate_notices(notices: list[dict[str, Any]], cutoff: date) -> list[dict[str, Any]]:
    out = []
    for notice in notices:
        title = str(notice.get("TITLE") or "")
        published = _parse_notice_date(str(notice.get("PUBLISHDATEDesc") or ""))
        if not published or published < cutoff:
            continue
        if "交易状态表" in title:
            continue
        if "大额申购" not in title and "申购" not in title:
            continue
        if "定期定额" not in title and "定投" not in title and "限额" not in title:
            continue
        out.append({**notice, "_published": published})
    return out


def _declares_separate_share_limits(text: str) -> bool:
    return bool(SEPARATE_SHARES_RE.search(text))


def scan_series(series: dict[str, Any], cutoff: date) -> list[dict[str, Any]]:
    shares = series.get("shares") or []
    if len(shares) < 2:
        return []

    notices: list[dict[str, Any]] = []
    used_code = ""
    for share in shares:
        code = str(share.get("code") or "")
        if not code:
            continue
        try:
            notices = fetch_notice_list(code)
        except Exception:  # noqa: BLE001
            notices = []
        if notices:
            used_code = code
            break
    if not notices:
        return []

    candidates = _candidate_notices(notices, cutoff)
    for notice in candidates[:MAX_NOTICES_PER_SERIES]:
        notice_id = str(notice.get("ID") or "")
        if not notice_id:
            continue
        try:
            text = fetch_notice_text(used_code, notice_id)
        except Exception:  # noqa: BLE001
            continue
        if _declares_separate_share_limits(text):
            continue
        codes, channels, ambiguous = extract_shared_evidence(text, shares, notice["_published"])
        if not channels or len(codes) < 2:
            continue
        grouped: dict[tuple[str, ...], list[dict[str, Any]]] = {}
        for channel in channels:
            group_codes = tuple(channel.get("share_codes") or codes)
            grouped.setdefault(group_codes, []).append({
                key: value for key, value in channel.items() if key != "share_codes"
            })

        results = []
        for group_codes, group_channels in grouped.items():
            suffix = ""
            if len(grouped) > 1:
                currencies = sorted({str(item.get("currency") or "") for item in group_channels})
                suffix = "-" + "-".join(item for item in currencies if item)
            results.append({
                "series_id": series.get("series_id"),
                "display_name": series.get("display_name"),
                "share_codes": list(group_codes),
                "share_classes": sorted({
                    str(item.get("share_class") or "")[:1]
                    for item in shares
                    if str(item.get("code")) in group_codes
                }),
                "limit_scope": "series_shared",
                "limit_group_id": f"notice-{notice_id}{suffix}",
                "limit_channels": group_channels,
                "limit_source": "基金公告（东方财富公告库）",
                "limit_source_url": NOTICE_DETAIL.format(code=used_code, notice_id=notice_id),
                "limit_notice_title": notice.get("TITLE"),
                "limit_effective_date": min(
                    (item["effective_date"] for item in group_channels if item.get("effective_date")),
                    default=notice["_published"].isoformat(),
                ),
                "limit_verified_at": date.today().isoformat(),
                "limit_confidence": "unverified" if ambiguous else "official",
            })
        return results
    return []


def build() -> dict[str, Any]:
    cutoff = date.today() - timedelta(days=LOOKBACK_DAYS)
    series_list = []
    for category in CATEGORIES:
        path = DATA_DIR / f"{category}.json"
        if not path.exists():
            continue
        payload = read_json(path)
        for series in payload.get("series", []):
            if len(series.get("shares") or []) > 1:
                series_list.append(series)

    groups = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(scan_series, series, cutoff): series for series in series_list}
        for future in as_completed(futures):
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                series = futures[future]
                print(f"  ⚠ 限额公告扫描失败: {series.get('display_name')}: {exc}")
                continue
            if result:
                groups.extend(result)

    groups.sort(key=lambda item: (str(item.get("display_name") or ""), item.get("series_id") or ""))
    return {
        "schema_version": 1,
        "generated_at": beijing_now_iso(),
        "source": "东方财富/天天基金公开基金公告",
        "lookback_days": LOOKBACK_DAYS,
        "scanned_series": len(series_list),
        "groups": groups,
    }


def main():
    payload = build()
    write_json(OUTPUT_FP, payload)
    print(f"✅ 共用限额公告：{len(payload['groups'])} 组（扫描 {payload['scanned_series']} 个多份额系列）")


if __name__ == "__main__":
    main()
