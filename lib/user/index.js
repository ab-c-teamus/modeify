const {Router} = require('express')
const uuid = require('node-uuid').v4

const {
  adminRequired,
  authenticationRequired,
  createAccount,
  getAccount,
  getAccounts,
  getGroupMembership,
  getGroups
} = require('../auth0')
const config = require('../config')
const {send} = require('../spark')

const app = Router()

module.exports = app

/**
 * Get all users
 */

app.get('/', authenticationRequired, adminRequired, function (req, res) {
  getAccounts((err, accounts) => {
    if (err) {
      res.status(400).send(err)
    } else {
      res.status(200).send(accounts)
    }
  })
})

/**
 * Get all managers
 */

app.get('/managers', authenticationRequired, adminRequired, getManagerGroup, function (req, res) {
  res.status(200).send(req.managerGroup.accounts.items)
})

/**
 * Get all managers for a given organization
 */

app.get('/managers-for-organization', authenticationRequired, adminRequired, getManagerGroup, function (req, res) {
  getGroups({
    name: 'organization-' + req.query.organization + '-manager',
    expand: 'accounts'
  }, function (err, groups) {
    if (err) {
      res.status(400).send(err)
    } else if (groups.items.length === 0) {
      res.status(404).send('Group does not exist.')
    } else {
      res.status(200).send(groups.items[0].accounts.items)
    }
  })
})

/**
 * Create a manager or promote a user to be a manager
 */

app.post('/managers', authenticationRequired, adminRequired, getManagerGroup, function (req, res) {
  if (!req.body.password) {
    req.body.password = uuid().replace(/-/g, '')
  }

  createOrRetrieveAccount(req.body)
    .then(account => {
      account.addToGroup(req.managerGroup, (err) => {
        if (err) {
          console.error(err)
          console.error(err.stack)
          if (err.code === 409) { // already in the group
            res.status(409).send(`${req.body.givenName} ${req.body.surname} (${req.body.email}) is already a manager.`)
          } else {
            res.status(400).send(err)
          }
        } else {
          res.status(200).send(account)
        }
      })
    })
    .catch(err => {
      console.error(err)
      console.error(err.stack)
      res.status(400).send(err)
    })
})

/**
 * Create a user
 */

app.post('/', authenticationRequired, adminRequired, function (req, res) {
  if (!req.body.email) {
    return res.status(400).send('Email address is required')
  }

  createAccount(req.body, (err, createdAccount) => {
    if (err) {
      res.status(400).send(err)
    } else {
      res.status(200).send(createdAccount)
    }
  })
})

/**
 * Middleware to retrieve a user by id
 */

function get (req, res, next) {
  getAccount(
    { expand: 'customData,groupMemberships,groups' },
    (err, user) => {
      if (err) {
        res.status(400).send(err)
      } else if (!user) {
        res.status(404).send('User does not exist.')
      } else {
        req.foundUser = user
        next()
      }
    }
  )
}

/**
 * Get a specific user
 */

app.get('/:id', authenticationRequired, adminRequired, get, function (req, res) {
  res.status(200).send(req.foundUser)
})

/**
 * Get the user's groups
 */

app.get('/:id/groups', authenticationRequired, adminRequired, get, function (req, res) {
  res.status(200).send(req.foundUser.groups.items)
})

/**
 * Add to groups
 */

app.get('/:id/add-to-group', authenticationRequired, adminRequired, get, function (req, res) {
  getGroups({ name: req.query.group }, function (err, groups) {
    if (err) {
      res.status(400).send(err)
    } else if (groups.items.length === 0) {
      res.status(404).send('Group does not exist.')
    } else {
      req.foundUser.addToGroup(groups.items[0].href, (err) => {
        if (err) {
          res.status(400).send(err)
        } else {
          res.status(201).end()
        }
      })
    }
  })
})

app.get('/:id/remove-from-group', authenticationRequired, adminRequired, get, function (req, res) {
  var group = getGroupByName(req.foundUser.groups.items, req.query.group)
  if (!group) {
    return res.status(404).send('Not in group.')
  }

  var groupMembership = getGroupMembershipByGroup(req.foundUser.groupMemberships.items, group)
  getGroupMembership(groupMembership.href, function (err, gm) {
    if (err) {
      res.status(400).send(err)
    } else {
      gm.delete(function (err) {
        if (err) {
          res.status(400).send(err)
        } else {
          res.status(204).end()
        }
      })
    }
  })
})

function getGroupByName (groups, name) {
  return groups.filter(function (group) {
    return group.name === name
  })[0]
}

function getGroupMembershipByGroup (memberships, group) {
  return memberships.filter(function (membership) {
    return group.href === membership.group.href
  })[0]
}

/**
 * Save customData
 */

app.post('/:id/save-custom-data', authenticationRequired, get, function (req, res) {
  for (var key in req.body.customData) {
    req.user.customData[key] = req.body.customData[key]
  }

  req.user.customData.save(function (err) {
    if (err) {
      res.status(400).send(err)
    } else {
      res.status(201).end()
    }
  })
})

/**
 * Update a user
 */

app.put('/:id', authenticationRequired, adminRequired, get, function (req, res) {
  if (req.body.givenName) req.foundUser.givenName = req.body.givenName
  if (req.body.surname) req.foundUser.surname = req.body.surname
  if (req.body.email) req.foundUser.email = req.body.email

  for (var key in req.body.customData) {
    req.foundUser.customData[key] = req.body.customData[key]
  }

  req.foundUser.save(function (err) {
    if (err) {
      res.status(400).send(err)
    } else {
      res.status(204).end()
    }
  })
})

/**
 * Delete a user
 */

app.delete('/:id', authenticationRequired, adminRequired, get, function (req, res) {
  req.foundUser.delete(function (err) {
    if (err) {
      res.status(400).send(err)
    } else {
      res.status(204).end()
    }
  })
})

function getManagerGroup (req, res, next) {
  getGroups({ name: 'manager', expand: 'accounts' }, (err, groups) => {
    if (err) {
      next(err)
    } else if (groups.items.length < 1) {
      next(new Error('Manager group does not exist for this directory.'))
    } else {
      req.managerGroup = groups.items[0]
      next()
    }
  })
}

function createOrRetrieveAccount (application, directory, data) {
  return new Promise((resolve, reject) => {
    directory.createAccount(data, {
      registrationWorkflowEnabled: false
    }, (err, account) => {
      if (err) {
        if (err.code === 2001) { // acount with that email already exists
          directory.getAccounts({ email: data.email }, function (err, accounts) {
            if (err) {
              reject(err)
            } else {
              resolve(accounts.items[0])
            }
          })
        } else {
          reject(err)
        }
      } else {
        const emailOpts = {
          domain: config.domain,
          applicationName: config.name,
          link: `${config.domain}/login?login=${data.email}&next=%2Fmanager%2Fwelcome`,
          username: data.email,
          password: data.password,
          template: 'invite-manager',
          subject: `You've been Invited to be a Manager on ${config.name}`,
          to: {
            name: data.givenName + ' ' + data.surname,
            email: data.email
          }
        }

        send(emailOpts, (err, results) => {
          if (err) {
            console.log(err)
          } else {
            console.log('sent manager invite email')
          }
        })
        resolve(account)
      }
    })
  })
}
