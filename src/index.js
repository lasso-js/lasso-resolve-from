'use strict';
var path = require('path');
var Module = require('module').Module;
var isAbsolute = require('is-absolute');
var fs = require('fs');
var browserOverridesLoader = require('./browser-overrides-loader');

var FS_READ_OPTIONS = { encoding: 'utf8' };

function Resolver(fromDir, fs, includeMeta) {
    this.fromDir = fromDir;
    this.fs = fs;

    this.browserOverrides = browserOverridesLoader.load(fromDir, this);

    this.includeMeta = includeMeta;
    this.meta = includeMeta ? [] : undefined;
}

Resolver.prototype = {
    resolveMain: function(dir) {
        var targetModule;
        var pkg = this.readPackageSync(path.join(dir, 'package.json'));
        if (pkg) {
            var main = pkg.main;
            if (main) {
                if (main.charAt(0) !== '.') {
                    main = './' + main;
                }
                targetModule = main;
            } else {
                targetModule = './index';
            }
        } else {
            targetModule = './index';
        }

        var resolvedMain = this.resolveFrom(dir, targetModule);
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
        var stat = this.statSync(targetModule);

        if (stat) {
            return [targetModule, stat];
        }

        if (!hasExt) {
            // Short circuit for the most common case where it is a JS file
            var withJSExt = targetModule + '.js';
            stat = this.statSync(targetModule);
            if (stat) {
                return [withJSExt, stat];
            }
        }

        // Try with the extensions
        var extensions = require.extensions;
        for (var ext in extensions) {
            if (extensions.hasOwnProperty(ext) && ext !== '.node' && ext !== originalExt) {
                var targetModuleWithExt = targetModule + ext;
                stat = this.statSync(targetModuleWithExt);
                if (stat) {
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

                stat = this.statSync(packagePath);

                if (stat && stat.isDirectory()) {
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
                // We tried all of the search paths and did not find the installed packaged
                return undefined;
            }
        }

        if (stat.isDirectory()) {
            resolvedPath = this.resolveMain(resolvedPath);
            if (!resolvedPath) {
                return undefined;
            }
        }

        var browserOverrides = this.browserOverrides;
        if (browserOverrides) {
            // Keep resolving the browser override

            while (true) {
                var browserOverride = browserOverrides[resolvedPath];
                if (browserOverride) {
                    if (this.includeMeta) {
                        this.meta.push({
                            type: 'browser-override',
                            from: resolvedPath,
                            to: browserOverride
                        });
                    }
                    resolvedPath = browserOverride;
                } else {
                    break;
                }
            }
        }

        return resolvedPath;
    },

    statSync: function(path) {
        var fs = this.fs;
        try {
            return fs.statSync(path);
        } catch(e) {
            return undefined;
        }
    },

    readPackageSync: function(path) {
        var fs = this.fs;
        var pkgSrc;

        try {
            pkgSrc = fs.readFileSync(path, FS_READ_OPTIONS);
        } catch(e) {
            return undefined;
        }

        return JSON.parse(pkgSrc);
    }
};


function resolveFrom(fromDir, targetModule, options) {
    var includeMeta = options && options.includeMeta === true;
    var resolver = new Resolver(fromDir, (options && options.fs) || fs, includeMeta);
    var resolvedPath = resolver.resolveFrom(fromDir, targetModule);
    if (!resolvedPath) {
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

module.exports = resolveFrom;