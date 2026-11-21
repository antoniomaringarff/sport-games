// GET  /api/records?place=monaco → los 10 mejores (un tiempo por jugador).
// POST /api/records { playerId, name, place, car, time, sectors } → guarda una vuelta o una etapa.
import { db } from './_lib/db.js';
import { json, readJson, origin, isUuid, cleanName } from './_lib/http.js';

// tiempos posibles (segundos) para descartar cosas imposibles
const LIMITS = { monaco: [40, 900], rally: [60, 3600], condor: [60, 3600] };
const CAR = /^[a-z0-9_-]{1,24}$/;

export async function GET(request) {
  const place = new URL(request.url).searchParams.get('place');
  if (!LIMITS[place]) return json({ error: 'Lugar desconocido' }, 400);
  const { data, error } = await db()
    .from('best_records')
    .select('player_name, car, time_ms')
    .eq('place', place)
    .order('time_ms')
    .limit(10);
  if (error) {
    console.error('best_records', error);
    return json({ error: 'No se pudo leer el ranking' }, 500);
  }
  const top = data.map((r) => ({ name: r.player_name, car: r.car, time: r.time_ms / 1000 }));
  return json({ place, top }, 200, { 'cache-control': 'public, s-maxage=10, stale-while-revalidate=60' });
}

export async function POST(request) {
  const b = await readJson(request);
  const name = cleanName(b?.name);
  const limits = LIMITS[b?.place];
  const time = Number(b?.time);
  if (!isUuid(b?.playerId) || !name || !limits || !CAR.test(b?.car ?? '')) return json({ error: 'Datos inválidos' }, 400);
  if (!(time >= limits[0] && time <= limits[1])) return json({ error: 'Tiempo fuera de rango' }, 400);
  const sectors = Array.isArray(b.sectors)
    ? b.sectors.slice(0, 3).map((s) => (Number.isFinite(s) ? Math.round(s * 1000) : null))
    : null;

  const from = origin(request);
  const client = db();
  // si el alta del jugador no llegó (sin conexión al empezar), se crea acá
  const { error: playerError } = await client.from('players').upsert(
    {
      id: b.playerId, name,
      first_ip: from.ip, first_city: from.city, first_region: from.region, first_country: from.country,
      last_ip: from.ip, last_city: from.city, last_region: from.region, last_country: from.country,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (playerError) {
    console.error('players upsert', playerError);
    return json({ error: 'No se pudo guardar el jugador' }, 500);
  }
  const { error } = await client.from('records').insert({
    player_id: b.playerId,
    player_name: name,
    place: b.place,
    car: b.car,
    time_ms: Math.round(time * 1000),
    sectors,
    ip: from.ip,
    city: from.city,
    region: from.region,
    country: from.country,
  });
  if (error) {
    console.error('records insert', error);
    return json({ error: 'No se pudo guardar el tiempo' }, 500);
  }
  return json({ ok: true });
}
