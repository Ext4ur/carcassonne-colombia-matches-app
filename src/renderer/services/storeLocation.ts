import { DatabaseService } from './database';
import { isStoreMode } from '../utils/appMode';

export type StoreLocationInput = {
  cityName: string;
  placeName: string;
};

/** Crea ciudad y lugar locales al crear el primer torneo en tienda. */
export async function resolveStorePlaceId(
  placeId: number | undefined,
  location?: StoreLocationInput
): Promise<number> {
  if (!isStoreMode()) {
    if (placeId == null) throw new Error('PLACE_REQUIRED');
    return placeId;
  }

  const cityName = location?.cityName?.trim();
  const placeName = location?.placeName?.trim();
  if (!cityName || !placeName) throw new Error('STORE_LOCATION_REQUIRED');

  const cityId = Number(await DatabaseService.createCity({ name: cityName }));
  const newPlaceId = Number(
    await DatabaseService.createPlace({ name: placeName, city_id: cityId })
  );
  return newPlaceId;
}
