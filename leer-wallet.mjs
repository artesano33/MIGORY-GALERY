// Lee los NFTs de la wallet con la API DAS de Helius y los guarda en sitio/data/nfts.json.
// Lo ejecuta GitHub Actions; la clave y la wallet llegan como secretos y nunca se publican.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const KEY = process.env.HELIUS_API_KEY;
const WALLET = process.env.WALLET_ADDRESS;
if (!KEY || !WALLET) {
  console.error("Faltan los secretos HELIUS_API_KEY o WALLET_ADDRESS en GitHub (Settings > Secrets and variables > Actions).");
  process.exit(1);
}

const URL_HELIUS = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const LIMITE = 1000;
const activos = [];

for (let pagina = 1; ; pagina++) {
  const r = await fetch(URL_HELIUS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "galeria-migory",
      method: "getAssetsByOwner",
      params: {
        ownerAddress: WALLET,
        page: pagina,
        limit: LIMITE,
        displayOptions: { showCollectionMetadata: true, showUnverifiedCollections: false }
      }
    })
  });
  if (!r.ok) throw new Error(`Helius respondió con el código ${r.status}. Revisa que la clave sea correcta.`);
  const j = await r.json();
  if (j.error) throw new Error(`Helius devolvió un error: ${j.error.message}`);
  const lote = j.result?.items ?? [];
  activos.push(...lote);
  if (lote.length < LIMITE) break;
}

const texto = v => (v === undefined || v === null ? "" : String(v));

const nfts = activos
  .filter(a => !a.burnt && !/fungible/i.test(a.interface || ""))
  .map(a => {
    const grupo = (a.grouping || []).find(g => g.group_key === "collection");
    const archivos = a.content?.files || [];
    const imagen =
      archivos.find(f => f.cdn_uri)?.cdn_uri ||
      a.content?.links?.image ||
      archivos[0]?.uri ||
      "";
    return {
      id: a.id,
      nombre: texto(a.content?.metadata?.name) || "Sin nombre",
      imagen,
      coleccion: texto(grupo?.collection_metadata?.name),
      coleccionId: texto(grupo?.group_value),
      atributos: (a.content?.metadata?.attributes || []).map(t => ({
        tipo: texto(t.trait_type),
        valor: texto(t.value)
      })),
      comprimido: !!a.compression?.compressed
    };
  });

// ---------- Detección de piezas sin revelar ----------
// Una imagen que comparten varias piezas de la misma colección es una imagen provisional
// (por ejemplo, la moneda antes de revelarse). Se recuerda de una ejecución a otra leyendo
// el nfts.json ya publicado, para que la última pieza sellada no se confunda con una revelada.
const PALABRAS_SIN_REVELAR = /unreveal|not revealed|sin revelar|mystery|hidden/i;

function baseSitio() {
  const repo = process.env.GITHUB_REPOSITORY || "";
  const [dueno, nombre] = repo.split("/");
  if (!dueno || !nombre) return "";
  return nombre.toLowerCase() === `${dueno.toLowerCase()}.github.io`
    ? `https://${dueno.toLowerCase()}.github.io`
    : `https://${dueno.toLowerCase()}.github.io/${nombre}`;
}
const BASE = baseSitio();

async function datosAnteriores() {
  const base = BASE;
  if (!base) return {};
  try {
    const r = await fetch(`${base}/data/nfts.json`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!r.ok) return {};
    return await r.json();
  } catch {
    return {};
  }
}

const anterior = await datosAnteriores();
const marcadores = new Set(Array.isArray(anterior.marcadores) ? anterior.marcadores : []);
const usos = {};
for (const n of nfts) {
  if (!n.imagen || !n.coleccionId) continue;
  const k = n.coleccionId + "|" + n.imagen;
  usos[k] = (usos[k] || 0) + 1;
}
for (const [k, c] of Object.entries(usos)) if (c > 1) marcadores.add(k.split("|").slice(1).join("|"));
for (const n of nfts) {
  const textoAtributos = n.atributos.map(a => a.tipo + " " + a.valor).join(" ");
  n.sinRevelar = !n.imagen || marcadores.has(n.imagen) || PALABRAS_SIN_REVELAR.test(n.nombre + " " + textoAtributos);
}

