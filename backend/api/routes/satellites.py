from fastapi import APIRouter, HTTPException
from typing import List

from ...models.satellite import Satellite
from ...data import db

router = APIRouter(prefix="/api/satellites", tags=["Satellites"])

@router.get("", response_model=List[Satellite])
def list_satellites():
    """Returns the list of all tracked satellites."""
    return db.get_all_satellites()

@router.get("/{satellite_id}", response_model=Satellite)
def get_satellite(satellite_id: str):
    """Retrieve details for a single satellite."""
    sats = db.get_all_satellites()
    target = next((s for s in sats if s.id == satellite_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Satellite not found")
    return target

@router.post("", response_model=Satellite)
def add_satellite(satellite: Satellite):
    """Adds a new satellite to tracking."""
    sats = db.get_all_satellites()
    if any(s.id == satellite.id for s in sats):
        raise HTTPException(status_code=400, detail="Satellite ID already exists")
    sats.append(satellite)
    db.save_satellites(sats)
    return satellite
