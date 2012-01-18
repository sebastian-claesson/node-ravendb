var http = require('http');
var util = require('util');
var qs = require('querystring');
var masks = require('./masks');
var Document = require('./../objects/document');
var Queryable = require('./../objects/queryable');

module.exports = (function() {
  return function (keys, includes, connection, cache, changes, callback) {
    if (!keys) return;

    if (typeof includes === 'function' && callback === undefined) {
        callback = includes;
        includes = undefined;
    }

    if (typeof keys === 'string') {
      if (!includes) {
        return single(keys, connection, cache, changes, callback);
      } else {
        return singleAndIncludes(keys, (typeof includes === 'string' ? [ includes ] : includes), connection, cache, changes, callback);
      }
    } else if (Array.isArray(keys)) {
      return batch(keys, (typeof includes === 'string' ? [ includes ] : includes), connection, cache, changes, callback);
    }
  };

  function single (key, connection, cache, changes, callback) {
    var document = cache[key];

    if (!document) {
      return get(key, connection, function (err, result) {
        if (result) {
          cache[key] = JSON.stringify(result);      // js passes by reference, so stringify it to not require a deep clone - used for comparison on save
          Object.freeze(result['@metadata']);       // you shouldn't be able to change the metadata after the first save
          changes[key] = result;                    // add a reference cache of the document to compare against the stringified cache
        }

	    return callback(err, result);
      });
    } else {
      return callback(undefined, JSON.parse(document));     
    }
  };

  function singleAndIncludes(key, include, connection, cache, changes, callback) {  	  
    var cached = cache[key];

    if (!cached) { 
      return batch([ key ], include, connection, cache, changes, callback);
    } else {
	  var document = JSON.parse(cached);
      Object.freeze(result['@metadata']); 

      var includes = [];	    
      var uncached = []; 

      include.forEach(function (property) {
        var doc = cache[document[property]];
        doc ? includes.push(doc) : uncached.push(document[property]);
      });

      var _callback = function (error) {
        return callback(error, document, new Queryable(includes));
      };

      var _cache = function (doc) {
        if (doc) {
          cache[doc['@metadata']['@id']] = JSON.stringify(doc);     // js passes by reference, so stringify it to not require a deep clone - used for comparison on save
          Object.freeze(doc['@metadata']);                          // you shouldn't be able to change the metadata after the first save
          changes[doc['@metadata']['@id']] = doc;                   // add a reference cache of the document to compare against the stringified cache
          includes.push(doc);
        }
      };

      if (uncached.length === 0) {          // all the includes are cached
        return callback(undefined, document, new Queryable(includes));
      } else if (uncached.length === 1) {   // just one include is uncached, do a HTTP GET
        return get(uncached[0], connection, function (error, doc) {
          _cache(doc);
          _callback(error);
        });     
      } else {                              // more than one include is uncached, do a batched HTTP POST
        return post(uncached, undefined, connection, function (error, docs) {
          if (docs) { docs.Results.forEach(_cache); }
          _callback(error);
        });
      }
    }
  };

  function batch(keys, includes, connection, cache, changes, callback) {
    // checking the cache for batched documents requires several steps:
    // checking the cache for cached documents
    // looping each include and then looping each document (for each include) to get the include keys
    // checking the cache for cached included documents
    // then in most cases still making a http request, we may as well just make the http request anyway.

    var _cache = function (documents) {
      documents.forEach(function (document) {
        var cached = cache[document['@metadata']['@id']];

        if (!cached) {
          cache[document['@metadata']['@id']] = JSON.stringify(document);       // js passes by reference, so stringify it to not require a deep clone - used for comparison on save
          Object.freeze(document['@metadata']);                               // you shouldn't be able to change the metadata after the first save
          changes[document['@metadata']['@id']] = document;                     // add a reference cache of the document to compare against the stringified cache
        }          
      });
    };

    return post(keys, includes, connection, function (error, docs) {
      var documents = [];
      var included = [];

      if (docs) {
        documents = docs.Results;
        included = docs.Includes;	      
        _cache(documents);
        _cache(included);
      }

      callback(error, new Queryable(documents), new Queryable(included));
    });       
  };

  function get(key, connection, callback) {
    var options = {
      host: connection.host,
      port: connection.port,
      path: util.format(masks.database + masks.document, connection.database, key),
    };

    http.get(options, function (response) {
      var error = undefined;
      var document = undefined;
  
      if (response.statusCode === 400) {
        error = new Error('Load Failed: The request url was badly formed. Ensure the id does not contain illegal characters');
        error.statusCode = 400;
      } else {
        response.on('data', function (chunk) {
          try {
            var json = JSON.parse(chunk);
            
            if (json.Error) {
              var message = json.Error.match(/: (.*)\r\n/)[1];
              error = new Error(message ? message : 'An error occured, no documents could be retrieved');
            } else {
              document = json;
              document['@metadata'] = {
                'Raven-Entity-Name': response.headers['raven-entity-name'],
                'Raven-Clr-Type': response.headers['raven-clr-type'],
                '@id': key,
                'Last-Modified': new Date(response.headers['last-modified']).toISOString(),
                '@etag': response.headers.etag
              };
            }
          } catch (e) {
            error = new Error('Parse Error: ' + e.message);
          }
        });
      }

      response.on('end', function() { callback(error, document); });  		      
    }).on('error', callback);
  };

  function post(keys, includes, connection, callback) {
    var query = masks.queries + (Array.isArray(includes) ? '?' + qs.stringify({ include: includes }, '&', '=') : '');

    var options = {
      host: connection.host,
      port: connection.port,
      path: util.format(masks.database, connection.database) + query,
      method: 'POST'
    };

    var request = http.request(options, function (response) {
      var error = undefined;
      var results = undefined;

      if (response.statusCode === 400) {
        error = new Error('Load Failed: The request url was badly formed. Ensure the id does not contain illegal characters');
        error.statusCode = 400;
      } else {
        response.on('data', function (chunk) {
          try {
            var json = JSON.parse(chunk);

            if (json.Error) {
              var message = json.Error.match(/: (.*)\r\n/)[1];
              error = new Error(message ? message : 'An error occured, no documents could be retrieved');
            } else {
              results = json;
            }
          } catch (e) {
            error = new Error('Parse Error: ' + e.message);
          }
        });
      }

      response.on('end', function () { callback(error, results); });      
    });

    request.on('error', callback);
    request.write(JSON.stringify(keys));
    request.end();
  };  
})();