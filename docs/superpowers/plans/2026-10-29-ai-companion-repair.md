# AI Companion Repair and Startup Improvement Plan

> Approved by Patrick on 2026-10-29. Implementation uses isolated branch `codex/ai-companion-repair`; publishing and production configuration changes require separate authorization.

**Goal:** Restore chat with a current OpenAI model, retain free hosting and the current avatar/voice, and begin waking the backend before the visitor submits a message.

**Architecture:** React/Rive on Vercel calls Express on Render, then OpenAI Chat Completions and Azure Speech. Text, audio URL, and visemes continue arriving together. No streaming, provider migration, conversation memory, voice replacement, or broad dependency upgrades.

**Baseline:** GitHub/Vercel `0513e9803cc6fd7759fb01425702e070480da902`; Render `d70add0ddd515184a6c2f0090c0c9c789dd6868a`. Backend source at those commits is identical. Original checkout has existing local modifications that must be preserved. Render logs on October 29 show OpenAI `404 model_not_found` for retired `gpt-3.5-turbo`.

## Implementation checklist

- [x] Create an isolated worktree and save this approved plan.
- [x] Replace the retired model with server-configurable `OPENAI_MODEL`, default `gpt-6-luna`; use `reasoning_effort: none`, `max_completion_tokens: 256`, and `temperature: 0.7`. Separate Echo's concise/warm persona from user input; retain locked SDK.
- [x] Add shared startup readiness checks using existing `/health`, immediately on mount; deduplicate concurrent/Strict Mode calls. Bound retries to 90 seconds. Recheck after 14 minutes on return/interaction, without periodic keepalive traffic.
- [x] Allow typing during wakeup; show “Waking up the companion…”. Hold one pending submission, then send once. Preserve failed message and provide explicit Retry. Show Thinking after readiness.
- [x] Add 25-second AI/speech limits, 60-second frontend chat limit after readiness, zero automatic inference retries, cancellation and resource cleanup. Log request IDs, model, provider status/error codes, AI/speech durations; exclude credentials and conversation content.
- [x] Preserve success contract `{text, audioUrl, visemes, success}`. Return stable failure codes/request IDs, distinguishing model/configuration, throttling, timeout, and speech failure. Show friendly UI errors instead of provider details.
- [x] Repair the silent-audio unlock feedback loop discovered during local browser testing; bound temporary audio attempts and clean up handlers, timers, audio, and the temporary context. Preserve the existing Rive asset and companion playback path.

## Verification checklist

- [x] Backend Node tests and frontend Jest/React Testing Library tests: model request, empty output, provider failures, speech timeout, successful audio/visemes, immediate/cold readiness, HTML/503 retry, deadline, Strict Mode, pending send, explicit retry, exactly one request/playback.
- [x] Run both suites and a production frontend build from source: 59 backend, 31 frontend, and 2 provider-smoke script tests passed; the source build succeeded.
- [x] Independently review spec compliance and code quality; no actionable findings remain in the reviewed source. Prepare release and rollback instructions in `docs/ai-companion-release.md`.
- [x] Check the local direct app and local iframe with simulated providers: early health checks through an 8-second simulated startup, one chat submission, friendly model failure and explicit retry without a duplicate user bubble, real Rive display, and one complete 2-second fixture-audio playback with viseme transitions.
- [ ] Validate replacement model and Azure speech independently, then full pipeline, including punctuation/XML-sensitive text.
- [ ] Validate direct app and actual blog iframe: typed chat, desktop microphone, mobile typed input, playback/lip sync/friendly failures.
- [ ] Measure readiness separately from send-to-audio, warm and after >15 minutes idle. Free hosting cannot guarantee instant cold starts.
- [ ] Obtain production authorization, deploy backend first then frontend, record revisions and check logs. No candidate push or deployment has occurred.

The completed local browser checks use simulated providers and fixture audio. They do not establish live model/Azure availability, physical microphone or mobile acceptance, or acceptance in the production blog iframe. The original local backend keys are placeholders, not expired real credentials. Provider gates remain pending while personal Azure/MSA resources are investigated. The old production deployment measured 42.236 seconds for a cold health request and 0.091 seconds warm; these are baseline observations, not candidate performance results.

## Release constraints

Keep Render Free, Vercel project and iframe URL, design, Azure voice, Rive assets, and existing microphone restrictions. Existing API/speech usage charges remain. Model access and speech health must be verified before release. A public health endpoint only proves liveness, not upstream model or speech health.

## Evidence

- OpenAI model: https://developers.openai.com/api/docs/models/gpt-6-luna
- Compatibility: https://developers.openai.com/api/docs/guides/latest-model
- Retirement: https://developers.openai.com/api/docs/deprecations
- Render sleeps after 15 idle minutes; wakeup about one minute: https://render.com/docs/free
