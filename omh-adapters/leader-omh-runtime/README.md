# Leader OMH runtime dependency

This local plugin declares the OMH core package through Hermes PM. The OMH-managed plugin bundle is kept unmodified.

Pinned official release: oh-my-hermes 3.0.2.
Wheel SHA256: 2df56ebd191b290ec44ecb408f98354ba99a24544e835457185bd1b3174ae647
Origin: https://github.com/rlaope/oh-my-hermes/releases/download/v3.0.2/oh_my_hermes-3.0.2-py3-none-any.whl

The wheel package files were compared with the existing OMH installation: 1092 files, zero differences. Hermes PM snapshots this metadata and the wheel in a dependency generation. No raw pip/uv mutation is used.

Memory compatibility: Hermes 0.22.2 loads an external memory provider in a second module namespace. OMH 3.0.2 registers its tools from that namespace as well, while Hermes retains the standalone plugin's hooks. A real call then arms the standalone bridge but invokes the memory copy's handler, returning `missing_capabilities: ["host_identity"]`. A metadata-only profiler confirmed both identities were present but the bridge dictionaries belonged to different modules.

Select `memory.provider: leader-omh-runtime` to instantiate the unchanged upstream `OmhMemoryProvider` from the pinned package. This adapter registers only the provider. The managed `omh` plugin remains enabled and solely owns its tools and hooks, so both sides of the bridge use one module instance. OMH store binding remains `plugins.entries.omh.settings.omh_home`. The OMH doctor's provider label check recognizes only the literal `omh`, so its provider wording does not recognize this adapter; native capture and subsequent-session recall are the acceptance criteria.

Readback compatibility: Hermes 0.22.2's sequential executor emits its terminal post-tool observer after the registry already applied OMH's presentation transform. OMH's board parser expects plain JSON and otherwise records `malformed_result`. This adapter observes the same native post-tool event before OMH, recognizes only OMH's tagged JSON readback, and forwards its original JSON bytes to the same upstream bridge. It preserves all host identities and arguments and leaves all correlation, bounds, duplicate-key and result validation to the upstream engine. It neither changes the model-facing output nor invokes native actions.

When upgrading OMH to another version, update this pinned wheel and dependency together and re-admit the plugin through Hermes PM before restarting Hermes.
