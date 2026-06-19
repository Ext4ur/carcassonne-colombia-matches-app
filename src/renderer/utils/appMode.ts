/** Build tienda kiosk: un clasificatorio local, export al finalizar. */
export function isStoreMode(): boolean {
  return import.meta.env.VITE_DEVIR_STORE_MODE === 'true';
}

/** Build sede central Devir: app completa solo local (import/export, sin nube). */
export function isDevirHqMode(): boolean {
  return import.meta.env.VITE_DEVIR_HQ_MODE === 'true';
}

/** Perfiles sin Supabase: tienda y sede Devir. */
export function isLocalOnlyMode(): boolean {
  return isStoreMode() || isDevirHqMode();
}
