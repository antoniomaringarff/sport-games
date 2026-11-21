// GET /api/backoffice/data → jugadores, últimos tiempos y ranking (solo con sesión).
import { db } from '../_lib/db.js';
import { json } from '../_lib/http.js';
import { isLoggedIn } from '../_lib/session.js';

const PLACES = ['monaco', 'rally', 'condor'];

export async function GET(request) {
  if (!isLoggedIn(request)) return json({ error: 'Sin sesión' }, 401);
  const client = db();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [players, records, playerCount, recordCount, recordsToday, ...rankings] = await Promise.all([
    client.from('players').select('*').order('last_seen_at', { ascending: false }).limit(500),
    client.from('records').select('*').order('created_at', { ascending: false }).limit(500),
    client.from('players').select('id', { count: 'exact', head: true }),
    client.from('records').select('id', { count: 'exact', head: true }),
    client.from('records').select('id', { count: 'exact', head: true }).gte('created_at', since),
    ...PLACES.map((place) =>
      client.from('best_records').select('*').eq('place', place).order('time_ms').limit(20),
    ),
  ]);

  const failed = [players, records, playerCount, recordCount, recordsToday, ...rankings].find((r) => r.error);
  if (failed) {
    console.error('backoffice data', failed.error);
    return json({ error: 'No se pudieron leer los datos' }, 500);
  }

  return json({
    summary: { players: playerCount.count, records: recordCount.count, recordsToday: recordsToday.count },
    players: players.data,
    records: records.data,
    ranking: Object.fromEntries(PLACES.map((p, i) => [p, rankings[i].data])),
  });
}
