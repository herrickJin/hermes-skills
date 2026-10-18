"""Bind OMH memory without registering a second copy of its tools and hooks."""

import json
from pathlib import Path
import sys

from hermes_cli.plugins import PluginContext
from omh.plugin_bundle.omh import runtime_paths
from omh.plugin_bundle.omh.memory_provider import OmhMemoryProvider


def _observe_board_readback(**kwargs):
    """Let OMH correlate the JSON inside its own readback presentation."""
    if kwargs.get("tool_name") not in {"kanban_show", "kanban_list", "kanban_attachments"}:
        return
    result = kwargs.get("result")
    if not isinstance(result, str) or not result.startswith("[OMH board readback] "):
        return
    _, separator, raw = result.partition("\n")
    if not separator:
        return
    try:
        payload = json.loads(raw)
    except (ValueError, RecursionError):
        return
    if not isinstance(payload, dict) or not isinstance(payload.get("omh_readback"), dict):
        return
    if payload["omh_readback"].get("schema_version") != "omh_kanban_readback/v1":
        return
    bridge_path = Path(__file__).resolve().parent.parent / "omh" / "agent_board_bridge.py"
    bridges = [module for name, module in tuple(sys.modules.items())
               if name.endswith(".agent_board_bridge")
               and getattr(module, "__file__", None) == str(bridge_path)]
    if len(bridges) == 1:
        # Keep the host's real identities, arguments and original JSON bytes.
        # The upstream engine still validates correlation, bounds and results.
        bridges[0].post_agent_board({**kwargs, "result": raw})


def register(ctx):
    """Use the upstream provider; standalone OMH owns tool/hook registration."""
    runtime_paths.note_host_registration(ctx)
    ctx.register_memory_provider(OmhMemoryProvider())
    if isinstance(ctx, PluginContext):
        ctx.register_hook("post_tool_call", _observe_board_readback)
