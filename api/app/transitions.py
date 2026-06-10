from fastapi import HTTPException

TRANSITIONS = {
    "acknowledge": {"new": "acknowledged"},
    "resolve": {"acknowledged": "resolved"},
    # bonus paths:
    "dismiss": {"new": "dismissed", "acknowledged": "dismissed"},
    "reopen": {"resolved": "acknowledged", "dismissed": "acknowledged"},
}
TERMINAL = {"resolved", "dismissed"}


def enforce(action: str, current: str) -> str:
    """Return the resulting status, or raise 409 if the move isn't allowed."""
    allowed = TRANSITIONS[action]
    if current not in allowed:
        raise HTTPException(
            409, f"Cannot {action} an alert in status '{current}'. Allowed from: {list(allowed)}."
        )
    return allowed[current]
