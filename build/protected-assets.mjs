import path from 'node:path';

// Wrap Vite's whole preload operation so CSS failures cannot reject React.lazy first.
export function rewritePreloadHelper(code, guard) {
  const exported = /export const __vitePreload\s*=/;
  const cssError = /link\.addEventListener\((["'])error\1,/;
  if (!exported.test(code) || !cssError.test(code)) {
    throw new Error('Unsupported Vite preload helper: inspect this Vite version before releasing');
  }
  return `import { protectedAssetImport } from ${JSON.stringify(guard)};\n` +
    code.replace(exported, 'const __seonologyRawPreload =')
      .replace(cssError, match => `link.addEventListener('error', () => { delete seen[dep]; link.remove(); });${match}`) +
    `\nexport const __vitePreload = (baseModule, deps, importerUrl) => protectedAssetImport(\n` +
    ` () => __seonologyRawPreload(baseModule, deps, importerUrl),\n` +
    ` deps?.length ? assetsURL(deps[0], importerUrl) : undefined);\n`;
}

export default function protectedAssets(guard = 'src/forwardAuth.ts') {
  let root, transformed = false;
  return {
    name: 'seonology-protected-assets', enforce: 'post', apply: 'build',
    configResolved(config) { root = config.root; },
    transform(code, id) {
      if (!id.includes('vite/preload-helper')) return;
      transformed = true;
      return { code: rewritePreloadHelper(code, path.resolve(root, guard)), map: null };
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(value => value.type === 'chunk');
      const imports = chunks.flatMap(chunk => chunk.dynamicImports.map(target => ({ from: chunk.fileName, target })));
      if (imports.length && !transformed) this.error('Dynamic assets exist but protected preload helper was not installed');
      this.emitFile({ type: 'asset', fileName: 'protected-assets.json', source: JSON.stringify({
        helperWrapped: transformed, dynamicImports: imports,
        chunks: chunks.map(chunk => ({ file: chunk.fileName, entry: chunk.isEntry, imports: chunk.imports,
          dynamicImports: chunk.dynamicImports, css: [...(chunk.viteMetadata?.importedCss ?? [])] })),
      }, null, 2) });
    },
  };
}
