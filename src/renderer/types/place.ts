export interface Place {
  id?: number;
  name: string;
  /** City where the place is located. */
  city_id: number;
  /** From JOIN with cities; for list/detail display. */
  city_name?: string;
  created_at?: string;
  updated_at?: string;
}
