import httpx
import sys
import time

BASE_URL = "http://127.0.0.1:8000/api/v1"

# ⚠️ REPLACE THIS WITH YOUR ACTUAL TOURNAMENT ID
TOURNAMENT_ID = "TOURN_285c861c"

# ⚠️ Organiser credentials used to drive tournament setup (create if they don't exist yet)
ORGANISER_IDENTIFIER = "dev-organiser@example.com"
ORGANISER_PIN = "1234"


def get_organiser_token(client: httpx.Client) -> str:
    """Logs in as the dev organiser, signing up on first run."""
    res = client.post("/auth/organiser/login", json={"identifier": ORGANISER_IDENTIFIER, "pin": ORGANISER_PIN})
    if res.status_code == 200:
        return res.json()["access_token"]

    signup_res = client.post("/auth/organiser/signup", json={
        "name": "Dev Organiser",
        "email": ORGANISER_IDENTIFIER,
        "pin": ORGANISER_PIN,
    })
    signup_res.raise_for_status()
    return signup_res.json()["access_token"]


def get_operator_token(client: httpx.Client, organiser_token: str) -> str:
    """Invites (or re-invites) a dev operator for TOURNAMENT_ID and logs in as them."""
    invite_res = client.post(
        f"/auth/tournaments/{TOURNAMENT_ID}/operators/invite",
        json={"name": "Dev Operator", "email": "dev-operator@example.com"},
        headers={"Authorization": f"Bearer {organiser_token}"},
    )
    invite_res.raise_for_status()
    invite = invite_res.json()

    login_res = client.post("/auth/operator/login", json={
        "identifier": "dev-operator@example.com",
        "tournament_id": TOURNAMENT_ID,
        "pin": invite["invite_code"],
    })
    login_res.raise_for_status()
    return login_res.json()["access_token"]

def play_round(client: httpx.Client, stage: str, round_num: int):
    """Fetches all matches for a specific stage and round, and submits scores."""
    print(f"\nFetching {stage} Round {round_num} matches...")
    res = client.get(f"/tournaments/{TOURNAMENT_ID}/matches?stage={stage}&round_num={round_num}")
    matches = res.json()
    
    if not matches:
        print(f"No matches found for {stage} Round {round_num}.")
        return False

    pending_matches = [m for m in matches if not m["is_completed"]]
    
    if not pending_matches:
        print(f"✅ All matches in {stage} Round {round_num} are already completed.")
        return True

    print(f"Found {len(pending_matches)} pending matches. Simulating scores...")
    
    for m in pending_matches:
        # Validate that players are actually assigned (not TBD placeholders)
        p1 = m.get("player1_id")
        p2 = m.get("player2_id")
        
        # 🛑 UPDATED: Checking for "TBD" anywhere in the string to catch scoped IDs
        if not p1 or "TBD" in p1 or not p2 or "TBD" in p2:
            print(f"❌ Match {m['id']} is not ready yet! Players are still TBD. (P1: {p1}, P2: {p2})")
            return False
            
        # P1 wins the simulation
        payload = {
            "winner_id": p1,
            "scores": [
                {"p1": 21, "p2": 18},
                {"p1": 21, "p2": 15}
            ]
        }
        
        score_res = client.post(f"/matches/{m['id']}/score", json=payload)
        if score_res.status_code == 200:
            print(f"   🏆 Score submitted for {m['id']} -> Winner: {p1}")
        else:
            print(f"   ⚠️ Failed to score {m['id']}: {score_res.text}")

    print(f"✅ {stage} Round {round_num} completed!")
    return True


def run():
    with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
        organiser_token = get_organiser_token(client)
        operator_token = get_operator_token(client, organiser_token)

        # Organiser drives setup/scheduling; operator drives scoring (mirrors real usage).
        client.headers["Authorization"] = f"Bearer {organiser_token}"

        # 1. Check if schedule needs to be generated
        res = client.get(f"/tournaments/{TOURNAMENT_ID}/matches")
        if not res.json():
            print("No matches found. Triggering Schedule Generation...")
            payload = {"start_time": "2026-10-01T09:00:00", "num_groups": 4}
            sched_res = client.post(f"/tournaments/{TOURNAMENT_ID}/generate-schedule", json=payload)
            if sched_res.status_code == 200:
                print("✅ Schedule job dispatched!")
                
                # --- NEW POLLING LOGIC ---
                print("⏳ Waiting for Celery worker & CP-SAT solver to finish...")
                for i in range(15):  # Wait up to 30 seconds
                    time.sleep(2)
                    check_res = client.get(f"/tournaments/{TOURNAMENT_ID}/matches")
                    if check_res.json():
                        print("✨ Matches generated and detected in database!")
                        break
                    print("   ...still solving...")
                else:
                    print("❌ Solver timed out or Celery worker isn't running.")
                    sys.exit(1)
                # -------------------------
            else:
                print(f"❌ Failed to dispatch schedule: {sched_res.text}")
                sys.exit(1)

        # 2. Play all 5 Swiss Rounds (as the operator, since scoring is their job)
        client.headers["Authorization"] = f"Bearer {operator_token}"
        TOTAL_SWISS_ROUNDS = 5
        for r in range(1, TOTAL_SWISS_ROUNDS + 1):
            success = play_round(client, stage="SWISS", round_num=r)
            if not success:
                print("\n🛑 Stopped early due to missing matches or TBD placeholders.")
                sys.exit(1)

        # 3. Play Knockout Stages
        print("\n🏆 Transitioning to Knockout Stage...")
        play_round(client, stage="KNOCKOUT", round_num=1)
        play_round(client, stage="KNOCKOUT", round_num=2)
        print("\n🎉 TOURNAMENT SIMULATION COMPLETE!")


if __name__ == "__main__":
    run()