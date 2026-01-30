/**
 * Interface base para todos los repositorios
 * Define las operaciones CRUD estándar que todos los repositorios deben implementar
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface IRepository<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  /**
   * Obtener todos los registros, opcionalmente filtrados
   * @param filters - Objeto con filtros opcionales
   * @returns Array de registros
   */
  findAll(filters?: any): Promise<T[]>;

  /**
   * Obtener un registro por su ID
   * @param id - ID del registro
   * @returns El registro o null si no existe
   */
  findById(id: number): Promise<T | null>;

  /**
   * Crear un nuevo registro
   * @param data - Datos del nuevo registro
   * @returns ID del registro creado
   */
  create(data: TCreate): Promise<number>;

  /**
   * Actualizar un registro existente
   * @param id - ID del registro a actualizar
   * @param data - Datos a actualizar
   */
  update(id: number, data: TUpdate): Promise<void>;

  /**
   * Eliminar un registro
   * @param id - ID del registro a eliminar
   */
  delete(id: number): Promise<void>;

  /**
   * Contar registros, opcionalmente filtrados
   * @param filters - Objeto con filtros opcionales
   * @returns Número de registros
   */
  count(filters?: any): Promise<number>;
}
