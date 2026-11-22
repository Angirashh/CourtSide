# API Reference

All endpoints are served by the FastAPI backend (`backend/app/api/routes_*.py`) under the
`settings.API_V1_STR` prefix (`/api/v1`), and consumed by the frontend (`frontend/src/hooks/*.ts`)
through React Query. "Sync vs async" below is used in two distinct senses that both matter for
this app, kept in separate columns:

- **Handler type (backend)** — whether the FastAPI route is declared `def` (sync; runs in
  Starlette's thread pool) or `async def` (runs on the event loop). Only two routes in this
  codebase are `async def` — everything else is sync.
- **Frontend call pattern** — how the UI triggers the request: a one-shot fetch (on mount or user
  action), a recurring poll (`refetchInterval`), or a true push channel (SSE), as opposed to a
  blocking/"synchronous-feeling" user action like a form submit.

## Backend handler types

| Route | Handler | Why |
|---|---|---|
| `GET /public/tournaments/{id}/events` (`routes_public.py`) | `async def stream_tournament_events` | SSE stream — holds a connection open for the tournament's lifetime, subscribing to the in-process `live_listener` registry fed by Postgres `LISTEN`/`NOTIFY`. Must be async so it can `await` on the next queued event without blocking a worker thread. |
| `POST /tournaments/{id}/players/upload` (`routes_players.py`) | `async def upload_roster_file` | Reads an uploaded file (`UploadFile.read()` is a coroutine). |
| Every other route (~70 endpoints) | `def` | Plain SQLAlchemy `Session` work — FastAPI runs these in a thread pool, so DB calls block the thread but not the event loop. No endpoint here does other async I/O, so there was no reason to mark the rest `async def`. |

## Backend endpoints by resource

### Auth — `/auth` (`routes_auth.py`)
| Method & path | Notes |
|---|---|
| `POST /auth/organiser/signup` | |
| `POST /auth/organiser/login` | |
| `GET /auth/organiser/pending` | superadmin only |
| `POST /auth/organiser/{user_id}/approve` | superadmin only |
| `POST /auth/organiser/{user_id}/reject` | superadmin only |
| `POST /auth/tournaments/{tournament_id}/operators/invite` | |
| `GET /auth/tournaments/{tournament_id}/operators` | |
| `POST /auth/tournaments/{tournament_id}/operators/{operator_id}/revoke` | |
| `GET /auth/tournaments/{tournament_id}/co-organisers` | |
| `POST /auth/tournaments/{tournament_id}/co-organisers` | |
| `DELETE /auth/tournaments/{tournament_id}/co-organisers/{organiser_id}` | |
| `POST /auth/operator/login` | |
| `GET /auth/me` | polled every 30s while a session is open (`use-auth.ts`) to pick up a role/approval change without requiring re-login |

### Player auth — `/auth/player` (`routes_player_auth.py`)
| Method & path | Notes |
|---|---|
| `POST /auth/player/google` | |
| `POST /auth/player/google/complete-signup` | |
| `GET /auth/player/registrations` | |

### Tournaments — `/tournaments` (`routes_tournaments.py`)
| Method & path | Notes |
|---|---|
| `POST /tournaments` | |
| `GET /tournaments` | |
| `GET /tournaments/{id}` | |
| `PATCH /tournaments/{id}` | |
| `POST /tournaments/{id}/generate-schedule` | also sends a `pg_notify` (see Real-time below) |
| `DELETE /tournaments/{id}` | |
| `POST /tournaments/{id}/start` | also notifies |
| `POST /tournaments/{id}/end` | also notifies; the one moment athlete career stats + profile cache are updated |
| `POST /tournaments/{id}/finalize-seeding` | |

### Players — `/tournaments/{tournament_id}/players` (`routes_players.py`)
| Method & path | Notes |
|---|---|
| `GET .../search-existing` | |
| `GET .../import-candidates` | |
| `POST .../import` | |
| `POST .../` (register) | |
| `POST .../self-register` | |
| `GET .../me/next-match` | polled every 5s while viewing the live tournament page (`LIVE_POLL_MS`, same cadence as the rest of that page) |
| `POST .../batch` | |
| `GET .../` (list) | |
| `PATCH .../team-assignments` | |
| `PATCH .../team-id-assignments` | |
| `PATCH .../{player_id}` | |
| `DELETE .../{player_id}` | |
| `DELETE .../` (delete all) | |
| `POST .../upload` | **async handler** — file upload |
| `POST .../{player_id}/withdraw` | also notifies; resolves pending walkovers in the same transaction |

### Teams — `/tournaments/{tournament_id}/teams` (`routes_teams.py`)
| Method & path | Notes |
|---|---|
| `POST .../` | |
| `PATCH .../{team_id}` | |

### Team ties — (`routes_team_ties.py`, no shared prefix — paths are explicit)
| Method & path | Notes |
|---|---|
| `GET /tournaments/{id}/team-ties` | polled every 5s while open (`useTeamTies`) |
| `GET /players/me/team-ties` | polled every 8s while open (`useMyTeamTies`) |
| `POST /tournaments/{id}/team-ties/{tie_id}/lineup` | |
| `POST /tournaments/{id}/team-ties/{tie_id}/lock` | |
| `POST /tournaments/{id}/team-ties/{tie_id}/unlock` | |
| `POST /team-games/{game_id}/start` | also notifies |
| `POST /team-games/{game_id}/score` | also notifies |

### Courts — `/tournaments/{tournament_id}/courts` (`routes_courts.py`)
| Method & path | Notes |
|---|---|
| `POST .../` | |
| `PATCH .../{court_id}` | |
| `DELETE .../{court_id}` | |
| `PATCH .../{court_id}/reschedule` | also notifies |

### Matches — (`routes_matches.py`, explicit paths)
| Method & path | Notes |
|---|---|
| `GET /tournaments/{id}/matches` | |
| `GET /matches/{match_id}` | |
| `POST /matches/{match_id}/start` | also notifies |
| `POST /matches/{match_id}/score` | also notifies |
| `POST /matches/{match_id}/no-result` | also notifies |
| `PATCH /matches/{match_id}/score` | also notifies |

### Athletes & leaderboard — `/athletes` (`routes_athletes.py`)
| Method & path | Notes |
|---|---|
| `GET /athletes/leaderboard` | |
| `GET /athletes` | |
| `POST /athletes` | |
| `GET /athletes/me` | served from the in-process exact-invalidation cache (`athlete_cache.py`) |
| `PATCH /athletes/me` | invalidates `athlete_cache` for this athlete |
| `GET /athletes/{id}` | also cached |
| `PATCH /athletes/{id}` | invalidates `athlete_cache` |

### Public showcase — `/public` (`routes_public.py`, no auth)
| Method & path | Notes |
|---|---|
| `GET /public/tournaments` | polled every 5s (`LIVE_POLL_MS`) — the browse/list page has no push channel |
| `GET /public/tournaments/{id}` | SSE-driven; polled every 45s as a backstop (`LIVE_PAGE_BACKSTOP_MS`) |
| `GET /public/tournaments/{id}/events` | **async handler**, SSE stream — see Real-time below |
| `GET /public/tournaments/{id}/standings` | SSE-driven; 45s backstop poll |
| `GET /public/tournaments/{id}/team-standings` | SSE-driven; 45s backstop poll |
| `GET /public/stats` | polled every 10s (`STATS_POLL_MS`) |

## Real-time push: Postgres LISTEN/NOTIFY + SSE

A handful of mutating routes (marked "also notifies" above) call
`live_updates.notify_tournament_changed(db, tournament_id)` immediately before their `db.commit()`,
which runs `pg_notify('tournament_updates', tournament_id)` in the same transaction (no-ops on
SQLite, so local dev/tests are unaffected). A single background task
(`live_listener.run_listener`, started in `main.py`'s lifespan) holds one dedicated `LISTEN`
connection and fans each notification out to any locally-subscribed SSE queues for that
tournament. The frontend's `useLiveTournamentEvents` hook (`use-public.ts`) opens one
`EventSource` per tournament and, on each message, calls `queryClient.invalidateQueries` for that
tournament's detail/standings/team-standings keys — the SSE message itself carries no payload,
it's just a wake-up that triggers a normal REST refetch. This connection is skipped entirely once
a tournament's status is `COMPLETED` (nothing can mutate it again), to avoid holding idle
connections open indefinitely on completed-tournament pages.

## Frontend call patterns

| Pattern | Where | Examples |
|---|---|---|
| **One-shot fetch** (`useQuery`, no interval) | Most reads: tournament lists for an organiser, match lists, roster search, leaderboard, co-organiser/operator lists | `useMatches`, `useAthletes`, `useCoOrganisers` |
| **Mutation** (`useMutation`, fired by a user action) | Every write — create/update/delete tournament, start/score a match, register a player, etc. | `useStartMatch`, `useSubmitMatchScore`, `useUpdateTournament` |
| **Polling** (`refetchInterval`) | Pages with no push channel, or as a backstop under SSE | `usePublicTournaments` (5s), `usePublicHubStats` (10s), `useTeamTies` (5s), `useMyTeamTies` (8s), `useMyNextMatch` (5s), operator's `useTournament` with `refetchInterval: 10_000`, `useCurrentUser` (30s), `usePublicTournament`/`usePublicStandings`/`usePublicTeamStandings` (45s backstop) |
| **Push (SSE)** | Single live tournament page only | `useLiveTournamentEvents` → `GET /public/tournaments/{id}/events` |

Note on terminology: every React Query call is technically asynchronous JavaScript (fetch is
non-blocking either way) — the meaningful distinction for this app is *why* a request fires:
once on demand (fetch/mutation), on a timer (poll), or pushed by the server (SSE).
