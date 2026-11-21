// POST /api/backoffice/logout → borra la cookie de sesión.
import { json } from '../_lib/http.js';
import { clearedCookie } from '../_lib/session.js';

export function POST() {
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie });
}
