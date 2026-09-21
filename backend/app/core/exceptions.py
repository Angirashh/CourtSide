from fastapi import Request, status
from fastapi.responses import JSONResponse


class TournamentAppException(Exception):
    """Base exception for tournament domain logic."""
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class SchedulingConflictError(TournamentAppException):
    """Raised when CP-SAT solver fails or finds an infeasible solution."""
    def __init__(self, message: str = "Could not generate a feasible court schedule under current constraints."):
        super().__init__(message=message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class TournamentStateError(TournamentAppException):
    """Raised when an operation is invalid for current tournament status."""
    def __init__(self, message: str = "Operation not allowed in the current tournament state."):
        super().__init__(message=message, status_code=status.HTTP_400_BAD_REQUEST)


class ResourceNotFoundError(TournamentAppException):
    """Raised when an entity is missing."""
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} with ID '{resource_id}' was not found.",
            status_code=status.HTTP_404_NOT_FOUND
        )


async def tournament_exception_handler(request: Request, exc: TournamentAppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.__class__.__name__,
            "message": exc.message,
            "path": request.url.path
        }
    )