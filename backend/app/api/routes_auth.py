from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_current_user, get_db, require_organiser, require_superadmin
from app.core.security import create_access_token, generate_invite_code, hash_pin, verify_pin
from app.db import models
from app.schemas.auth import (
    CoOrganiserAddRequest,
    CoOrganiserResponse,
    OperatorCourtInfo,
    OperatorInviteRequest,
    OperatorInviteResponse,
    OperatorLogin,
    OperatorStatusResponse,
    OrganiserLogin,
    OrganiserSignup,
    OrganiserSignupResponse,
    PendingOrganiserResponse,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


def _find_user_by_identifier(identifier: str, db: Session) -> models.User:
    return db.query(models.User).filter(
        or_(models.User.email == identifier, models.User.phone == identifier)
    ).first()


# =====================================================================
# ORGANISER SIGNUP / LOGIN
# =====================================================================
@router.post("/organiser/signup", response_model=OrganiserSignupResponse, status_code=status.HTTP_201_CREATED)
def organiser_signup(payload: OrganiserSignup, db: Session = Depends(get_db)):
    """
    Registers an organiser's request for an account, identified by email and/or phone and
    secured with a PIN. The account starts unapproved and can't log in until a superadmin
    approves it from the pending-requests queue, so no token is issued here.
    """
    existing = None
    if payload.email:
        existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if not existing and payload.phone:
        existing = db.query(models.User).filter(models.User.phone == payload.phone).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email/phone already exists.")

    user = models.User(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        role=models.UserRole.ORGANISER,
        pin_hash=hash_pin(payload.pin),
        is_approved=False,
    )
    db.add(user)
    db.commit()

    return OrganiserSignupResponse()


@router.post("/organiser/login", response_model=TokenResponse)
def organiser_login(payload: OrganiserLogin, db: Session = Depends(get_db)):
    user = _find_user_by_identifier(payload.identifier, db)
    if not user or user.role != models.UserRole.ORGANISER or not user.pin_hash or not verify_pin(payload.pin, user.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your account is pending approval from the tournament admin.")

    token = create_access_token({"sub": user.id, "role": user.role.value})
    return TokenResponse(access_token=token, role=user.role, user=UserResponse.model_validate(user))


# =====================================================================
# ORGANISER APPROVAL QUEUE (SUPERADMIN ONLY)
# =====================================================================
@router.get("/organiser/pending", response_model=List[PendingOrganiserResponse])
def list_pending_organisers(
    current_user: CurrentUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Superadmin-only. Every organiser signup awaiting approval, oldest first."""
    return (
        db.query(models.User)
        .filter(models.User.role == models.UserRole.ORGANISER, models.User.is_approved == False)
        .order_by(models.User.created_at.asc())
        .all()
    )


@router.post("/organiser/{user_id}/approve", status_code=status.HTTP_200_OK)
def approve_organiser(
    user_id: str,
    current_user: CurrentUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Superadmin-only. Grants a pending organiser signup the ability to log in."""
    user = db.query(models.User).filter(models.User.id == user_id, models.User.role == models.UserRole.ORGANISER).first()
    if not user:
        raise HTTPException(status_code=404, detail="No such organiser request.")
    user.is_approved = True
    db.commit()
    return {"message": "Organiser approved."}


@router.post("/organiser/{user_id}/reject", status_code=status.HTTP_200_OK)
def reject_organiser(
    user_id: str,
    current_user: CurrentUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """
    Superadmin-only. Declines a pending organiser signup and removes the request. Safe to
    delete outright: a pending account owns no tournaments and was never able to log in.
    """
    user = db.query(models.User).filter(
        models.User.id == user_id, models.User.role == models.UserRole.ORGANISER, models.User.is_approved == False
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="No such organiser request.")
    db.delete(user)
    db.commit()
    return {"message": "Organiser request rejected."}


# =====================================================================
# OPERATOR INVITE / LOGIN
# =====================================================================
@router.post(
    "/tournaments/{tournament_id}/operators/invite",
    response_model=OperatorInviteResponse,
    status_code=status.HTTP_201_CREATED,
)
def invite_operator(
    tournament_id: str,
    payload: OperatorInviteRequest,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Organiser-only. Grants (or re-invites) someone as a court operator for this tournament,
    returning a one-time PIN they use to log in via /auth/operator/login.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.organiser_id and tournament.organiser_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tournament.")

    operator = None
    if payload.email:
        operator = db.query(models.User).filter(models.User.email == payload.email).first()
    if not operator and payload.phone:
        operator = db.query(models.User).filter(models.User.phone == payload.phone).first()

    if operator and operator.role != models.UserRole.OPERATOR:
        raise HTTPException(status_code=400, detail="This identifier already belongs to an organiser account.")

    if not operator:
        operator = models.User(
            name=payload.name,
            email=payload.email,
            phone=payload.phone,
            role=models.UserRole.OPERATOR,
        )
        db.add(operator)
        db.flush()

    invite_code = generate_invite_code()
    assignment = db.query(models.OperatorAssignment).filter(
        models.OperatorAssignment.operator_id == operator.id,
        models.OperatorAssignment.tournament_id == tournament_id,
    ).first()

    if assignment:
        assignment.pin_hash = hash_pin(invite_code)
        assignment.is_revoked = False
    else:
        assignment = models.OperatorAssignment(
            operator_id=operator.id,
            tournament_id=tournament_id,
            pin_hash=hash_pin(invite_code),
        )
        db.add(assignment)

    db.commit()

    return OperatorInviteResponse(
        operator_id=operator.id,
        name=operator.name,
        tournament_id=tournament_id,
        invite_code=invite_code,
    )


@router.get(
    "/tournaments/{tournament_id}/operators",
    response_model=List[OperatorStatusResponse],
)
def list_tournament_operators(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Organiser-only. Every operator invited to this tournament, with live busy/idle status."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.organiser_id and tournament.organiser_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tournament.")

    assignments = (
        db.query(models.OperatorAssignment)
        .options(joinedload(models.OperatorAssignment.operator))
        .filter(models.OperatorAssignment.tournament_id == tournament_id)
        .order_by(models.OperatorAssignment.created_at.desc())
        .all()
    )
    if not assignments:
        return []

    # Whichever match(es) are currently in progress on this tournament, keyed by the
    # operator who started them — that's how we tell "on Court 2" apart from "idle".
    active_matches = (
        db.query(models.Match)
        .options(joinedload(models.Match.court))
        .filter(
            models.Match.tournament_id == tournament_id,
            models.Match.status == models.MatchStatus.IN_PROGRESS,
            models.Match.operator_id.isnot(None),
        )
        .all()
    )
    busy_by_operator = {m.operator_id: m for m in active_matches}

    results = []
    for assignment in assignments:
        live_match = busy_by_operator.get(assignment.operator_id)
        results.append(
            OperatorStatusResponse(
                operator_id=assignment.operator_id,
                name=assignment.operator.name,
                email=assignment.operator.email,
                phone=assignment.operator.phone,
                invited_at=assignment.created_at,
                is_revoked=assignment.is_revoked,
                is_busy=live_match is not None,
                current_court=(
                    OperatorCourtInfo(id=live_match.court.id, name=live_match.court.name)
                    if live_match and live_match.court else None
                ),
                current_match_id=live_match.id if live_match else None,
            )
        )
    return results


@router.post(
    "/tournaments/{tournament_id}/operators/{operator_id}/revoke",
    status_code=status.HTTP_200_OK,
)
def revoke_operator(
    tournament_id: str,
    operator_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Organiser-only. Immediately invalidates an operator's access to this tournament."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.organiser_id and tournament.organiser_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tournament.")

    assignment = db.query(models.OperatorAssignment).filter(
        models.OperatorAssignment.operator_id == operator_id,
        models.OperatorAssignment.tournament_id == tournament_id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="No such operator assignment for this tournament.")

    assignment.is_revoked = True
    db.commit()
    return {"message": "Operator access revoked."}



# =====================================================================
# CO-ORGANISER MANAGEMENT
# =====================================================================
@router.get(
    "/tournaments/{tournament_id}/co-organisers",
    response_model=List[CoOrganiserResponse],
)
def list_co_organisers(
    tournament_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Anyone with access to this tournament (owner or co-organiser) can see who else has it."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    rows = (
        db.query(models.TournamentCoOrganiser)
        .options(joinedload(models.TournamentCoOrganiser.organiser))
        .filter(models.TournamentCoOrganiser.tournament_id == tournament_id)
        .order_by(models.TournamentCoOrganiser.added_at.asc())
        .all()
    )
    return [
        CoOrganiserResponse(
            organiser_id=row.organiser_id,
            name=row.organiser.name,
            email=row.organiser.email,
            phone=row.organiser.phone,
            added_at=row.added_at,
        )
        for row in rows
    ]


@router.post(
    "/tournaments/{tournament_id}/co-organisers",
    response_model=CoOrganiserResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_co_organiser(
    tournament_id: str,
    payload: CoOrganiserAddRequest,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """
    Grants an existing, approved organiser account the same standing as the tournament's
    owner — full fixtures/roster/schedule/operator access. Unlike operators, co-organisers
    already have their own login, so this is a lookup + grant, not a PIN issuance.
    """
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    target = _find_user_by_identifier(payload.identifier, db)
    if not target or target.role != models.UserRole.ORGANISER:
        raise HTTPException(status_code=404, detail="No organiser account found with that email/phone.")
    if not target.is_approved:
        raise HTTPException(status_code=400, detail=f"{target.name}'s organiser account is still pending approval.")
    if target.id == tournament.organiser_id or target.id == current_user.id:
        raise HTTPException(status_code=400, detail=f"{target.name} already has access to this tournament.")

    existing = db.query(models.TournamentCoOrganiser).filter(
        models.TournamentCoOrganiser.tournament_id == tournament_id,
        models.TournamentCoOrganiser.organiser_id == target.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"{target.name} already has access to this tournament.")

    row = models.TournamentCoOrganiser(tournament_id=tournament_id, organiser_id=target.id)
    db.add(row)
    db.commit()

    return CoOrganiserResponse(
        organiser_id=target.id, name=target.name, email=target.email, phone=target.phone, added_at=row.added_at
    )


@router.delete(
    "/tournaments/{tournament_id}/co-organisers/{organiser_id}",
    status_code=status.HTTP_200_OK,
)
def remove_co_organiser(
    tournament_id: str,
    organiser_id: str,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    """Anyone with access to this tournament can remove a co-organiser (including themselves)."""
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    ensure_tournament_access(tournament, current_user, db)

    row = db.query(models.TournamentCoOrganiser).filter(
        models.TournamentCoOrganiser.tournament_id == tournament_id,
        models.TournamentCoOrganiser.organiser_id == organiser_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="No such co-organiser for this tournament.")
    db.delete(row)
    db.commit()
    return {"message": "Co-organiser access removed."}


@router.post("/operator/login", response_model=TokenResponse)
def operator_login(payload: OperatorLogin, db: Session = Depends(get_db)):
    operator = _find_user_by_identifier(payload.identifier, db)
    if not operator or operator.role != models.UserRole.OPERATOR:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    assignment = db.query(models.OperatorAssignment).filter(
        models.OperatorAssignment.operator_id == operator.id,
        models.OperatorAssignment.tournament_id == payload.tournament_id,
        models.OperatorAssignment.is_revoked == False,
    ).first()
    if not assignment or not verify_pin(payload.pin, assignment.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    token = create_access_token({
        "sub": operator.id,
        "role": operator.role.value,
        "tournament_id": payload.tournament_id,
    })
    return TokenResponse(
        access_token=token,
        role=operator.role,
        user=UserResponse.model_validate(operator),
        tournament_id=payload.tournament_id,
    )


# =====================================================================
# CURRENT SESSION
# =====================================================================
@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
