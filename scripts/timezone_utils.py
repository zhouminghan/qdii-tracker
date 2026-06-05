#!/usr/bin/env python3
"""
时区工具模块 - 统一处理北京时间（东八区）

为了避免本地开发环境和 GitHub Actions 环境的时区不一致问题，
所有时间戳生成都应使用此模块提供的函数。
"""

import pytz
from datetime import datetime


# 定义北京时间时区
BEIJING_TZ = pytz.timezone('Asia/Shanghai')


def beijing_now() -> datetime:
    """获取当前北京时间"""
    return datetime.now(BEIJING_TZ)


def beijing_now_iso() -> str:
    """获取当前北京时间的 ISO 格式字符串"""
    return beijing_now().isoformat()


def beijing_date_str() -> str:
    """获取当前北京时间的日期字符串（YYYY-MM-DD）"""
    return beijing_now().strftime('%Y-%m-%d')


def beijing_year() -> int:
    """获取当前北京时间的年份"""
    return beijing_now().year


def beijing_year_start() -> datetime:
    """获取当前北京时间的年初日期"""
    current_year = beijing_year()
    return BEIJING_TZ.localize(datetime(current_year, 1, 1))


def utc_to_beijing(utc_dt: datetime) -> datetime:
    """将 UTC 时间转换为北京时间"""
    if utc_dt.tzinfo is None:
        utc_dt = pytz.utc.localize(utc_dt)
    return utc_dt.astimezone(BEIJING_TZ)


def beijing_to_utc(beijing_dt: datetime) -> datetime:
    """将北京时间转换为 UTC 时间"""
    if beijing_dt.tzinfo is None:
        beijing_dt = BEIJING_TZ.localize(beijing_dt)
    return beijing_dt.astimezone(pytz.utc)