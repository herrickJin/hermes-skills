"""任务看板 backend — one namespace that carries the WHOLE board.

Mounted by Hermes' web server under ``/api/plugins/task-board``. Combines:

- the bundled kanban plugin's full router (board, tasks CRUD, comments, links,
  attachments, bulk, diagnostics, workers, runs/inspect/terminate, reclaim,
  specify, reassign, estimate, config, stats, assignees, log, dispatch, and
  the ``/events`` WebSocket) — imported from the hermes installation, so the
  surfaces cannot drift from the CLI/gateway;
- the kanban-sessions router (``/boards``, ``/tasks``, ``/task``, ``/log``,
  ``/session``) — read-only replay of worker sessions per board/task/profile.

Both source modules keep their own module identity (imported by file path
under private names), so their module-level caches and helpers stay intact.
Route collisions do not exist: the sessions router only adds ``/boards``,
``/tasks`` (GET list), ``/task``, ``/log`` and ``/session``, none of which the
bundled router claims (it uses ``/tasks/{task_id}`` and ``/tasks/{id}/log``).
"""

from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter

router = APIRouter()


def _hermes_roots() -> tuple[Path, Path]:
    """(plugins_root, hermes_install_root) for this plugin copy."""
    plugins_root = Path(__file__).resolve().parents[2]
    env_root = os.environ.get("HERMES_AGENT_ROOT", "").strip()
    if env_root:
        return plugins_root, Path(env_root)
    # ~/.hermes/plugins/<name>/dashboard/plugin_api.py → plugins_root.parent is
    # the hermes home (or profiles/<name>), whose parent chain holds the install.
    home = plugins_root.parent
    for candidate in (home, *home.parents[:3]):
        install = candidate / "hermes-agent"
        if (install / "plugins" / "kanban" / "dashboard" / "plugin_api.py").is_file():
            return plugins_root, install
    return plugins_root, home


def _load_module(path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(module_name, None)
        raise
    return module


def _include(router: APIRouter, module) -> Optional[str]:
    sub = getattr(module, "router", None)
    if sub is None:
        return "no router"
    router.include_router(sub)
    return None


_, _install_root = _hermes_roots()
if _install_root.is_dir() and str(_install_root) not in sys.path:
    # The bundled kanban module imports `hermes_cli.*`; the plugin host usually
    # already has the install on sys.path — this only backs it up.
    sys.path.append(str(_install_root))

_ERRORS: list[str] = []

_kanban_path = _install_root / "plugins" / "kanban" / "dashboard" / "plugin_api.py"
try:
    _kanban = _load_module(_kanban_path, "_task_board_bundled_kanban")
    _err = _include(router, _kanban)
    if _err:
        _ERRORS.append(f"kanban: {_err}")
except Exception as exc:  # never take the whole namespace down for one half
    _ERRORS.append(f"kanban: {type(exc).__name__}: {exc}")

_sessions_path = Path(__file__).resolve().parents[2] / "kanban-sessions" / "dashboard" / "plugin_api.py"
if not _sessions_path.is_file():
    # Profile copies live next to us; the launch home copy is the fallback.
    _sessions_path = _install_root.parent / "plugins" / "kanban-sessions" / "dashboard" / "plugin_api.py"
try:
    _sessions = _load_module(_sessions_path, "_task_board_kanban_sessions")
    _err = _include(router, _sessions)
    if _err:
        _ERRORS.append(f"sessions: {_err}")
except Exception as exc:
    _ERRORS.append(f"sessions: {type(exc).__name__}: {exc}")


@router.get("/_health")
async def health() -> dict:
    """Which halves loaded — for the plugin's own Capabilities inventory."""
    return {
        "plugin": "task-board",
        "kanban_router": "ok" if not any(e.startswith("kanban:") for e in _ERRORS) else "failed",
        "sessions_router": "ok" if not any(e.startswith("sessions:") for e in _ERRORS) else "failed",
        "errors": _ERRORS,
    }
