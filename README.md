# Galería MIGORY

Galería privada que lee tu wallet de Solana y muestra automáticamente tus NFTs de MIGORY.
GitHub lee la wallet cada 6 horas usando Helius, guarda la lista en `sitio/data/nfts.json`
y publica la página en GitHub Pages. La clave de Helius vive como secreto en GitHub y nunca
llega al navegador.

## Qué hay en el proyecto

```
sitio/index.html                 La galería
sitio/data/nfts.json             Lista de NFTs (la genera la acción, no se edita a mano)
scripts/leer-wallet.mjs          Lee la wallet con Helius
.github/workflows/galeria.yml    Acción que actualiza y publica la galería
```

## Puesta en marcha

### 1. Consigue tu clave de Helius
Crea una cuenta gratuita en helius.dev y copia tu API key desde el panel.

### 2. Crea el repositorio en GitHub
1. En GitHub, pulsa **New repository**. Ponle un nombre, por ejemplo `galeria-migory`.
2. Déjalo como **Public** (GitHub Pages es gratis en repositorios públicos).
3. Entra al repositorio, pulsa **Add file > Upload files** y arrastra todo el contenido de esta carpeta.

La carpeta `.github` empieza con punto y algunos sistemas la ocultan. En Mac, pulsa
`Cmd + Shift + .` en el Finder para verla. Si no se sube, créala a mano: **Add file > Create new file**,
escribe `.github/workflows/galeria.yml` como nombre y pega el contenido del archivo.

### 3. Guarda los secretos
En el repositorio: **Settings > Secrets and variables > Actions > New repository secret**.
Crea estos dos:

| Nombre | Valor |
|---|---|
| `HELIUS_API_KEY` | Tu clave de Helius |
| `WALLET_ADDRESS` | La dirección pública de tu wallet de Solana |

Nunca pongas aquí ni en ningún otro lugar tu frase semilla ni tu clave privada. La galería solo
necesita la dirección pública.

### 4. Activa GitHub Pages
**Settings > Pages > Build and deployment > Source:** elige **GitHub Actions**.

### 5. Ejecuta la acción por primera vez
Pestaña **Actions > Galería MIGORY > Run workflow**. Cuando termine (marca verde), la galería
estará en:

```
https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/
```

## Recomendado: fija las colecciones por su ID

Al principio, la galería reconoce cada familia por palabras en el nombre de la colección
(`fun guy`, `plastik`, `agent`, `infernal`, `terrestrial`). Ya descarta los NFTs que no tienen una
colección verificada, pero lo más seguro contra NFTs falsos que llegan como spam es usar el ID
exacto de cada colección.

1. En **Actions**, abre la última ejecución y el paso **Leer la wallet**. Verás una lista así:
   ```
   Colecciones (ID y nombre):
     AbC123...xyz  Fun Guys  (4)
   ```
2. En `sitio/index.html`, busca `const SALAS` y pega cada ID en la sala que corresponde:
   ```js
   buscar:["fun guy","funguy","fun guys"], colecciones:["AbC123...xyz"] },
   ```
3. Guarda el archivo. La galería se vuelve a publicar sola.

Cuando mintees Agentes, Infernals o Terrestrials, repite estos pasos para su colección.

## Personalizar

- **Frecuencia de actualización:** en `.github/workflows/galeria.yml`, la línea `cron: "0 */6 * * *"`
  significa cada 6 horas. `"0 * * * *"` sería cada hora. También puedes actualizar al momento con
  **Run workflow**.
- **Textos y orden de las salas:** en `const SALAS` dentro de `sitio/index.html`. Cada sala tiene
  título, subtítulo, texto, color (`tono`, de 0 a 360) y estilo (`orbita`, `capsulas` o `marcos`).
- **Plastiks sin revelar:** se muestran como cápsulas selladas si no tienen imagen, si su nombre o
  atributos dicen "unrevealed" o similar, o si varios comparten la misma imagen. Cuando se revelen,
  la cápsula se abre sola en la siguiente actualización.

## Si algo falla

- **La acción marca error en "Leer la wallet":** revisa que los dos secretos estén bien escritos.
- **La galería dice que no encontró piezas de MIGORY:** revisa la lista de colecciones en el registro
  de la acción y ajusta las palabras o los IDs en `SALAS`.
- **Dejó de actualizarse sola:** GitHub pausa las acciones programadas si el repositorio pasa 60 días
  sin cambios. Entra a **Actions** y vuelve a activarla.
