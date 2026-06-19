#!/usr/bin/env node
/**
 * Admin: genera códigos Devir ligados a un torneo ya existente en Supabase.
 *
 * Uso:
 *   node scripts/generate-store-codes.mjs \
 *     --tournament-uuid=<uuid> \
 *     --place-name="Tienda X Bogotá" \
 *     --valid-until=2026-12-31 \
 *     [--out=store-codes.csv]
 *
 * Batch (JSON array):
 *   node scripts/generate-store-codes.mjs --batch=codes.json --out=store-codes.csv
 *
 * Requiere VITE_SUPABASE_URL y VITE_SUPABASE_SECRET_KEY en .env.colombia
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.colombia') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SECRET_KEY;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      args[raw.slice(2)] = true;
    } else {
      args[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return args;
}

function generateCode(placeName) {
  const slug =
    placeName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase() || 'STORE';
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const year = new Date().getFullYear();
  return `DEVIR-${slug}-${year}-${suffix}`;
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function ensureTournamentExists(supabase, tournamentUuid) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('uuid, name, status')
    .eq('uuid', tournamentUuid)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`Torneo no encontrado en Supabase: ${tournamentUuid}`);
  }
  return data;
}

async function insertActivation(supabase, { tournament_uuid, place_name, valid_until }) {
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode(place_name);
    const { error } = await supabase.from('store_activations').insert({
      code,
      place_name,
      tournament_uuid,
      valid_until,
      status: 'available',
    });
    if (!error) return code;
    if (error.code !== '23505') throw error;
  }
  throw new Error('No se pudo generar un código único tras varios intentos');
}

async function main() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_SECRET_KEY en .env.colombia');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out ?? 'store-codes.csv';
  const supabase = createClient(supabaseUrl, supabaseKey);

  /** @type {{ tournament_uuid: string; place_name: string; valid_until: string }[]} */
  let rows = [];

  if (args.batch) {
    const batchPath = path.resolve(process.cwd(), args.batch);
    const parsed = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new Error('--batch debe ser un JSON array');
    }
    rows = parsed;
  } else {
    const { 'tournament-uuid': tournament_uuid, 'place-name': place_name, 'valid-until': valid_until } =
      args;
    if (!tournament_uuid || !place_name || !valid_until) {
      console.error(
        'Uso: --tournament-uuid=<uuid> --place-name="Nombre" --valid-until=YYYY-MM-DD [--out=file.csv]'
      );
      process.exit(1);
    }
    rows = [{ tournament_uuid, place_name, valid_until }];
  }

  const csvLines = ['code,place_name,tournament_uuid,valid_until,tournament_name'];
  const created = [];

  for (const row of rows) {
    const tournament = await ensureTournamentExists(supabase, row.tournament_uuid);
    const code = await insertActivation(supabase, row);
    created.push({ code, ...row, tournament_name: tournament.name });
    csvLines.push(
      [
        escapeCsv(code),
        escapeCsv(row.place_name),
        escapeCsv(row.tournament_uuid),
        escapeCsv(row.valid_until),
        escapeCsv(tournament.name),
      ].join(',')
    );
    console.log(`✅ ${code} → ${row.place_name} (${tournament.name})`);
  }

  fs.writeFileSync(outPath, `${csvLines.join('\n')}\n`, 'utf8');
  console.log(`\n📄 CSV guardado en ${outPath} (${created.length} código(s))`);
}

main().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
