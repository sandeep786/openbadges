var mongoose = require('mongoose')
  , conf = require('../lib/configuration').get('database')
  , url = require('url')
mongoose.connect(conf.host, conf.name, conf.port);

var urlre = /(^(https?):\/\/[^\s\/$.?#].[^\s]*$)|(^\/\S+$)/
  , emailre = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/
  , originre = /^(https?):\/\/[^\s\/$.?#].[^\s\/]*$/
  , versionre = /^v?\d+\.\d+\.\d+$/

var maxlen = function(len){ return function(v){ return (v||'').length < len } }
var slashTrim = function(v){ return v.replace(/\/*$/, ''); }
var isodate = function(){}
var fqUrl = function(v){
  if (!v) return v;
  var baseurl = url.parse(v)
    , origin
  if (!baseurl.hostname) {
    origin = url.parse(this.meta.pingback || this.badge.issuer.origin)
    baseurl.host = origin.host;
    baseurl.port = origin.port;
    baseurl.slashes = origin.slashes;
    baseurl.protocol = origin.protocol;
    baseurl.hostname = origin.hostname;
  }
  return url.format(baseurl);
}

isodate.re = /\d{4}-\d{2}-\d{2}/;
isodate.set = function(input) {
  if (!isodate.re.test(input)) return false;
  var pieces = input.split('-')
    , year = parseInt(pieces[0], 10)
    , month = parseInt(pieces[1], 10)
    , day = parseInt(pieces[2], 10)
  if (month > 12 || month < 1) return false;
  if (day > 31 || day < 1) return false;
  return input;
};
isodate.validate = function(v) { return v === null || v.match(isodate.re) ; }

var Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId

var Badge = new Schema(
  { meta:
    { pingback  : { type: String }
    , publicKey : { type: String }
    , imagePath : { type: String }
    , accepted : { type: Boolean }
    , rejected : { type: Boolean }
    }
  , recipient : { type: String, required: true, match: emailre, index: true }
  , evidence  : { type: String, match: urlre, get: fqUrl}
  , expires   : { type: String, set: isodate.set, validate: [isodate.validate, 'isodate'] }
  , issued_on : { type: String, set: isodate.set, validate: [isodate.validate, 'isodate'] }
  , badge:
    { version     : { type: String, required: true, match: versionre }
    , name        : { type: String, required: true, validate: [maxlen(128), 'maxlen'] }
    , description : { type: String, required: true, validate: [maxlen(128), 'maxlen'] }
    , image       : { type: String, required: true, match: urlre, get: fqUrl }
    , criteria    : { type: String, required: true, match: urlre, get: fqUrl }
    , issuer:
      { origin  : { type: String, required: true, match: originre, set: slashTrim }
      , name    : { type: String, required: true, validate: [maxlen(128), 'maxlen'] }
      , org     : { type: String, validate: [maxlen(128), 'maxlen'] }
      , contact : { type: String, match: emailre, index: true }
      }
    }
  }
)

Badge.virtual('evidenced')
  .get(function(){
    var evidence = url.parse(this.evidence)
      , origin
    if (!evidence.hostname) {
      origin = url.parse(this.meta.pingback || this.issuer.origin)
      evidence.host = origin.host;
      evidence.port = origin.port;
      evidence.slashes = origin.slashes;
      evidence.protocol = origin.protocol;
      evidence.hostname = origin.hostname;
    }
    return url.format(evidence);
  })
  .set(function(v){ this.set('evidence', v) })

var BadgeModel = module.exports = mongoose.model('Badge', Badge);
BadgeModel.prototype.upsert = function(callback) {
  var self = this
    , query = {recipient: this.recipient, 'meta.pingback': this.meta.pingback}
  
  BadgeModel.findOne(query, function(err, doc) {
    var id;
    if (doc) {
      self._doc._id = doc._doc._id;
      doc._doc = self._doc;
      doc.save(callback);
    } else {
      self.save(callback);
    }
  })
}