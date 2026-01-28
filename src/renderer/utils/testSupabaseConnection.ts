import { SupabaseClient } from '@api/clients/SupabaseClient';
import { isSupabaseConfigured, getConfigError } from '@api/clients/supabaseConfig';
import { DB_CONFIG } from '@constants';

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
 */
export function getCurrentApiClientInfo(): {
  type: 'sqlite' | 'supabase' | 'dual';
  configured: boolean;
  message: string;
} {
  const supabaseConfigured = isSupabaseConfigured();
  
  if (DB_CONFIG.mode === 'remote') {
    return {
      type: 'supabase',
      configured: supabaseConfigured,
      message: supabaseConfigured 
        ? 'Usando Supabase (modo remoto)' 
        : 'Configurado para Supabase pero no está configurado, usando SQLite como fallback',
    };
  } else if (DB_CONFIG.mode === 'dual') {
    return {
      type: 'dual',
      configured: supabaseConfigured,
      message: 'Modo dual configurado (usando SQLite por ahora, DualRepository pendiente en Sprint 3)',
    };
  } else {
    return {
      type: 'sqlite',
      configured: true,
      message: 'Usando SQLite (modo local)',
    };
  }
}
