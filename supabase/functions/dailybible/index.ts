// 1426 다본문 성경 — 매일성경(성서유니온) 해설 본문 읽기 (개인 열람 전용)
// 비밀값(Supabase > Edge Functions > Secrets): OWNER_EMAILS = 열람 허용 이메일(쉼표 구분)
// 자동 제공: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 저장·캐시 없음. 요청 시 공식 페이지를 읽어 해설 영역(#body_cont_3)만 돌려줌.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const ENT: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const clean = (h: string) =>
  h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
   .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENT[m] || m)
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
   .split("\n").map((l) => l.replace(/[ \t\r]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    const owners = (Deno.env.get("OWNER_EMAILS") || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    if (!svc || !owners.length) return json({ error: "server setup missing (OWNER_EMAILS)" }, 500);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, svc);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    const email = (u?.user?.email || "").toLowerCase();
    if (!email) return json({ error: "login required" }, 401);
    if (!owners.includes(email)) return json({ error: "not allowed" }, 403);

    const { date } = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return json({ error: "bad date" }, 400);
    const r = await fetch(`https://sum.su.or.kr:8888/bible/today?qt_ty=QT1&base_de=${date}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    if (!r.ok) return json({ error: `source ${r.status}` }, 502);
    const t = await r.text();
    const i = t.indexOf('id="mainView_3"');
    if (i < 0) return json({ error: "해설 영역을 찾지 못함" }, 502);
    const end = t.indexOf("해설의 저작권", i);
    const seg = t.slice(i, end > 0 ? end : undefined);
    const pick = (re: RegExp) => { const m = seg.match(re); return m ? clean(m[1]) : ""; };
    const day = pick(/id="dailybible_info2"[^>]*>([\s\S]*?)<\/div>/);
    const title = pick(/id="select_date_3"[\s\S]*?class="bible_text"[^>]*>([\s\S]*?)<\/div>/);
    const ref = pick(/id="bibleinfo_box_3"[^>]*>([\s\S]*?)<\/div>/);
    const blocks: { k: string; t: string }[] = [];
    const b0 = seg.indexOf('id="body_cont_3"');
    for (const m of seg.slice(b0).matchAll(/<div class="(b_text|g_text|text)"[^>]*>([\s\S]*?)<\/div>/g)) {
      const txt = clean(m[2]); if (txt) blocks.push({ k: m[1] === "b_text" ? "b" : m[1] === "g_text" ? "g" : "p", t: txt });
    }
    if (!blocks.length) return json({ error: "해설이 없거나 열람 기간이 지난 날짜" }, 404);
    return json({ date, day, title, ref, blocks });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
