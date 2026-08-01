import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const projectRoot = resolve(import.meta.dirname, '..');
const distDir = resolve(projectRoot, 'dist');
const indexPath = resolve(distDir, 'index.html');
const assetsDir = resolve(distDir, 'assets');
const loaderSizeLimit = 12_000;
const maximumSourceChunkSize = 40_000;
const maximumCompressedChunkSize = 12_000;

const assetNames = await readdir(assetsDir);
const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
const cssAssets = assetNames.filter((name) => name.endsWith('.css'));

if (jsAssets.length !== 1 || cssAssets.length !== 1) {
  throw new Error(
    `Expected one JavaScript and one CSS asset, found ${jsAssets.length} JavaScript and ${cssAssets.length} CSS assets.`
  );
}

const [html, appJs, appCss] = await Promise.all([
  readFile(indexPath, 'utf8'),
  readFile(resolve(assetsDir, jsAssets[0])),
  readFile(resolve(assetsDir, cssAssets[0])),
]);

const buildHash = createHash('sha256')
  .update('resilient-loader-v4')
  .update(appJs)
  .update(appCss)
  .digest('hex')
  .slice(0, 12);
const payloadName = `resilient-${buildHash}`;
const payloadDir = resolve(assetsDir, payloadName);

await rm(payloadDir, { recursive: true, force: true });
await mkdir(payloadDir, { recursive: true });

async function writeChunks(prefix, source) {
  const chunks = [];
  let offset = 0;
  let index = 0;

  while (offset < source.length) {
    let sourceChunkSize = Math.min(maximumSourceChunkSize, source.length - offset);
    let chunk = source.subarray(offset, offset + sourceChunkSize);
    let compressedChunk = gzipSync(chunk, { level: 9 });

    while (compressedChunk.length > maximumCompressedChunkSize && sourceChunkSize > loaderSizeLimit) {
      sourceChunkSize = Math.max(loaderSizeLimit, Math.floor(sourceChunkSize * 0.8));
      chunk = source.subarray(offset, offset + sourceChunkSize);
      compressedChunk = gzipSync(chunk, { level: 9 });
    }

    if (compressedChunk.length > maximumCompressedChunkSize) {
      throw new Error(
        `${prefix} chunk ${index} is too large after compression: ${compressedChunk.length} bytes.`
      );
    }

    const fileName = `${prefix}-${String(index).padStart(3, '0')}.bin`;
    await Promise.all([
      writeFile(resolve(payloadDir, fileName), chunk),
      writeFile(resolve(payloadDir, `${fileName}.gz`), compressedChunk),
    ]);
    chunks.push({
      url: `/assets/${payloadName}/${fileName}`,
      size: chunk.length,
    });

    offset += sourceChunkSize;
    index += 1;
  }

  return chunks;
}

const [jsChunks, cssChunks] = await Promise.all([
  writeChunks('app', appJs),
  writeChunks('styles', appCss),
]);

const manifest = JSON.stringify({
  js: jsChunks,
  css: cssChunks,
});

const loadingState = [
  '<div id="root">',
  '<main class="boot-screen" aria-live="polite">',
  '<div class="boot-content">',
  '<div class="boot-brand">Office ServiceDesk</div>',
  '<div id="boot-status" class="boot-status">Загружаем рабочее пространство...</div>',
  '<div class="boot-track" aria-hidden="true"><div id="boot-progress" class="boot-progress"></div></div>',
  '<button id="boot-retry" class="boot-retry" type="button" hidden>Повторить</button>',
  '</div>',
  '</main>',
  '</div>',
].join('');

const bootStyles = [
  '<style>',
  'html,body,#root{min-height:100%;margin:0}',
  '.boot-screen{min-height:100vh;display:grid;place-items:center;background:#f5f5f5;color:#4a4a4a;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
  '.boot-content{width:min(320px,calc(100vw - 48px));padding:24px;text-align:center}',
  '.boot-brand{font-size:20px;font-weight:700;color:#1f1f1f}',
  '.boot-status{min-height:20px;margin-top:8px;font-size:14px;line-height:20px}',
  '.boot-track{height:3px;margin-top:16px;overflow:hidden;background:#dedede}',
  '.boot-progress{width:0;height:100%;background:#2274d6;transition:width .18s ease}',
  '.boot-retry{margin-top:16px;padding:9px 16px;border:1px solid #b8b8b8;border-radius:6px;background:#fff;color:#1f1f1f;font:600 14px/20px inherit;cursor:pointer}',
  '.boot-retry:hover{border-color:#2274d6;color:#1559a6}',
  '</style>',
].join('');

