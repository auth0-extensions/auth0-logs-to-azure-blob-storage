module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "/dist/";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(setImmediate) {'use strict';

	var Auth0 = __webpack_require__(3);
	var async = __webpack_require__(4);
	var moment = __webpack_require__(5);
	var azure = __webpack_require__(6);
	var useragent = __webpack_require__(7);
	var express = __webpack_require__(8);
	var Webtask = __webpack_require__(9);
	var app = express();

	function lastLogCheckpoint(req, res) {
	  var required_settings = ['AUTH0_DOMAIN', 'AUTH0_GLOBAL_CLIENT_ID', 'AUTH0_GLOBAL_CLIENT_SECRET', 'STORAGE_ACCOUNT_NAME', 'STORAGE_ACCOUNT_KEY', 'STORAGE_CONTAINER_NAME'];
	  var missing_settings = required_settings.filter(function (setting) {
	    return !ctx.data[setting];
	  });

	  if (missing_settings.length) {
	    return res.status(400).send({ message: 'Missing settings: ' + missing_settings.join(', ') });
	  }

	  // If this is a scheduled task, we'll get the last log checkpoint from the previous run and continue from there.
	  req.webtaskContext.read('history', {}, function (err, data) {

	    var startCheckpointId = typeof data === 'undefined' ? null : data.checkpointId;

	    // Initialize both clients.
	    var auth0 = new Auth0({
	      domain: ctx.data.AUTH0_DOMAIN,
	      clientID: ctx.data.AUTH0_GLOBAL_CLIENT_ID,
	      clientSecret: ctx.data.AUTH0_GLOBAL_CLIENT_SECRET
	    });
	    var blobService = azure.createBlobService(ctx.data.STORAGE_ACCOUNT_NAME, ctx.data.STORAGE_ACCOUNT_KEY);

	    // Start the process.
	    async.waterfall([function (callback) {
	      auth0.getAccessToken(function (err) {
	        if (err) {
	          console.log('Error authenticating:', err);
	        }
	        return callback(err);
	      });
	    }, function (callback) {
	      try {
	        blobService.createContainerIfNotExists(ctx.data.STORAGE_CONTAINER_NAME, function (err) {
	          return callback(err);
	        });
	      } catch (e) {
	        return callback(e);
	      }
	    }, function (callback) {
	      var getLogs = function getLogs(context) {
	        console.log('Downloading logs from: ' + (context.checkpointId || 'Start') + '.');

	        context.logs = context.logs || [];
	        auth0.getLogs({ take: 200, from: context.checkpointId }, function (err, logs) {
	          if (err) {
	            return callback(err);
	          }

	          if (logs && logs.length) {
	            logs.forEach(function (l) {
	              return context.logs.push(l);
	            });
	            context.checkpointId = context.logs[context.logs.length - 1]._id;
	            return setImmediate(function () {
	              return getLogs(context);
	            });
	          }

	          console.log('Total logs: ' + context.logs.length + '.');
	          return callback(null, context);
	        });
	      };

	      getLogs({ checkpointId: startCheckpointId });
	    }, function (context, callback) {
	      context.logs = context.logs.map(function (record) {
	        var level = 0;
	        record.type_code = record.type;
	        if (logTypes[record.type]) {
	          level = logTypes[record.type].level;
	          record.type = logTypes[record.type].event;
	        }

	        var agent = useragent.parse(record.user_agent);
	        record.os = agent.os.toString();
	        record.os_version = agent.os.toVersion();
	        record.device = agent.device.toString();
	        record.device_version = agent.device.toVersion();
	        return record;
	      });
	      callback(null, context);
	    }, function (context, callback) {
	      console.log('Uploading blobs...');

	      async.eachLimit(context.logs, 5, function (log, cb) {
	        var date = moment(log.date);
	        var url = date.format('YYYY/MM/DD') + '/' + date.format('HH') + '/' + log._id + '.json';
	        console.log('Uploading ' + url + '.');

	        blobService.createBlockBlobFromText(ctx.data.STORAGE_CONTAINER_NAME, url, JSON.stringify(log), cb);
	      }, function (err) {
	        if (err) {
	          return callback(err);
	        }

	        console.log('Upload complete.');
	        return callback(null, context);
	      });
	    }], function (err, context) {
	      if (err) {
	        console.log('Job failed.');

	        return req.webtaskContext.write('history', JSON.stringify({ checkpointId: startCheckpointId }), {}, function (error) {
	          if (error) return res.status(500).send(error);

	          res.status(500).send({
	            error: err
	          });
	        });
	      }

	      console.log('Job complete.');
	      return req.webtaskContext.write('history', JSON.stringify({ checkpointId: context.checkpointId, totalLogsProcessed: context.logs.length }), {}, function (error) {
	        if (error) return res.status(500).send(error);

	        res.sendStatus(200);
	      });
	    });
	  });
	}

	var logTypes = {
	  's': {
	    event: 'Success Login',
	    level: 1 // Info
	  },
	  'seacft': {
	    event: 'Success Exchange',
	    level: 1 // Info
	  },
	  'feacft': {
	    event: 'Failed Exchange',
	    level: 3 // Error
	  },
	  'f': {
	    event: 'Failed Login',
	    level: 3 // Error
	  },
	  'w': {
	    event: 'Warnings During Login',
	    level: 2 // Warning
	  },
	  'du': {
	    event: 'Deleted User',
	    level: 1 // Info
	  },
	  'fu': {
	    event: 'Failed Login (invalid email/username)',
	    level: 3 // Error
	  },
	  'fp': {
	    event: 'Failed Login (wrong password)',
	    level: 3 // Error
	  },
	  'fc': {
	    event: 'Failed by Connector',
	    level: 3 // Error
	  },
	  'fco': {
	    event: 'Failed by CORS',
	    level: 3 // Error
	  },
	  'con': {
	    event: 'Connector Online',
	    level: 1 // Info
	  },
	  'coff': {
	    event: 'Connector Offline',
	    level: 3 // Error
	  },
	  'fcpro': {
	    event: 'Failed Connector Provisioning',
	    level: 4 // Critical
	  },
	  'ss': {
	    event: 'Success Signup',
	    level: 1 // Info
	  },
	  'fs': {
	    event: 'Failed Signup',
	    level: 3 // Error
	  },
	  'cs': {
	    event: 'Code Sent',
	    level: 0 // Debug
	  },
	  'cls': {
	    event: 'Code/Link Sent',
	    level: 0 // Debug
	  },
	  'sv': {
	    event: 'Success Verification Email',
	    level: 0 // Debug
	  },
	  'fv': {
	    event: 'Failed Verification Email',
	    level: 0 // Debug
	  },
	  'scp': {
	    event: 'Success Change Password',
	    level: 1 // Info
	  },
	  'fcp': {
	    event: 'Failed Change Password',
	    level: 3 // Error
	  },
	  'sce': {
	    event: 'Success Change Email',
	    level: 1 // Info
	  },
	  'fce': {
	    event: 'Failed Change Email',
	    level: 3 // Error
	  },
	  'scu': {
	    event: 'Success Change Username',
	    level: 1 // Info
	  },
	  'fcu': {
	    event: 'Failed Change Username',
	    level: 3 // Error
	  },
	  'scpn': {
	    event: 'Success Change Phone Number',
	    level: 1 // Info
	  },
	  'fcpn': {
	    event: 'Failed Change Phone Number',
	    level: 3 // Error
	  },
	  'svr': {
	    event: 'Success Verification Email Request',
	    level: 0 // Debug
	  },
	  'fvr': {
	    event: 'Failed Verification Email Request',
	    level: 3 // Error
	  },
	  'scpr': {
	    event: 'Success Change Password Request',
	    level: 0 // Debug
	  },
	  'fcpr': {
	    event: 'Failed Change Password Request',
	    level: 3 // Error
	  },
	  'fn': {
	    event: 'Failed Sending Notification',
	    level: 3 // Error
	  },
	  'sapi': {
	    event: 'API Operation'
	  },
	  'fapi': {
	    event: 'Failed API Operation'
	  },
	  'limit_wc': {
	    event: 'Blocked Account',
	    level: 4 // Critical
	  },
	  'limit_ui': {
	    event: 'Too Many Calls to /userinfo',
	    level: 4 // Critical
	  },
	  'api_limit': {
	    event: 'Rate Limit On API',
	    level: 4 // Critical
	  },
	  'sdu': {
	    event: 'Successful User Deletion',
	    level: 1 // Info
	  },
	  'fdu': {
	    event: 'Failed User Deletion',
	    level: 3 // Error
	  }
	};

	app.get('/', lastLogCheckpoint);
	app.post('/', lastLogCheckpoint);

	module.exports = Webtask.fromExpress(app);
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(1).setImmediate))

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(setImmediate, clearImmediate) {var nextTick = __webpack_require__(2).nextTick;
	var apply = Function.prototype.apply;
	var slice = Array.prototype.slice;
	var immediateIds = {};
	var nextImmediateId = 0;

	// DOM APIs, for completeness

	exports.setTimeout = function() {
	  return new Timeout(apply.call(setTimeout, window, arguments), clearTimeout);
	};
	exports.setInterval = function() {
	  return new Timeout(apply.call(setInterval, window, arguments), clearInterval);
	};
	exports.clearTimeout =
	exports.clearInterval = function(timeout) { timeout.close(); };

	function Timeout(id, clearFn) {
	  this._id = id;
	  this._clearFn = clearFn;
	}
	Timeout.prototype.unref = Timeout.prototype.ref = function() {};
	Timeout.prototype.close = function() {
	  this._clearFn.call(window, this._id);
	};

	// Does not start the time, just sets up the members needed.
	exports.enroll = function(item, msecs) {
	  clearTimeout(item._idleTimeoutId);
	  item._idleTimeout = msecs;
	};

	exports.unenroll = function(item) {
	  clearTimeout(item._idleTimeoutId);
	  item._idleTimeout = -1;
	};

	exports._unrefActive = exports.active = function(item) {
	  clearTimeout(item._idleTimeoutId);

	  var msecs = item._idleTimeout;
	  if (msecs >= 0) {
	    item._idleTimeoutId = setTimeout(function onTimeout() {
	      if (item._onTimeout)
	        item._onTimeout();
	    }, msecs);
	  }
	};

	// That's not how node.js implements it but the exposed api is the same.
	exports.setImmediate = typeof setImmediate === "function" ? setImmediate : function(fn) {
	  var id = nextImmediateId++;
	  var args = arguments.length < 2 ? false : slice.call(arguments, 1);

	  immediateIds[id] = true;

	  nextTick(function onNextTick() {
	    if (immediateIds[id]) {
	      // fn.call() is faster so we optimize for the common use-case
	      // @see http://jsperf.com/call-apply-segu
	      if (args) {
	        fn.apply(null, args);
	      } else {
	        fn.call(null);
	      }
	      // Prevent ids from leaking
	      exports.clearImmediate(id);
	    }
	  });

	  return id;
	};

	exports.clearImmediate = typeof clearImmediate === "function" ? clearImmediate : function(id) {
	  delete immediateIds[id];
	};
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(1).setImmediate, __webpack_require__(1).clearImmediate))

