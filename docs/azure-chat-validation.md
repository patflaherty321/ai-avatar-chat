# Azure chat validation deployment

Status: created after Patrick explicitly approved the target on 2026-10-29. Azure reports Succeeded. Live model and combined chat/speech validation passed locally. The blog app has not been published.

Patrick selected Azure credits for chat on 2026-10-29. The existing personal Visual Studio Enterprise subscription is enabled, and its spending limit is On. Microsoft restricts the credit benefit to individual development/testing. No subscription or spending-limit change is proposed.

## Target

- Subscription: Visual Studio Enterprise Subscription (`51eb4bbb-c1cd-45e2-8a3d-2e39a739ea83`).
- Existing resource: `Avatar-foundry`, resource group `Avatar-Foundry`, West US.
- Deployment name: `gpt-6-luna` (created for this validation).
- Model: OpenAI `gpt-6-luna`, version `2026-09-22`.
- SKU: `GlobalStandard`, usage-based billing; no provisioned throughput reservation.
- Capacity: 10 units. The model catalog describes 1 request/minute and 1,000 tokens/minute per unit (10 requests/minute and 10,000 tokens/minute total). This is a rate allocation, not a monthly spend limit.
- Verified available West US quota and regional capacity: 250 GlobalStandard units before creation.
- API endpoint: `https://avatar-foundry.openai.azure.com/openai/v1/`.
- Speech remains `RIVE-SPEECH` in West US with the current voice.

## Creation command used

```sh
az cognitiveservices account deployment create \
  --subscription 51eb4bbb-c1cd-45e2-8a3d-2e39a739ea83 \
  --name Avatar-foundry \
  --resource-group Avatar-Foundry \
  --deployment-name gpt-6-luna \
  --model-name gpt-6-luna \
  --model-version 2026-09-22 \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 10
```

## Validation and later app configuration

Provisioning succeeded. The candidate model-only smoke test passed in 1,437 ms. A local full HTTP chat request returned status 200 with `{text, audioUrl, visemes, success}` in 1,927 ms; its audio URL returned status 200, 54,720 bytes, and 30 visemes. A live local iframe reply played once for 4.32 seconds with 46 synchronized visemes. One separate provider request returned bounded `AI_UNAVAILABLE` after about five seconds; a diagnostic call and subsequent full check passed. The cause of that isolated failure was not established. Retrieve existing resource keys only into the test process; do not print them or commit them. Preserve the 25-second provider deadlines and zero automatic retries.

The candidate uses server environment `OPENAI_BASE_URL` for the endpoint, `OPENAI_MODEL=gpt-6-luna` for the deployment name, and `OPENAI_API_KEY` for the existing Avatar-foundry resource key. Azure speech credentials remain separate. No frontend secret is needed.

A later production release would require explicitly authorized Render configuration and app deployment, plus resolution of the Visual Studio dev/test restriction. The existing direct-OpenAI key in Render must not be sent to Azure; configuring Azure requires the matching Azure resource key and endpoint together.

If the validation deployment is no longer wanted, removal can be proposed separately. Do not delete or alter the existing Phi-4, Speech, or other deployments.
