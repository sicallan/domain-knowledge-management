"""Stage 7: streaming, immutable JSONL emission (spec 003 §File Lifecycle).

Each entry is written one line at a time as it passes validation (criterion 9 — streaming).
Once a writer is closed the file is **immutable**: any further write raises, mirroring the
"never modified after written" lifecycle rule. Entities and relationships go to separate files
(spec 003 Decision 2).
"""

from __future__ import annotations

from pathlib import Path
from types import TracebackType

from dkm_enrichment.models import JsonlEntry


class JsonlWriter:
    """A streaming writer for one JSONL file. Use as a context manager."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle = path.open("w", encoding="utf-8")
        self._closed = False
        self.count = 0

    def write(self, entry: JsonlEntry) -> None:
        if self._closed:
            raise RuntimeError(f"Cannot write to closed (immutable) JSONL file: {self.path}")
        self._handle.write(entry.to_jsonl() + "\n")
        self._handle.flush()
        self.count += 1

    def close(self) -> None:
        if not self._closed:
            self._handle.close()
            self._closed = True

    def __enter__(self) -> JsonlWriter:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()


def read_jsonl(path: Path) -> list[dict[str, object]]:
    """Read a JSONL file back into a list of dicts (test/loader-side helper)."""

    import json

    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]
