from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    token_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    emails = relationship("EmailRecord", back_populates="user", cascade="all, delete-orphan")


class EmailRecord(Base):
    __tablename__ = "email_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    gmail_message_id = Column(String(255), nullable=False, index=True)
    sender = Column(String(255), nullable=True)
    subject = Column(String(512), nullable=True)
    snippet = Column(Text, nullable=True)
    body_text = Column(Text, nullable=True)
    label = Column(String(32), nullable=False, default="safe")
    confidence = Column(Integer, nullable=False, default=0)
    reason = Column(Text, nullable=True)
    scanned_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="emails")
