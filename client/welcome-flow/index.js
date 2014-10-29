var introJs = require('intro.js').introJs;
var log = require('log')('welcome-flow');
var LocationsView = require('locations-view');

var FindingOptions = require('./finding-options');
var Locations = require('./locations');
var Welcome = require('./welcome');

/**
 * Show Modal
 */

module.exports = function(session) {
  var commuter = session.commuter();
  var plan = session.plan();
  var main = document.querySelector('#main');

  main.classList.add('Welcome');

  var welcome = new Welcome(commuter);

  welcome.on('next', function() {
    var locations = new Locations({
      'locations-view': new LocationsView(plan),
      plan: plan,
      commuter: commuter
    });
    locations.show();

    locations.on('next', function() {
      var route = plan.options()[0];
      var findingOptions = new FindingOptions(route);
      findingOptions.show();

      findingOptions.on('next', function() {
        commuter.updateProfile('welcome_wizard_complete', true);
        commuter.save();

        main.classList.remove('Welcome');
        findingOptions.hide();
        highlightResults();
      });

      setTimeout(function() {
        locations.hide();
      }, 0);
    });

    setTimeout(function() {
      welcome.hide();
    }, 0);
  });

  // Start!
  welcome.show();
};

/**
 * Intro JS
 */

function highlightResults() {
  var intro = introJs();

  intro.setOptions({
    disableInteraction: false,
    exitOnEsc: false,
    exitOnOverlayClick: false,
    overlayOpacity: 1,
    scrollToElement: false,
    showBullets: false,
    showProgress: false,
    showStepNumbers: false,
    skipLabel: 'Skip',
    doneLabel: 'Close',
    steps: [{
      element: document.querySelector('.Options'),
      intro: '<strong>Here are your best options!</strong> We\'ve searched all combinations of available travel modes to find the best trips for you, ranked based on their benefits versus driving alone.<br><br>Use this screen to explore your options and plan any other trips you\'d like to take!',
      position: 'top'
    }, {
      element: document.querySelector('nav .fa-question-circle'),
      intro: 'Click here to find out more!',
      position: 'left'
    }]
  });

  intro.start();
}
