from __future__ import annotations

import hashlib
import logging
import re
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine
from sqlalchemy.orm import sessionmaker

from backend.api.errors import install_error_handlers
from backend.api.routes.health import router as health_router
from backend.api.routes.models import router as models_router
from backend.api.routes.runs import router as runs_router
from backend.infra.database import engine


logger = logging.getLogger("ragproof.http")
_RUN_ID_PATTERN = re.compile(r"^run_[0-9a-f]{32}$")


def create_app(*, database_engine: Engine | None = None) -> FastAPI:
    selected_engine = database_engine or engine
    app = FastAPI(title="RagProof API", version="1.0.0")
    app.state.engine = selected_engine
    app.state.session_factory = sessionmaker(
        bind=selected_engine, autoflush=False, expire_on_commit=False
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    @app.middleware("http")
    async def request_log(request: Request, call_next):
        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            route = request.scope.get("route")
            path_template = getattr(route, "path", "unknown_api")
            owner_id = getattr(request.state, "owner_id", None)
            owner = (
                hashlib.sha256(owner_id.encode("utf-8")).hexdigest()[:12]
                if owner_id
                else "-"
            )
            candidate_id = request.path_params.get("run_id", "")
            resource_id = (
                candidate_id if _RUN_ID_PATTERN.fullmatch(candidate_id) else "-"
            )
            logger.info(
                "method=%s path=%s status=%d duration_ms=%d owner=%s resource_id=%s",
                request.method,
                path_template,
                status_code,
                max(0, int((time.perf_counter() - started) * 1000)),
                owner,
                resource_id,
            )

    install_error_handlers(app)
    app.include_router(health_router)
    app.include_router(models_router)
    app.include_router(runs_router)
    return app


app = create_app()
