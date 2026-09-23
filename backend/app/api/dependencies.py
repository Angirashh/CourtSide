from dataclasses import dataclass
from typing import Generator, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db import models
from app.db.session import SessionLocal

bearer_scheme = HTTPBearer(description="Access token from /auth/organiser/login or /auth/operator/login")


def get_db() -> Generator[Session, None, None]:
    """Dependency that provides a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@dataclass
class CurrentUser:
    id: str
    name: str
    role: models.UserRole
    tournament_id: Optional[str] = None  # set only on OPERATOR tokens
    is_superadmin: bool = False


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.")

    user = db.query(models.User).filter(models.User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists.")

    return CurrentUser(
        id=user.id,
        name=user.name,
        role=user.role,
        tournament_id=payload.get("tournament_id"),
        is_superadmin=user.is_superadmin,
    )


def require_organiser(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role != models.UserRole.ORGANISER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organiser access required.")
    return current_user


def require_superadmin(current_user: CurrentUser = Depends(require_organiser)) -> CurrentUser:
    if not current_user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user


def require_operator_or_organiser(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user.role not in (models.UserRole.OPERATOR, models.UserRole.ORGANISER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operator or organiser access required.")
    return current_user


def ensure_tournament_access(tournament: models.Tournament, current_user: CurrentUser, db: Session) -> None:
    """
    Authorization gate for a specific tournament's resources.
    - Organisers may act on any tournament they own, any they've been added to as a
      co-organiser (full parity with the owner — see TournamentCoOrganiser), or any legacy
      tournament with no owner.
    - Operators may act only on a tournament they hold a live (non-revoked) invite for,
      and only when their token was scoped to that same tournament at login.
    """
    if current_user.role == models.UserRole.ORGANISER:
        if not tournament.organiser_id or tournament.organiser_id == current_user.id:
            return
        is_co_organiser = db.query(models.TournamentCoOrganiser).filter(
            models.TournamentCoOrganiser.tournament_id == tournament.id,
            models.TournamentCoOrganiser.organiser_id == current_user.id,
        ).first()
        if not is_co_organiser:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this tournament.")
        return

    # OPERATOR
    if current_user.tournament_id != tournament.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your operator session is not scoped to this tournament.",
        )

    assignment = db.query(models.OperatorAssignment).filter(
        models.OperatorAssignment.operator_id == current_user.id,
        models.OperatorAssignment.tournament_id == tournament.id,
        models.OperatorAssignment.is_revoked == False,
    ).first()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your access to this tournament was revoked.")
