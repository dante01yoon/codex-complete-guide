import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

// 키는 이 스크립트와 같은 폴더의 .env.local에서만 읽습니다.
const env = parseEnv(readFileSync(new URL('.env.local', import.meta.url), 'utf8'));
if (!env.OPENROUTER_API_KEY) {
  throw new Error('.env.local에 OPENROUTER_API_KEY가 필요합니다.');
}

const client = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  timeout: 60_000,
  maxRetries: 0,
});

// 구조화된 출력: 세 필드를 필수 문자열로 정의하고 추가 필드를 금지합니다.
const Recommendation = z.object({
  name: z.string().describe('서울에 있는 도서관 이름'),
  district: z.string().describe('도서관이 위치한 서울의 자치구'),
  reason: z.string().describe('주말 방문을 추천하는 이유를 한국어로 설명'),
}).strict();

try {
  const completion = await client.chat.completions.create({
    // OpenRouter /api/v1/models에서 구조화된 출력 지원과 가격을 확인한 모델.
    model: 'openai/gpt-oss-20b',
    messages: [
      { role: 'user', content: '주말에 가볼 만한 서울 도서관 한 곳을 추천해줘.' },
    ],
    // Zod 정의를 strict JSON 스키마로 변환하여 모델에 전달합니다.
    response_format: zodResponseFormat(Recommendation, 'library_recommendation'),
    // response_format을 실제로 지원하는 제공자로만 라우팅합니다.
    provider: { require_parameters: true },
    max_tokens: 2048,
  });

  const choice = completion.choices[0];
  if (!choice || choice.finish_reason !== 'stop' || !choice.message.content || choice.message.refusal) {
    throw new Error('완전한 JSON 응답을 받지 못했습니다.');
  }
  // 받은 JSON이 같은 Zod 스키마에 맞는지도 로컬에서 검증합니다.
  const result = Recommendation.parse(JSON.parse(choice.message.content));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // 오류 객체에는 요청 정보가 포함될 수 있으므로 그대로 출력하지 않습니다.
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  console.error(status ? `API 요청 실패 (HTTP ${status}).` : '응답 수신 또는 JSON 스키마 검증에 실패했습니다.');
  process.exitCode = 1;
}