// ---------- Color dominante de cada imagen ----------
// Se calcula aquí (en GitHub) para que la galería sepa el color de cada pieza revelada
// antes de mostrar la imagen. Los colores ya calculados se reutilizan de la versión publicada.
const colores = (anterior.colores && typeof anterior.colores === "object") ? anterior.colores : {};

function rgbAHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

function colorDominante(px, ancho, alto) {
  // Histograma de tonos ponderado por lo vivo de cada píxel (saturación × brillo) y por su
  // cercanía al centro, donde suele estar el personaje: así pesa más su color que el del fondo.
  const bins = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0, sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < px.length; i += 3) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const p = i / 3, x = (p % ancho) / ancho - 0.5, y = Math.floor(p / ancho) / alto - 0.5;
    const centro = Math.exp(-(x * x + y * y) / (2 * 0.15 * 0.15));
    sr += r; sg += g; sb += b; n++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max / 255;
    if (v < 0.12) continue;
    const sat = max === 0 ? 0 : (max - min) / max, w = sat * sat * v * (0.02 + centro);
    if (w < 0.02) continue;
    let h = 0;
    if (max !== min) {
      const d = max - min;
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    const k = Math.floor(h / 10) % 36;
    bins[k].w += w; bins[k].r += r * w; bins[k].g += g * w; bins[k].b += b * w; total += w;
  }
  if (total < n * 0.005) return rgbAHsl(sr / n, sg / n, sb / n); // imagen casi sin color
  let mejor = 0, mejorW = -1;
  for (let k = 0; k < 36; k++) {
    const w = bins[(k + 35) % 36].w + bins[k].w + bins[(k + 1) % 36].w;
    if (w > mejorW) { mejorW = w; mejor = k; }
  }
  let W = 0, R = 0, G = 0, B = 0;
  for (const k of [(mejor + 35) % 36, mejor, (mejor + 1) % 36]) { W += bins[k].w; R += bins[k].r; G += bins[k].g; B += bins[k].b; }
  return rgbAHsl(R / W, G / W, B / W);
}

async function cargarSharp() {
  try { return (await import("sharp")).default; } catch {}
  try {
    console.log("Instalando la herramienta de imágenes (sharp)...");
    execSync("npm install --no-save --no-package-lock --no-audit --no-fund sharp@0.33.5", { stdio: "inherit" });
    return (await import("sharp")).default;
  } catch (e) {
    console.log("No se pudo instalar sharp; las piezas usarán su color por defecto.", e.message);
    return null;
  }
}

// ---------- Imágenes ligeras ----------
// Cada imagen se guarda en dos tamaños optimizados (WebP): una miniatura para las salas y una
// versión grande para la ficha y la ceremonia. Las que ya se publicaron antes se reutilizan.
const TAMANOS = { mini: 640, grande: 1400 };
const miniaturasPrevias = (anterior.miniaturas && typeof anterior.miniaturas === "object") ? anterior.miniaturas : {};
const miniaturas = {};
const claveDe = url => createHash("sha1").update(url).digest("hex").slice(0, 16);
const rutaDe = (clave, tam) => `img/${clave}-${TAMANOS[tam]}.webp`;
await mkdir("sitio/img", { recursive: true });

