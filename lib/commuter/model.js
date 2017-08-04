const async = require('async')
const uuid = require('node-uuid')

const analytics = require('../analytics')
const config = require('../config')
const Email = require('../email/model')
const geocode = require('../geocode')
const mongoose = require('../mongo')

const {createAccount} = require('../auth0')
const {send} = require('../spark')

/**
 * Create `schema`
 */

var schema = new mongoose.Schema({
  account: String,
  email: String,
  givenName: String,
  surname: String,
  internalId: String,
  _organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  _user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  anonymous: {
    type: Boolean,
    default: true
  },
  link: String,
  labels: Array,
  status: {
    type: String,
    default: 'not invited'
  },
  opts: {
    type: mongoose.Schema.Types.Mixed,
    default: defaultObject,
    select: true
  },
  profile: {
    type: mongoose.Schema.Types.Mixed,
    default: defaultObject,
    select: true
  },
  stats: {
    type: mongoose.Schema.Types.Mixed,
    default: defaultObject
  }
})

/**
 * Default object
 */

function defaultObject () {
  return {}
}

/**
 * On save generate a link
 */

schema.pre('save', function (next) {
  if (this.isNew || !this.link) this.link = uuid.v4().replace(/-/g, '')
  next()
})

/**
 * Sync with account
 */

schema.methods.syncWithAccount = function (client) {
  if (!this.account) return Promise.resolve(this)

  return new Promise((resolve, reject) => {
    client.getAccount(this.account, (err, account) => {
      if (err) {
        reject(err)
      } else {
        this.givenName = account.givenName
        this.surname = account.surname
        this.email = account.email
        this.save()
          .then(resolve)
          .catch(reject)
      }
    })
  })
}

/**
 * Generate
 */

schema.statics.generate = function (accountData, commuterData) {
  let commuter = null
  let commuterPromise = null

  if (accountData && accountData.email) {
    commuterPromise = createAccount(accountData)
      .then(createdAccount => {
        commuterData.account = createdAccount.href
        return Commuter.create(commuterData)
      })
  } else { // account-less commuter
    commuterPromise = Commuter.create(commuterData)
  }

  return commuterPromise
    .then(createdCommuter => {
      commuter = createdCommuter
      if (commuter._location) {
        const CommuterLocation = require('../commuter-locations/model')
        return CommuterLocation.create({
          _commuter: commuter._id,
          _location: commuter._location
        })
      } else {
        return commuter
      }
    })
}

/**
 * Generate and send plan
 */

schema.statics.generateAndSendPlan = function (userData, commuterData) {
  let commuter = null
  return this.generate(userData, commuterData)
    .then((generatedCommuter) => {
      commuter = generatedCommuter
      return commuter.sendPlan()
    })
    .then(() => {
      return commuter
    })
}

/**
 * Carpool sign up
 */

schema.methods.carpoolSignUp = function (opts) {
  this.profile.commute = opts.commute
  this.profile.carpool_matching = true

  return this.save()
    .then(() => {
      return this.sendEmail('carpool-matching-sign-up', {
        subject: 'Signed Up for Carpool Matching'
      })
    })
}

/**
 * Send an email to a commuter
 */

schema.methods.sendEmail = function (template, options) {
  const name = `${this.givenName} ${this.surname}`

  return new Promise((resolve, reject) => {
    const opts = Object.assign({}, {
      domain: config.domain,
      applicationName: config.name,
      link: `${config.domain}/planner/${this.link}`,
      name: name,
      organization: config.organization.name,
      organization_url: config.organization.url,
      template: template,
      to: {
        name: name,
        email: this.email
      }
    }, options)

    send(opts, (err, results) => {
      if (err) {
        reject(err)
      } else {
        analytics.track({
          userId: this.account,
          event: `Sent Email: "${template}"`,
          properties: opts
        })

        Email.create({
          account: this.account,
          _commuter: this._id,
          _organization: this._organization,
          metadata: opts,
          result: results
        }, (err, email) => {
          if (err) {
            reject(err)
          } else {
            resolve(email)
          }
        })
      }
    })
  })
}

/**
 * Send plan
 */

schema.methods.sendPlan = function () {
  return this.sendEmail('plan', {
    subject: `Get your commute plan from ${config.name}`,
    survey: config.survey
  })
}

/**
 * Update status
 */

schema.methods.updateStatus = function (callback) {
  var commuter = this
  Email
    .findOne()
    .where('_commuter', this._id)
    .sort('-modified')
    .exec(function (err, email) {
      if (err) {
        callback(err)
      } else if (!email) {
        commuter.status = 'not invited'
        commuter.save(callback)
      } else {
        email.updateCommuter(commuter, callback)
      }
    })
}

/**
 * Reverse Geocode
 */

schema.methods.reverseGeocode = function (ll, callback) {
  var commuter = this
  geocode.reverse(ll, function (err, address) {
    if (err) {
      callback(err)
    } else {
      for (var key in address) {
        commuter[key] = address[key]
      }
      commuter.save(callback)
    }
  })
}

/**
 * Iterate and apply to all
 */

schema.statics.iterateAndApply = function (fn, opts) {
  const tick = opts.tick || function () {}
  const limit = opts.limit || 100
  return new Promise((resolve, reject) => {
    let more = true
    let skip = 0
    async.doWhilst(
      (cb) => {
        Commuter
          .find()
          .limit(limit)
          .skip(limit * skip++)
          .exec()
          .then(commuters => {
            if (!commuters || commuters.length === 0) {
              more = false
              cb()
            } else {
              return Promise.all(fn(commuters))
            }
          })
          .then(commuters => {
            tick(commuters)
            cb(null, commuters)
          })
      },
      () => {
        return more
      },
      (err) => {
        if (err) reject(err)
        else resolve()
      }
    )
  })
}

/**
 * Plugins
 */

schema.plugin(require('../plugins/mongoose-geocode'))
schema.plugin(require('../plugins/mongoose-querystring'))
schema.plugin(require('../plugins/mongoose-trackable'))

/**
 * Expose `Commuter`
 */

const Commuter = mongoose.model('Commuter', schema)

module.exports = Commuter
