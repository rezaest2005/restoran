"""
AST analyser behind the module-boundary guard (standard library only, no Django).

It walks every ``bizsuite/**/*.py`` (migrations excluded), resolves each internal import (also the ones hidden
inside functions) to the file that defines the imported thing, maps both ends to a module with
``module_registry.module_of`` and reports every import that crosses a boundary illegally:

``dep``        the importing module has no declared edge to the target module (``DEPENDS_ON``), or the target is
               a business module and the importer is core.
``internal``   an edge exists but the imported file is not in the target's ``public_api`` (private internals).
``model``      another business module's model is imported directly (cross-module ORM access); models are never
               public, other modules must go through the owner's public API.

A violation is identified by ``(source file, source module, target module, kind, target)`` where ``target`` is
``dotted.module:Name`` — line numbers are deliberately not part of the key.
"""
from __future__ import annotations

import ast
import os

from . import module_registry as reg

PKG = os.path.dirname(os.path.abspath(__file__))


def _rel(path: str) -> str:
    return os.path.relpath(path, PKG).replace(os.sep, "/")


def iter_sources():
    for dirpath, dirnames, filenames in os.walk(PKG):
        dirnames[:] = [d for d in dirnames if d not in ("__pycache__",)]
        for f in filenames:
            if f.endswith(".py"):
                full = os.path.join(dirpath, f)
                rel = _rel(full)
                if any(rel.startswith(i) for i in reg.IGNORED):
                    continue
                yield rel, full


def model_name_files() -> dict[str, str]:
    """Model/helper name -> models/<file>.py that defines it (from the re-exports of models/__init__.py)."""
    with open(os.path.join(PKG, "models", "__init__.py"), encoding="utf-8-sig") as fh:
        tree = ast.parse(fh.read())
    out: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module:
            for a in node.names:
                out[a.asname or a.name] = f"models/{node.module}.py"
    return out


def _resolve(rel: str, node: ast.ImportFrom) -> str | None:
    """Dotted path (relative to bizsuite, '' = the package itself) an ImportFrom points at, or None if external."""
    if node.level == 0:
        mod = node.module or ""
        if mod == "bizsuite":
            return ""
        if mod.startswith("bizsuite."):
            return mod[len("bizsuite."):]
        return None
    parts = rel.split("/")[:-1]  # package of the importing file
    up = node.level - 1
    if up:
        parts = parts[:-up] if up <= len(parts) else []
    if node.module:
        parts += node.module.split(".")
    return ".".join(parts)


def _file_for(dotted: str) -> str | None:
    p = dotted.replace(".", "/")
    if p == "":
        return "__init__.py"
    if os.path.isfile(os.path.join(PKG, p + ".py")):
        return p + ".py"
    if os.path.isfile(os.path.join(PKG, p, "__init__.py")):
        return p + "/__init__.py"
    return None


def imports_of(rel: str, full: str, names: dict[str, str]):
    """Yield (target_file, target_label, is_model) for each internal import in a file."""
    with open(full, encoding="utf-8-sig", errors="replace") as fh:
        tree = ast.parse(fh.read())
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            base = _resolve(rel, node)
            if base is None:
                continue
            for a in node.names:
                if base in ("models",) or base.startswith("models."):
                    if base == "models":
                        f = names.get(a.name)
                        if f is None:
                            sub = _file_for("models." + a.name)
                            f = sub
                        if f:
                            yield f, f"models:{a.name}", True
                        continue
                    f = _file_for(base)
                    if f:
                        yield f, f"{base}:{a.name}", True
                    continue
                sub = _file_for((base + "." + a.name).strip("."))
                if sub and sub != "__init__.py" and not sub.endswith("/__init__.py"):
                    yield sub, f"{(base + '.' + a.name).strip('.')}:*", False
                    continue
                f = _file_for(base)
                if f:
                    yield f, f"{base or 'bizsuite'}:{a.name}", False
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name.startswith("bizsuite."):
                    f = _file_for(a.name[len("bizsuite."):])
                    if f:
                        yield f, f"{a.name[len('bizsuite.'):]}:*", False


def collect(raw: bool = False):
    """Set of violation tuples ``(src_file, src_mod, dst_mod, kind, target)`` + list of unowned files."""
    names = model_name_files()
    out: set[tuple] = set()
    unowned: list[str] = []
    for rel, full in iter_sources():
        src = reg.module_of(rel)
        if src is None:
            unowned.append(rel)
            continue
        if reg.tier(src) == reg.ROOT:
            continue
        for tfile, label, is_model in imports_of(rel, full, names):
            dst = reg.module_of(tfile)
            if dst is None or dst == src or reg.tier(dst) == reg.ROOT:
                continue
            td = reg.tier(dst)
            if td == reg.CORE:
                continue  # everyone may use the core
            if raw:  # every import of another non-core module, whatever the rules say
                out.add((rel, src, dst, "model" if is_model else "dep", label))
                continue
            if reg.tier(src) == reg.CORE:
                out.add((rel, src, dst, "dep", label))
                continue
            if not reg.edge_allowed(src, dst):
                out.add((rel, src, dst, "model" if is_model else "dep", label))
            elif is_model:
                out.add((rel, src, dst, "model", label))
            elif tfile not in reg.MODULES[dst]["public_api"]:
                out.add((rel, src, dst, "internal", label))
    return out, unowned


def pair_counts(violations) -> dict[tuple[str, str], int]:
    counts: dict[tuple[str, str], int] = {}
    for _f, s, d, _k, _t in violations:
        counts[(s, d)] = counts.get((s, d), 0) + 1
    return counts
