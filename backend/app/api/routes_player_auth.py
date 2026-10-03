from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import CurrentUser, get_db, require_player
from app.core.config import settings
from app.core.security import create_access_token
from app.db import models
from app.schemas.auth import PlayerGoogleLogin, PlayerGoogleLoginResponse, UserResponse
from app.schemas.player import MyRegistrationResponse

router = APIRouter(prefix="/auth/player", tags=["Player Auth"])


def _claim_or_create_athlete(db: Session, name: str, email: str, phone: Optional[str]) -> tuple[models.Athlete, bool]:
    """
    Matches an organiser-added Athlete by the email being claimed, same dedup key
    _find_or_create_athlete (routes_players.py) uses. Only email is checked here — unlike the
    CSV upload's email-or-phone dedup, phone can't be a secondary match key for a sign-in flow:
    email is literally the identity being created, so it's the only key that makes sense.
    Backfills a missing phone on a claimed record. Returns (athlete, claimed_existing).
    """
    athlete = db.query(models.Athlete).filter(models.Athlete.email == email).first()
    if athlete:
        if phone and not athlete.phone:
            athlete.phone = phone
        return athlete, True
    athlete = models.Athlete(name=name, email=email, phone=phone)
    db.add(athlete)
    db.flush()
    return athlete, False


@router.post("/google", response_model=PlayerGoogleLoginResponse)
def player_google_login(payload: PlayerGoogleLogin, db: Session = Depends(get_db)):
    """
    Single sign-in-or-register endpoint: Google has already verified the email, so there's no
    separate OTP/verification step — a valid, email-verified Google credential is enough to
    log in immediately, claiming a pre-existing organiser-added roster entry if one matches.
    """
    try:
        claims = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google credential.")

    if not claims.get("email_verified"):
        raise HTTPException(status_code=400, detail="Your Google email isn't verified.")

    email = claims["email"]
    google_sub = claims["sub"]
    name = claims.get("name") or email

    user = db.query(models.User).filter(models.User.google_sub == google_sub).first()
    claimed_existing = False
    if not user:
        # A PLAYER row with this email but no google_sub yet would only exist from data
        # predating this auth method — link it opportunistically rather than erroring.
        user = db.query(models.User).filter(
            models.User.email == email, models.User.role == models.UserRole.PLAYER
        ).first()
        if user:
            user.google_sub = google_sub
        else:
            athlete, claimed_existing = _claim_or_create_athlete(db, name, email, None)
            user = models.User(
                name=name,
                email=email,
                role=models.UserRole.PLAYER,
                google_sub=google_sub,
                athlete_id=athlete.id,
                is_approved=True,
            )
            db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return PlayerGoogleLoginResponse(
        access_token=token,
        role=user.role,
        user=UserResponse.model_validate(user),
        claimed_existing_record=claimed_existing,
    )


@router.get("/registrations", response_model=List[MyRegistrationResponse])
def list_my_registrations(current_user: CurrentUser = Depends(require_player), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user.athlete_id:
        return []

    rows = (
        db.query(models.Player)
        .options(joinedload(models.Player.tournament))
        .filter(models.Player.athlete_id == user.athlete_id)
        .order_by(models.Player.id.desc())
        .all()
    )
    return [
        MyRegistrationResponse(
            tournament_id=p.tournament.id,
            tournament_name=p.tournament.name,
            tournament_format=p.tournament.format,
            tournament_status=p.tournament.status,
            tournament_date=p.tournament.tournament_date,
            venue=p.tournament.venue,
            player_id=p.id,
            seed=p.seed,
            is_withdrawn=p.is_withdrawn,
        )
        for p in rows
    ]
