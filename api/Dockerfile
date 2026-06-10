FROM python:3.12-slim

WORKDIR /app

# Install deps first so the layer caches across app-code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# DATA_DIR -> the read-only mounted provided JSON; DB_URL -> a writable named volume
# so the first-boot seed + ingest persists across restarts. Both overridable via compose.
ENV DATA_DIR=/data \
    DB_URL=sqlite:////app/db/knaq.db \
    WEB_ORIGIN=http://localhost:3000

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
