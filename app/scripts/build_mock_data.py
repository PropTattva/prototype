"""Normalise docs/PropTattva_Demo_Data.json (exported from PropTattva_Demo_Database.xlsx)
into app/src/data/mockData.json — the single data source for the prototype.

Run from the repo root:  python3 -I app/scripts/build_mock_data.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "PropTattva_Demo_Data.json"
OUT = ROOT / "app" / "src" / "data" / "mockData.json"

raw = json.loads(SRC.read_text())

JUNK_OCCUPIER = re.compile(r"^[\d,\.]+$|asking rent|current vacancy|^avail\.?$", re.I)


def is_junk(name):
    return not name or bool(JUNK_OCCUPIER.search(name.strip()))


def parse_msft(text):
    """'4.7 msft…' -> 4.7, 'B2 ~6 lakh + B3 ~4 lakh' -> 1.0, '30 acres · 4 Msft' -> 4.0"""
    if not text:
        return None
    lakhs = re.findall(r"([\d.]+)\s*lakh", text, re.I)
    if lakhs:
        return round(sum(float(x) for x in lakhs) / 10, 2)
    m = re.search(r"([\d.]+)\s*(msft|mn)", text, re.I)
    return float(m.group(1)) if m else None


def pct(text):
    if not text:
        return None
    m = re.search(r"([\d.]+)\s*%", text)
    return float(m.group(1)) if m else None


def short_block(block_id):
    return block_id.split("-", 1)[1] if block_id and "-" in block_id else block_id


def floor_key(label):
    """Normalise '3rd Floor' / '3' / 'G' for duplicate detection."""
    m = re.match(r"^(\d+)", (label or "").strip())
    return m.group(1) if m else (label or "").strip().upper()


# ---------- floors (stacking) ----------
floors = []
for f in raw["floors"]:
    occ = (f["occupier"] or "").strip()
    status = f["status"]
    if status == "Occupied" and re.match(r"^avail\.?$", occ, re.I):
        status, occ = "Vacant", ""
    elif status == "Occupied" and "self" in occ.lower():
        status = "Self-use"
    elif status == "Occupied" and is_junk(occ):
        occ = "Undisclosed"
    floors.append({
        "floorId": f["floor_id"],
        "blockId": f["block_id"],
        "parkId": f["park_id"],
        "floorNo": f["floor_no"],
        "wing": f["wing"] or None,
        "use": f["use"],
        "occupier": occ or None,
        "areaSft": f["area_sft"],
        "status": status,
    })

# ---------- availability (fill-down merged cells, drop totals, dedupe vs stacking) ----------
# First listing rows with a blank block (merged cell lost in export); park note says "D1 – 11 furnished floors".
FIRST_BLOCK = {"D": "D-D1"}
availability = []
last = {pid: {"block_id": b} for pid, b in FIRST_BLOCK.items()}
for a in raw["availability"]:
    if (a["floor_no"] or "").strip().lower() == "total":
        continue
    if a["source"] == "availability":
        prev = last.get(a["park_id"], {})
        block = a["block_id"] or prev.get("block_id", "")
        handover = a["handover"] or (prev.get("handover", "") if not a["block_id"] else "")
        timeline = a["timeline"] or (prev.get("timeline", "") if not a["block_id"] else "")
        a = {**a, "block_id": block, "handover": handover, "timeline": timeline}
        last[a["park_id"]] = a
    availability.append(a)

listed = {(a["block_id"], floor_key(a["floor_no"])) for a in availability if a["source"] == "availability"}
availability = [
    a for a in availability
    if a["source"] == "availability" or (a["block_id"], floor_key(a["floor_no"])) not in listed
]
availability = [{
    "availId": a["avail_id"],
    "parkId": a["park_id"],
    "blockId": a["block_id"] or None,
    "blockName": short_block(a["block_id"]) or None,
    "floorLabel": a["floor_no"],
    "wing": a["wing"] or None,
    "areaSft": a["area_sft"],
    "handover": a["handover"] or "Not specified",
    "timeline": a["timeline"] or ("Immediate" if a["source"] == "stacking" else "TBC"),
    "source": "Stacking (vacant floor)" if a["source"] == "stacking" else "Owner listing",
} for a in availability]

# ---------- parks ----------
parks = []
for p in raw["parks"]:
    pid = p["park_id"]
    pf = [f for f in floors if f["parkId"] == pid]
    occupied = sum(f["areaSft"] or 0 for f in pf if f["status"] in ("Occupied", "Self-use"))
    available = sum(a["areaSft"] or 0 for a in availability if a["parkId"] == pid)
    parks.append({
        "parkId": pid,
        "name": p["name"],
        "ownerId": p["owner_id"],
        "location": p["location"],
        "city": p["city"],
        "status": p["status"],
        "scale": p["scale"],
        "availabilityNote": p["availability_note"],
        "acres": p["acres"],
        "msft": parse_msft(p["scale"]) or parse_msft(p["built_potential"]) or parse_msft(p["msft_total"]),
        "builtPotential": p["built_potential"] or p["msft_total"],
        "operationalMsft": p["operational_msft"],
        "underDevMsft": p["under_dev_msft"],
        "tenants": p["tenants"],
        "certification": p["certification"],
        "askingRent": p["asking_rent"],
        "vacancyPct": pct(p["vacancy_pct"]),
        "timeline": p["timeline"],
        "handover": p["handover"],
        "occupiedSft": occupied,
        "availableSft": available,
        "topOccupiers": [
            {"occupier": o["occupier"], "sft": o["sft"]}
            for o in p["top_occupiers"] if not is_junk(o["occupier"]) and o["sft"]
        ],
    })

# ---------- transactions ----------
transactions = [
    {"txnId": f"T-{i + 1:03d}", "parkId": pid, "occupier": occ, "areaSft": sft, "rent": rent}
    for i, (pid, occ, sft, rent) in enumerate(t for t in raw["transactions"] if not is_junk(t[1]))
]

# ---------- orgs / owners / users ----------
plans = {s["org_id"]: s for s in raw["subs"]}
organisations = [{
    "orgId": o["org_id"],
    "name": o["name"],
    "type": o["type"],
    "planCode": plans.get(o["org_id"], {}).get("plan_code"),
    "subscriptionStatus": plans.get(o["org_id"], {}).get("status"),
} for o in raw["orgs"]]

users = [{
    "userId": u["user_id"], "orgId": u["org_id"], "name": u["name"], "email": u["email"], "role": u["role"],
} for u in raw["users"]]

blocks = [{
    "blockId": b["block_id"], "parkId": b["park_id"], "name": b["name"], "totalSft": b["total_sft"],
} for b in raw["blocks"]]

leases = [{
    "leaseId": l["lease_id"], "parkId": l["park_id"], "blockId": l["block_id"], "floorNo": l["floor_no"],
    "wing": l["wing"] or None, "occupier": l["occupier"], "areaSft": l["area_sft"], "status": l["status"],
} for l in raw["leases"]]

occupiers = [{
    "occupierId": o["occupier_id"], "name": o["name"], "sector": o["sector"],
    "isGcc": o["is_gcc"], "isStartup": o["is_startup"],
} for o in raw["occupiers"] if not is_junk(o["name"])]

data = {
    "organisations": organisations,
    "users": users,
    "parks": parks,
    "blocks": blocks,
    "floors": floors,
    "leases": leases,
    "availability": availability,
    "occupiers": occupiers,
    "transactions": transactions,
}
# The dataset anonymises cities; give them real names so the demo reads naturally.
CITY_NAMES = {"City 1": "Bengaluru", "City 2": "Gurugram", "City 3": "Mumbai"}
# Move one Northstar park so the owner demo spans two cities.
for p in parks:
    if p["parkId"] == "D":
        p["city"], p["location"] = "City 2", "Location 2B, City 2"
text = json.dumps(data, indent=1, ensure_ascii=False)
text = re.sub(r"\bCity [123]\b", lambda m: CITY_NAMES[m.group(0)], text)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text)
print({k: len(v) for k, v in data.items()}, file=sys.stderr)
