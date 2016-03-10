'use strict';
var path = require('path');
var Module = require('module').Module;
var isAbsolute = require('is-absolute');
var browserRemapsLoader = require('./browser-remaps-loader');
var lassoCachingFS = require('lasso-caching-fs');
var resolveFrom = require('resolve-from');
var extend = require('raptor-util/extend');

function safeResolveFrom(fromDir, targetModule) {
    try {
        return resolveFrom(fromDir, targetModule);
    } catch(e) {}
}

function Resolver(fromDir, includeMeta, remaps) {
    this.fromDir = fromDir;
    this.includeMeta = includeMeta;
    this.remaps = remaps;

    this.meta = includeMeta ? [] : undefined;
}

Resolver.prototype = {
    resolveMain: function(dir) {
        var resolvedMain = resolveFrom(dir, './');

        if (this.includeMeta) {
            this.meta.push({
                'type': 'main',
                'dir': dir,
                'main': resolvedMain
            });
        }
        return resolvedMain;
    },

    tryExtensions: function(targetModule) {
        var originalExt = path.extname(targetModule);
        var hasExt = originalExt !== '';
        var stat = lassoCachingFS.statSync(targetModule);

        if (stat.exists()) {
            return [targetModule, stat];
        }

        if (!hasExt) {
            // Short circuit for the most common case where it is a JS file
            var withJSExt = targetModule + '.js';
            stat = lassoCachingFS.statSync(targetModule);
            if (stat.exists()) {
                return [withJSExt, stat];
            }
        }

        // Try with the extensions
        var extensions = require.extensions;
        for (var ext in extensions) {
            if (extensions.hasOwnProperty(ext) && ext !== '.node' && ext !== originalExt) {
                var targetModuleWithExt = targetModule + ext;
                stat = lassoCachingFS.statSync(targetModuleWithExt);
                if (stat.exists()) {
                    return [targetModuleWithExt, stat];
                }
            }
        }
    },

    resolveFrom: function(fromDir, targetModule) {
        var resolved;
        var resolvedPath;
        var stat;

        if (isAbsolute(targetModule)) {
            resolved = this.tryExtensions(targetModule);
            if (!resolved) {
                return undefined;
            }

            resolvedPath = resolved[0];
            stat = resolved[1];
        } else if (targetModule.charAt(0) === '.') {
            // Don't go through the search paths for relative paths
            resolvedPath = path.join(fromDir, targetModule);
            resolved = this.tryExtensions(resolvedPath);
            if (!resolved) {
                return undefined;
            }

            resolvedPath = resolved[0];
            stat = resolved[1];
        } else {
            var sepIndex = targetModule.indexOf('/');
            var packageName;
            var packageRelativePath;

            if (sepIndex === -1) {
                packageName = targetModule;
                packageRelativePath = null;
            } else {
                packageName = targetModule.substring(0, sepIndex);
                packageRelativePath = targetModule.substring(sepIndex + 1);
            }

            var searchPaths = Module._nodeModulePaths(fromDir);

            for (var i=0, len=searchPaths.length; i<len; i++) {
                var searchPath = searchPaths[i];

                var packagePath = path.join(searchPath, packageName);

                stat = lassoCachingFS.statSync(packagePath);

                if (stat.isDirectory()) {
                    if (this.includeMeta) {
                        this.meta.push({
                            type: 'installed',
                            packageName: packageName,
                            searchPath: searchPath
                        });
                    }
                    // The installed module has been found, but now need to find the module
                    // within the package
                    if (packageRelativePath) {
                        return this.resolveFrom(packagePath, './' + packageRelativePath);
                    } else {
                        resolvedPath = packagePath;
                    }
                    break;
                }
            }

            if (!resolvedPath) {

                // This might be a native Node.js module such as `path` so let's try the Node.js resolver
                resolvedPath = safeResolveFrom(fromDir, targetModule);

                if (!resolvedPath) {
                    // We tried all of the search paths and did not find the installed packaged
                    return undefined;
                }
            }
        }

        if (stat.isDirectory()) {
            resolvedPath = this.resolveMain(resolvedPath);
            if (!resolvedPath) {
                return undefined;
            }
        }

        var remaps = this.remaps;

        if (remaps) {
            // Handle all of the remappings
            while (true) {
                var remapTo = remaps[resolvedPath];
                if (remapTo === undefined) {
                    break;
                } else {
                    if (this.includeMeta) {
                        this.meta.push({
                            type: 'remap',
                            from: resolvedPath,
                            to: remapTo
                        });
                    }
                    resolvedPath = remapTo;

                    if (resolvedPath === false) {
                        break;
                    }
                }
            }
        }

        return resolvedPath;
    }
};


function lassoResolveFrom(fromDir, targetModule, options) {
    var includeMeta = options && options.includeMeta === true;
    var remaps = browserRemapsLoader.load(fromDir);
    if (options && options.remaps) {
        remaps = extend({}, remaps);
        extend(remaps, options.remaps);
    }

    var resolver = new Resolver(fromDir, includeMeta, remaps);
    var resolvedPath = resolver.resolveFrom(fromDir, targetModule);
    if (resolvedPath == null) {
        return undefined;
    }

    if (includeMeta) {
        return {
            path: resolvedPath,
            meta: resolver.meta
        };
    } else {
        return resolvedPath;
    }
}

module.exports = lassoResolveFrom;