var ok = require('assert').ok;
var nodePath = require('path');
var lassoCachingFS = require('lasso-caching-fs');
var resolveFrom = require('resolve-from');
var browserRemapsByDir = {};
var flattenedBrowserRemapsByDir = {};

var browserRemapsByDir = {};

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

function loadBrowserRemapsFromPackage(pkg, dir) {
    var browser = pkg.browser;

    if (pkg.browser === undefined) {
        browser = pkg.browserify;
    }

    if (browser == null) {
        return undefined;
    }

    var browserRemaps = {};

    if (typeof browser === 'string' || browser === false) {
        var resolvedMain = resolveMain(dir); // Resolve the main file for the current directory
        if (!resolvedMain) {
            throw new Error('Invalid "browser" field in "' + nodePath.join(dir, 'package.json') + '". Module not found: ' + dir);
        }

        browserRemaps[resolvedMain] = browser ? resolveBrowserPath(browser, dir) : false;
    } else {
        for (var source in browser) {
            if (browser.hasOwnProperty(source)) {
                var target = browser[source];
                var resolvedSource = resolveBrowserPath(source, dir);
                if (!resolvedSource) {
                    throw new Error('Invalid "browser" field in "' + nodePath.join(dir, 'package.json') + '". Module not found: ' + source);
                }

                browserRemaps[resolvedSource] = target === false ? false : resolveBrowserPath(target, dir);
            }
        }
    }

    return browserRemaps;
}

exports.load = function(dir) {
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
                currentBrowserRemaps = loadBrowserRemapsFromPackage(pkg, currentDir);
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