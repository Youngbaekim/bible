// 1426 다본문 성경 — 원어 절 AI 직역(한·영) + 단어별 한글 뜻
// 비밀값(Supabase > Edge Functions > Secrets): ANTHROPIC_API_KEY, (선택) ANTHROPIC_MODEL
// 자동 제공: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// 모델: ANTHROPIC_MODEL 비밀값이 있으면 그것, 없으면 계정에서 쓸 수 있는 최신 Sonnet을 자동 선택
let MODEL_CACHE = "";
async function pickModel(key: string): Promise<string> {
  const fixed = Deno.env.get("ANTHROPIC_MODEL");
  if (fixed) return fixed;
  if (MODEL_CACHE) return MODEL_CACHE;
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (r.ok) {
      const ids: string[] = ((await r.json()).data || []).map((m: { id: string }) => m.id);
      MODEL_CACHE = ids.find((id) => id.includes("sonnet")) || ids[0] || "";
    }
  } catch (_) { /* 아래 기본값 사용 */ }
  return MODEL_CACHE || "claude-sonnet-4-5";
}
// Anthropic 오류를 사람이 읽을 수 있게
function aiErr(status: number, body: string): string {
  let msg = body;
  try { msg = JSON.parse(body)?.error?.message || body; } catch (_) { /* 원문 */ }
  if (status === 401) return "API 키가 올바르지 않습니다(ANTHROPIC_API_KEY 확인): " + msg;
  if (status === 404) return "모델을 찾을 수 없습니다(ANTHROPIC_MODEL 확인): " + msg;
  if (status === 429) return "요청 한도 초과(잠시 후 다시): " + msg;
  if (/credit|balance|billing/i.test(msg)) return "Anthropic 계정 크레딧(결제) 확인 필요: " + msg;
  return `AI 오류 ${status}: ${msg}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 서버 전용 키: 예전 이름(SERVICE_ROLE) 또는 새 이름(SECRET) 중 있는 것 사용
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    if (!svc) return json({ error: "server key missing (SUPABASE_SERVICE_ROLE_KEY)" }, 500);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY secret missing" }, 500);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, svc);
    // 1) 로그인 + 허용 사용자 확인(비용 보호)
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    const email = u?.user?.email;
    if (!email) return json({ error: "login required" }, 401);
    const { data: ok } = await sb.from("allowed_users").select("email").eq("email", email).maybeSingle();
    if (!ok) return json({ error: "not allowed" }, 403);

    const { key, lang, ref, words } = await req.json();
    if (!key || !Array.isArray(words) || !words.length) return json({ error: "bad request" }, 400);

    // 2) 저장된 결과가 있으면 그대로
    const { data: hit } = await sb.from("bible_ai_cache").select("data").eq("key", key).maybeSingle();
    if (hit) return json({ ...hit.data, cached: true });

    // 3) AI 생성
    const langName = lang === "heb" ? "히브리어(아람어 포함)" : "헬라어";
    const table = words.map((w: string[], i: number) =>
      `${i + 1}\t${w[0]}\t${w[1]}\t${w[2]}\t${w[3]}\t${w[4]}\t${w[5]}=${w[6]}`).join("\n");
    const prompt =
`당신은 성경 원어 전문가입니다. 아래는 ${ref}의 ${langName} 본문을 단어별로 분석한 표입니다.
(열: 번호, 원문, 음역, 영어 단어 뜻, 스트롱 번호, 문법 코드, 원형=원형 뜻)

${table}

다음을 JSON 하나로만 답하세요. 설명 문장이나 코드블록 표시 없이 JSON만 출력합니다.
{
  "ko": "원문 어순과 문법을 최대한 살린 한국어 직역(자연스러운 의역 금지, 필요하면 [ ]로 보충어 표시)",
  "en": "원문 어순과 문법을 최대한 살린 영어 직역(같은 원칙)",
  "words": ["1번 단어의 한국어 뜻(이 문맥에서, 짧게)", "2번 ...", ...],   // 표의 단어 수와 정확히 같은 개수, 같은 순서
  "note": "직역에서 주의할 문법·어순 포인트 1~3문장(한국어)"
}`;
    const model = await pickModel(Deno.env.get("ANTHROPIC_API_KEY")!);
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return json({ error: aiErr(r.status, await r.text()), model }, 502);
    const out = await r.json();
    const text = (out.content || []).map((c: { text?: string }) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "ai parse error", raw: text }, 502);
    const data = JSON.parse(m[0]);
    if (!Array.isArray(data.words)) data.words = [];

    await sb.from("bible_ai_cache").upsert({ key, data, model });
    return json({ ...data, cached: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