const loaderScript = `
<script>
(() => {
  const manifest = ${manifest};
  const status = document.getElementById('boot-status');
  const progress = document.getElementById('boot-progress');
  const retry = document.getElementById('boot-retry');
  const entries = [...manifest.css, ...manifest.js];
  let completed = 0;

  const updateProgress = () => {
    completed += 1;
    progress.style.width = Math.round((completed / entries.length) * 100) + '%';
  };

  const fetchChunk = async (entry) => {
    let lastError;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      try {
        const suffix = attempt === 0 ? '' : '?retry=' + attempt;
        const response = await fetch(entry.url + suffix, {
          cache: attempt === 0 ? 'force-cache' : 'reload',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== entry.size) {
          throw new Error('Incomplete response');
        }
        return buffer;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  };

  const fetchGroup = async (group, concurrency) => {
    const results = new Array(group.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < group.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await fetchChunk(group[index]);
        updateProgress();
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, group.length) }, () => worker())
    );
    return results;
  };

  const merge = (buffers) => {
    const size = buffers.reduce((total, buffer) => total + buffer.byteLength, 0);
    const merged = new Uint8Array(size);
    let offset = 0;

    for (const buffer of buffers) {
      merged.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    return merged;
  };

  const start = async () => {
    completed = 0;
    progress.style.width = '0';
    retry.hidden = true;
    status.textContent = 'Загружаем рабочее пространство...';

    try {
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const constrainedConnection = Boolean(
        connection
        && (connection.saveData || ['slow-2g', '2g'].includes(connection.effectiveType))
      );
      const payloadBuffers = await fetchGroup(
        entries,
        constrainedConnection ? 2 : (isMobile ? 4 : 6)
      );
      const cssBuffers = payloadBuffers.slice(0, manifest.css.length);
      const jsBuffers = payloadBuffers.slice(manifest.css.length);
      const decoder = new TextDecoder();
      const appStyle = document.createElement('style');
      appStyle.textContent = decoder.decode(merge(cssBuffers));
      document.head.append(appStyle);

      const appScript = document.createElement('script');
      appScript.type = 'module';
      appScript.textContent = decoder.decode(merge(jsBuffers));
      document.body.append(appScript);
    } catch (error) {
      console.error('Application loading failed', error);
      status.textContent = 'Не удалось загрузить интерфейс. Проверьте интернет-соединение.';
      retry.hidden = false;
    }
  };

  retry.addEventListener('click', start);
  start();
})();
</script>`;

const resilientHtml = html
  .replace(
    /<link rel="stylesheet" crossorigin href="[^"]+">/,
    () => bootStyles
  )
  .replace(
    /<script type="module" crossorigin src="[^"]+"><\/script>/,
    ''
  )
  .replace('<div id="root"></div>', loadingState)
  .replace('</body>', () => `${loaderScript}\n</body>`);

if (
  resilientHtml === html ||
  /\/assets\/[^"']+\.(?:js|css)/.test(resilientHtml) ||
  Buffer.byteLength(resilientHtml) > loaderSizeLimit
) {
  throw new Error('Resilient production loader was not generated correctly.');
}

await writeFile(indexPath, resilientHtml);

const reconstructedJs = Buffer.concat(
  await Promise.all(jsChunks.map(({ url }) => readFile(resolve(distDir, url.slice(1)))))
);
const reconstructedCss = Buffer.concat(
  await Promise.all(cssChunks.map(({ url }) => readFile(resolve(distDir, url.slice(1)))))
);

if (!reconstructedJs.equals(appJs) || !reconstructedCss.equals(appCss)) {
  throw new Error('Production payload chunks failed reconstruction verification.');
}

console.log(
  `Created ${jsChunks.length + cssChunks.length} resilient payload chunks in ${payloadName}.`
);
