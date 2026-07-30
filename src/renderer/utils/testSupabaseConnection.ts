/* eslint-disable @typescript-eslint/no-explicit-any */
import { SupabaseClient } from '@api/clients/SupabaseClient';
import {
  isSupabaseConfigured,
  isRemoteSyncReady,
  isSyncAuthConfigured,
  hasSupabaseCredentials,
  getConfigError,
} from '@api/clients/supabaseConfig';
import { isStoreMode } from '@utils/storeMode';

/**
 * Utilidad para probar la conexión con Supabase
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  // Verificar configuración
  if (!isRemoteSyncReady()) {
    return {
      success: false,
      message: 'Supabase no está configurado',
      details: getConfigError(),
    };
  }

  try {
    const wrapper = new SupabaseClient();
    const client = wrapper.client;
    if (!client) {
      return {
        success: false,
        message: 'Supabase no está configurado',
        details: getConfigError(),
      };
    }

    const { count, error } = await client
      .from('players')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;

    return {
      success: true,
      message: 'Conexión con Supabase exitosa',
      details: {
        playersCount: count || 0,
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
  if (isRemoteSyncReady()) {
    return {
      type: 'cloud-sync',
      configured: true,
      message: 'Base de datos Local (SQLite) + Sincronización Nube (Supabase)',
    };
  }

  if (hasSupabaseCredentials() && !isSyncAuthConfigured()) {
    const storeHint = isStoreMode()
      ? ' El instalador tienda debe compilarse con VITE_SUPABASE_SYNC_EMAIL y VITE_SUPABASE_SYNC_PASSWORD en .env.colombia.'
      : ' Añade VITE_SUPABASE_SYNC_EMAIL y VITE_SUPABASE_SYNC_PASSWORD en .env.colombia y reinicia.';
    return {
      type: 'local',
      configured: true,
      message: `SQLite local — URL/key de Supabase presentes, pero faltan credenciales de sync.${storeHint}`,
    };
  }

  if (isSupabaseConfigured()) {
    return {
      type: 'cloud-sync',
      configured: false,
      message: 'Sincronización deshabilitada en ajustes (solo SQLite local activo).',
    };
  }

  return {
    type: 'local',
    configured: false,
    message:
      'Base de datos Local (SQLite) - Sin sincronización (falta VITE_SUPABASE_URL / PUBLISHABLE_KEY)',
  };
}
