"""Email through Gmail SMTP (App Password) or Brevo's free HTTP API.
Render's free plan blocks outgoing SMTP ports, so use Brevo there."""
import base64
import json
import logging
import smtplib
import urllib.request
from email.message import EmailMessage

from .config import BREVO_API_KEY, MAIL_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER

log = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(MAIL_FROM and (BREVO_API_KEY or (SMTP_USER and SMTP_PASSWORD)))


def send(to: str, subject: str, html: str, attachment: tuple[str, bytes] | None = None) -> bool:
    if not enabled():
        log.info("Email is off (no SMTP or Brevo settings). Would send %r to %s", subject, to)
        return False
    try:
        if BREVO_API_KEY:
            body = {"sender": {"email": MAIL_FROM, "name": "Mock Interview Coach"}, "to": [{"email": to}],
                    "subject": subject, "htmlContent": html}
            if attachment:
                body["attachment"] = [{"name": attachment[0], "content": base64.b64encode(attachment[1]).decode()}]
            req = urllib.request.Request("https://api.brevo.com/v3/smtp/email", data=json.dumps(body).encode(),
                                         headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=20).close()
        else:
            msg = EmailMessage()
            msg["From"], msg["To"], msg["Subject"] = MAIL_FROM, to, subject
            msg.set_content("Please view this email in an HTML-capable client.")
            msg.add_alternative(html, subtype="html")
            if attachment:
                msg.add_attachment(attachment[1], maintype="application", subtype="pdf", filename=attachment[0])
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        return True
    except Exception as exc:  # never crash a request because email failed
        log.warning("Email failed: %s", exc)
        return False
