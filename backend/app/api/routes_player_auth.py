from typing import List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import CurrentUser, get_db, require_player
from app.core.security import create_access_token, decode_access_token
from app.db import models
from app.schemas.auth import (
    PlayerClaimEmailRequest,
    PlayerClaimEmailResponse,
    PlayerGoogleAuthRequest,
    PlayerGoogleAuthResponse,
    PlayerGoogleSignupCompleteRequest,
    PlayerSignupResponse,
    TokenResponse,
    UserResponse,
)
from app.schemas.player import MyRegistrationResponse
from app.services.google_auth import verify_google_id_token

router = APIRouter(prefix="/auth/player", tags=["Player Auth"])

_GOOGLE_SIGNUP_PURPOSE = "player_google_signup"
_GOOGLE_SIGNUP_TOKEN_MINUTES = 15


def _claim_or_create_athlete(db: Session, name: str, email: str, phone: str) -> tuple[models.Athlete, bool]:
    """
    Matches an organiser-added Athlete by phone first, falling back to email (covers an
    organiser who only had an email on file). Backfills whichever of phone/email was missing on
    a claimed record. Returns (athlete, claimed_existing).
    """
    athlete = db.query(models.Athlete).filter(models.Athlete.phone == phone).first()
    if not athlete:
        athlete = db.query(models.Athlete).filter(models.Athlete.email == email).first()
    if athlete:
        if phone and not athlete.phone:
            athlete.phone = phone
        if email and not athlete.email:
            athlete.email = email
        return athlete, True
    athlete = models.Athlete(name=name, email=email, phone=phone)
    db.add(athlete)
    db.flush()
    return athlete, False


def _sync_athlete_contact(db: Session, user: models.User, *, email: Optional[str] = None, phone: Optional[str] = None) -> None:
    """Keeps the linked Athlete row (the career-stats registry, separate from login) in sync
    whenever a User's email/phone is set after the account already exists -- e.g. linking a
    Google email onto a phone-only account, or /claim-email. Without this, _claim_or_create_athlete's
    phone/email lookup on a later signup keeps missing this athlete and creates a duplicate.
    Only fills in a field the athlete doesn't already have, and skips it if another Athlete
    already owns that value."""
    if not user.athlete_id:
        return
    athlete = db.query(models.Athlete).filter(models.Athlete.id == user.athlete_id).first()
    if not athlete:
        return
    if email and not athlete.email and not db.query(models.Athlete).filter(
        models.Athlete.email == email, models.Athlete.id != athlete.id
    ).first():
        athlete.email = email
    if phone and not athlete.phone and not db.query(models.Athlete).filter(
        models.Athlete.phone == phone, models.Athlete.id != athlete.id
    ).first():
        athlete.phone = phone


