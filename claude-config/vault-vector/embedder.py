#!/usr/bin/env python3
"""
Vault Embedder — watches your vault for changes and keeps ChromaDB updated.
Runs as a persistent background service. Embeds every .md file into a vector
database so Claude can search semantically with search_vault().
"""

import sys
import time
import hashlib
import logging
import requests
import chromadb
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from logging.handlers import RotatingFileHandler

HOME         = Path.home()
VAULT_PATH   = HOME / "Documents" / "My Vault"
DB_PATH      = HOME / ".claude" / "vault-vector" / "db"
OLLAMA_URL   = "http://localhost:11434"
EMBED_MODEL  = "nomic-embed-text"
LOG_PATH     = HOME / ".claude" / "vault-vector" / "embedder.log"

WATCH_FOLDERS = [
    "Notes/Inner Work",
    "Notes/Business",
    "Notes/People",
    "Notes/Companies",
    "Notes/Software",
    "Notes/Playbooks",
    "Notes/Claude Memory",
    "Daily Notes",
]

# Logging
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
log_formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
file_handler = RotatingFileHandler(str(LOG_PATH), maxBytes=5*1024*1024, backupCount=2)
file_handler.setFormatter(log_formatter)
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_formatter)
logging.basicConfig(level=logging.INFO, handlers=[file_handler, stream_handler])
log = logging.getLogger(__name__)

# ChromaDB
DB_PATH.mkdir(parents=True, exist_ok=True)
client     = chromadb.PersistentClient(path=str(DB_PATH))
collection = client.get_or_create_collection(
    name="vault",
    metadata={"hnsw:space": "cosine", "embed_model": EMBED_MODEL}
)


def get_embedding(text: str) -> list[float]:
    for attempt in range(4):
        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text[:6000], "options": {"num_ctx": 8192}},
                timeout=60
            )
            resp.raise_for_status()
            return resp.json()["embedding"]
        except Exception as e:
            if attempt < 3:
                time.sleep(1 + attempt)
            else:
                log.error(f"Embedding failed: {e}")
                return None


def note_id(path: Path) -> str:
    return str(path.relative_to(VAULT_PATH))


def embed_note(path: Path):
    if not path.suffix == ".md" or not path.is_file():
        return

    try:
        content = path.read_text(encoding="utf-8").strip()
    except Exception as e:
        log.warning(f"Cannot read {path.name}: {e}")
        return

    if not content:
        return

    content_hash = hashlib.md5(content.encode()).hexdigest()
    doc_id       = note_id(path)

    try:
        existing = collection.get(ids=[doc_id])
        if existing["ids"] and existing["metadatas"][0].get("hash") == content_hash:
            return  # unchanged
    except Exception:
        pass

    embedding = get_embedding(content)
    if embedding is None:
        return

    collection.upsert(
        ids=[doc_id],
        embeddings=[embedding],
        documents=[content],
        metadatas=[{
            "name":     path.stem,
            "folder":   str(path.parent.relative_to(VAULT_PATH)),
            "hash":     content_hash,
            "modified": path.stat().st_mtime,
            "preview":  content[:500].replace("\n", " "),
        }]
    )
    log.info(f"Embedded: {path.name}")


def remove_note(path: Path):
    try:
        collection.delete(ids=[note_id(path)])
        log.info(f"Removed: {path.name}")
    except Exception as e:
        log.warning(f"Could not remove {path.name}: {e}")


def initial_sync():
    log.info(f"Initial sync — vault: {VAULT_PATH}")
    count = 0
    for folder in WATCH_FOLDERS:
        folder_path = VAULT_PATH / folder
        if not folder_path.exists():
            continue
        for md_file in folder_path.rglob("*.md"):
            embed_note(md_file)
            count += 1
    log.info(f"Sync complete — {count} notes checked.")


class VaultHandler(FileSystemEventHandler):
    def _is_md(self, path: str) -> bool:
        return path.endswith(".md")

    def on_created(self, event):
        if not event.is_directory and self._is_md(event.src_path):
            embed_note(Path(event.src_path))

    def on_modified(self, event):
        if not event.is_directory and self._is_md(event.src_path):
            embed_note(Path(event.src_path))

    def on_deleted(self, event):
        if not event.is_directory and self._is_md(event.src_path):
            remove_note(Path(event.src_path))

    def on_moved(self, event):
        if not event.is_directory and self._is_md(event.dest_path):
            remove_note(Path(event.src_path))
            embed_note(Path(event.dest_path))


def wait_for_ollama(max_retries=30, delay=10):
    for attempt in range(max_retries):
        try:
            requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
            log.info("Ollama is reachable.")
            return True
        except Exception:
            log.info(f"Waiting for Ollama... ({attempt + 1}/{max_retries})")
            time.sleep(delay)
    log.error("Ollama not reachable. Exiting.")
    return False


if __name__ == "__main__":
    log.info(f"Vault Embedder starting — watching {VAULT_PATH}")

    if not wait_for_ollama():
        sys.exit(1)

    initial_sync()

    observer = Observer()
    observer.schedule(VaultHandler(), str(VAULT_PATH), recursive=True)
    observer.start()
    log.info("Watching for changes...")

    try:
        while True:
            time.sleep(2)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
    log.info("Embedder stopped.")
