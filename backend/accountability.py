from database import SessionLocal
from models import AuditLog
import datetime

def log_action(action: str, target: str = None, outcome: str = "Success", operator: str = "Admin"):
    """
    Tactical Accountability Utility:
    Records an operator-initiated event to the permanent AuditLog.
    """
    try:
        db = SessionLocal()
        new_log = AuditLog(
            action=action,
            target=target,
            outcome=outcome,
            operator=operator,
            timestamp=datetime.datetime.utcnow()
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        db.close()
        print(f"[AUDIT] {action} | Target: {target} | Outcome: {outcome}")
        return True
    except Exception as e:
        print(f"[!] Audit Log Failure: {e}")
        return False
