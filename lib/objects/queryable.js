var Queryable = module.exports = (function() {
  function Queryable (documents) {
    var arr = [ ];

    if (Array.isArray(documents)) {
      arr = documents.slice(0);
    }

    arr.__proto__ = Queryable.prototype;
    return arr;
  };

  Queryable.prototype = new Array

  Queryable.prototype.all = function(func) {
    return this.every(func);
  };

  Queryable.prototype.any = function(func) {
    return this.exists(func);
  };

  Queryable.prototype.count = function(func) {
    return (func ? this.where(func) : this).length;
  };

  Queryable.prototype.elementAt = function(index) {
    return this[index];
  };

  Queryable.prototype.empty = function() {
    return this.length === 0;
  };

  Queryable.prototype.exists = function(func) {
    return this.some(func);
  };

  Queryable.prototype.first = function(func) {
    if (func) {
      var temp = this.where(func);
      return temp.length > 0 ? temp[0] : null;
    }
    
    return this.length > 0 ? this[0] : null;
  };

  Queryable.prototype.last = function(func) {
    if (func) {
      var temp = this.where(func);
      return temp.length > 0 ? temp[temp.length - 1] : null;
    }
    
    return this.length > 0 ? this[this.length - 1] : null;
  };

  Queryable.prototype.load = function(key) {
    return this.single(function(document) {
      return document['@metadata']['@id'] === id;
    });
  };

  Queryable.prototype.orderBy = function(property) {
    var temp = this;

    if (typeof property === 'string') {
      return new Queryable(temp.sort(function(a, b) {
        return (a[condition] < b[condition]) ? -1 : ((a[condition] > b[condition]) ? 1 : 0);
      }));
    }
  };

  Queryable.prototype.random = function(func) {
    if (func) {
      var temp = this.where(func);
      return temp[Math.floor(Math.random() * results.length)] || null;
    }
   
    return this[Math.floor(Math.random() * this.length)] || null;
  };

  Queryable.prototype.select = function(func) {
    if (typeof func === 'string') {
      return new Queryable(this.map(function(document) {
        return document[func];
      }));
    } else if (typeof func === 'function') {
      return new Queryable(this.map.func);
    }
    return null;
  };

  Queryable.prototype.single = function(func) {
    var temp = this.where(func);

    if (temp.length === 1) {
      return temp[0];
    } else if (temp.length > 1) {
      throw new Error('Sequence contains more than one element');
    }

    return null;
  };

  Queryable.prototype.where = function(func) {
    return new Queryable(this.filter(func));
  };

  return Queryable;
})();