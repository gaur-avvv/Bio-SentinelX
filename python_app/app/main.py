from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.routes.health import router as health_router
from app.api.routes.pages import router as pages_router
from app.core.config import get_settings

settings = get_settings()
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.include_router(pages_router)
app.include_router(health_router, prefix="/api")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
