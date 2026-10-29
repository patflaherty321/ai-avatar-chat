# AI Companion release checklist

## Candidate and baseline

- Candidate branch: `codex/ai-companion-repair` (local until authorized).
- Original Vercel/GitHub revision: `0513e9803cc6fd7759fb01425702e070480da902`.
- Original Render revision: `d70add0ddd515184a6c2f0090c0c9c789dd6868a` (same backend source).
- Frontend: `https://ai-avatar-chat-dusky.vercel.app`, Vercel project `ai-avatar-chat`.
- Backend: `https://ai-avatar-chat-backend.onrender.com`, Render service `srv-d1te4imr433s73dle8dg`.
- Embed: `https://www.iamp.at/work/ai-companion`.
- Keep Render Free. No paid compute, always-on pings, or scheduled keepalive jobs.

## Configuration

Render retains root directory `backend` and start command `npm start`. Use `npm ci` as its build command when the configuration change is authorized. Keep the existing OpenAI and Azure secrets in Render; never put them in Vercel frontend environment variables, tracked files, logs, or screenshots.

`OPENAI_MODEL` defaults to `gpt-6-luna`. Explicitly setting that value in Render is optional and requires production authorization. The model runs through Chat Completions with reasoning disabled, a 256-token completion limit and temperature 0.7. Preserve the Azure voice `en-US-EchoTurboMultilingualNeural` and region. The frontend's `REACT_APP_BACKEND_URL` remains the Render URL; it is resolved at build time.

The candidate `vercel.json` installs the frontend from its lockfile, runs its source build, and serves `frontend/build`. No copying output to the repository root or hand-editing compiled bundles. Confirm dashboard project overrides do not supersede `vercel.json` before release; this configuration has not been deployed.

## Local verification

From the candidate repository root:

```sh
npm --prefix backend ci
npm --prefix backend test
npm --prefix frontend ci
CI=true npm --prefix frontend test -- --watchAll=false --runInBand
npm --prefix frontend run build
node --test scripts/test/provider-smoke.test.cjs
```

Tests use provider fakes and must never send real messages to OpenAI or Azure. Live checks use non-sensitive sample prompts and require valid existing credentials. Public `/health` is only a liveness check; success there does not prove model access, billing availability, or speech health.

### Verified candidate evidence (2026-10-29)

- Backend: 59 tests passed. Frontend: 31 tests passed. Provider-smoke script: 2 tests passed. The test suites were independently rerun during review.
- The production frontend build from source succeeded. Clean frontend installation also succeeded after the focused TypeScript peer-lock correction from 5.8.3 to 4.9.5.
- Independent spec and code-quality reviews found no actionable findings in the candidate source.
- Browser checks of the local direct app and a local iframe, using simulated providers, verified that the health check starts early and completes through an 8-second simulated startup, one pending chat submits once, and a friendly model failure can be explicitly retried without duplicating the user bubble.
- The local browser displayed the existing Rive asset and completed one 2-second fixture-audio playback with viseme transitions. Browser testing exposed a pre-existing silent-audio unlock feedback loop; the candidate fix bounds each temporary source to one load/play attempt and releases its audio, context, handlers, and timers. Regression tests cover repeated events, rejected playback, and unmount cleanup.

These checks establish local behavior with simulated providers. Live OpenAI model access, Azure synthesis, the combined live pipeline, physical desktop microphone input, mobile acceptance, and the actual production blog iframe remain unverified. No candidate push, production deployment, or production configuration change has occurred. Provider release gates remain pending while personal Azure/MSA resources are investigated.

### Live provider checks — pending

With valid credentials supplied through the process environment, run the independent checks followed by the combined check:

```sh
node scripts/provider-smoke.cjs --mode model
node scripts/provider-smoke.cjs --mode speech
node scripts/provider-smoke.cjs --mode full
```

The optional `--env backend/.env` reads an ignored local environment file without copying or printing its values. The script rejects placeholders before network calls, emits only safe result metadata, and removes its temporary generated audio. It does not modify Render or Vercel. The speech check includes XML-sensitive punctuation.

Verify these scenarios:

1. Independent OpenAI greeting returns nonempty text with the selected model.
2. Independent Azure synthesis of `Tom & Jerry say <hello>.` returns playable audio and real visemes; XML-sensitive text is escaped before SSML interpolation.
3. Combined request returns the existing `{text, audioUrl, visemes, success}` shape. Audio is fetchable, plays once, and lip sync ends cleanly.
4. Direct app and iframe permit typing during startup, retain one pending message, show progress, and do not submit twice when Enter/click events overlap.
5. Timeout/offline/model/throttling/speech errors show friendly text and allow explicit retry without duplicate chat bubbles. No raw provider errors or conversation content in diagnostics.
6. Desktop Chrome microphone works after the user grants permission; mobile typed input works and the current mobile/Teams microphone restriction stays in place.

## Production sequence — authorization required

1. Complete independent provider checks and inspect the reviewed candidate diff. Obtain permission to publish and change production settings before any push to an auto-deployed branch or production deployment.
2. Release the backend first. It remains compatible with the existing frontend. Confirm model, speech, full chat, audio retrieval, sanitized failure handling, and deployment revision in Render logs.
3. Release the frontend and confirm the intended source revision and output directory in Vercel. Confirm its health/chat/audio requests use the intended backend.
4. Test the direct app and the actual blog iframe with its existing sandbox/allow attributes. Do not change the WordPress embed as part of this repair.
5. Record iframe-mount-to-readiness, send-to-response, and send-to-audio-start separately. Test warm traffic, then after more than 15 minutes with no backend traffic. Do not use monitoring requests during the idle interval. Test returning to an already-open tab after 14 minutes.
6. Confirm the initial health check starts before chat submission. A cold start may still take about a minute; no hard instant-response promise applies to Render Free.

## Rollback

Record the candidate commit and successful deployment IDs before promotion. If the frontend regresses, restore the previous Vercel deployment while retaining the repaired backend. If the backend regresses, revert the faulty changes in a new candidate while retaining a verified supported model; the old backend revision still hardcodes a retired model and does not restore working chat. Revalidate both providers before redeploying.

## Investigation evidence (2026-10-29)

Render application logs reported `404 model_not_found` for retired `gpt-3.5-turbo`; the app converted it into HTTP 500. A live production health request measured 42.236 seconds and a subsequent warm request 0.091 seconds. These are observations from the old deployment, not post-release performance claims.

The original local backend environment file contains placeholder OpenAI and Azure keys, not expired real credentials. An earlier probe returned OpenAI 401 and Azure cancellation code 4 (connection failure). Those results do not establish that any real credentials expired or determine the validity of the separate production keys in Render. The candidate smoke script now rejects placeholders before network calls. No credentials were copied or changed. Valid local test credentials or an authorized controlled environment using production configuration are required to complete the provider release gates.
