"""
AstroVigil FDO Copilot service powered by Gemini 2.5 Pro.
"""
import json
import os
from typing import Any, Dict, Optional

from .config import COPILOT_MODEL

try:
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - handled gracefully in runtime fallback
    genai = None
    types = None


SYSTEM_PROMPT = (
    "You are the AstroVigil FDO Copilot. Analyze this orbital telemetry and "
    "provide a concise, 3-sentence Situational Report (SitRep) for the human "
    "operator. Highlight critical fuel warnings, imminent conjunctions, and "
    "blackout risks."
)


def _get_api_key() -> Optional[str]:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


def _extract_response_text(response: Any) -> str:
    text = getattr(response, "text", None)
    if text:
        return text.strip()

    candidates = getattr(response, "candidates", None) or []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        assembled = []
        for part in parts:
            part_text = getattr(part, "text", None)
            if part_text:
                assembled.append(part_text)
        if assembled:
            return " ".join(assembled).strip()

    return ""


def _format_distance(distance_m: Optional[float]) -> str:
    if distance_m is None:
        return "N/A"
    if distance_m >= 1000:
        return f"{distance_m / 1000.0:.1f} km"
    return f"{distance_m:.0f} m"


def _fallback_sitrep(state_payload: Dict[str, Any]) -> str:
    fuel_levels = state_payload.get("fuel_levels", [])
    conjunctions = state_payload.get("closest_conjunctions", [])
    blackouts = state_payload.get("upcoming_blackouts", [])
    kti_scores = state_payload.get("kti_scores", [])

    lowest_fuel = fuel_levels[0] if fuel_levels else None
    nearest_conjunction = conjunctions[0] if conjunctions else None
    highest_kti = kti_scores[0] if kti_scores else None

    sentence_1 = (
        f"Fleet fuel is nominal with no low-fuel warnings."
        if lowest_fuel is None
        else (
            f"Fuel watch is led by SAT-{lowest_fuel['satellite_id']} at "
            f"{lowest_fuel['fuel_remaining_kg']:.1f} kg remaining."
        )
    )
    sentence_2 = (
        "No active close conjunctions are inside the current monitoring window."
        if nearest_conjunction is None
        else (
            f"Nearest conjunction is SAT-{nearest_conjunction['satellite_id']} "
            f"to OBJ-{nearest_conjunction['debris_id']} at "
            f"{_format_distance(nearest_conjunction['miss_distance_m'])} "
            f"with {nearest_conjunction['risk_level']} risk."
        )
    )
    if blackouts:
        blackout = blackouts[0]
        sentence_3 = (
            f"Blackout risk is rising for SAT-{blackout['satellite_id']} because "
            f"its next conjunction is expected without LOS, while the highest "
            f"KTI remains SAT-{highest_kti['satellite_id']} at {highest_kti['kti_score']:.1f}."
            if highest_kti is not None
            else (
                f"Blackout risk is rising for SAT-{blackout['satellite_id']} "
                f"because its next conjunction is expected without LOS."
            )
        )
    else:
        sentence_3 = (
            f"Highest KTI exposure is SAT-{highest_kti['satellite_id']} at "
            f"{highest_kti['kti_score']:.1f}, with no imminent blackout risk flagged."
            if highest_kti is not None
            else "No imminent blackout risk is currently flagged."
        )

    return " ".join([sentence_1, sentence_2, sentence_3]).strip()


class FDOCopilot:
    """Small service wrapper around Gemini 2.5 Pro for operator SitReps."""

    def __init__(self, model: str = COPILOT_MODEL):
        self.model = model

    def generate_sitrep(self, state_payload: Dict[str, Any]) -> Dict[str, Any]:
        payload_json = json.dumps(
            state_payload,
            separators=(",", ":"),
            sort_keys=True,
        )

        api_key = _get_api_key()
        if genai is None or types is None or not api_key:
            return {
                "provider": "local-fallback",
                "model": self.model,
                "available": False,
                "sitrep": _fallback_sitrep(state_payload),
                "input_summary_json": payload_json,
            }

        try:
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=self.model,
                contents=payload_json,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.2,
                    max_output_tokens=180,
                ),
            )
            sitrep = _extract_response_text(response) or _fallback_sitrep(state_payload)
            return {
                "provider": "google-genai",
                "model": self.model,
                "available": True,
                "sitrep": sitrep,
                "input_summary_json": payload_json,
            }
        except Exception:
            return {
                "provider": "local-fallback",
                "model": self.model,
                "available": False,
                "sitrep": _fallback_sitrep(state_payload),
                "input_summary_json": payload_json,
            }
