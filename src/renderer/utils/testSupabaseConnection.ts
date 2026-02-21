/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupabaseClient } from '@api/clients/SupabaseClient';
import { isSupabaseConfigured, getConfigError } from '@api/clients/supabaseConfig';

/**
 * Utilidad para probar la conexión con Supabase
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  // Verificar configuración
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      message: 'Supabase no está configurado',
      details: getConfigError(),
    };
  }

  try {
    const client = new SupabaseClient();

    // Intentar una query simple para verificar la conexión
    // Probamos con la tabla 'players' que debería existir después de las migraciones
    const result = await client.query('SELECT COUNT(*) as count FROM players');

    return {
      success: true,
      message: 'Conexión con Supabase exitosa',
      details: {
        playersCount: result[0]?.count || 0,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Error al conectar con Supabase',
      details: {
        error: error.message,
        stack: error.stack,
      },
    };
  }
}

/**
 * Verificar qué cliente de API se está usando actualmente
 * En la arquitectura Local-First, siempre es SQLite. Supabase es opcional.
 */
export function getCurrentApiClientInfo(): {
  type: 'local' | 'cloud-sync';
  configured: boolean;
  message: string;
} {
  const supabaseConfigured = isSupabaseConfigured();

  if (supabaseConfigured) {
    return {
      type: 'cloud-sync',
      configured: true,
      message: 'Base de datos Local (SQLite) + Sincronización Nube (Supabase)',
    };
  } else {
    return {
      type: 'local',
      configured: false,
      message: 'Base de datos Local (SQLite) - Sin sincronización',
    };
  }
}
