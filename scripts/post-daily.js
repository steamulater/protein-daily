#!/usr/bin/env node
// Daily Protein of the Day → Canva slide → X post
// Requires env vars: CANVA_API_TOKEN, CANVA_TEMPLATE_ID,
//                   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET

import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load proteins ────────────────────────────────────────────────────────────

const proteinsPath = join(__dirname, '..', 'proteins.js');
const raw = readFileSync(proteinsPath, 'utf8');
// Strip the `const PROTEINS =` wrapper so we can JSON-parse the array
const jsonStr = raw.replace(/^const PROTEINS\s*=\s*/, '').replace(/;\s*$/, '');
const PROTEINS = JSON.parse(
    jsonStr.replace(/undefined/g, 'null')
           .replace(/,\s*([\]\}])/g, '$1') // trailing commas
);

// ─── Today's protein ─────────────────────────────────────────────────────────

function getDayOfYear() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

const dayIndex = getDayOfYear() - 1;
const protein = PROTEINS[dayIndex];

if (!protein) {
    console.error(`No protein found for day ${dayIndex + 1}`);
    process.exit(1);
}

console.log(`Day ${dayIndex + 1}: ${protein.name} (${protein.pdbId})`);

// ─── RCSB image URL ──────────────────────────────────────────────────────────

const pdbLower = protein.pdbId.toLowerCase();
const imageUrl = `https://cdn.rcsb.org/images/structures/${pdbLower}/${pdbLower}-assembly-1.jpeg`;

// ─── Canva helpers ───────────────────────────────────────────────────────────

const CANVA_BASE = 'https://api.canva.com/rest/v1';
const CANVA_TOKEN = process.env.CANVA_API_TOKEN;
const TEMPLATE_ID = process.env.CANVA_TEMPLATE_ID;

