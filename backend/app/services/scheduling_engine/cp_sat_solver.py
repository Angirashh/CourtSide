import collections
import math
from typing import List, Dict, Any
from ortools.sat.python import cp_model
from app.services.fixture_engine.datatypes import Match, MatchStage


class CourtScheduler:
    @staticmethod
    def schedule_matches(
        matches: List[Match],
        num_courts: int,
        match_duration: int = 35,
        rest_time: int = 25,
        court_hourly_cost: float = 40.0
    ) -> Dict[str, Any]:
        """
        Assigns matches to courts and time slots.
        Optimizes for both tournament duration (makespan) and court rental cost
        by de-ramping courts and booking each court only for its required window.
        """
        active_matches = [m for m in matches if not m.is_bye and not m.is_completed]
        if not active_matches:
            return {
                "status": "NO_ACTIVE_MATCHES",
                "makespan_minutes": 0,
                "total_cost": 0.0,
                "court_bookings": {},
                "schedule": []
            }

        horizon = len(active_matches) * (match_duration + rest_time)
        model = cp_model.CpModel()

        match_starts = {}
        match_ends = {}
        court_intervals = collections.defaultdict(list)
        player_intervals = collections.defaultdict(list)
        match_presences = {}

        # 1. Variables & Interval Setup
        for m in active_matches:
            start_var = model.NewIntVar(0, horizon, f"start_{m.id}")
            end_var = model.NewIntVar(0, horizon, f"end_{m.id}")
            model.NewIntervalVar(start_var, match_duration, end_var, f"interval_{m.id}")

            match_starts[m.id] = start_var
            match_ends[m.id] = end_var

            court_presences_for_m = []
            for c in range(1, num_courts + 1):
                presence = model.NewBoolVar(f"pres_{m.id}_C{c}")
                court_presences_for_m.append(presence)
                match_presences[(m.id, c)] = presence

                opt_interval = model.NewOptionalIntervalVar(
                    start_var, match_duration, end_var, presence, f"court_int_{m.id}_C{c}"
                )
                court_intervals[c].append(opt_interval)

            model.AddExactlyOne(court_presences_for_m)

            # Player rest intervals
            padded_end_var = model.NewIntVar(0, horizon + rest_time, f"padded_end_{m.id}")
            model.Add(padded_end_var == start_var + match_duration + rest_time)

            if m.player1_id and not str(m.player1_id).startswith("TBD"):
                p1_int = model.NewIntervalVar(start_var, match_duration + rest_time, padded_end_var, f"p1_{m.id}")
                player_intervals[m.player1_id].append(p1_int)

            if m.player2_id and not str(m.player2_id).startswith("TBD"):
                p2_int = model.NewIntervalVar(start_var, match_duration + rest_time, padded_end_var, f"p2_{m.id}")
                player_intervals[m.player2_id].append(p2_int)

        # 2. Overlap Constraints
        for c in range(1, num_courts + 1):
            model.AddNoOverlap(court_intervals[c])

        for pid, intervals in player_intervals.items():
            if len(intervals) > 1:
                model.AddNoOverlap(intervals)

        # 3. Round Precedence Constraints
        # GROUP-stage round-robin pairings are fixed in advance and don't depend on
        # other rounds' results, so a group's rounds are only chained against its
        # OWN matches -- this must never force one group to wait on another group's
        # matches just because they share the round number label, or courts sit
        # idle for no real reason. SWISS and KNOCKOUT rounds genuinely depend on the
        # previous round's results (next round's pairings/participants aren't known
        # until it finishes), so those stay globally synchronized across every court.
        group_matches = [m for m in active_matches if m.stage == MatchStage.GROUP]
        swiss_matches = [m for m in active_matches if m.stage == MatchStage.SWISS]
        knockout_matches = [m for m in active_matches if m.stage == MatchStage.KNOCKOUT]

        feeder_stage_end = None  # last group/swiss round's completion, gates knockout round 1

        if group_matches:
            by_group_round = collections.defaultdict(list)
            for m in group_matches:
                by_group_round[(m.group_id, m.round_num)].append(m)

            rounds_by_group = collections.defaultdict(set)
            for (gid, rnd) in by_group_round:
                rounds_by_group[gid].add(rnd)

            group_final_ends = []
            for gid, rounds in rounds_by_group.items():
                sorted_rounds = sorted(rounds)
                round_end_vars = {}
                for rnd in sorted_rounds:
                    ms = by_group_round[(gid, rnd)]
                    round_end = model.NewIntVar(0, horizon, f"grp_{gid}_r{rnd}_end")
                    model.AddMaxEquality(round_end, [match_ends[m.id] for m in ms])
                    round_end_vars[rnd] = round_end

                for i in range(len(sorted_rounds) - 1):
                    curr_end = round_end_vars[sorted_rounds[i]]
                    for m in by_group_round[(gid, sorted_rounds[i + 1])]:
                        model.Add(match_starts[m.id] >= curr_end + rest_time)

                group_final_ends.append(round_end_vars[sorted_rounds[-1]])

            feeder_stage_end = model.NewIntVar(0, horizon, "group_stage_end")
            model.AddMaxEquality(feeder_stage_end, group_final_ends)

        if swiss_matches:
            by_round = collections.defaultdict(list)
            for m in swiss_matches:
                by_round[m.round_num].append(m)
            sorted_rounds = sorted(by_round.keys())
            round_end_vars = {}
            for rnd in sorted_rounds:
                round_end = model.NewIntVar(0, horizon, f"swiss_r{rnd}_end")
                model.AddMaxEquality(round_end, [match_ends[m.id] for m in by_round[rnd]])
                round_end_vars[rnd] = round_end

            for i in range(len(sorted_rounds) - 1):
                curr_end = round_end_vars[sorted_rounds[i]]
                for m in by_round[sorted_rounds[i + 1]]:
                    model.Add(match_starts[m.id] >= curr_end + rest_time)

            feeder_stage_end = round_end_vars[sorted_rounds[-1]]

        if knockout_matches:
            by_round = collections.defaultdict(list)
            for m in knockout_matches:
                by_round[m.round_num].append(m)
            sorted_rounds = sorted(by_round.keys())
            round_end_vars = {}
            for rnd in sorted_rounds:
                round_end = model.NewIntVar(0, horizon, f"ko_r{rnd}_end")
                model.AddMaxEquality(round_end, [match_ends[m.id] for m in by_round[rnd]])
                round_end_vars[rnd] = round_end

            for i in range(len(sorted_rounds) - 1):
                curr_end = round_end_vars[sorted_rounds[i]]
                for m in by_round[sorted_rounds[i + 1]]:
                    model.Add(match_starts[m.id] >= curr_end + rest_time)

            if feeder_stage_end is not None:
                for m in by_round[sorted_rounds[0]]:
                    model.Add(match_starts[m.id] >= feeder_stage_end + rest_time)

        # 4. Court-Specific Booking Windows (Cost Efficiency)
        court_start_vars = {}
        court_end_vars = {}
        court_used_vars = {}
        court_durations = []

        court_packing_penalties = []

        for c in range(1, num_courts + 1):
            court_used = model.NewBoolVar(f"court_used_{c}")
            court_used_vars[c] = court_used

            c_start = model.NewIntVar(0, horizon, f"c_start_{c}")
            c_end = model.NewIntVar(0, horizon, f"c_end_{c}")
            court_start_vars[c] = c_start
            court_end_vars[c] = c_end

            # If match m is on court c, it constrains court start/end
            for m in active_matches:
                p = match_presences[(m.id, c)]
                # Link usage
                model.Add(court_used >= p)
                # Link window boundaries conditionally
                model.Add(c_start <= match_starts[m.id]).OnlyEnforceIf(p)
                model.Add(c_end >= match_ends[m.id]).OnlyEnforceIf(p)

                # Penalty: higher court index costs slightly more to force matches onto Court 1/2 first
                court_packing_penalties.append(p * (c * 5))

            # Duration for this specific court
            c_dur = model.NewIntVar(0, horizon, f"c_dur_{c}")
            model.Add(c_dur == c_end - c_start).OnlyEnforceIf(court_used)
            model.Add(c_dur == 0).OnlyEnforceIf(court_used.Not())
            court_durations.append(c_dur)

        # 5. Multi-Objective Function:
        # Primary: Minimize tournament makespan
        # Secondary: Minimize total court minutes booked across all courts
        # Tertiary: Pack lower court index numbers first
        makespan = model.NewIntVar(0, horizon, "makespan")
        model.AddMaxEquality(makespan, [match_ends[m.id] for m in active_matches])

        total_court_minutes = model.NewIntVar(0, horizon * num_courts, "total_court_minutes")
        model.Add(total_court_minutes == sum(court_durations))

        model.Minimize(
            (makespan * 100) +
            (total_court_minutes * 10) +
            sum(court_packing_penalties)
        )

        # 6. Solve
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(model)

        # 7. Structure Output with Booking Plan
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            schedule = []
            for m in active_matches:
                for c in range(1, num_courts + 1):
                    if solver.Value(match_presences[(m.id, c)]):
                        schedule.append({
                            "match_id": m.id,
                            "stage": m.stage.value,
                            "round_num": m.round_num,
                            "court_id": f"Court_{c}",
                            "start_minute": solver.Value(match_starts[m.id]),
                            "end_minute": solver.Value(match_ends[m.id])
                        })

            schedule.sort(key=lambda x: (x["start_minute"], x["court_id"]))

            # Calculate individual court booking windows & hourly cost
            court_bookings = {}
            total_billable_hours = 0.0

            for c in range(1, num_courts + 1):
                if solver.Value(court_used_vars[c]):
                    start_min = solver.Value(court_start_vars[c])
                    end_min = solver.Value(court_end_vars[c])
                    dur_min = end_min - start_min
                    # Venues usually bill rounded up to the nearest half-hour or hour
                    billed_hours = math.ceil(dur_min / 30) * 0.5  # 30-minute rounding
                    total_billable_hours += billed_hours

                    court_bookings[f"Court_{c}"] = {
                        "booked_from_minute": start_min,
                        "booked_until_minute": end_min,
                        "duration_minutes": dur_min,
                        "billed_hours": billed_hours,
                        "court_cost": billed_hours * court_hourly_cost
                    }

            total_cost = total_billable_hours * court_hourly_cost

            return {
                "status": solver.StatusName(status),
                "makespan_minutes": solver.Value(makespan),
                "total_court_minutes": solver.Value(total_court_minutes),
                "total_billable_hours": total_billable_hours,
                "total_cost": total_cost,
                "court_bookings": court_bookings,
                "schedule": schedule
            }

        return {
            "status": solver.StatusName(status),
            "makespan_minutes": 0,
            "total_cost": 0.0,
            "court_bookings": {},
            "schedule": []
        }