/**
 * 执行回放 — the worker-session timeline for one kanban task.
 *
 * Reads the task's runs (bundled backend), picks the run to replay (latest
 * with a recorded session by default), and renders the normalized session
 * timeline from the kanban-sessions half of the combined backend: user turns,
 * assistant turns (collapsible reasoning + tool calls), and tool outputs.
 * Everything rides the app theme vars — same dark surface as the drawer, no
 * hardcoded palette.
 */

import { cn, Codicon, Loader, MessageTextContent, Tip, useQuery } from '@hermes/plugin-sdk'
import { useState } from 'react'

import { fetchReplaySession, fetchReplayTask, type ReplayStep, workerSessionId } from './api'
import type { KanbanRun } from './types'
import { useKanban } from './ui'

function StepText({ text }: { text: string }) {
  return (
    <div className="min-w-0 [&_.aui-md>:first-child]:mt-0 [&_.aui-md>:last-child]:mb-0" data-selectable-text="true">
      <MessageTextContent media={false} text={text} />
    </div>
  )
}

function Collapse({
  defaultOpen = false,
  label,
  children
}: {
  defaultOpen?: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className="group min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[0.625rem] text-(--ui-text-quaternary) transition-colors hover:text-(--ui-text-secondary)">
        <Codicon
          className="transition-transform group-open:rotate-90"
          name="chevron-right"
          size="0.7rem"
        />
        {label}
      </summary>
      <div className="mt-1 min-w-0">{children}</div>
    </details>
  )
}

function ReasoningBlock({ text }: { text: string }) {
  return (
    <Collapse label="思考">
      <div
        className="whitespace-pre-wrap border-l-2 border-(--ui-stroke-tertiary) pl-2 font-mono text-[0.625rem] leading-relaxed text-(--ui-text-tertiary)"
        data-selectable-text="true"
      >
        {text}
      </div>
    </Collapse>
  )
}

function ToolCallBlock({ args, name }: { args: string; name: string }) {
  return (
    <div className="min-w-0 rounded bg-(--ui-bg-quaternary)">
      <div className="flex items-center gap-1 px-1.5 pt-1 font-mono text-[0.625rem] text-(--ui-text-secondary)">
        <Codicon name="tools" size="0.7rem" />
        <span className="truncate font-medium">{name}</span>
      </div>
      {args ? (
        <pre
          className="max-h-40 overflow-auto px-1.5 pb-1 pt-0.5 font-mono text-[0.5625rem] leading-relaxed whitespace-pre-wrap text-(--ui-text-quaternary)"
          data-selectable-text="true"
        >
          {args}
        </pre>
      ) : null}
    </div>
  )
}

function ToolResultBlock({ name, output, truncated }: { name: string; output: string; truncated?: boolean }) {
  return (
    <div className="min-w-0">
      <Collapse label={name ? `↳ ${name}` : '↳ 工具输出'}>
        <pre
          className="max-h-48 overflow-auto rounded bg-(--ui-bg-quaternary) p-1.5 font-mono text-[0.5625rem] leading-relaxed whitespace-pre-wrap text-(--ui-text-tertiary)"
          data-selectable-text="true"
        >
          {output}
          {truncated ? '\n…' : ''}
        </pre>
      </Collapse>
    </div>
  )
}

function Step({ step }: { step: ReplayStep }) {
  const k = useKanban()

  if (step.kind === 'user') {
    return (
      <div className="flex flex-col gap-1" data-step-kind="user">
        <div className="flex items-center gap-1 text-[0.625rem] font-medium text-(--ui-text-secondary)">
          <Codicon name="person" size="0.7rem" />
          user
        </div>
        <div className="rounded bg-(--ui-bg-quaternary) px-2 py-1.5 text-[0.75rem] text-(--ui-text-primary)">
          <StepText text={step.text ?? ''} />
        </div>
      </div>
    )
  }

  if (step.kind === 'tool_result') {
    return (
      <div className="ml-3 flex flex-col gap-0.5" data-step-kind="tool_result">
        <ToolResultBlock name={step.name ?? ''} output={step.output ?? ''} truncated={step.output_truncated} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1" data-step-kind="assistant">
      <div className="flex items-center gap-1 text-[0.625rem] font-medium text-(--ui-text-secondary)">
        <Codicon name="hubot" size="0.7rem" />
        assistant
      </div>
      {step.reasoning ? <ReasoningBlock text={step.reasoning} /> : null}
      {step.text ? (
        <div className="text-[0.75rem] text-(--ui-text-primary)">
          <StepText text={step.text} />
        </div>
      ) : null}
      {step.tool_calls && step.tool_calls.length > 0 ? (
        <div className="ml-3 flex flex-col gap-1">
          <span className="text-[0.625rem] text-(--ui-text-quaternary)">{k.replayToolCalls}</span>
          {step.tool_calls.map((callItem, index) => (
            <ToolCallBlock args={callItem.args} key={`${index}-${callItem.name}`} name={callItem.name} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The replay tab body: run picker (when several) + one session timeline. */
export function SessionReplay({ runs }: { runs: KanbanRun[] }) {
  const k = useKanban()

  // Latest run with a recorded worker session first — replays are about the
  // most recent attempt; reruns without a session (crash pre-write) are skipped.
  const candidates = runs
    .map(run => ({ profile: run.profile ?? 'default', run, sessionId: workerSessionId(run.metadata) }))
    .filter(entry => entry.sessionId)
  const [pick, setPick] = useState(0)
  const active = candidates[Math.min(pick, Math.max(candidates.length - 1, 0))]

  const { data: timeline, isPending } = useQuery({
    enabled: !!active,
    queryFn: () => fetchReplaySession(active!.profile, active!.sessionId),
    queryKey: ['replay', active?.profile, active?.sessionId],
    refetchInterval: false,
    staleTime: 60_000
  })

  if (candidates.length === 0) {
    return (
      <p className="text-[0.75rem] text-(--ui-text-quaternary)">{k.replayEmpty}</p>
    )
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-[0.75rem] text-(--ui-text-quaternary)">
        <Loader type="lemniscate-bloom" />
        {k.replay}…
      </div>
    )
  }

  if (!timeline || timeline.error) {
    return (
      <p className="text-[0.75rem] text-(--ui-text-quaternary)">
        {k.replayLoadError(timeline?.hint || timeline?.error || 'unknown')}
      </p>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {candidates.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          {candidates.map((entry, index) => (
            <Tip key={String(entry.run.id)} label={`${entry.profile} · ${entry.sessionId}`}>
              <button
                aria-pressed={index === Math.min(pick, candidates.length - 1)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[0.625rem] transition-colors',
                  index === Math.min(pick, candidates.length - 1)
                    ? 'bg-(--chrome-action-hover) text-foreground'
                    : 'bg-(--ui-bg-quaternary) text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)'
                )}
                onClick={() => setPick(index)}
                type="button"
              >
                {k.replayRun(index + 1)}
              </button>
            </Tip>
          ))}
        </div>
      ) : null}

      {timeline.model ? (
        <span className="font-mono text-[0.625rem] text-(--ui-text-quaternary)">
          {k.replayModelLabel(timeline.model)}
        </span>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        {timeline.steps.map((step, index) => (
          <Step key={index} step={step} />
        ))}
        {timeline.steps.length === 0 && <p className="text-[0.75rem] text-(--ui-text-quaternary)">{k.replayEmpty}</p>}
      </div>
    </div>
  )
}