async function reutilizarPublicadas(clave) {
  if (!BASE) return false;
  try {
    const bufs = {};
    for (const tam of Object.keys(TAMANOS)) {
      const r = await fetch(`${BASE}/${rutaDe(clave, tam)}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return false;
      bufs[tam] = Buffer.from(await r.arrayBuffer());
    }
    for (const tam of Object.keys(TAMANOS)) await writeFile(`sitio/${rutaDe(clave, tam)}`, bufs[tam]);
    return true;
  } catch {
    return false;
  }
}

// ---------- Solo las colecciones que muestra la galería ----------
// Se leen los IDs de colección configurados en SALAS dentro de index.html. Los NFTs de otras
// colecciones no se procesan ni se publican. Si no hay IDs configurados, se usan todos.
async function coleccionesDeLaGaleria() {
  for (const ruta of ["sitio/index.html", "index.html"]) {
    try {
      const html = await readFile(ruta, "utf8");
      const ids = new Set();
      for (const m of html.matchAll(/colecciones\s*:\s*\[([^\]]*)\]/g))
        for (const id of m[1].matchAll(/["']([1-9A-HJ-NP-Za-km-z]{32,44})["']/g)) ids.add(id[1]);
      return ids;
    } catch {}
  }
  return new Set();
}
const delaGaleria = await coleccionesDeLaGaleria();
const galeria = delaGaleria.size ? nfts.filter(n => delaGaleria.has(n.coleccionId)) : nfts;
console.log(delaGaleria.size
  ? `Colecciones de la galería: ${delaGaleria.size}. Piezas que se publican: ${galeria.length} de ${nfts.length}.`
  : "No hay colecciones fijadas en la galería: se publican todas las piezas.");

const nombresDe = {};
for (const n of galeria) (nombresDe[n.imagen] ??= []).push(n.nombre);
const urls = [...new Set(galeria.map(n => n.imagen).filter(u => /^https?:\/\//i.test(u)))];
let sharp = null, sharpCargado = false;
let reutilizadas = 0, generadas = 0;
let i = 0;
const trabajador = async () => {
  while (i < urls.length) {
    const url = urls[i++];
    const clave = claveDe(url);
    let lista = miniaturasPrevias[url] === clave && await reutilizarPublicadas(clave);
    if (lista) reutilizadas++;
    if (lista && colores[url]) { miniaturas[url] = clave; continue; }
    try {
      if (!sharpCargado) { sharpCargado = true; sharp = await cargarSharp(); }
      if (!sharp) continue;
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!colores[url]) {
        const { data, info } = await sharp(buf, { animated: false }).resize(64, 64, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        colores[url] = colorDominante(data, info.width, info.height);
      }
      if (!lista) {
        for (const [tam, px] of Object.entries(TAMANOS)) {
          await sharp(buf, { animated: false }).rotate()
            .resize(px, px, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: tam === "mini" ? 80 : 86, effort: 5 })
            .toFile(`sitio/${rutaDe(clave, tam)}`);
        }
        generadas++;
        lista = true;
      }
    } catch (e) {
      console.log(`  No se pudo procesar la imagen de ${(nombresDe[url] || ["una pieza"]).join(", ")} (${e.message})`);
    }
    if (lista) miniaturas[url] = clave;
  }
};
// sharp se carga una sola vez antes de repartir el trabajo
if (urls.some(u => !(miniaturasPrevias[u] && colores[u]))) { sharpCargado = true; sharp = await cargarSharp(); }
await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
console.log(`Imágenes ligeras: ${generadas} nuevas, ${reutilizadas} reutilizadas.`);

const enUso = {};
for (const n of galeria) {
  if (colores[n.imagen]) { n.color = colores[n.imagen]; enUso[n.imagen] = colores[n.imagen]; }
  const clave = miniaturas[n.imagen];
  if (clave) { n.mini = rutaDe(clave, "mini"); n.grande = rutaDe(clave, "grande"); }
}
console.log(`Colores calculados: ${Object.keys(enUso).length} imágenes.`);

// Resumen en el registro de la acción, para copiar los IDs de colección a la galería.
const resumen = {};
for (const n of nfts) {
  const k = n.coleccionId || "(sin colección verificada)";
  resumen[k] ??= { coleccion: n.coleccion || "(sin nombre)", piezas: 0 };
  resumen[k].piezas++;
}
console.log(`\nNFTs encontrados: ${nfts.length} (sin revelar: ${nfts.filter(n => n.sinRevelar).length})\n\nColecciones (ID y nombre):`);
for (const [id, v] of Object.entries(resumen)) console.log(`  ${id}  ${v.coleccion}  (${v.piezas})`);

await mkdir("sitio/data", { recursive: true });
await writeFile(
  "sitio/data/nfts.json",
  JSON.stringify({ actualizado: new Date().toISOString(), marcadores: [...marcadores], colores: enUso, miniaturas, nfts: galeria }, null, 2)
);
console.log("\nGuardado en sitio/data/nfts.json");
