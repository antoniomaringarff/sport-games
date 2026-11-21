// POST /api/backoffice/login { user, password } → cookie de sesión.
import { json, readJson } from '../_lib/http.js';
import { checkCredentials, sessionCookie } from '../_lib/session.js';

export async function POST(request) {
  const b = await readJson(request);
  if (!checkCredentials(b?.user, b?.password)) {
    // frena un poco a quien prueba claves de a muchas
    await new Promise((r) => setTimeout(r, 800));
    console.error('backoffice: login fallido');
    return json({ error: 'Usuario o clave incorrectos' }, 401);
  }
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie() });
}
