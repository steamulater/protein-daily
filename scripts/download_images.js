#!/usr/bin/env node
// One-time setup: parse proteins_with_blurbs.csv → proteins.json + download all RCSB images
// Run locally before committing: node scripts/download_images.js
//
// Output:
//   proteins.json        — clean JSON array used by post-daily.js
//   images/{pdbId}.jpeg  — one image per protein, committed to repo

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'images');
const CSV_PATH   = join(ROOT, 'proteins_with_blurbs.csv');
const JSON_PATH  = join(ROOT, 'proteins.json');

mkdirSync(IMAGES_DIR, { recursive: true });

// ─── CSV parser (handles quoted fields with commas/newlines) ──────────────────
function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = parseRow(lines[0]);
    return lines.slice(1).map(line => {
        const values = parseRow(line);
        return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()]));
    });
}

function parseRow(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);
    return fields;
}

// ─── Build proteins.json ──────────────────────────────────────────────────────
const rows = parseCSV(readFileSync(CSV_PATH, 'utf8'));

const proteins = rows.map(r => ({
    id:            parseInt(r['ID']),
    pdbId:         r['PDB ID'],
    name:          r['Name'],
    type:          r['Type'],
    description:   r['Description'],
    bioRelevance:  parseInt(r['Bio Relevance']),
    notoriety:     parseInt(r['Notoriety']),
    discoveryYear: parseInt(r['Discovery Year']),
    funFact:       r['Fun Fact'],
    dailyBlurb:    r['Daily Blurb'],
}));

writeFileSync(JSON_PATH, JSON.stringify(proteins, null, 2));
console.log(`proteins.json written — ${proteins.length} entries\n`);

// ─── Download images ──────────────────────────────────────────────────────────
let downloaded = 0, skipped = 0, failed = 0;

for (const p of proteins) {
    const dest = join(IMAGES_DIR, `${p.pdbId}.jpeg`);

    if (existsSync(dest)) {
        skipped++;
        continue;
    }

    const pdbLower = p.pdbId.toLowerCase();
    const url = `https://cdn.rcsb.org/images/structures/${pdbLower}_assembly-1.jpeg`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(dest, buf);
        downloaded++;
        process.stdout.write(`[${downloaded + skipped}/${proteins.length}] ${p.pdbId}  ${p.name}\n`);
    } catch (e) {
        failed++;
        console.error(`  FAILED ${p.pdbId}  ${p.name}: ${e.message}`);
    }
}

console.log(`\nDone.  Downloaded: ${downloaded}  Skipped (already had): ${skipped}  Failed: ${failed}`);
if (failed > 0) {
    console.log('Re-run to retry failed images, or check PDB IDs manually.');
}
