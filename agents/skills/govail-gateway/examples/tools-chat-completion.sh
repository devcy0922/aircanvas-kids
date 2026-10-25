#!/usr/bin/env bash
set -euo pipefail

: "${GOVAIL_API_KEY:?GOVAIL_API_KEY를 설정하세요. 키 원문을 로그에 출력하지 마세요.}"
gateway_url="${GOVAIL_GATEWAY_URL:-http://127.0.0.1:8080}"
model="${GOVAIL_MODEL:-govail/worker}"

request_body="$(jq -n --arg model "$model" '
  {
    model: $model,
    messages: [{role: "user", content: "ORD-1001 주문의 현재 상태를 확인해줘."}],
    tools: [{
      type: "function",
      function: {
        name: "lookup_order",
        description: "호출자가 소유한 읽기 전용 주문 조회 어댑터",
        parameters: {
          type: "object",
          properties: {order_id: {type: "string"}},
          required: ["order_id"],
          additionalProperties: false
        }
      }
    }],
    tool_choice: "auto"
  }
')"

curl --fail-with-body --silent --show-error \
  --request POST "${gateway_url%/}/v1/chat/completions" \
  --header "Authorization: Bearer ${GOVAIL_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data "$request_body" | jq '{model, choices: [.choices[] | {finish_reason, message}]}'
