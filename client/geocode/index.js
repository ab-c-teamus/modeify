var log = require('../log')('geocode')
var get = require('../request').get

/**
 * Geocode
 */

module.exports = geocode
module.exports.extended = extended
module.exports.reverse = reverse
module.exports.suggest = suggest

/**
 * Geocode -- returns lat/lng coordinate only
 */

function geocode (address, magicKey, callback) {
  let params = ''
  if (!callback) {
    callback = magicKey
    magicKey = undefined
  } else {
    params = `?magicKey=${magicKey}`
  }
  log('--> geocoding %s', address)
  get(`/geocode/${address}${params}`, function (err, res) {
    if (err) {
      log('<-- geocoding error %s', err)
      callback(err, res)
    } else {
      log('<-- geocoding complete %j', res.body)
      callback(null, res.body)
    }
  })
}

/**
 * Extended Geocode -- returns all address properties in addition to coordinate
 */

function extended (address, callback) {
  log('--> extended geocoding %s', address)
  get('/geocode/extended/' + address, function (err, res) {
    if (err) {
      log('<-- geocoding error %s', err)
      callback(err, res)
    } else {
      log('<-- geocoding complete %j', res.body)
      callback(null, res.body)
    }
  })
}

/**
 * Reverse geocode
 */

function reverse (ll, callback) {
  log('--> reverse geocoding %s', ll)
  get('/geocode/reverse/' + ll[0] + ',' + ll[1], function (err, res) {
    if (err) {
      log('<-- geocoding error %e', err)
      callback(err, res)
    } else {
      log('<-- geocoding complete %j', res.body)
      callback(null, res.body)
    }
  })
}

/**
 * Suggestions!
 */

function suggest (text, callback) {
  log('--> getting suggestion for %s', text)
  get('/geocode/suggest/' + text, function (err, res) {
    if (err) {
      log('<-- suggestion error %s', err)
      callback(err, res)
    } else {
      log('<-- got %s suggestions', res.body.length)
      callback(null, res.body)
    }
  })
}
