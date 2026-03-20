#!/bin/bash
# Protein Daily — local dev server
# Run this from the project root to serve the app at http://localhost:3000

set -e

# Build: copy source files into www/
echo "Building..."
mkdir -p www
cp index.html styles.css app.js proteins.js cache.js proteins.csv www/
cp -r vendor www/
echo "Build complete."

# Start server
echo "Serving at http://localhost:3000 — press Ctrl+C to stop"
cd www && python3 -m http.server 3000
