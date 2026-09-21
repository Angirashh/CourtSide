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


class MatchStatus(enum.Enum):
    SCHEDULED = "SCHEDULED"      # Has a court/time slot, not yet underway
    IN_PROGRESS = "IN_PROGRESS"  # An operator has started it on court
    COMPLETED = "COMPLETED"      # Score submitted (or resolved as a bye)


class UserRole(enum.Enum):
    ORGANISER = "ORGANISER"
    OPERATOR = "OPERATOR"


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

    id = Column(String, primary_key=True, default=lambda: f"USR_{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    phone = Column(String, unique=True, index=True, nullable=True)
    role = Column(Enum(UserRole), nullable=False)

    # Only set for ORGANISER accounts; operators log in via OperatorAssignment.pin_hash instead.
    pin_hash = Column(String, nullable=True)

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


# =====================================================================
# TOURNAMENT & COURT MODELS
# =====================================================================
class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(String, primary_key=True, default=lambda: f"TOURN_{uuid.uuid4().hex[:8]}")
    name = Column(String, nullable=False)
    format = Column(Enum(TournamentFormat), nullable=False)
    status = Column(Enum(TournamentStatus), default=TournamentStatus.DRAFT)
    category = Column(Enum(TournamentCategory), nullable=True)

    venue = Column(String, nullable=True)
    tournament_date = Column(Date, nullable=True)

    match_duration_minutes = Column(Integer, default=15)
    rest_time_minutes = Column(Integer, default=10)

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
    courts = relationship("Court", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="tournament", cascade="all, delete-orphan")
    operator_assignments = relationship(
        "OperatorAssignment", back_populates="tournament", cascade="all, delete-orphan"
    )


class Court(Base):
    __tablename__ = "courts"

    id = Column(String, primary_key=True, default=lambda: f"CRT_{uuid.uuid4().hex[:8]}")
    tournament_id = Column(String, ForeignKey("tournaments.id"), nullable=False)
    name = Column(String, nullable=False)
    hourly_rate = Column(Float, default=0.0)

    # Relationships
    tournament = relationship("Tournament", back_populates="courts")
    matches = relationship("Match", back_populates="court")


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

    player1 = relationship("Player", foreign_keys=[player1_id])
    player2 = relationship("Player", foreign_keys=[player2_id])
    winner = relationship("Player", foreign_keys=[winner_id])