#!/usr/bin/env python3
"""
Gmail MCP Server — full send/reply/search/read capability.
Credentials: ~/.claude/credentials/gmail_credentials.json
Token:       ~/.claude/credentials/gmail_token.json
"""

import base64
import json
import os
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from fastmcp import FastMCP
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
]

CREDS_PATH = Path.home() / ".claude/credentials/gmail_credentials.json"
TOKEN_PATH = Path.home() / ".claude/credentials/gmail_token.json"

mcp = FastMCP("gmail")


def get_service():
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_PATH.exists():
                raise FileNotFoundError(
                    f"Gmail credentials not found at {CREDS_PATH}. "
                    "Download credentials.json from Google Cloud Console "
                    "(APIs & Services > Credentials > OAuth 2.0 Client ID > Desktop app) "
                    f"and save it to {CREDS_PATH}"
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def _make_message(to: list, subject: str, body: str, cc: list = None, bcc: list = None, reply_to_msg_id: str = None, thread_id: str = None) -> dict:
    msg = MIMEMultipart("alternative")
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = ", ".join(cc)
    if bcc:
        msg["Bcc"] = ", ".join(bcc)
    if reply_to_msg_id:
        msg["In-Reply-To"] = reply_to_msg_id
        msg["References"] = reply_to_msg_id
    msg.attach(MIMEText(body, "plain"))
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    result = {"raw": raw}
    if thread_id:
        result["threadId"] = thread_id
    return result


@mcp.tool()
def gmail_send_email(
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] = None,
    bcc: list[str] = None,
) -> str:
    """Send a new email."""
    service = get_service()
    # Normalize to list in case MCP framework passes a single string
    if isinstance(to, str):
        to = [to]
    if isinstance(cc, str):
        cc = [cc]
    if isinstance(bcc, str):
        bcc = [bcc]
    message = _make_message(to, subject, body, cc, bcc)
    sent = service.users().messages().send(userId="me", body=message).execute()
    return f"Sent. Message ID: {sent['id']}"


@mcp.tool()
def gmail_reply_to_email(
    thread_id: str,
    message_id: str,
    subject: str,
    body: str,
    to: list[str],
    cc: list[str] = None,
) -> str:
    """Reply to an existing email thread."""
    service = get_service()
    message = _make_message(to, subject, body, cc, reply_to_msg_id=message_id, thread_id=thread_id)
    sent = service.users().messages().send(userId="me", body=message).execute()
    return f"Reply sent. Message ID: {sent['id']}"


@mcp.tool()
def gmail_search_messages(query: str, max_results: int = 10) -> str:
    """Search Gmail messages. Uses standard Gmail search syntax (from:, to:, subject:, after:, etc.)"""
    service = get_service()
    results = service.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
    messages = results.get("messages", [])
    if not messages:
        return "No messages found."
    output = []
    for m in messages:
        msg = service.users().messages().get(userId="me", id=m["id"], format="metadata",
            metadataHeaders=["From", "To", "Subject", "Date"]).execute()
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        output.append({
            "id": msg["id"],
            "threadId": msg["threadId"],
            "from": headers.get("From", ""),
            "to": headers.get("To", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": msg.get("snippet", ""),
        })
    return json.dumps(output, indent=2)


@mcp.tool()
def gmail_read_thread(thread_id: str) -> str:
    """Read all messages in a thread."""
    service = get_service()
    thread = service.users().threads().get(userId="me", id=thread_id, format="full").execute()
    output = []
    for msg in thread.get("messages", []):
        headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
        body = _extract_body(msg["payload"])
        output.append({
            "id": msg["id"],
            "from": headers.get("From", ""),
            "to": headers.get("To", ""),
            "date": headers.get("Date", ""),
            "subject": headers.get("Subject", ""),
            "body": body,
        })
    return json.dumps(output, indent=2)


@mcp.tool()
def gmail_read_message(message_id: str) -> str:
    """Read a single email message by ID."""
    service = get_service()
    msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    headers = {h["name"]: h["value"] for h in msg["payload"].get("headers", [])}
    return json.dumps({
        "id": msg["id"],
        "threadId": msg["threadId"],
        "from": headers.get("From", ""),
        "to": headers.get("To", ""),
        "cc": headers.get("Cc", ""),
        "date": headers.get("Date", ""),
        "subject": headers.get("Subject", ""),
        "body": _extract_body(msg["payload"]),
    }, indent=2)


@mcp.tool()
def gmail_create_draft(
    to: list[str],
    subject: str,
    body: str,
    cc: list[str] = None,
) -> str:
    """Create a draft email."""
    service = get_service()
    message = _make_message(to, subject, body, cc)
    draft = service.users().drafts().create(userId="me", body={"message": message}).execute()
    return f"Draft created. Draft ID: {draft['id']}"


def _extract_body(payload: dict) -> str:
    """Recursively extract plain text body from message payload."""
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
    if "parts" in payload:
        for part in payload["parts"]:
            result = _extract_body(part)
            if result:
                return result
    return ""


if __name__ == "__main__":
    mcp.run()
