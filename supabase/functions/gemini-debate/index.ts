import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOPIC = '지구 온난화 대응을 위해 개발을 제한해야 하는가?';
const MAX_MESSAGE_LENGTH = 700;
const HISTORY_LIMIT = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ChatRole = 'student' | 'ai';

type ChatEntry = {
  role: ChatRole;
  content: string;
};

type RequestBody = {
  action?: 'create_room' | 'set_room_open' | 'ask';
  pin?: string;
  isOpen?: boolean;
  studentId?: string;
  nickname?: string;
  message?: string;
  history?: ChatEntry[];
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || '';
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'POST 요청만 지원합니다.' }, 405);
  }

  try {
    const body = await request.json() as RequestBody;
    if (body.action === 'create_room') {
      return await createRoom(request, body);
    }
    if (body.action === 'set_room_open') {
      return await setRoomOpen(request, body);
    }
    if (body.action === 'ask') {
      return await askGemini(body);
    }
    return json({ error: '지원하지 않는 action입니다.' }, 400);
  } catch (error) {
    console.error('[gemini-debate] request failed:', error);
    const message = error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.';
    return json({ error: message }, 500);
  }
});

async function createRoom(request: Request, body: RequestBody) {
  const teacherEmail = await requireAllowedTeacher(request);
  const pin = validatePin(body.pin);

  const { data, error } = await admin
    .from('debate_rooms')
    .insert({
      pin,
      topic: TOPIC,
      teacher_email: teacherEmail,
      is_open: false,
    })
    .select('id, pin, topic, is_open')
    .single();

  if (error) {
    console.error('[gemini-debate] create room failed:', error);
    throw new Error('토론방을 만들지 못했습니다. 다시 시도하세요.');
  }

  return json({
    roomId: data.id,
    pin: data.pin,
    topic: data.topic,
    isOpen: data.is_open,
  });
}

async function setRoomOpen(request: Request, body: RequestBody) {
  const teacherEmail = await requireAllowedTeacher(request);
  const pin = validatePin(body.pin);
  const isOpen = Boolean(body.isOpen);

  const { data: room, error: roomError } = await admin
    .from('debate_rooms')
    .select('id, teacher_email')
    .eq('pin', pin)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!room) return json({ error: '토론방을 찾을 수 없습니다.' }, 404);
  if (String(room.teacher_email).toLowerCase() !== teacherEmail.toLowerCase()) {
    return json({ error: '이 토론방을 제어할 권한이 없습니다.' }, 403);
  }

  const { error } = await admin
    .from('debate_rooms')
    .update({
      is_open: isOpen,
      updated_at: new Date().toISOString(),
      closed_at: isOpen ? null : new Date().toISOString(),
    })
    .eq('id', room.id);

  if (error) throw error;
  return json({ pin, isOpen });
}

async function askGemini(body: RequestBody) {
  if (!geminiApiKey) {
    return json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, 500);
  }

  const pin = validatePin(body.pin);
  const message = sanitizeMessage(body.message);
  if (!message) return json({ error: '메시지를 입력하세요.' }, 400);
  if (String(body.message || '').trim().length > MAX_MESSAGE_LENGTH) {
    return json({ error: `${MAX_MESSAGE_LENGTH}자 이하로 입력하세요.` }, 400);
  }

  const nickname = sanitizeMessage(body.nickname, 30) || '학생';
  const studentId = sanitizeMessage(body.studentId, 80);
  const history = normalizeHistory(body.history || []);

  const { data: room, error: roomError } = await admin
    .from('debate_rooms')
    .select('id, is_open')
    .eq('pin', pin)
    .maybeSingle();

  if (roomError) throw roomError;
  if (!room) return json({ error: '토론방을 찾을 수 없습니다.' }, 404);
  if (!room.is_open) {
    return json({ error: '교사가 대화창을 열어야 AI와 대화할 수 있습니다.' }, 403);
  }

  await insertMessage(room.id, studentId, nickname, 'student', message);
  const prompt = buildPrompt(nickname, message, history);
  const reply = await callGemini(prompt);
  await insertMessage(room.id, studentId, 'AI', 'ai', reply);

  return json({ reply });
}

async function requireAllowedTeacher(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('교사 로그인이 필요합니다.');

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) {
    throw new Error('교사 로그인 정보를 확인할 수 없습니다.');
  }

  const email = data.user.email;
  const { data: allowed, error: allowedError } = await admin
    .from('allowed_teachers')
    .select('email')
    .ilike('email', email)
    .limit(1);

  if (allowedError) throw allowedError;
  if (!allowed?.length) throw new Error('허용된 교사 계정이 아닙니다.');

  return email;
}

function validatePin(pin: unknown) {
  const value = String(pin || '').trim();
  if (!/^\d{6}$/.test(value)) {
    throw new Error('6자리 방 코드가 필요합니다.');
  }
  return value;
}

function sanitizeMessage(value: unknown, maxLength = MAX_MESSAGE_LENGTH) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeHistory(history: ChatEntry[]) {
  return history
    .filter((entry) => (entry.role === 'student' || entry.role === 'ai') && sanitizeMessage(entry.content))
    .map((entry) => ({
      role: entry.role,
      content: sanitizeMessage(entry.content),
    }))
    .slice(-HISTORY_LIMIT);
}

function buildPrompt(studentName: string, message: string, history: ChatEntry[]) {
  const context = normalizeHistory(history)
    .map((entry) => `${entry.role === 'student' ? studentName : 'AI'}: ${entry.content}`)
    .join('\n');

  return [
    '당신은 중학교 과학/사회 융합 수업의 토론 상대 AI입니다.',
    `토론 주제: ${TOPIC}`,
    '',
    '역할 규칙:',
    '- 학생의 입장을 먼저 파악하고, 반대 관점의 근거 또는 검증 질문을 제시하세요.',
    '- 한쪽 결론을 대신 내려주지 마세요.',
    '- 지구 온난화, 탄소 배출, 생태계, 경제, 일자리, 형평성을 균형 있게 다루세요.',
    '- 답변은 한국어로 3~5문장, 마지막은 학생이 이어서 답할 수 있는 질문으로 끝내세요.',
    '- 비난하거나 조롱하지 말고 수업 토론에 맞는 표현을 쓰세요.',
    '',
    context ? `이전 대화:\n${context}\n` : '',
    `${studentName}의 새 주장: ${message}`,
    '',
    '위 주장에 토론 상대처럼 응답하세요.',
  ].filter(Boolean).join('\n');
}

async function insertMessage(
  roomId: string,
  studentId: string,
  nickname: string,
  role: ChatRole,
  content: string,
) {
  const { error } = await admin
    .from('debate_messages')
    .insert({
      room_id: roomId,
      student_id: studentId || null,
      nickname,
      role,
      content,
    });

  if (error) {
    console.error('[gemini-debate] message insert failed:', error);
  }
}

async function callGemini(prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 900,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[gemini-debate] Gemini API failed:', response.status, errorText);
    throw new Error('Gemini API 응답을 받을 수 없습니다.');
  }

  const payload = await response.json();
  const finishReason = payload?.candidates?.[0]?.finishReason || '';
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini 응답이 비어 있습니다.');
  if (finishReason === 'MAX_TOKENS') {
    return `${text}\n\n(응답이 길어 일부가 잘렸습니다. 더 짧게 다시 질문해 보세요.)`.slice(0, 2000);
  }
  return text.slice(0, 2000);
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
