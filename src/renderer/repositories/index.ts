import { IRepository } from './base/IRepository';
import { LocalPlayerRepository } from './local/LocalPlayerRepository';
import { Player } from '@types/player';
import { DB_CONFIG } from '@constants';

/**
 * Factory para crear repositorios según la configuración
 * Por ahora solo retorna LocalRepository
 * En Sprint 3 se agregará DualRepository
 */

/**
 * Crear repositorio de jugadores
 * @returns Repositorio de jugadores (local por ahora)
 */
export function createPlayerRepository(): IRepository<Player> {
  // Por ahora solo retornamos LocalRepository
  // En Sprint 3 agregaremos DualRepository cuando implementemos sincronización
  return new LocalPlayerRepository();
}

/**
 * Factory genérico para crear repositorios (para uso futuro)
 * @param type - Tipo de repositorio a crear
 * @param mode - Modo de operación (local, remote, dual)
 * @returns Repositorio del tipo especificado
 */
export function createRepository<T>(
  type: 'player' | 'tournament' | 'match' | 'round',
  mode: 'local' | 'remote' | 'dual' = DB_CONFIG.mode
): IRepository<T> {
  switch (type) {
    case 'player':
      return createPlayerRepository() as IRepository<T>;
    // Agregar más casos en sprints siguientes:
    // case 'tournament':
    //   return createTournamentRepository(mode) as IRepository<T>;
    // case 'match':
    //   return createMatchRepository(mode) as IRepository<T>;
    // case 'round':
    //   return createRoundRepository(mode) as IRepository<T>;
    default:
      throw new Error(`Repository type ${type} not implemented`);
  }
}
