/**
 * Tipos comunes para repositorios
 */

/**
 * Modo de operación del repositorio
 */
export type RepositoryMode = 'local' | 'remote' | 'dual';

/**
 * Estrategia de resolución de conflictos
 */
export type ConflictResolution = 'last-write-wins' | 'manual';

/**
 * Tipo de operación en la cola de sincronización
 */
export type SyncOperationType = 'create' | 'update' | 'delete';

/**
 * Estado de una operación de sincronización
 */
export type SyncStatus = 'pending' | 'synced' | 'error';
