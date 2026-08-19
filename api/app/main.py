import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import WEB_ORIGIN
from .db import Base, SessionLocal, engine
from .ingest import run_ingest
from .models import Device
from .routers import alerts, devices, leaderboard, users
from .seed import seed

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("knaq")

app = FastAPI(title="Knaq Alert Triage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[WEB_ORIGIN] if WEB_ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.query(Device).first() is None:          # idempotent: only on an empty DB
            log.info("empty DB -> seeding + ingesting")
            seed(db)
            run_ingest(db)
        else:
            log.info("DB already populated -> skipping seed/ingest")
    finally:
        db.close()


# Consistent error envelope: { "error": { "code", "message" } }
@app.exception_handler(StarletteHTTPException)
def http_error(_: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.status_code, "message": exc.detail}})


@app.exception_handler(RequestValidationError)
def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": {"code": 422, "message": "Validation failed", "details": jsonable_encoder(exc.errors())}})


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(alerts.router)
app.include_router(devices.router)
app.include_router(users.router)
app.include_router(leaderboard.router)
