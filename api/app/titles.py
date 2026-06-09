# alert_type slug -> human label. Title shown in the queue is "<Label> - <device name>".
LABELS = {
    "high_temperature": "High Temperature",
    "overcurrent": "Overcurrent",
    "speed_deviation": "Speed Deviation",
    "frequency_deviation": "Frequency Deviation",
    "vibration_anomaly": "Vibration Anomaly",
    "door_fault": "Door Fault",
}

DASH = chr(0x2014)  # em-dash via codepoint so the source stays pure-ASCII


def build_title(alert_type: str, device_name: str) -> str:
    label = LABELS.get(alert_type, alert_type.replace("_", " ").title())
    return f"{label} {DASH} {device_name}"
