#!/usr/bin/env python3
"""Verify the final Chandrahasa project ZIP against the working project tree."""
import hashlib
import pathlib
import sys
import zipfile

project = pathlib.Path(__file__).resolve().parents[2]
archive = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else project.parent / "Chandrahasa-Railway-Final.zip"
exclude = {"node_modules", ".git", "__pycache__", ".DS_Store", ".env"}
def digest(data):
    return hashlib.sha256(data).hexdigest()

files = [
    p for p in project.rglob("*")
    if p.is_file() and not any(part in exclude for part in p.parts)
    and p.name not in exclude
]
with zipfile.ZipFile(archive) as z:
    names = set(z.namelist())
    missing, mismatch = [], []
    for path in files:
        rel = path.relative_to(project).as_posix()
        zip_name = "chandra-rebuild/" + rel
        if zip_name not in names:
            missing.append(rel)
        elif digest(path.read_bytes()) != digest(z.read(zip_name)):
            mismatch.append(rel)
    bad = z.testzip()

print(f"Project files checked: {len(files)}")
print(f"Missing in archive: {len(missing)}")
print(f"Content mismatches: {len(mismatch)}")
print(f"ZIP CRC integrity: {'PASS' if bad is None else 'FAIL: ' + bad}")
if missing:
    print("MISSING:", missing)
if mismatch:
    print("MISMATCH:", mismatch)
if missing or mismatch or bad:
    sys.exit(1)
print("PACKAGE VERIFICATION PASS")
