import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Enum,
    JSON,
    Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


# =====================================================================
# ENUMS
# =====================================================================
class TournamentFormat(enum.Enum):
    GROUP_KNOCKOUT = "GROUP_KNOCKOUT"
    SWISS_KNOCKOUT = "SWISS_KNOCKOUT"
    KNOCKOUT = "KNOCKOUT"
    TEAM_FRIENDLY = "TEAM_FRIENDLY"


class TournamentType(str, enum.Enum):
    INDIVIDUAL = "INDIVIDUAL"
    TEAM = "TEAM"


class TournamentCategory(enum.Enum):
    CORPORATE = "CORPORATE"
    COLLEGE = "COLLEGE"
    JUNIOR = "JUNIOR"
    FRIENDLY = "FRIENDLY"


class TournamentStatus(enum.Enum):
    DRAFT = "DRAFT"              # Registering players, configuring courts
    SCHEDULING = "SCHEDULING"    # CP-SAT solver running
    IN_PROGRESS = "IN_PROGRESS"  # Matches active
    COMPLETED = "COMPLETED"      # Champion crowned, points awarded


class MatchStage(enum.Enum):
    GROUP = "GROUP"
    SWISS = "SWISS"
    KNOCKOUT = "KNOCKOUT"
    CROSSOVER = "CROSSOVER"


class MatchStatus(enum.Enum):
    SCHEDULED = "SCHEDULED"      # Has a court/time slot, not yet underway
    IN_PROGRESS = "IN_PROGRESS"  # An operator has started it on court
    COMPLETED = "COMPLETED"      # Score submitted (or resolved as a bye)


class RegistrationStatus(str, enum.Enum):
    NOT_OPEN = "NOT_OPEN"  # Organiser hasn't opened registration yet
    OPEN = "OPEN"          # Players can self-register right now
    CLOSED = "CLOSED"      # Organiser closed it manually, or the roster cap was reached


class UserRole(enum.Enum):
    ORGANISER = "ORGANISER"
    OPERATOR = "OPERATOR"
    PLAYER = "PLAYER"


# =====================================================================
# AUTH: USERS & OPERATOR ASSIGNMENTS
# =====================================================================
class User(Base):
    """
    Login identity for both organisers and court operators.
    Organisers authenticate with just their own PIN. Operators are invited
    per-tournament and authenticate with a tournament-scoped invite PIN
    (see OperatorAssignment).
    """
    __tablename__ = "users"
    __table_args__ = (
        # Unique per ROLE rather than globally -- lets the same person hold an ORGANISER
        # account and a separate PLAYER account on the same email/phone (e.g. an organiser who
        # also wants to play), while still preventing two accounts of the *same* role from
        # colliding on contact info. See ensure_user_contact_unique_per_role in migrations.py
        # for the matching index rename on already-deployed databases.
        Index("ix_users_email_role", "email", "role", unique=True),
        Index("ix_users_phone_role", "phone", "role", unique=True),
    )

    id = Column(String, primary_key=True, default=lambda: f"USR_{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    # PLAYER accounts only — collected separately at signup; `name` is kept in sync as
    # "{first_name} {last_name}" so ORGANISER/OPERATOR code that only ever reads `name` still works.
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, index=True, nullable=True)
    phone = Column(String, index=True, nullable=True)
    role = Column(Enum(UserRole), nullable=False)

    # Only set for ORGANISER accounts; operators log in via OperatorAssignment.pin_hash instead.
    # PLAYER accounts authenticate via Google sign-in and never set this.
    pin_hash = Column(String, nullable=True)

    # Gate on self-service ORGANISER signup: new signups default to False and can't log in
    # until a superadmin approves them. Defaults True at the column level so it never locks
    # out operators (invited directly, never self-signed-up) or organiser rows that existed
    # before this flag was introduced. PLAYER accounts are always auto-approved.
    is_approved = Column(Boolean, default=True, nullable=False)
    # Grants access to the pending-organiser approval queue. Not exposed via any signup path —
    # only ever set directly in the database.
    is_superadmin = Column(Boolean, default=False, nullable=False)

    # PLAYER accounts only. Links to the global athlete registry — set at login, either by
    # claiming a pre-existing Athlete (an organiser already added them via manual add/CSV
    # before they ever signed in) or by creating a fresh one. NULL for ORGANISER/OPERATOR rows.
    athlete_id = Column(String, ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    operator_assignments = relationship(
        "OperatorAssignment", back_populates="operator", cascade="all, delete-orphan"
    )
    organised_tournaments = relationship("Tournament", back_populates="organiser")


class OperatorAssignment(Base):
    """Grants a User(role=OPERATOR) the ability to log in and score matches for one tournament."""
    __tablename__ = "operator_assignments"
    __table_args__ = (
        Index("ix_operator_assignment_unique", "operator_id", "tournament_id", unique=True),
    )

    id = Column(String, primary_key=True, default=lambda: f"OPA_{uuid.uuid4().hex[:8]}")
    operator_id = Column(String, ForeignKey("users.id"), nullable=False)
    tournament_id = Column(String, ForeignKey("tournaments.id"), nullable=False)

    pin_hash = Column(String, nullable=False)
    is_revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    operator = relationship("User", back_populates="operator_assignments")
    tournament = relationship("Tournament", back_populates="operator_assignments")


class TournamentCoOrganiser(Base):
    """
    Grants a second ORGANISER account the same standing as the tournament's creator: full
    fixtures/roster/schedule/operator management, not a reduced role. Unlike OperatorAssignment,
    there's no PIN here — co-organisers already have their own login, this just links their
    existing account to someone else's tournament.
    """
    __tablename__ = "tournament_co_organisers"
    __table_args__ = (
        Index("ix_tournament_co_organiser_unique", "tournament_id", "organiser_id", unique=True),
    )

    id = Column(String, primary_key=True, default=lambda: f"COORG_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id"), nullable=False)
    organiser_id = Column(String, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)

    tournament = relationship("Tournament", back_populates="co_organisers")
    organiser = relationship("User")


