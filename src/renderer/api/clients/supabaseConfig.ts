/**
 * Configuración de Supabase
 * 
 * Para usar Supabase, necesitas:
 * 1. Crear un proyecto en https://supabase.com
 * 2. Obtener la URL y la publishable key desde Settings > API
 * 3. Configurar las variables de entorno o usar valores por defecto aquí
 */

/**
 * URL del proyecto Supabase
 * Por defecto: vacío (requiere configuración)
 * Para desarrollo: puedes usar valores de entorno o hardcodear temporalmente
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

/**
 * Publishable key de Supabase (pública, segura para usar en el cliente)
 * Reemplaza a la antigua "anon key"
 * Por defecto: vacío (requiere configuración)
 */
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

/**
 * Secret key de Supabase (privada, solo para servidor/Edge Functions)
 * Reemplaza a la antigua "service_role key"
 * NUNCA exponer en el cliente
 */
export const SUPABASE_SECRET_KEY = import.meta.env.VITE_SUPABASE_SECRET_KEY || '';

/**
 * Verificar si Supabase está configurado
 */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/**
 * Obtener mensaje de error si no está configurado
 */
export function getConfigError(): string | null {
  if (!SUPABASE_URL && !SUPABASE_PUBLISHABLE_KEY) {
    return 'Supabase no está configurado. Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY';
  }
  if (!SUPABASE_URL) {
    return 'VITE_SUPABASE_URL no está configurado';
  }
  if (!SUPABASE_PUBLISHABLE_KEY) {
    return 'VITE_SUPABASE_PUBLISHABLE_KEY no está configurado';
  }
  return null;
}
