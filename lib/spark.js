const hogan = require('hogan.js')
const juice = require('juice')
const path = require('path')
const Sparkpost = require('sparkpost')

const config = require('./config')

let spark = {
  transmissions: {
    get () {},
    send () {}
  }
}

if (process.env.SPARKPOST_API_KEY) {
  spark = new Sparkpost()
}

const templates = {}

module.exports.send = function send (options, callback, template) {
  if (process.env.NODE_ENV === 'test') {
    if (options.to.email && options.template) {
      return callback(null, {
        _id: '123',
        status: 'sent'
      })
    } else {
      return callback(new Error('Must have email & template set to send an email.'))
    }
  }

  if (!template) {
    if (templates[options.template]) {
      return send(options, callback, templates[options.template])
    } else {
      return juice.juiceFile(path.join(__dirname, `/../email-templates/${options.template}.html`), {},
        function (err, data) {
          if (err) {
            return callback(err)
          } else {
            templates[options.template] = hogan.compile(data)
            return send(options, callback, templates[options.template])
          }
        }
      )
    }
  }

  const html = template.render(options)
  const transmission = {
    content: {
      from: { email: config.email.address, name: config.email.name },
      html,
      subject: options.subject,
      text: html
    },
    options: {
      click_tracking: true,
      open_tracking: true,
      transactional: true
    },
    recipients: [{address: options.to}]
  }

  spark.transmissions.send(transmission, (err, response) => {
    if (err) {
      callback(err)
    } else {
      callback(null, response.body)
    }
  })
}

module.exports.info = function info (id, callback) {
  spark.transmissions.get(id, (err, response) => {
    if (err) {
      callback(err)
    } else {
      callback(null, response.body)
    }
  })
}
