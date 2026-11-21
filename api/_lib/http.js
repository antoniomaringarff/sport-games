// Ayudas comunes de las funciones: respuestas JSON, de dónde viene el pedido y validaciones.
import { geolocation, ipAddress } from '@vercel/functions';

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** IP y ubicación aproximada que agrega Vercel a cada pedido (en local no hay ciudad). */
export function origin(request) {
  const geo = geolocation(request);
  const ip = ipAddress(request) ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
  return { ip, city: geo.city ?? null, region: geo.countryRegion ?? null, country: geo.country ?? null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

/** Nombre del jugador: entre 2 y 16 letras, sin espacios de más. null si no sirve. */
export function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= 16 ? s : null;
}