async function canvaRequest(method, path, body) {
    const res = await fetch(`${CANVA_BASE}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${CANVA_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Canva ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
}

async function poll(fn, label, intervalMs = 2000, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const result = await fn();
        if (result) return result;
        console.log(`  Waiting for ${label}…`);
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error(`Timed out waiting for ${label}`);
}

// Upload the RCSB image as a Canva asset
async function uploadImageToCanva(url) {
    console.log('Fetching RCSB image…');
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`RCSB image fetch failed: ${imgRes.status}`);
    const buffer = await imgRes.arrayBuffer();
    const bytes = Buffer.from(buffer);

    // Canva asset upload — multipart
    const boundary = '----CanvaBoundary';
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${protein.name}.jpg\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="asset"; filename="${protein.pdbId}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const res = await fetch(`${CANVA_BASE}/assets`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${CANVA_TOKEN}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
    });
    if (!res.ok) throw new Error(`Asset upload failed: ${res.status} ${await res.text()}`);
    const data = await res.json();

    // Poll until asset is ready
    const assetId = data.asset?.id || data.job?.id;
    if (data.asset?.id) return data.asset.id;

    return poll(async () => {
        const status = await canvaRequest('GET', `/assets/${assetId}`);
        return status.asset?.id || null;
    }, 'asset upload');
}

// Create autofill job — fills template placeholders with today's protein data
async function autofillTemplate(assetId) {
    console.log('Creating Canva autofill job…');

    // Your Canva template needs these named data fields:
    //   protein_image  (image)
    //   protein_name   (text)
    //   protein_type   (text)
    //   pdb_id         (text)
    //   fun_fact       (text)
    //   day_number     (text)
    const job = await canvaRequest('POST', '/autofills', {
        brand_template_id: TEMPLATE_ID,
        title: `Protein of the Day — Day ${dayIndex + 1}`,
        data: {
            protein_image: { type: 'image', asset_id: assetId },
            protein_name:  { type: 'text',  text: protein.name },
            protein_type:  { type: 'text',  text: protein.type.toUpperCase() },
            pdb_id:        { type: 'text',  text: `PDB: ${protein.pdbId}` },
            fun_fact:      { type: 'text',  text: protein.funFact },
            day_number:    { type: 'text',  text: `Day ${dayIndex + 1} of 365` }
        }
    });

    const jobId = job.job.id;
    return poll(async () => {
        const status = await canvaRequest('GET', `/autofills/${jobId}`);
        if (status.job.status === 'success') return status.job.result.design.id;
        if (status.job.status === 'failed') throw new Error('Autofill job failed');
        return null;
    }, 'autofill');
}

// Export the filled design as a PNG
async function exportDesign(designId) {
    console.log('Exporting design…');
    const job = await canvaRequest('POST', '/exports', {
        design_id: designId,
        format: 'png',
        export_quality: 'pro'
    });

    const jobId = job.job.id;
    const downloadUrl = await poll(async () => {
        const status = await canvaRequest('GET', `/exports/${jobId}`);
        if (status.job.status === 'success') return status.job.urls[0];
        if (status.job.status === 'failed') throw new Error('Export failed');
        return null;
    }, 'export');

    console.log('Downloading exported PNG…');
    const res = await fetch(downloadUrl);
    return Buffer.from(await res.arrayBuffer());
}

// ─── X (Twitter) helpers ─────────────────────────────────────────────────────

const X_API_KEY     = process.env.X_API_KEY;
const X_API_SECRET  = process.env.X_API_SECRET;
const X_ACCESS_TOKEN  = process.env.X_ACCESS_TOKEN;
const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET;

function oauthHeader(method, url, params = {}) {
    const nonce = Math.random().toString(36).slice(2);
    const ts = Math.floor(Date.now() / 1000).toString();

    const oauthParams = {
        oauth_consumer_key: X_API_KEY,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: ts,
        oauth_token: X_ACCESS_TOKEN,
        oauth_version: '1.0'
    };

    const allParams = { ...params, ...oauthParams };
    const sorted = Object.keys(allParams).sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`).join('&');

    const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sorted)}`;
    const signingKey = `${encodeURIComponent(X_API_SECRET)}&${encodeURIComponent(X_ACCESS_SECRET)}`;
    const sig = createHmac('sha1', signingKey).update(base).digest('base64');

    const headerParams = { ...oauthParams, oauth_signature: sig };
    const headerStr = Object.keys(headerParams).sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(headerParams[k])}"`)
        .join(', ');

    return `OAuth ${headerStr}`;
}

async function uploadMediaToX(imageBuffer) {
    console.log('Uploading image to X…');
    const url = 'https://upload.twitter.com/1.1/media/upload.json';
    const b64 = imageBuffer.toString('base64');

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': oauthHeader('POST', url),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `media_data=${encodeURIComponent(b64)}`
    });
    if (!res.ok) throw new Error(`X media upload failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.media_id_string;
}

async function postTweet(text, mediaId) {
    console.log('Posting tweet…');
    const url = 'https://api.twitter.com/2/tweets';
    const body = { text, media: { media_ids: [mediaId] } };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': oauthHeader('POST', url),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Tweet failed: ${res.status} ${await res.text()}`);
    return res.json();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    // 1. Upload RCSB image to Canva
    const assetId = await uploadImageToCanva(imageUrl);
    console.log(`  Asset ID: ${assetId}`);

    // 2. Fill template
    const designId = await autofillTemplate(assetId);
    console.log(`  Design ID: ${designId}`);

    // 3. Export as PNG
    const imageBuffer = await exportDesign(designId);
    console.log(`  Exported ${imageBuffer.length} bytes`);

    // 4. Upload to X and post
    const mediaId = await uploadMediaToX(imageBuffer);
    const caption = [
        `Day ${dayIndex + 1} of 365 — ${protein.name}`,
        '',
        protein.description,
        '',
        `✨ ${protein.funFact}`,
        '',
        `#ProteinOfTheDay #Biochemistry #Science #PDB${protein.pdbId}`
    ].join('\n');

    const tweet = await postTweet(caption, mediaId);
    console.log(`Posted! Tweet ID: ${tweet.data.id}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