/***/ },
/* 2 */
/***/ function(module, exports) {

	// shim for using process in browser

	var process = module.exports = {};
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;

	function cleanUpNextTick() {
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}

	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = setTimeout(cleanUpNextTick);
	    draining = true;

	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            if (currentQueue) {
	                currentQueue[queueIndex].run();
	            }
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    clearTimeout(timeout);
	}

	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        setTimeout(drainQueue, 0);
	    }
	};

	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};

	function noop() {}

	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;

	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};

	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };


/***/ },
/* 3 */
/***/ function(module, exports) {

	module.exports = require("auth0@0.8.2");

/***/ },
/* 4 */
/***/ function(module, exports) {

	module.exports = require("async");

/***/ },
/* 5 */
/***/ function(module, exports) {

	module.exports = require("moment");

/***/ },
/* 6 */
/***/ function(module, exports) {

	module.exports = require("azure-storage");

/***/ },
/* 7 */
/***/ function(module, exports) {

	module.exports = require("useragent");

/***/ },
/* 8 */
/***/ function(module, exports) {

	module.exports = require("express");

/***/ },
/* 9 */
/***/ function(module, exports, __webpack_require__) {

	exports.fromConnect = exports.fromExpress = fromConnect;
	exports.fromHapi = fromHapi;
	exports.fromServer = exports.fromRestify = fromServer;


	// API functions

	function fromConnect (connectFn) {
	    return function (context, req, res) {
	        var normalizeRouteRx = createRouteNormalizationRx(req.x_wt.jtn);

	        req.originalUrl = req.url;
	        req.url = req.url.replace(normalizeRouteRx, '/');
	        req.webtaskContext = attachStorageHelpers(context);

	        return connectFn(req, res);
	    };
	}

	function fromHapi(server) {
	    var webtaskContext;

	    server.ext('onRequest', function (request, response) {
	        var normalizeRouteRx = createRouteNormalizationRx(request.x_wt.jtn);

	        request.setUrl(request.url.replace(normalizeRouteRx, '/'));
	        request.webtaskContext = webtaskContext;
	    });

	    return function (context, req, res) {
	        var dispatchFn = server._dispatch();

	        webtaskContext = attachStorageHelpers(context);

	        dispatchFn(req, res);
	    };
	}

	function fromServer(httpServer) {
	    return function (context, req, res) {
	        var normalizeRouteRx = createRouteNormalizationRx(req.x_wt.jtn);

	        req.originalUrl = req.url;
	        req.url = req.url.replace(normalizeRouteRx, '/');
	        req.webtaskContext = attachStorageHelpers(context);

	        return httpServer.emit('request', req, res);
	    };
	}


	// Helper functions

	function createRouteNormalizationRx(jtn) {
      var normalizeRouteBase = '^\/api\/run\/[^\/]+\/?';
      var normalizeNamedRoute = '(?:[^\/\?#]*\/?)?';

	    return new RegExp(
	        normalizeRouteBase + (
	        jtn
	            ?   normalizeNamedRoute
	            :   ''
	    ));
	}

	function attachStorageHelpers(context) {
	    context.read = context.secrets.EXT_STORAGE_URL
	        ?   readFromPath
	        :   readNotAvailable;
	    context.write = context.secrets.EXT_STORAGE_URL
	        ?   writeToPath
	        :   writeNotAvailable;

	    return context;


	    function readNotAvailable(path, options, cb) {
	        var Boom = __webpack_require__(10);

	        if (typeof options === 'function') {
	            cb = options;
	            options = {};
	        }

	        cb(Boom.preconditionFailed('Storage is not available in this context'));
	    }

	    function readFromPath(path, options, cb) {
	        var Boom = __webpack_require__(10);
	        var Request = __webpack_require__(11);

	        if (typeof options === 'function') {
	            cb = options;
	            options = {};
	        }

	        Request({
	            uri: context.secrets.EXT_STORAGE_URL,
	            method: 'GET',
	            headers: options.headers || {},
	            qs: { path: path },
	            json: true,
	        }, function (err, res, body) {
	            if (err) return cb(Boom.wrap(err, 502));
	            if (res.statusCode === 404 && Object.hasOwnProperty.call(options, 'defaultValue')) return cb(null, options.defaultValue);
	            if (res.statusCode >= 400) return cb(Boom.create(res.statusCode, body && body.message));

	            cb(null, body);
	        });
	    }

	    function writeNotAvailable(path, data, options, cb) {
	        var Boom = __webpack_require__(10);

	        if (typeof options === 'function') {
	            cb = options;
	            options = {};
	        }

	        cb(Boom.preconditionFailed('Storage is not available in this context'));
	    }

	    function writeToPath(path, data, options, cb) {
	        var Boom = __webpack_require__(10);
	        var Request = __webpack_require__(11);

	        if (typeof options === 'function') {
	            cb = options;
	            options = {};
	        }

	        Request({
	            uri: context.secrets.EXT_STORAGE_URL,
	            method: 'PUT',
	            headers: options.headers || {},
	            qs: { path: path },
	            body: data,
	        }, function (err, res, body) {
	            if (err) return cb(Boom.wrap(err, 502));
	            if (res.statusCode >= 400) return cb(Boom.create(res.statusCode, body && body.message));

	            cb(null);
	        });
	    }
	}


/***/ },
/* 10 */
/***/ function(module, exports) {

	module.exports = require("boom");

/***/ },
/* 11 */
/***/ function(module, exports) {

	module.exports = require("request");

/***/ }
/******/ ]);
