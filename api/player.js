// POST /api/player { id, name } → alta o visita del jugador, con su IP y ciudad.
import { db } from './_lib/db.js';
import { json, readJson, origin, isUuid, cleanName } from './_lib/http.js';

export async function POST(request) {
  const body = await readJson(request);
  const name = cleanName(body?.name);
  if (!isUuid(body?.id) || !name) return json({ error: 'El nombre tiene que tener entre 2 y 16 letras.' }, 400);

  const from = origin(request);
  const { error } = await db().rpc('touch_player', {
    p_id: body.id,
    p_name: name,
    p_ip: from.ip,
    p_city: from.city,
    p_region: from.region,
    p_country: from.country,
    p_user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  });
  if (error) {
    console.error('touch_player', error);
    return json({ error: 'No se pudo guardar el jugador.' }, 500);
  }
  return json({ ok: true, name });
}
