var ok = require('assert').ok;
var nodePath = require('path');
var lassoCachingFS = require('lasso-caching-fs');
var browserRemapsByDir = {};
var flattenedBrowserRemapsByDir = {};

var browserRemapsByDir = {};

function resolveMain(dir, resolveFrom) {
    var meta = [];
    var remaps = null;

    var resolved = resolveFrom(dir, './', meta, remaps);
    return resolved;
}

function resolveBrowserPath(path, dir, resolveFrom) {

    var meta = [];
    var remaps = null;

    var resolved;

    if (path.charAt(0) === '.') {
        resolved = resolveFrom(dir, path, meta, remaps);
    } else {
        resolved = resolveFrom(dir, './' + path, meta, remaps);
        if (!resolved) {
            resolved = resolveFrom(dir, path, meta, remaps);
        }
    }

    return resolved;
}

function loadBrowserRemapsFromPackage(pkg, dir, resolveFrom) {
    var browser = pkg.browser;

    if (pkg.browser === undefined) {
        browser = pkg.browserify;
    }

    if (browser == null) {
        return undefined;
    }

    var browserRemaps = {};

    if (typeof browser === 'string' || browser === false) {
        var resolvedMain = resolveMain(dir, resolveFrom); // Resolve the main file for the current directory
        if (!resolvedMain) {
            throw new Error('Invalid "browser" field in "' + nodePath.join(dir, 'package.json') + '". Module not found: ' + dir);
        }

        browserRemaps[resolvedMain.path] = browser ? resolveBrowserPath(browser, dir, resolveFrom) : false;
    } else {
        for (var source in browser) {
            if (browser.hasOwnProperty(source)) {
                var target = browser[source];
                var resolvedSource = resolveBrowserPath(source, dir, resolveFrom);
                if (resolvedSource) {
                    browserRemaps[resolvedSource.path] = target === false ? false : resolveBrowserPath(target, dir, resolveFrom);
                }
            }
        }
    }

    return browserRemaps;
}

exports.load = function(dir, resolveFrom) {
    ok(dir, '"dirname" is required');
    ok(typeof dir === 'string', '"dirname" must be a string');

    var browserRemaps = flattenedBrowserRemapsByDir[dir];
    if (browserRemaps) {
        return browserRemaps;
    }

    browserRemaps = {};

    var currentDir = dir;

    while(currentDir) {
        var currentBrowserRemaps = browserRemapsByDir[currentDir];

        if (currentBrowserRemaps === undefined) {
            var packagePath = nodePath.join(currentDir, 'package.json');
            var pkg = lassoCachingFS.readPackageSync(packagePath);

            if (pkg) {
                currentBrowserRemaps = loadBrowserRemapsFromPackage(pkg, currentDir, resolveFrom);
            }

            browserRemapsByDir[dir] = currentBrowserRemaps || null;
        }

        if (currentBrowserRemaps) {
            for (var k in currentBrowserRemaps) {
                if (currentBrowserRemaps.hasOwnProperty(k) && !browserRemaps.hasOwnProperty(k)) {
                    browserRemaps[k] = currentBrowserRemaps[k];
                }
            }
        }

        var parentDir = nodePath.dirname(dir);
        if (!parentDir || parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }

    flattenedBrowserRemapsByDir[dir] = browserRemaps;

    return browserRemaps;
};