# =====================================================================
# GLOBAL ATHLETE MODEL (PERSISTENT ACROSS ALL TOURNAMENTS)
# =====================================================================
class Athlete(Base):
    """
    Global athlete registry. Stores lifetime statistics, contact info
    for Google Forms / registration deduplication, and overall ranking points.
    """
    __tablename__ = "athletes"

    id = Column(String, primary_key=True, default=lambda: f"ATH_{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    phone = Column(String, unique=True, index=True, nullable=True)
    club_or_city = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    dominant_hand = Column(String, nullable=True)
    preferred_format = Column(String, nullable=True)  # comma-separated; read via preferred_formats below
    bio = Column(String, nullable=True)

    # Global Career Statistics
    ranking_points = Column(Float, default=0.0, index=True)
    tournaments_played = Column(Integer, default=0)
    matches_played = Column(Integer, default=0)
    matches_won = Column(Integer, default=0)
    matches_lost = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tournament_entries = relationship("Player", back_populates="athlete")

    @property
    def preferred_formats(self) -> list:
        """Read-side view of the comma-separated `preferred_format` column as a list, so every
        response path (including plain `from_attributes` serialization in list/create routes)
        gets the multi-select shape for free without duplicating the split logic."""
        return self.preferred_format.split(",") if self.preferred_format else []


# =====================================================================
# TOURNAMENT & COURT MODELS
# =====================================================================
class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(String, primary_key=True, default=lambda: f"TOURN_{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    # TEAM_FRIENDLY remains the legacy two-side individual event.
    tournament_type = Column(Enum(TournamentType, native_enum=False), default=TournamentType.INDIVIDUAL, nullable=False)
    format = Column(Enum(TournamentFormat), nullable=False)
    event_formats = Column(JSON, nullable=True)
    team_config = Column(JSON, nullable=True)
    status = Column(Enum(TournamentStatus), default=TournamentStatus.DRAFT)
    category = Column(Enum(TournamentCategory), nullable=True)

    venue = Column(String, nullable=True)
    venue_link = Column(String, nullable=True)
    tournament_date = Column(Date, nullable=True)

    match_duration_minutes = Column(Integer, default=15)
    rest_time_minutes = Column(Integer, default=10)

    # Public self-registration gate, independent of `status` -- an organiser can keep a
    # DRAFT/SCHEDULING tournament out of public view while still setting it up, then flip
    # this to OPEN when ready, and it auto-flips to CLOSED the moment the roster cap is hit
    # (see `_auto_close_registration_if_full` in routes_players.py). Plain string column
    # (not a native Postgres enum) so adding future statuses never needs an `ALTER TYPE`.
    # Defaults to OPEN so every existing tournament (created before this flag existed, when
    # registration was implicitly always open at DRAFT/SCHEDULING) keeps behaving as before.
    registration_status = Column(String, default=RegistrationStatus.OPEN.value, nullable=False)
    # Optional roster cap shown as a public "X / Y players registered" progress bar.
    # NULL means uncapped.
    max_players = Column(Integer, nullable=True)

    # Shuttle economics: a shuttle wears out after a fixed number of matches,
    # so cost scales with how many matches actually get played, not with time.
    shuttle_cost = Column(Float, default=220.0)
    shuttle_matches_per_unit = Column(Integer, default=3)

    # Snapshot of the most recent CP-SAT run: makespan, per-court booking windows,
    # and the cost-vs-flat-booking comparison. Rebuilt each time the schedule is (re)generated.
    schedule_summary = Column(JSON, nullable=True)

    # Owning organiser. Nullable to tolerate rows created before auth existed;
    # ownership checks treat NULL as unowned/legacy rather than forbidden.
    organiser_id = Column(String, ForeignKey("users.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organiser = relationship("User", back_populates="organised_tournaments")
    players = relationship("Player", back_populates="tournament", cascade="all, delete-orphan")
    teams = relationship("TournamentTeam", back_populates="tournament", cascade="all, delete-orphan")
    team_ties = relationship("TeamTie", back_populates="tournament", cascade="all, delete-orphan")
    courts = relationship("Court", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="tournament", cascade="all, delete-orphan")
    operator_assignments = relationship(
        "OperatorAssignment", back_populates="tournament", cascade="all, delete-orphan"
    )
    co_organisers = relationship(
        "TournamentCoOrganiser", back_populates="tournament", cascade="all, delete-orphan"
    )


class Court(Base):
    __tablename__ = "courts"

    id = Column(String, primary_key=True, default=lambda: f"CRT_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String, nullable=False)
    hourly_rate = Column(Float, default=0.0)

    # Minutes after the tournament's chosen kickoff time that this specific court actually opens
    # up — e.g. 3 courts are free from 1:00pm but a 4th isn't booked until 1:30pm, so that one
    # gets 30. Fed into the CP-SAT solver at schedule-generation time as a hard floor on when a
    # match may start on this court; 0 (the default) means "available from the tournament start,
    # same as every other court," which is every court's behavior before this field existed.
    available_from_minutes = Column(Integer, default=0, nullable=False)

    # Relationships
    tournament = relationship("Tournament", back_populates="courts")
    matches = relationship("Match", back_populates="court")


class TournamentTeam(Base):
    __tablename__ = "tournament_teams"

    id = Column(String, primary_key=True, default=lambda: f"TEAM_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    seed = Column(Integer, nullable=True)
    captain_player_id = Column(String, nullable=True)

    tournament = relationship("Tournament", back_populates="teams")
    players = relationship("Player", back_populates="tournament_team")

    @property
    def player_ids(self):
        return [player.id for player in self.players]


class TeamTie(Base):
    """A format-level fixture between two tournament teams."""
    __tablename__ = "team_ties"

    id = Column(String, primary_key=True, default=lambda: f"TIE_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False, index=True)
    stage = Column(Enum(MatchStage, native_enum=False), nullable=False)
    round_num = Column(Integer, nullable=False)
    group_id = Column(String, nullable=True)
    # Strings intentionally allow unresolved knockout placeholders (TBD_*).
    team1_id = Column(String, nullable=True, index=True)
    team2_id = Column(String, nullable=True, index=True)
    winner_team_id = Column(String, ForeignKey("tournament_teams.id", ondelete="SET NULL"), nullable=True)
    is_draw = Column(Boolean, default=False, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    lineups_locked = Column(Boolean, default=False, nullable=False)

    tournament = relationship("Tournament", back_populates="team_ties")
    games = relationship("TeamTieGame", back_populates="tie", cascade="all, delete-orphan", order_by="TeamTieGame.order_num")


class TeamTieGame(Base):
    """One scheduled singles/doubles game inside a team tie."""
    __tablename__ = "team_tie_games"

    id = Column(String, primary_key=True, default=lambda: f"TG_{uuid.uuid4().hex[:8]}")
    tie_id = Column(String, ForeignKey("team_ties.id", ondelete="CASCADE"), nullable=False, index=True)
    order_num = Column(Integer, nullable=False)
    match_type = Column(String, nullable=False)  # SINGLES or DOUBLES
    team1_player_ids = Column(JSON, nullable=True)
    team2_player_ids = Column(JSON, nullable=True)
    winner_team_id = Column(String, ForeignKey("tournament_teams.id", ondelete="SET NULL"), nullable=True)
    scores = Column(JSON, nullable=True)
    court_id = Column(String, ForeignKey("courts.id", ondelete="SET NULL"), nullable=True)
    scheduled_start_time = Column(DateTime, nullable=True)
    scheduled_end_time = Column(DateTime, nullable=True)
    actual_start_time = Column(DateTime, nullable=True)
    actual_end_time = Column(DateTime, nullable=True)
    status = Column(Enum(MatchStatus, native_enum=False), default=MatchStatus.SCHEDULED, nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False)
    is_skipped = Column(Boolean, default=False, nullable=False)
    operator_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    tie = relationship("TeamTie", back_populates="games")
    court = relationship("Court")
    operator = relationship("User")


# =====================================================================
# TOURNAMENT PLAYER (ROSTER / SLOT MODEL)
# =====================================================================
class Player(Base):
    """
    Tournament-specific roster slot.
    - If a real athlete registered, `athlete_id` points to `athletes.id`.
    - If a TBD placeholder for elimination rounds, `athlete_id` is NULL.
    """
    __tablename__ = "players"

    id = Column(String, primary_key=True, default=lambda: f"P_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id"), nullable=False)
    athlete_id = Column(String, ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True)

    name = Column(String, nullable=False)  # Display name or "TBD_Seed_1"
    seed = Column(Integer, nullable=True)
    is_placeholder = Column(Boolean, default=False)

    # TEAM_FRIENDLY format only: which side of the 2-team split this player is on ("A"/"B").
    # How many matches each player plays is a single tournament-wide number set at schedule
    # generation time (ScheduleGenerationRequest.matches_per_player), not stored per player.
    team = Column(String, nullable=True)
    # TEAM_FRIENDLY format only: at most one captain per team, enforced at the API layer.
    is_captain = Column(Boolean, nullable=False, default=False)
    team_id = Column(String, ForeignKey("tournament_teams.id", ondelete="SET NULL"), nullable=True, index=True)

    # Tournament-specific awards
    ranking_points_earned = Column(Float, default=0.0)
    final_placement = Column(Integer, nullable=True)  # 1 = Champion, 2 = Runner-up, etc.

    # Withdrawal (injury / emergency / no-show before their match is played)
    is_withdrawn = Column(Boolean, default=False)
    withdrawn_at = Column(DateTime, nullable=True)
    withdrawal_reason = Column(String, nullable=True)

    # Relationships
    tournament = relationship("Tournament", back_populates="players")
    athlete = relationship("Athlete", back_populates="tournament_entries")
    tournament_team = relationship("TournamentTeam", back_populates="players")


# =====================================================================
# MATCH MODEL
# =====================================================================
class Match(Base):
    __tablename__ = "matches"

    id = Column(String, primary_key=True, default=lambda: f"M_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id"), nullable=False)

    stage = Column(Enum(MatchStage), nullable=False)
    round_num = Column(Integer, nullable=False)
    group_id = Column(String, nullable=True)

    # References the tournament-specific roster slot (players.id)
    player1_id = Column(String, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    player2_id = Column(String, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)
    winner_id = Column(String, ForeignKey("players.id", ondelete="SET NULL"), nullable=True)

    # Scheduling
    court_id = Column(String, ForeignKey("courts.id", ondelete="SET NULL"), nullable=True)
    scheduled_start_time = Column(DateTime, nullable=True)
    scheduled_end_time = Column(DateTime, nullable=True)

    # Match state
    status = Column(Enum(MatchStatus), default=MatchStatus.SCHEDULED, nullable=False)
    actual_start_time = Column(DateTime, nullable=True)  # Set when an operator starts the match on court
    actual_end_time = Column(DateTime, nullable=True)    # Set when the score is submitted
    is_completed = Column(Boolean, default=False)
    is_bye = Column(Boolean, default=False)
    is_walkover = Column(Boolean, default=False)  # Auto-resolved because one participant withdrew
    scores = Column(JSON, nullable=True)  # e.g., [{"p1": 21, "p2": 18}, {"p1": 21, "p2": 15}]

    # Whoever tapped "Start match" on court — lets the organiser see which operator
    # is currently busy (and where) vs. idle. Left set after completion as an audit trail.
    operator_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    tournament = relationship("Tournament", back_populates="matches")
    court = relationship("Court", back_populates="matches")
    operator = relationship("User", foreign_keys=[operator_id])

    @property
    def operator_role(self):
        return self.operator.role if self.operator else None

    player1 = relationship("Player", foreign_keys=[player1_id])
    player2 = relationship("Player", foreign_keys=[player2_id])
    winner = relationship("Player", foreign_keys=[winner_id])
