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



