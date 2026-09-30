"""File storage. Local disk for development; swap for S3 (Tokyo region, encrypted) in production.

Keys are random and generated here, so a user-supplied name can never reach the file system.
"""

import re
import uuid
from pathlib import Path

from .config import STORAGE_DIR

KEY_RE = re.compile(r"^[0-9a-f]{32}\.wav$")


class LocalStorage:
    def __init__(self, base: Path = STORAGE_DIR):
        self.base = Path(base)
        self.base.mkdir(parents=True, exist_ok=True)

    def put(self, data: bytes) -> str:
        key = f"{uuid.uuid4().hex}.wav"
        (self.base / key).write_bytes(data)
        return key

    def path(self, key: str) -> Path:
        if not KEY_RE.match(key):
            raise ValueError("bad key")
        return self.base / key


storage = LocalStorage()
