"""基于 SMTP 的邮件通知服务。"""
import html
import logging
import smtplib
from dataclasses import dataclass
from email.header import Header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.system_config import SystemConfig

logger = logging.getLogger(__name__)

SMTP_CONFIG_KEYS = (
    "smtp_host",
    "smtp_port",
    "smtp_user",
    "smtp_password",
    "smtp_use_ssl",
    "smtp_from_name",
    "smtp_from_email",
)
NOTIFICATION_TEMPLATE_KEY = "smtp_notification_template"
DEFAULT_NOTIFICATION_TEMPLATE = "{title}\n\n{content}\n\n— 器材管理系统"


@dataclass(frozen=True)
class SmtpSettings:
    host: str
    port: int
    user: str
    password: str
    use_ssl: bool
    from_name: str
    from_email: str


def get_smtp_settings(db: Session | None = None) -> SmtpSettings:
    persisted = _load_persisted_smtp_values(db)
    return SmtpSettings(
        host=_choose_text(persisted, "smtp_host", settings.SMTP_HOST),
        port=_choose_port(persisted, "smtp_port", settings.SMTP_PORT),
        user=_choose_text(persisted, "smtp_user", settings.SMTP_USER),
        password=_choose_text(persisted, "smtp_password", settings.SMTP_PASSWORD),
        use_ssl=_choose_bool(persisted, "smtp_use_ssl", settings.SMTP_USE_SSL),
        from_name=_choose_text(persisted, "smtp_from_name", settings.SMTP_FROM_NAME),
        from_email=_choose_text(persisted, "smtp_from_email", settings.SMTP_FROM_EMAIL),
    )


def is_smtp_configured(db: Session | None = None) -> bool:
    smtp = get_smtp_settings(db)
    return _is_smtp_settings_configured(smtp)


def _smtp_configured() -> bool:
    return is_smtp_configured()


def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    *,
    db: Session | None = None,
) -> bool:
    """发送单封邮件，失败只记录日志，不影响主业务流程。"""
    smtp = get_smtp_settings(db)
    if not _is_smtp_settings_configured(smtp):
        logger.debug("SMTP not configured, skipping email to %s", to_email)
        return False

    from_addr = smtp.from_email or smtp.user
    from_name = smtp.from_name

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8").encode()
    msg["From"] = formataddr((Header(from_name, "utf-8").encode(), from_addr))
    msg["To"] = to_email

    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        if smtp.use_ssl:
            with smtplib.SMTP_SSL(smtp.host, smtp.port, timeout=10) as server:
                server.login(smtp.user, smtp.password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(smtp.host, smtp.port, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(smtp.user, smtp.password)
                server.sendmail(from_addr, [to_email], msg.as_string())
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception:
        logger.exception("Failed to send email to %s: %s", to_email, subject)
        return False


def send_notification_email(
    to_email: str,
    title: str,
    content: str,
    *,
    db: Session | None = None,
) -> bool:
    """将站内通知格式化为邮件。"""
    subject = f"[器材管理] {title}"
    body_text = _render_notification_template(db, title, content)
    safe_content = html.escape(body_text).replace("\n", "<br>")
    body_html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #C49A6C; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">器材管理系统</h2>
      </div>
      <div style="background: #fff; border: 1px solid #e5e0db; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #6F675E; line-height: 1.6; margin: 0 0 20px;">{safe_content}</p>
        <hr style="border: none; border-top: 1px solid #e5e0db; margin: 20px 0;">
        <p style="color: #A39E96; font-size: 12px; margin: 0;">此邮件由系统自动发送，请勿回复。</p>
      </div>
    </div>
    """
    if db is None:
        return send_email(to_email, subject, body_text, body_html)
    return send_email(to_email, subject, body_text, body_html, db=db)


def send_test_email(to_email: str, *, db: Session | None = None) -> bool:
    """发送 SMTP 配置测试邮件。"""
    subject = "[器材管理] 测试邮件"
    body_text = "这是一封器材管理系统 SMTP 配置测试邮件。"
    body_html = """
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #C49A6C; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">器材管理系统</h2>
      </div>
      <div style="background: #fff; border: 1px solid #e5e0db; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #201E1A; line-height: 1.6; margin: 0;">这是一封 SMTP 配置测试邮件。收到此邮件表示当前邮件推送参数可以正常发送。</p>
      </div>
    </div>
    """
    return send_email(to_email, subject, body_text, body_html, db=db)


def _load_persisted_smtp_values(db: Session | None) -> dict[str, str]:
    if db is None:
        return {}
    try:
        rows = db.query(SystemConfig).filter(SystemConfig.key.in_(SMTP_CONFIG_KEYS)).all()
        return {row.key: row.value for row in rows if row.value is not None and str(row.value).strip() != ""}
    except Exception:
        logger.exception("读取数据库 SMTP 配置失败，已回退 .env 配置")
        db.rollback()
        return {}


def _render_notification_template(db: Session | None, title: str, content: str) -> str:
    template = _load_notification_template(db)
    try:
        return template.format(title=title, content=content)
    except (KeyError, IndexError, ValueError):
        logger.warning("邮件内容模板格式无效，已回退默认模板")
        return DEFAULT_NOTIFICATION_TEMPLATE.format(title=title, content=content)


def _load_notification_template(db: Session | None) -> str:
    if db is None:
        return DEFAULT_NOTIFICATION_TEMPLATE
    try:
        item = db.query(SystemConfig).filter(SystemConfig.key == NOTIFICATION_TEMPLATE_KEY).first()
        if item and item.value and item.value.strip():
            return item.value
        return DEFAULT_NOTIFICATION_TEMPLATE
    except Exception:
        logger.exception("读取邮件内容模板失败，已回退默认模板")
        db.rollback()
        return DEFAULT_NOTIFICATION_TEMPLATE


def _choose_text(persisted: dict[str, str], key: str, fallback: str) -> str:
    value = persisted.get(key)
    if value is None or str(value).strip() == "":
        return fallback or ""
    return str(value).strip()


def _choose_port(persisted: dict[str, str], key: str, fallback: int) -> int:
    value = persisted.get(key)
    if value is None or str(value).strip() == "":
        return fallback
    try:
        port = int(value)
    except (TypeError, ValueError):
        return fallback
    if port < 1 or port > 65535:
        return fallback
    return port


def _choose_bool(persisted: dict[str, str], key: str, fallback: bool) -> bool:
    value = persisted.get(key)
    if value is None or str(value).strip() == "":
        return fallback
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _is_smtp_settings_configured(smtp: SmtpSettings) -> bool:
    return bool(smtp.host and smtp.user and smtp.password)
