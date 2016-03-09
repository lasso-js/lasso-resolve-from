var ok = require('assert').ok;
var nodePath = require('path');
var lassoCachingFS = require('lasso-caching-fs');
var resolveFrom = require('resolve-from');
var browserOverridesByDir = {};
var flattenedBrowserOverridesByDir = {};

var browserOverridesByDir = {};

function resolveMain(dir) {
    return resolveFrom(dir, './');
}

function resolveBrowserPath(path, dir) {
    var resolvedPath;

    if (path.charAt(0) === '.') {
        resolvedPath = resolveFrom(dir, path);
    } else {
        resolvedPath = resolveFrom(dir, './' + path);
        if (!resolvedPath) {
            resolvedPath = resolveFrom(dir, path);
        }
    }

    return resolvedPath;
}

function loadBrowserOverridesFromPackage(pkg, dir) {
    var browser = pkg.browser || pkg.browserify;
    if (!browser) {
        return null;
    }

    var browserOverrides = {};
    var resolvedTarget;

    if (typeof browser === 'string') {
        var resolvedMain = resolveMain(dir); // Resolve the main file for the current directory
        if (!resolvedMain) {
            throw new Error('Invalid "browser" field in "' + nodePath.join(dir, 'package.json') + '". Module not found: ' + dir);
        }
        resolvedTarget = resolveBrowserPath(browser, dir);
        browserOverrides[resolvedMain] = resolvedTarget;
    } else {
        for (var source in browser) {
            if (browser.hasOwnProperty(source)) {
                var target = browser[source];
                var resolvedSource = resolveBrowserPath(source, dir);
                if (!resolvedSource) {
                    throw new Error('Invalid "browser" field in "' + nodePath.join(dir, 'package.json') + '". Module not found: ' + source);
                }

                resolvedTarget = target === false ? false : resolveBrowserPath(target, dir);
                browserOverrides[resolvedSource] = resolvedTarget;
            }
        }
    }

    return browserOverrides;
}

exports.load = function(dir) {
    ok(dir, '"dirname" is required');
    ok(typeof dir === 'string', '"dirname" must be a string');

    var browserOverrides = flattenedBrowserOverridesByDir[dir];
    if (browserOverrides) {
        return browserOverrides;
    }

    browserOverrides = {};

    var currentDir = dir;

    while(currentDir) {
        var currentBrowserOverrides = browserOverridesByDir[currentDir];

        if (currentBrowserOverrides === undefined) {
            var packagePath = nodePath.join(currentDir, 'package.json');
            var pkg = lassoCachingFS.readPackageSync(packagePath);

            if (pkg) {
                currentBrowserOverrides = loadBrowserOverridesFromPackage(pkg, currentDir);
            }

            browserOverridesByDir[dir] = currentBrowserOverrides || null;
        }

        if (currentBrowserOverrides) {
            for (var k in currentBrowserOverrides) {
                if (currentBrowserOverrides.hasOwnProperty(k) && !browserOverrides.hasOwnProperty(k)) {
                    browserOverrides[k] = currentBrowserOverrides[k];
                }
            }
        }

        var parentDir = nodePath.dirname(dir);
        if (!parentDir || parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }

    flattenedBrowserOverridesByDir[dir] = browserOverrides;

    return browserOverrides;
};