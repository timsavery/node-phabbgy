'use strict';

var url = require('url');
var http = require('http');
var crypto = require('crypto');

function Phabricator(config) {

  if (!config) {
    throw new Error('Cannot create Phabricator instance. Missing "config"');
  }

  this._config = config;
  this.__conduit__ = null;
  
}

Phabricator.prototype._rawCall = function (endpoint, paramsObj, callback) {

  var self = this;

  var params = {};

  Object.keys(paramsObj).forEach(function (key) {
    params[key] = paramsObj[key];
  });

  var data = ['output=json'];
  data.push('__conduit__=1');
  data.push('params=' + encodeURIComponent(JSON.stringify(params)));

  var options = {
    hostname: url.parse(self._config.host).host,
    path: '/api/' + endpoint,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };

  var req = http.request(options, function (res) {

    res.setEncoding('utf8');

    var result = '';

    res.on('data', function (chunk) {
      result += chunk;
    });

    res.on('end', function () {
      
      var resultObj = JSON.parse(result);

      if (resultObj.error_code) {
        return callback(resultObj.error_info);
      }

      callback(null, resultObj.result);

    });

  });

  req.on('error', function (e) {
    return callback(e);
  });

  req.write(data.join('&'));
  req.end();

};

Phabricator.prototype._authenticate = function (callback) {

  var self = this;

  if (self.__conduit__) {
    return callback(null, self.__conduit__);
  }

  var authToken = new Date().getTime() / 1000;

  var params = {
    client: 'phabby',
    user: self._config.username,
    host: self._config.host,
    authToken: authToken,
    authSignature: crypto.createHash('sha1').update(authToken + self._config.cert).digest('hex')
  };

  this._rawCall('conduit.connect', params, callback);

};

Phabricator.prototype._authCall = function (endpoint, paramsObj, callback) {

  var self = this;

  self._authenticate(function (err, sessionInfo) {

    if (err) {
      return callback(err);
    }

    paramsObj.__conduit__ = sessionInfo;

    self._rawCall(endpoint, paramsObj, callback);

  });

};

//
// phid.lookup
//
Phabricator.prototype._lookupDiffId = function (name, callback) {

  var params = {
    names: [name]
  };

  this._authCall('phid.lookup', params, function (err, result) {

    if (err) {
      return callback(err);
    }

    callback(null, result[name].phid);

  });

};

//
// user.query
//
Phabricator.prototype.getUserId = function (username, callback) {

  var self = this;

  var params = {
    usernames: [username]
  };

  self._authCall('user.query', params, function (err, results) {

    if (err) {
      return callback(err);
    }

    if (!results || results.length === 0) {
      return callback();
    }

    callback(null, results[0].phid);

  });

};

//
// differential.query
//
Phabricator.prototype.getDiff = function (name, callback) {

  var self = this;

  self._lookupDiffId(name, function (err, diffId) {

    if (err) {
      return callback(err);
    }

    self._authCall('differential.query', { phids: [diffId] }, function (err, results) {

      if (err) {
        return callback(err);
      }

      if (!results || results.length === 0) {
        return callback();
      }

      callback(null, results[0]);

    });

  });

};

//
// differential.creatediff
//
Phabricator.prototype.createDiff = function (params, callback) {

  var self = this;

  self._authCall('differential.creatediff', params, callback);

};

//
// differential.createrevision
//
Phabricator.prototype.createRevision = function (diffId, params, callback) {

  var self = this;

  var revision = {
    diffid: diffId,
    fields: params
  };

  self._authCall('differential.createrevision', revision, callback);

};

module.exports = Phabricator;
