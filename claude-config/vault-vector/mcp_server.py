#!/usr/bin/env python3
"""
Vault MCP Server — semantic search over your Obsidian vault.
Started by Claude Code as a subprocess per session.
Provides search_vault, find_related_to_note, and vault_stats tools.
"""

import os
import requests
import chromadb
from pathlib import Path
from fastmcp import FastMCP

HOME        = Path.home()
DB_PATH     = HOME / ".claude" / "vault-vector" / "db"
VAULT_PATH  = HOME / "Documents" / "My Vault"
OLLAMA_URL  = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"

client     = chromadb.PersistentClient(path=str(DB_PATH))
collection = client.get_or_create_collection("vault", metadata={"hnsw:space": "cosine"})
mcp        = FastMCP("vault-search")


def get_embedding(text: str) -> list[float]:
    resp = requests.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text[:6000], "options": {"num_ctx": 8192}},
        timeout=60
    )
    return resp.json()["embedding"]


@mcp.tool()
def search_vault(query: str, n: int = 10) -> str:
    """
    Semantic search across all vault notes. Use this to find notes related
    to a concept, topic, person, or phrase — even without exact keyword match.

    Args:
        query: What you're looking for (concept, phrase, topic)
        n: Number of results (default 10)

    Returns:
        Ranked list of relevant notes with folder, relevance score, and preview
    """
    total = collection.count()
    if total == 0:
        return "Vault index is empty. Run the embedder first: python3 ~/.claude/vault-vector/embedder.py"

    embedding = get_embedding(query)
    results   = collection.query(
        query_embeddings=[embedding],
        n_results=min(n, total),
        include=["metadatas", "distances", "documents"]
    )

    if not results["ids"][0]:
        return "No results found."

    lines = [f"Search: '{query}' — top {len(results['ids'][0])} results\n"]
    for doc_id, meta, dist in zip(
        results["ids"][0],
        results["metadatas"][0],
        results["distances"][0]
    ):
        relevance = round((1 - dist) * 100, 1)
        preview   = meta.get("preview", "")[:200].replace("\n", " ")
        lines.append(
            f"[{relevance}%] [[{meta['name']}]] — {meta['folder']}\n"
            f"  {preview}..."
        )

    return "\n".join(lines)


@mcp.tool()
def find_related_to_note(note_name: str, n: int = 10) -> str:
    """
    Find notes semantically related to a specific note by name.
    Use when adding backlinks — finds genuine connections without reading every file.

    Args:
        note_name: Exact name of the note (without .md)
        n: Number of related notes to return (default 10)

    Returns:
        Ranked list of related notes
    """
    results = collection.get(
        where={"name": {"$eq": note_name}},
        include=["documents", "metadatas"]
    )

    if not results["ids"]:
        return f"Note '{note_name}' not found in index. Check the name or run the embedder."

    content   = results["documents"][0]
    embedding = get_embedding(content)
    total     = collection.count()

    similar = collection.query(
        query_embeddings=[embedding],
        n_results=min(n + 1, total),
        include=["metadatas", "distances"]
    )

    lines = [f"Notes related to [[{note_name}]]:\n"]
    for meta, dist in zip(similar["metadatas"][0], similar["distances"][0]):
        if meta["name"] == note_name:
            continue
        relevance = round((1 - dist) * 100, 1)
        lines.append(f"[{relevance}%] [[{meta['name']}]] — {meta['folder']}")

    return "\n".join(lines)


@mcp.tool()
def vault_stats() -> str:
    """Returns current vault index stats — total notes, notes per folder."""
    total = collection.count()
    if total == 0:
        return "Index is empty. Run: python3 ~/.claude/vault-vector/embedder.py"

    all_meta = collection.get(include=["metadatas"])["metadatas"]
    folders  = {}
    for m in all_meta:
        f = m.get("folder", "unknown")
        folders[f] = folders.get(f, 0) + 1

    lines = [f"Total notes indexed: {total}\n"]
    for folder, count in sorted(folders.items()):
        lines.append(f"  {folder}: {count}")
    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
