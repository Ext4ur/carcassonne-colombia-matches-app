import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables for Colombia
dotenv.config({ path: path.join(process.cwd(), '.env.colombia') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SECRET_KEY; // Requires Service Role / Secret Key

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials in .env.colombia');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupCities() {
  console.log('🧹 Cleaning up non-default cities in Supabase (Colombia)...');

  // Keep these UUIDs
  const allowedUuids = [
    '00000000-0000-0000-0000-000000000001', // Online City
    '00000000-0000-0000-0000-000000000002', // Offline City
  ];

  const allowedPlaceUuids = [
    '00000000-0000-0000-0000-100000000001', // Online Place
    '00000000-0000-0000-0000-100000000002', // Offline Place
  ];

  try {
    // 1. Places cleanup
    const { data: places, error: pError } = await supabase
      .from('places')
      .delete()
      .not('uuid', 'in', `(${allowedPlaceUuids.join(',')})`);

    if (pError) throw pError;
    console.log('✅ Places cleaned up.');

    // 2. Cities cleanup
    const { data: cities, error: cError } = await supabase
      .from('cities')
      .delete()
      .not('uuid', 'in', `(${allowedUuids.join(',')})`);

    if (cError) throw cError;
    console.log('✅ Cities cleaned up.');

    // 3. Ensure defaults exist in cloud
    console.log('✨ Ensuring Online/Offline exist in cloud...');
    
    await supabase.from('cities').upsert([
      { name: 'Online', uuid: '00000000-0000-0000-0000-000000000001' },
      { name: 'Offline', uuid: '00000000-0000-0000-0000-000000000002' }
    ]);

    const { data: onlineCity } = await supabase.from('cities').select('id').eq('name', 'Online').single();
    const { data: offlineCity } = await supabase.from('cities').select('id').eq('name', 'Offline').single();

    if (onlineCity) {
      await supabase.from('places').upsert({
        name: 'Online',
        city_id: onlineCity.id,
        uuid: '00000000-0000-0000-0000-100000000001',
        city_uuid: '00000000-0000-0000-0000-000000000001'
      });
    }

    if (offlineCity) {
      await supabase.from('places').upsert({
        name: 'Offline',
        city_id: offlineCity.id,
        uuid: '00000000-0000-0000-0000-100000000002',
        city_uuid: '00000000-0000-0000-0000-000000000002'
      });
    }

    console.log('🚀 Supabase cleanup complete!');
  } catch (err) {
    console.error('❌ Sync Cleanup failed:', err.message);
  }
}

cleanupCities();
