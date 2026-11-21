// Cliente de Supabase con la clave de servicio: solo se usa en las funciones, nunca en el navegador.
import { createClient } from '@supabase/supabase-js';

let client = null;

export function db() {
  client ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
