from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


@dataclass
class ApiError(Exception):
    code: str
    message: str
    status_code: int
    details: dict[str, Any] = field(default_factory=dict)
    retry_after: float | None = None

    def __post_init__(self) -> None:
        Exception.__init__(self, self.message)


def error_body(error: ApiError) -> dict[str, Any]:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "details": error.details,
        }
    }


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, error: ApiError) -> JSONResponse:
        headers = (
            {"Retry-After": str(max(0, math.ceil(error.retry_after)))}
            if error.retry_after is not None
            else None
        )
        return JSONResponse(
            error_body(error), status_code=error.status_code, headers=headers
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, error: RequestValidationError
    ) -> JSONResponse:
        fields = [
            ".".join(str(part) for part in item["loc"]) for item in error.errors()
        ]
        public = ApiError(
            "INVALID_REQUEST", "请求参数校验失败", 422, {"fields": fields}
        )
        return JSONResponse(error_body(public), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(
        request: Request, error: StarletteHTTPException
    ) -> JSONResponse:
        if error.status_code == 404:
            public = ApiError("NOT_FOUND", "资源不存在", 404)
        elif error.status_code == 405:
            public = ApiError("INVALID_REQUEST", "请求方法不受支持", 405)
        else:
            public = ApiError("INVALID_REQUEST", "请求无法处理", error.status_code)
        return JSONResponse(error_body(public), status_code=public.status_code)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request, error: Exception
    ) -> JSONResponse:
        public = ApiError("INTERNAL_ERROR", "服务暂时不可用", 500)
        return JSONResponse(error_body(public), status_code=500)
