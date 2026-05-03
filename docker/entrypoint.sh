#!/bin/bash
set -e

echo "🚀 [entrypoint] starting QDII Tracker container..."
echo "[entrypoint] timezone: $(cat /etc/timezone)"
echo "[entrypoint] date: $(date)"

# 如果 web/data/ 为空（首次启动 / 挂载了空卷），自动跑一次完整流水线
if [ -z "$(ls -A /app/web/data 2>/dev/null | grep -v holdings)" ]; then
  echo "📥 [entrypoint] web/data/ 为空，先跑一次完整流水线（预计 15~20 分钟，请耐心）..."
  cd /app/scripts
  python scan_funds.py       || echo "⚠️  scan_funds.py failed"
  python enrich_data.py      || echo "⚠️  enrich_data.py failed"
  python fill_missing.py     || echo "⚠️  fill_missing.py failed"
  python fetch_holdings.py   || echo "⚠️  fetch_holdings.py failed"
  python fetch_stocks.py     || echo "⚠️  fetch_stocks.py failed"
  echo "✅ [entrypoint] 首次流水线完成"
else
  echo "📂 [entrypoint] web/data/ 已有数据，跳过首次流水线"
fi

# 启动 Nginx
echo "🌐 [entrypoint] starting nginx..."
nginx

# 前台跑 supercronic（容器生命周期就跟着它）
echo "⏰ [entrypoint] starting supercronic..."
exec supercronic /app/crontab
