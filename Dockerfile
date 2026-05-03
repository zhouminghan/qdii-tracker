# ─────────────────────────────────────────────────────
# QDII Tracker · All-in-One 镜像
#   · 内置 Python 3.11（跑数据流水线 5 脚本）
#   · 内置 Nginx（托管 web/ 静态页）
#   · 内置 supercronic（容器内的 cron，按时自动刷新数据）
# 使用：docker compose up -d  （见 docker-compose.yml）
# ─────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Shanghai \
    DEBIAN_FRONTEND=noninteractive

# 基础依赖 + Nginx + 时区
RUN apt-get update && apt-get install -y --no-install-recommends \
      nginx \
      tzdata \
      curl \
      ca-certificates \
    && ln -sf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

# supercronic：容器里常驻的轻量 cron（比 cron 更适合容器）
RUN curl -fsSL -o /usr/local/bin/supercronic \
      https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
    && chmod +x /usr/local/bin/supercronic

WORKDIR /app

# 安装 Python 依赖
COPY scripts/requirements.txt /app/scripts/requirements.txt
RUN pip install --no-cache-dir -r /app/scripts/requirements.txt

# 拷贝代码
COPY scripts/ /app/scripts/
COPY web/ /app/web/

# Nginx 配置（放在启动脚本里生成，避免写死路径）
COPY docker/nginx.conf /etc/nginx/sites-available/default
COPY docker/crontab /app/crontab
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80
VOLUME ["/app/web/data"]

CMD ["/app/entrypoint.sh"]
