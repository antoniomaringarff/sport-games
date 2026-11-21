// Sesión del backoffice: usuario y clave fijos (variables de entorno) y una cookie firmada.
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'bo_session';
const MAX_AGE = 60 * 60 * 24 * 7; // una semana
const ATTRS = 'Path=/api/backoffice; HttpOnly; Secure; SameSite=Strict';

const sign = (value) => createHmac('sha256', process.env.BACKOFFICE_SECRET).update(value).digest('base64url');

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const configured = () =>
  !!(process.env.BACKOFFICE_USER && process.env.BACKOFFICE_PASSWORD && process.env.BACKOFFICE_SECRET);

export function checkCredentials(user, password) {
  if (!configured()) return false;
  // las dos comparaciones siempre, para no dar pistas por el tiempo de respuesta
  const okUser = same(user ?? '', process.env.BACKOFFICE_USER);
  const okPass = same(password ?? '', process.env.BACKOFFICE_PASSWORD);
  return okUser && okPass;
}

export function sessionCookie() {
  const expires = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${COOKIE}=${expires}.${sign(expires)}; ${ATTRS}; Max-Age=${MAX_AGE}`;
}

export const clearedCookie = `${COOKIE}=; ${ATTRS}; Max-Age=0`;

export function isLoggedIn(request) {
  if (!configured()) return false;
  const raw = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [expires, signature] = raw.slice(COOKIE.length + 1).split('.');
  if (!expires || !signature || Number(expires) < Date.now() / 1000) return false;
  return same(signature, sign(expires));
}
