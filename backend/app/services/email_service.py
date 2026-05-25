"""Email notification service using SMTP.

Sends email notifications when enable_email_notifications is True
and SMTP credentials are configured. Failures are logged but never
raise — email is best-effort alongside the in-app notification system.
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def send_email(to_email: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    """Send a single email. Returns True on success, False on failure."""
    if not _smtp_configured():
        logger.debug("SMTP not configured, skipping email to %s", to_email)
        return False

    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    from_name = settings.SMTP_FROM_NAME

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_addr}>"
    msg["To"] = to_email

    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        if settings.SMTP_USE_SSL:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(from_addr, [to_email], msg.as_string())
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s: %s", to_email, subject)
        return False


def send_notification_email(to_email: str, title: str, content: str) -> bool:
    """Convenience wrapper that formats a notification as an email."""
    subject = f"[器材管理] {title}"
    body_text = f"{title}\n\n{content}\n\n— 器材管理系统"
    body_html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #C49A6C; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">器材管理系统</h2>
      </div>
      <div style="background: #fff; border: 1px solid #e5e0db; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <h3 style="margin: 0 0 12px; color: #201E1A;">{title}</h3>
        <p style="color: #6F675E; line-height: 1.6; margin: 0 0 20px;">{content}</p>
        <hr style="border: none; border-top: 1px solid #e5e0db; margin: 20px 0;">
        <p style="color: #A39E96; font-size: 12px; margin: 0;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    </div>
    """
    return send_email(to_email, subject, body_text, body_html)
