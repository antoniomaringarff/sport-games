import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const nodes = j.nodes.map((n, i) => `${i}:${n.name} t=${(n.translation||[0,0,0]).map(v=>v.toFixed(2))} r=${n.rotation? n.rotation.map(v=>v.toFixed(2)):''} s=${n.scale||''} mesh=${n.mesh??''} ch=${n.children||''}`);
  const acc = j.meshes.map(m => m.primitives.map(p => { const a = j.accessors[p.attributes.POSITION]; return `${m.name} min=${a.min.map(v=>v.toFixed(2))} max=${a.max.map(v=>v.toFixed(2))}`; }).join('|'));
  console.log('==', f, 'images:', JSON.stringify(j.images), 'materials:', j.materials?.map(m=>m.name));
  console.log(nodes.join('\n')); console.log(acc.join('\n'));
}
