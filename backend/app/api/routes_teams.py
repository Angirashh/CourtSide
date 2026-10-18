from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, ensure_tournament_access, get_db, require_organiser
from app.db import models
from app.schemas.tournament import TournamentTeamCreate, TournamentTeamResponse, TournamentTeamUpdate

router = APIRouter(prefix="/tournaments/{tournament_id}/teams", tags=["Tournament Teams"])


def _get_setup_tournament(tournament_id: str, current_user: CurrentUser, db: Session) -> models.Tournament:
    tournament = db.query(models.Tournament).filter(models.Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    ensure_tournament_access(tournament, current_user, db)
    if tournament.tournament_type != models.TournamentType.TEAM:
        raise HTTPException(status_code=400, detail="Teams can only be managed for team tournaments.")
    if tournament.status not in (models.TournamentStatus.DRAFT, models.TournamentStatus.SCHEDULING):
        raise HTTPException(status_code=400, detail="Teams can only be edited before the tournament starts.")
    return tournament


@router.post("", response_model=TournamentTeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    tournament_id: str,
    payload: TournamentTeamCreate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    tournament = _get_setup_tournament(tournament_id, current_user, db)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Team name cannot be blank.")
    if any(team.name.casefold() == name.casefold() for team in tournament.teams):
        raise HTTPException(status_code=409, detail="A team with this name already exists.")
    current_seeds = [team.seed for team in tournament.teams if team.seed is not None]
    team = models.TournamentTeam(tournament_id=tournament_id, name=name, seed=max(current_seeds, default=0) + 1)
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.patch("/{team_id}", response_model=TournamentTeamResponse)
def update_team(
    tournament_id: str,
    team_id: str,
    payload: TournamentTeamUpdate,
    current_user: CurrentUser = Depends(require_organiser),
    db: Session = Depends(get_db),
):
    tournament = _get_setup_tournament(tournament_id, current_user, db)
    team = db.query(models.TournamentTeam).filter(
        models.TournamentTeam.id == team_id,
        models.TournamentTeam.tournament_id == tournament_id,
    ).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        name = updates["name"].strip()
        if not name:
            raise HTTPException(status_code=422, detail="Team name cannot be blank.")
        duplicate = db.query(models.TournamentTeam).filter(
            models.TournamentTeam.tournament_id == tournament_id,
            models.TournamentTeam.id != team_id,
        ).all()
        if any(other.name.casefold() == name.casefold() for other in duplicate):
            raise HTTPException(status_code=409, detail="A team with this name already exists.")
        team.name = name
    if "captain_player_id" in updates:
        captain_id = updates["captain_player_id"]
        if captain_id is not None:
            captain = db.query(models.Player).filter(
                models.Player.id == captain_id,
                models.Player.tournament_id == tournament_id,
                models.Player.team_id == team_id,
                models.Player.is_placeholder == False,
                models.Player.is_withdrawn == False,
            ).first()
            if not captain:
                raise HTTPException(status_code=400, detail="Captain must be an eligible player on this team.")
        team.captain_player_id = captain_id
    if "seed" in updates:
        seed = updates["seed"]
        if seed is not None:
            duplicate_seed = db.query(models.TournamentTeam).filter(
                models.TournamentTeam.tournament_id == tournament_id,
                models.TournamentTeam.id != team_id,
                models.TournamentTeam.seed == seed,
            ).first()
            if duplicate_seed:
                duplicate_seed.seed = team.seed
        team.seed = seed

    db.commit()
    db.refresh(team)
    return team