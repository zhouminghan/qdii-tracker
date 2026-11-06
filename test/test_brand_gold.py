"""brand_gold 品牌金价表格解析单测。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from pipeline.brand_gold import parse_brands


def test_parse_brands_maps_gold_and_bar():
    html = """
    <tbody>
      <tr class='no_top'><td class='align_center' rowspan='3'>周大福</td><td class='align_center'><span>金条</span></td><td class='align_center'><span>1083</span></td><td class='align_center'><span>元/克</span></td></tr>
      <tr class=''><td class='align_center'><span>铂金</span></td><td class='align_center'><span>580</span></td><td class='align_center'><span>元/克</span></td></tr>
      <tr class=''><td class='align_center'><span>黄金</span></td><td class='align_center'><span>1229</span></td><td class='align_center'><span>元/克</span></td></tr>
      <tr class=''><td class='align_center' rowspan='2'>老凤祥</td><td class='align_center'><span>金条</span></td><td class='align_center'><span>1082</span></td><td class='align_center'><span>元/克</span></td></tr>
      <tr class=''><td class='align_center'><span>黄金</span></td><td class='align_center'><span>1225</span></td><td class='align_center'><span>元/克</span></td></tr>
    </tbody>
    """
    brands = parse_brands(html)
    assert brands["周大福"] == {"金条": 1083.0, "黄金": 1229.0}
    assert brands["老凤祥"] == {"金条": 1082.0, "黄金": 1225.0}
    assert "铂金" not in brands["周大福"]


def test_parse_brands_ignores_non_cny_units():
    html = """
    <tbody>
      <tr class=''><td class='align_center' rowspan='1'>香港周大福</td><td class='align_center'><span>黄金</span></td><td class='align_center'><span>47162</span></td><td class='align_center'><span>港币/两</span></td></tr>
    </tbody>
    """
    assert parse_brands(html) == {}


def test_parse_brands_ignores_invalid_price():
    html = """
    <tbody>
      <tr class=''><td class='align_center' rowspan='1'>某品牌</td><td class='align_center'><span>黄金</span></td><td class='align_center'><span>--</span></td><td class='align_center'><span>元/克</span></td></tr>
    </tbody>
    """
    assert parse_brands(html) == {}
