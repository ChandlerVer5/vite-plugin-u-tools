import { resolve } from 'path';
import { build as viteBuild, Plugin, ResolvedConfig } from 'vite';

import buildUpx from './buildUpx';
import { BUILD_UTOOLS_MODE } from './constant';
import {
	createPreloadFilter,
	createReplaceAlias,
	getModuleName,
	isUndef,
	NodeBuiltin,
	ReplaceAlias,
	transformFilter,
} from './helper';
import { RequiredOptions } from './options';
import transformExternal from './transform/external';
import transformPreload from './transform/preload';

export const preloadPlugin = (preloadOptions: RequiredOptions['preload']): Plugin => {
	if (!preloadOptions)
		return {
			name: 'vite:utools-preload',
		};

	const { path, watch, name } = preloadOptions;
	const filter = createPreloadFilter(path);

	let config: ResolvedConfig;
	let replaceAlias: ReplaceAlias = (path) => path;

	return {
		name: 'vite:utools-preload',

		config: (userConfig) => ({
			base: isUndef(userConfig.base) || userConfig.base === '/' ? '' : userConfig.base,

			build:
				userConfig.mode !== BUILD_UTOOLS_MODE
					? void 0
					: {
							// TODO: use build lib options ?
							minify: false,
							emptyOutDir: false,
							rollupOptions: {
								external: [...NodeBuiltin],
								plugins: [
									{
										name: 'preload',
										transform: (code, id) => (filter(id) ? transformPreload(code, name) : code),
									},
								],
								input: path,
								output: {
									inlineDynamicImports: false,
									entryFileNames: 'preload.js',
									format: 'cjs',
									globals: (id: string) => `require('${id}')`,
									chunkFileNames: 'node_modules/[name].js',
									manualChunks: (id) => getModuleName(id) || 'vendor',
								},
							},
					  },
		}),

		configResolved: (c) => {
			config = c;
			replaceAlias = createReplaceAlias(c.resolve.alias);
		},

		transform: (code, id) =>
			!transformFilter(id)
				? code
				: transformExternal(code, (sourcePath) =>
						filter(resolve(id, '../', replaceAlias(sourcePath))) ? name : void 0
				  ),

		handleHotUpdate: async ({ file }) => {
			if (watch && filter(file)) await viteBuild();
		},

		closeBundle: async () => {
			if (config.mode !== BUILD_UTOOLS_MODE)
				await viteBuild({
					mode: BUILD_UTOOLS_MODE,
				});
		},
	};
};

export const apiExternalPlugin = (apiExternal: RequiredOptions['external']): Plugin => {
	return {
		name: 'vite:utools-api',

		config: () => ({
			optimizeDeps: { exclude: [apiExternal] },
			build: {
				rollupOptions: {
					external: [apiExternal],
				},
			},
		}),

		transform: (code, id) =>
			!transformFilter(id)
				? code
				: transformExternal(code, (sourcePath) => (sourcePath === apiExternal ? 'window.utools' : void 0)),
	};
};

export const buildUpxPlugin = (options: RequiredOptions): Plugin => {
	let config: ResolvedConfig;

	return {
		name: 'vite:utools-build-upx',

		configResolved: (c) => {
			config = c;
		},

		closeBundle: async () => {
			if (config.mode === BUILD_UTOOLS_MODE) await buildUpx(config.build.outDir, options, config.logger);
		},
	};
};
