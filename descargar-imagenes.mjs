// Descarga en tamaño original las imágenes de todos los NFTs revelados de la galería
// y las ordena en carpetas por familia (Plastiks, Fun Guys, Agents, Infernals, ...).
// Lo usa la acción "Descargar imágenes MIGORY"; no necesita ninguna clave.

import { mkdir, writeFile, rm } from "node:fs/promises";

const DATOS = process.env.DATOS_URL || "https://artesano33.github.io/MIGORY-GALERY/data/nfts.json";
const SALIDA = process.env.SALIDA || "MIGORY";

const FAMILIAS = [
  ["Plastiks", ["plastik"]],
  ["Fun Guys", ["fun guy", "funguy", "fun guys"]],
  ["Agents", ["agent"]],
  ["Infernals", ["infernal"]],
  ["Terrestrials", ["terrestrial"]],
];

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const familiaDe = n => {
  const t = norm([n.coleccion, n.nombre, ...(n.atributos || []).map(a => a.tipo + " " + a.valor)].join(" "));
  return FAMILIAS.find(([, claves]) => claves.some(c => t.includes(norm(c))))?.[0] || "Otros";
};

// La galería guarda a veces la imagen pasada por el CDN de Helius (reducida).
// Aquí se busca la dirección original para bajarla a máxima calidad.
const original = url => {
  const m = String(url).match(/\/cdn-cgi\/image\/[^/]*\/(https?:\/\/.+)$/i);
  return m ? m[1] : url;
};
const ipfs = url => String(url).replace(/^ipfs:\/\//i, "https://ipfs.io/ipfs/");

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif", "video/mp4": "mp4" };
const nombreArchivo = s => String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim() || "pieza";

async function bajar(url) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90000), redirect: "follow" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const tipo = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      return { datos: Buffer.from(await r.arrayBuffer()), tipo };
    } catch (e) {
      if (intento === 3) throw e;
      await new Promise(ok => setTimeout(ok, 2000 * intento));
    }
  }
}

const r = await fetch(DATOS, { cache: "no-store" });
if (!r.ok) throw new Error(`No se pudo leer ${DATOS} (HTTP ${r.status}). ¿Está publicada la galería?`);
const { nfts = [] } = await r.json();
const revelados = nfts.filter(n => !n.sinRevelar && n.imagen);
console.log(`Piezas reveladas: ${revelados.length} de ${nfts.length}\n`);

await rm(SALIDA, { recursive: true, force: true });
const usados = new Set();
const cuenta = {};
let fallos = 0;

for (const n of revelados) {
  const familia = familiaDe(n);
  await mkdir(`${SALIDA}/${familia}`, { recursive: true });
  const urls = [...new Set([ipfs(original(n.imagen)), ipfs(n.imagen)])];
  let hecho = false;
  for (const url of urls) {
    try {
      const { datos, tipo } = await bajar(url);
      const ext = EXT[tipo] || (url.match(/\.(png|jpe?g|gif|webp|svg|avif|mp4)(\?|$)/i)?.[1] || "png").toLowerCase();
      let base = `${SALIDA}/${familia}/${nombreArchivo(n.nombre)}`;
      let ruta = `${base}.${ext}`;
      for (let i = 2; usados.has(ruta); i++) ruta = `${base} (${i}).${ext}`;
      usados.add(ruta);
      await writeFile(ruta, datos);
      cuenta[familia] = (cuenta[familia] || 0) + 1;
      console.log(`  ✓ ${familia} / ${ruta.split("/").pop()}  (${(datos.length / 1048576).toFixed(1)} MB)`);
      hecho = true;
      break;
    } catch (e) {
      console.log(`  … ${n.nombre}: no se pudo bajar de ${url} (${e.message})`);
    }
  }
  if (!hecho) { fallos++; console.log(`  ✗ ${n.nombre}: no se pudo descargar`); }
}

console.log("\nResumen:");
for (const [f, c] of Object.entries(cuenta)) console.log(`  ${f}: ${c}`);
if (fallos) console.log(`  No descargadas: ${fallos}`);
