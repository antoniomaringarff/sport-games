// Convierte las texturas de Poly Haven (assets-raw/textures/<nombre>/{Diffuse,nor_gl,Rough}.jpg)
// a WebP livianas en public/assets/textures/<nombre>_{color,normal,rough}.webp
// Uso: node tools/convert-textures.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'assets-raw/textures';
const OUT = 'public/assets/textures';
const SIZE = { color: 1024, normal: 1024, rough: 512 };
const MAPS = { Diffuse: 'color', nor_gl: 'normal', Rough: 'rough' };

fs.mkdirSync(OUT, { recursive: true });
for (const name of fs.readdirSync(SRC)) {
  for (const [src, kind] of Object.entries(MAPS)) {
    const file = path.join(SRC, name, `${src}.jpg`);
    if (!fs.existsSync(file)) continue;
    const out = path.join(OUT, `${name}_${kind}.webp`);
    await sharp(file).resize(SIZE[kind], SIZE[kind]).webp({ quality: kind === 'normal' ? 90 : 80 }).toFile(out);
    console.log(out, Math.round(fs.statSync(out).size / 1024), 'KB');
  }
}
