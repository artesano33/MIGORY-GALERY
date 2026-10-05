// Lee los NFTs de la wallet con la API DAS de Helius y los guarda en sitio/data/nfts.json.
// Lo ejecuta GitHub Actions; la clave y la wallet llegan como secretos y nunca se publican.
import { mkdir, writeFile } from "node:fs/promises";

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

// Resumen en el registro de la acción, para copiar los IDs de colección a la galería.
const resumen = {};
for (const n of nfts) {
  const k = n.coleccionId || "(sin colección verificada)";
  resumen[k] ??= { coleccion: n.coleccion || "(sin nombre)", piezas: 0 };
  resumen[k].piezas++;
}
console.log(`\nNFTs encontrados: ${nfts.length}\n\nColecciones (ID y nombre):`);
for (const [id, v] of Object.entries(resumen)) console.log(`  ${id}  ${v.coleccion}  (${v.piezas})`);

await mkdir("sitio/data", { recursive: true });
await writeFile(
  "sitio/data/nfts.json",
  JSON.stringify({ actualizado: new Date().toISOString(), nfts }, null, 2)
);
console.log("\nGuardado en sitio/data/nfts.json");