def _finalize_player_signup(db: Session, name: str, email: str, phone: str) -> tuple[models.User, bool]:
    """Creates the PLAYER User row for a verified (email, phone) pair, claiming a matching
    organiser-added Athlete if one exists. Caller must have already checked for conflicting
    User rows on email/phone."""
    first_name, _, last_name = name.partition(" ")
    first_name = first_name or name
    athlete, claimed_existing = _claim_or_create_athlete(db, name, email, phone)
    user = models.User(
        name=name,
        first_name=first_name,
        last_name=last_name or None,
        email=email,
        phone=phone,
        role=models.UserRole.PLAYER,
        athlete_id=athlete.id,
        is_approved=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user, claimed_existing


def _finalize_player_signup_racesafe(db: Session, name: str, email: str, phone: str) -> tuple[models.User, bool]:
    """Same as _finalize_player_signup, but tolerates losing a race to a concurrent request that
    created the same account first (e.g. Google's sign-in callback firing twice, or a double
    click) by logging in as whichever row won instead of raising a raw 500 on the unique
    constraint."""
    try:
        return _finalize_player_signup(db, name, email, phone)
    except IntegrityError:
        db.rollback()
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            raise
        return user, True


@router.post("/google", response_model=PlayerGoogleAuthResponse)
def player_google_auth(payload: PlayerGoogleAuthRequest, db: Session = Depends(get_db)):
    """
    Verifies a Google sign-in. Logs straight in if a PLAYER account already exists for this
    Google email, or if an organiser-added Athlete with this email already has a phone number on
    file (so a returning player isn't asked to re-type something we already have). Otherwise hands
    back a short-lived signup_token so the client can collect a phone number and finish creating
    the account via /google/complete-signup.
    """
    profile = verify_google_id_token(payload.id_token)
    email = profile["email"]

    # `email` is unique across the whole `users` table, not just within PLAYER -- an
    # ORGANISER/OPERATOR account on this email blocks a PLAYER account from ever using it too,
    # so that has to be surfaced as a clear error rather than silently falling through to a
    # signup that would later fail on the unique constraint.
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing and existing.role != models.UserRole.PLAYER:
        raise HTTPException(
            status_code=409,
            detail=f"{email} is already used by a {existing.role.value.title()} account here. Sign up with a different email.",
        )
    if existing:
        token = create_access_token({"sub": existing.id, "role": existing.role.value})
        return PlayerGoogleAuthResponse(
            account_exists=True,
            session=TokenResponse(access_token=token, role=existing.role, user=UserResponse.model_validate(existing)),
        )

    name = profile.get("name", "") or email.split("@")[0]
    athlete = db.query(models.Athlete).filter(models.Athlete.email == email).first()
    if athlete and athlete.phone and not db.query(models.User).filter(models.User.phone == athlete.phone).first():
        user, _claimed = _finalize_player_signup_racesafe(db, name, email, athlete.phone)
        token = create_access_token({"sub": user.id, "role": user.role.value})
        return PlayerGoogleAuthResponse(
            account_exists=True,
            session=TokenResponse(access_token=token, role=user.role, user=UserResponse.model_validate(user)),
        )

    signup_token = create_access_token(
        {"purpose": _GOOGLE_SIGNUP_PURPOSE, "email": email, "name": profile.get("name", "")},
        expires_minutes=_GOOGLE_SIGNUP_TOKEN_MINUTES,
    )
    return PlayerGoogleAuthResponse(account_exists=False, signup_token=signup_token, name=profile.get("name"), email=email)


@router.post("/google/complete-signup", response_model=PlayerSignupResponse)
def player_google_complete_signup(payload: PlayerGoogleSignupCompleteRequest, db: Session = Depends(get_db)):
    """Creates a PLAYER account from a verified Google identity plus the phone number the user
    just typed in. Claims a pre-existing organiser-added roster entry if one matches."""
    try:
        claims = decode_access_token(payload.signup_token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=400, detail="This sign-up link has expired. Please sign in with Google again.")
    if claims.get("purpose") != _GOOGLE_SIGNUP_PURPOSE:
        raise HTTPException(status_code=400, detail="Invalid sign-up token.")

    email = claims["email"]
    name = claims.get("name") or email.split("@")[0]

    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(
            status_code=409, detail="An account with this email already exists. Please sign in with Google instead."
        )

    phone_user = db.query(models.User).filter(models.User.phone == payload.phone).first()
    if phone_user:
        if phone_user.role != models.UserRole.PLAYER or phone_user.email:
            raise HTTPException(status_code=409, detail="An account with this phone number already exists.")
        # Phone-only PLAYER account (e.g. self-registered without an email) -- attach this
        # verified Google identity to it instead of rejecting a returning player.
        phone_user.email = email
        _sync_athlete_contact(db, phone_user, email=email)
        db.commit()
        db.refresh(phone_user)
        token = create_access_token({"sub": phone_user.id, "role": phone_user.role.value})
        return PlayerSignupResponse(
            access_token=token,
            role=phone_user.role,
            user=UserResponse.model_validate(phone_user),
            claimed_existing_record=True,
        )

    user, claimed_existing = _finalize_player_signup_racesafe(db, name, email, payload.phone)
    token = create_access_token({"sub": user.id, "role": user.role.value})
    return PlayerSignupResponse(
        access_token=token,
        role=user.role,
        user=UserResponse.model_validate(user),
        claimed_existing_record=claimed_existing,
    )


@router.post("/claim-email", response_model=PlayerClaimEmailResponse)
def player_claim_email(payload: PlayerClaimEmailRequest, db: Session = Depends(get_db)):
    """
    One-time migration helper for players already in the system with a real phone number but a
    placeholder test email: lets them set their real email using the phone number alone (see
    PlayerClaimEmailRequest docstring for why no OTP is needed here). Shared, unauthenticated
    link by design.
    """
    user = db.query(models.User).filter(
        models.User.phone == payload.phone, models.User.role == models.UserRole.PLAYER
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="No player account found for this phone number.")

    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=409, detail="This email is already associated with another account.")

    user.email = payload.email
    _sync_athlete_contact(db, user, email=payload.email)
    db.commit()
    return PlayerClaimEmailResponse()


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
