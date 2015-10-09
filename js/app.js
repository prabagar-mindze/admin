'use strict';

var oneHpApp = angular.module('oneHpApp', [
  'ui.router',
  'ngCordova',
  'oneHpControllers',
  'oneHpServices',
  'angular-svg-round-progress'
]);

	
//http://stackoverflow.com/questions/14070285/how-to-implement-history-back-in-angular-js
oneHpApp.directive('back', ['$window', function($window) {
        return {
            restrict: 'A',
            link: function (scope, elem, attrs) {
                elem.bind('click', function () {
                    $window.history.back();
                });
            }
        };
    }]);
	


/*
 * Sets the app version in the headers
 */
oneHpApp.factory('oneHealthInterceptor', ['$q', '$rootScope', 'authService',
  function($q, $rootScope, authService) {
    return {
      'request': function(request) {
        request.headers.token = authService.getToken();
        console.log(request);
        return request;
      },
      'response': function(response) {
        console.log(response);
        return response;
      },
      'responseError' : function (rejection) {
        console.log (rejection);
        switch (rejection.status) {
          case 200:
          case 201:
          case 304:
            break;
          case 0:
            $rootScope.$broadcast ("slowNetwork", "network");
            break;
          case 500:
          case 501:
          case 404:
            $rootScope.$broadcast ("slowNetwork", "server");
            break;
        }
        return $q.reject(rejection);
      }
    };
  }]);

oneHpApp.factory('timeoutHttpIntercept', function ($rootScope, $q) {
    return {
      'request': function(config) {
        config.timeout = 10000;
        return config;
      }
    };
 });

oneHpApp.config(['$httpProvider', function ($httpProvider) {
  $httpProvider.interceptors.push('oneHealthInterceptor');
  $httpProvider.interceptors.push('timeoutHttpIntercept');
}]);

/*
 * Data persistance support using PouchDB
 */
oneHpApp.service('dbService', ['$q','$timeout',
  function($q, $timeout) {
    var dbname = "oneHpClientDB";

    var set = function(key, value) {
      var db = new PouchDB(dbname);
      return $q.when(db.get(key)
                     .then(function(response) {
                       return db.put({_id: key,
                                      _rev: response._rev,
                                      value: value});
          })
               .catch(function(response) {
           return db.put({_id: key,
                                      value: value});
         }));
    };

    var get = function(key) {
      var db = new PouchDB(dbname);
      return $q.when(db.get(key));
    };

    var remove = function(key) {
      var db = new PouchDB(dbname, {auto_compaction: true});
      db.get(key).then(function(doc) {
        db.remove(doc);
      }).catch(function(error) {
        console.log(error);
      });
      return true;
    };

    return {set: set,
            remove: remove,
            get: get};
  }]);

/*
 * Store and retrieve auth cookie using the dbService
 */
oneHpApp.service('authService', ['$q', 'dbService',
  function($q, dbService) {
    var _token = null;
    var deffered = $q.defer();

    var getTokenFromStorage = function() {
      dbService.get("token").then(function(data) {
         _token = data.value;
         deffered.resolve(data.value);
      }, function(error) {
         deffered.reject(error);
      });
      return deffered.promise;
    };

    var getToken = function() {
      return _token;
    };

    var setToken = function(token) {
      dbService.set("token", token);
      _token = token;
    };

    var removeToken = function(token) {
      dbService.remove("token",token);
      _token = null;
    };

    var isLoggedIn = function () {
      if (_token != null)
       return true;
      return false;
    };

    return {isLoggedIn: isLoggedIn,
            removeToken: removeToken,
            getToken: getToken,
            setToken: setToken,
            getTokenFromStorage: getTokenFromStorage};
  }
]);

oneHpApp.run(function($rootScope) {
  document.addEventListener("keyup", function(e) {
    if (e.keyCode === 27) {
      $rootScope.$broadcast("escapePressed", e.target);
    }
  });

  document.addEventListener("click", function(e) {
    $rootScope.$broadcast("documentClicked", e.target);
  });
});

/*
 * This function will be called using $injector.invoke() when it is
 * passed as an argument to resolve in ui-router configuration.
 *
 * Redirect to the login page if the user is not logged in.
 */
function isLoggedIn($q, $state, $location, authService)
{
  var deffered = $q.defer();
  if (authService.isLoggedIn()) {
    deffered.resolve();
  } else {
    authService.getTokenFromStorage().then(function (data) {
      deffered.resolve();
    }).catch (function(error) {
      $location.path ('/login');
    });
  }
  return deffered.promise;
}


oneHpApp.run(function($rootScope, $sce, localeMessages) {
  $rootScope.gMsgs = localeMessages.query();
  $rootScope.saneHTML = function(string) {
    return $sce.trustAsHtml(string);
  };

  var app = document.URL.indexOf( 'http://' ) === -1 && document.URL.indexOf( 'https://' ) === -1;
  if (app) {
    $rootScope.gIsBrowser = true;
  } else {
    $rootScope.gIsBrowser = false;
  }
});


oneHpApp.controller('AppMainCtrl', [
  '$scope', '$rootScope', 'ModalService', '$timeout',
  function ($scope, $rootScope, ModalService, $timeout) {

    $scope.slowNetworkStatus = false;
    $scope.checkingNow = false;

    $rootScope.$on("slowNetwork", function(event, reason) {
      $scope.slowNetworkStatus = true;
      $scope.reason = reason;
    });

    $scope.$watch('slowNetworkStatus', function(newValue, oldValue, scope) {

      if ($scope.slowNetworkStatus == false)
        return;
      if (newValue == oldValue)
        return;

      ModalService.showModal({
        templateUrl: "partials/slownetwork.html",
        controller: "SlowNetworkController",
        inputs: {reason: $scope.reason}
      }).then(function(modal) {
        modal.close.then(function(result) {
          $scope.modal = false;
          $scope.slowNetworkStatus = false;
        });
      });

    });

  }]);

oneHpApp.controller('SlowNetworkController', [
  "$scope", "close", "reason", "Profile", "$timeout", "$state",
  function ($scope, close, reason, Profile, $timeout, $state) {
    $scope.reason = reason;
    $scope.close = function() {
      close();
    };

    $scope.tryagain = function() {
      $scope.checkingNow = true;

      Profile.getProfile().$promise
                  .then(function(data) {
                    $scope.checkingNow = false;
                    close();
                    $state.go($state.current, {}, {reload: true, location: "replace"}); 
                  })
                  .catch(function(data) {
                    $timeout(function() {$scope.checkingNow = false;}, 1500);
                  });
    };
  }]);

oneHpApp.filter('sprintf', function() {
    function parse(str) {
        var args = [].slice.call(arguments, 1),
            i = 0;

        return str.replace(/%s/g, function() {
            return args[i++];
        });
    }

    return function(str) {
        return parse(str, arguments[1], arguments[2], arguments[3], arguments[4], arguments[5]);
    };
});

"use strict";

var app = {
    init: function init() {
        console.log('Binding evnets...');
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function() {
        console.log("bind events");
        document.addEventListener('deviceready', this.onDeviceReady, false);
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicitly call 'app.receivedEvent(...);'
    onDeviceReady: function() {
        app.receivedEvent('deviceready');
        document.addEventListener("backbutton", function(e) {
           var loc = window.location.href;
           if (loc.indexOf('#/dashboard')  > -1|| loc.indexOf('#/login') > -1) {
               e.preventDefault();
               navigator.app.exitApp();
           }
           else {
               navigator.app.backHistory();
           }
        }, false);

        if (true) { //device.platform == 'iOS') {
          //http://stackoverflow.com/questions/26784118/scrolling-on-ios-device-finger-input-tag/28862015#28862015
          document.addEventListener('DOMContentLoaded', function() {
              setTextareaPointerEvents('none');
          });
          document.addEventListener('touchstart', function() {
              setTextareaPointerEvents('auto');
          });
          document.addEventListener('touchmove', function(e) {
              //e.preventDefault();
              setTextareaPointerEvents('none');
          });
          document.addEventListener('touchend', function() {
              setTimeout(function() {
                  setTextareaPointerEvents('none');
              }, 0);
          });
        }

    },
    // Update DOM on a Received Event
    receivedEvent: function(id) {
        // var parentElement = document.getElementById(id);
        // var listeningElement = parentElement.querySelector('.listening');
        // var receivedElement = parentElement.querySelector('.received');

        // listeningElement.setAttribute('style', 'display:none;');
        // receivedElement.setAttribute('style', 'display:block;');
    }
};

function setTextareaPointerEvents(value) {
    var nodes = document.getElementsByTagName('input');
    for(var i = 0; i < nodes.length; i++) {
        nodes[i].style.pointerEvents = value;
    }
}

//module.exports = app;

/*
 * Rename this file to config.js and update serverUrl appropriately
 */

var serverUrl = "http://p.1hf.co:30003";

/* Controllers */

var oneHpControllers = angular.module('oneHpControllers', ['angularModalService']);

function getToday() {
  var today = new Date();
  // Set the time to start of day
  today.setSeconds(0); today.setMinutes(0); today.setHours(0);
  var start = new Date(today);
  today.setSeconds(59); today.setMinutes(59); today.setHours(23);
  var end = new Date(today);

  return {start: start.toISOString(), end: end.toISOString()};
}

function getCurrentMonth() {
   var date = new Date();
   var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
   var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

   return {firstDay: firstDay.toISOString(), lastDay: lastDay.toISOString()};
}

//oneHpControllers.controller('SplashCtrl', [
//  '$scope', '$state', '$location', '$stateParams', 'authService', '$timeout',
//  function($scope, $state, $location, $stateParams, authService, $timeout) {
//    $scope.onLoad = function () {
//
//      var splashHoldTime = 1500;
//
//      if (authService.isLoggedIn()) {
//        $timeout(function(){$state.go ('dashboard');}, splashHoldTime);
//        return;
//      }
//
//    authService.getTokenFromStorage().then(function (data) {
//      var redirect = $stateParams.redirect;
//      if (typeof redirect === 'undefined') {
//        $timeout(function(){$state.go('dashboard');}, splashHoldTime);
//      } else {
//        $timeout(function(){$location.path(redirect);}, splashHoldTime);
//      }
//    }).catch(function(error) {
//        $timeout(function(){$state.go ('login');}, splashHoldTime);
//      });
//    };
//  }
//]);



oneHpControllers.controller('DashboardCtrl', ['$scope', '$state',
  'ModalService', 'Event','$rootScope','LoginServices', 'authService',
  function($scope, $state, ModalService, Event, $rootScope, LoginServices,
           authService) {
    var today = getToday();

    Event.getEvents({start: today.start, end: today.end})
      .$promise.then(function(data) {
        $scope.events = data;
        // Compute the completed percentage
        $scope.completed = data.filter(function(e) {
          if (e.status === 'complete') return true;
          else return false;
        }).length;
        if (data.length > 0) $scope.percentComplete = parseInt(($scope.completed/data.length)*100);
        else $scope.percentComplete = 0;
      });

    $scope.notifications = [
      {
          "type": "emergency",
          "message": "Patient X admitted",
          "read": false,
          "date": "2015-09-03T11:00:00Z"
      },
      {
          "type": "ad",
          "message": "buy our tablets, tonics for a discount",
          "read": false,
          "date": "2015-09-03T11:00:00Z"
      }
    ];

    // TODO: Use Array.prototype.filter
    $scope.notificationsUnread = [];
    angular.forEach($scope.notifications, function(value, key) {
      if (!value.read) {
        $scope.notificationsUnread.push(value);
      }
    });

  }]);


oneHpControllers.controller('LoginCtrl', [
  '$scope', '$state', 'Login', 'authService','$timeout','countryCode','$rootScope',
  function($scope, $state, Login, authService, $timeout, countryCode, $rootScope) {
    // These variables holds the error messages from the form.
    $scope.otpError = "";
    $scope.signIn = "";
    // Set these variables to toggle view of the two forms, OTP and login.
    $scope.showLogin = true;
    $scope.showOtp = false;
    // Set this variable to switch messages about OTP and call.
    $scope.waitingForOtp = '';
    var timeout_before_call = 60000;
    $scope.countryCodes = countryCode.query();

    // Call for OTP
    var callForOTP = function() {
      $scope.waitingForOtp = "calling";
      Login.callToGetOTP({"phoneNumber": $scope.mobile.toString(),
                          "partnerId": $scope.partnerId.toString(),
                          "countryCode": $scope.countryCode});
    };

    $scope.getOtp = function() {
      $scope.formSubmitted = true;
      if ($scope.loginForm.$invalid) {
        var elements = document.getElementsByClassName('ng-invalid');
        angular.element(elements[1]).next().removeClass('validation-error'); //Show only one error.
        elements[1].focus();
        return;
      }

      $scope.showLogin = false;
      $scope.showOtp = true;

      Login.getAccessCode({"phoneNumber": $scope.mobile.toString(),
                           "countryCode": $scope.countryCode,
                           "partnerId": $scope.partnerId,
						   "userType": "secretary"},
                          function(data) {
                            $scope.waitingForOtp = 'waiting';
                            $scope.timerId = $timeout(callForOTP, timeout_before_call);
                          },function(error) {
                            if (error.data)
                              $scope.otpError = error.data.message;
                            $scope.showLogin = true;
                            $scope.showOtp = false;
                          });
    };

    $scope.signIn = function() {
      $timeout.cancel($scope.timerId);
      Login.validateOtp({"phoneNumber": $scope.mobile.toString(),
                         "countryCode": $scope.countryCode,
                         "partnerId": $scope.partnerId,
                         "otp": $scope.otp.toString(),
						  "userType": "secretary"},
                        function(data) {
							// Set the authentication cookie
							var tokenval = data.token;
                          authService.setToken(data.token);
                          // Check for first login
                          if (data.firstLogin === true) {
                            $rootScope.firstLogin = true;
                            $state.go('profile');
                          } else {
                            $rootScope.firstLogin = false;
                            $state.go('profile');
                          }
                        },function(error) {
                          if (error.data)
                            $scope.signInError = error.data.message;
                        });
    };
  }]);


oneHpControllers.controller('EventCtrl', ['$scope', '$state', 'ModalService', 'Event', 'oneHealthToast',
  function($scope, $state, ModalService, Event, oneHealthToast) {

    $scope.showEventDetails = function(e) {
      console.log(e);
      var countryCode = angular.isUndefined(e.countryCode) ? "" : e.countryCode;
      var patient = {
        countryCode: countryCode, phoneNumber: e.mobile,
        name: e.name, sex: e.sex, age: e.age
      };

      if (e.status == 'cancelled') {
        oneHealthToast.show($scope.gMsgs.cancelled_appointment_toast_message);
        return;
      }
      if (e.status == 'noshow') {
        oneHealthToast.show($scope.gMsgs.noshow_appointment_toast_message);
        return;
      }
      if (e.status == 'complete') {
        $state.go('patientrecordlist', {patient: patient});
        return;
      }

      ModalService.showModal({
        templateUrl: "partials/event-details-modal.html",
        controller: "EventDetailsCtrl",
        inputs: {event: e, patient: patient}
      }).then(function(modal) {
        modal.close.then(function(result) {
          switch (result) {
          case 'edit':
            $scope.editEvent(e);
            break;
          case 'consultforms':
            $state.go('patientrecordlist', {patient: patient});
            break;
          }
        });
      });
    };

    $scope.addEvent = function(date) {
      ModalService.showModal({
        templateUrl: "partials/event.html",
        controller: "AddEventCtrl",
        inputs: {date: date||moment()}
      }).then(function(modal) {
        modal.close.then(function(result) {
          if (result) {
            $scope.events.push(result);
          }
        });
      });
    };

    $scope.editEvent = function(e) {
      ModalService.showModal({
        templateUrl: "partials/event.html",
        controller: "EditEventCtrl",
        inputs: {event: e}
      }).then(function(modal) {
        modal.close.then(function(result) {
          if (result) {
          }
        });
      });
    };

  }]);


oneHpControllers.controller('AddEventCtrl', ['$scope', '$filter', 'close',
                                             'date', 'Event', 'countryCode', 'oneHealthToast',
  function($scope, $filter, close, date, Event, countryCode, oneHealthToast) {
    $scope.event = {};
    $scope.countryCodes = countryCode.query();
    $scope.day = date.clone().startOf('day');
    // event.start needs to be a Date object (not moment)
    $scope.event.start = date.clone().startOf('minute').toDate();

    //Form variables with selected fields (select/radio), 
    //needs explict setting of their values to the default value.
    $scope.event.duration = "30";
    $scope.event.countryCode = "91";
    $scope.event.type = "outpatient";
    $scope.event.sex = "male";
    $scope.event.location = "Vikram Hospital"; //TODO: Dangerous!!

    $scope.add = function() {
      $scope.formSubmitted = true;
      if ($scope.eventForm.$invalid) {
        var elements = document.getElementsByClassName('ng-invalid');
        angular.element(elements[1]).next().removeClass('validation-error'); //Show only one error.
        elements[1].focus();
        return;
      }

      $scope.event.end = new Date($scope.event.start)
                               .setMinutes($scope.event.start.getMinutes() + Number($scope.event.duration));

      Event.add($scope.event,
                function(data) {
                  oneHealthToast.show($scope.gMsgs.new_event_toast_message);
                  close(data);
                },
                function(error) {
                  $scope.error = error.data.message;
                  oneHealthToast.show($scope.error);
                });
    };
    $scope.close = function() {
      close(false);
    };
  }]);


oneHpControllers.controller('EditEventCtrl', ['$scope', '$filter', 'close',
                                              'event', 'Event', 'countryCode', 'oneHealthToast',
  function($scope, $filter, close, event, Event, countryCode, oneHealthToast) {
    // TODO: Merge this controller with AddEventCtrl
    $scope.event = event;
    // event.start needs to be a Date object (not moment)
    $scope.event.start = new Date($scope.event.start);
    $scope.day = moment($scope.event.start);
    $scope.countryCodes = countryCode.query();

    $scope.update = function() {
      $scope.event.end = new Date($scope.event.start)
                               .setMinutes($scope.event.start.getMinutes() + Number($scope.event.duration));
      Event.update($scope.event,
                   function(data) {
                     oneHealthToast.show('Appointment Updated');
                     close(data);
                   },
                   function(error) {
                     //$scope.error = error.data.message;
                     oneHealthToast.show(error.data.message);
                   });
    };

    $scope.close = function() {
      close(true);
    };
  }]);


oneHpControllers.controller('EventDetailsCtrl', ['$scope', '$state', 'close', 'event', 'patient', 'Event',
  function($scope, $state, close, event, patient, Event) {
    $scope.event = event;
    $scope.patient = patient;
    $scope.selected = null;
    // Success callback which updates the status of the event.
    var updateStatus = function() {
      $scope.event.status = $scope.selected;
      // Send back the updated event
      close();
    };
    $scope.confirm = function() {
      // Update the event status after contacting the server.
      var data = {'eventId': event.eventId};
      switch ($scope.selected) {
      case 'complete':
        Event.complete(data, updateStatus);
        $state.go('patientrecordlist', {patient: patient});
        break;
      case 'cancelled':
        Event.cancel({eventIds: [event.eventId]}, updateStatus);
        break;
      case 'noshow':
        Event.noshow(data, updateStatus);
        break;
      };
    };
    $scope.cancel = function() {
      close();
    };
    $scope.edit = function() {
      close('edit');
    };
    $scope.consultforms = function() {
      close('consultforms');
    };
  }]);


oneHpControllers.controller('CalendarCtrl', ['$scope', 'ModalService', 'Event', 'oneHealthToast', '$filter',
  function ($scope, ModalService, Event, oneHealthToast, $filter) {
    'use strict';

    $scope.addEvent = function(date) {
      ModalService.showModal({
          templateUrl: "partials/event.html",
          controller: "AddEventCtrl",
          inputs: {date: date}
      }).then(function(modal) {
        modal.close.then(function(result) {
          if (result) {
            $scope.events.push(result);
            //Brute force update
            $scope.loadSummary(date);
          }
        });
      });
    };

    $scope.summary = [];
    $scope.loadSummary = function(date) {
      Event.summary({start: date.clone().startOf('month').toISOString(),
                     end: date.clone().endOf('month').toISOString()},
        function(data) {
          angular.forEach(data, function(day) {
            var dayOfMonth = moment(new Date(day.date)).format('D');
            var monthIndex = moment(new Date(day.date)).format('M');
            if (!this.hasOwnProperty(monthIndex))
              this[monthIndex] = [];
            this[monthIndex][dayOfMonth] = {hasEvents: day.available ? (day.count > 0 ? true : false) : false,
                                blocked: day.available ? false : true};
          }, $scope.summary);
        });
    };

    $scope.events_arr = [];
    $scope.loadEvents = function(date) {
      $scope.events = null;
      $scope.selectedDate = date;
      var dayOfMonth = moment(new Date(date)).format('D');
      var monthIndex = moment(new Date(date)).format('M');
      if (!$scope.events_arr.hasOwnProperty(monthIndex))
        $scope.events_arr[monthIndex] = [];
      if ($scope.events_arr[monthIndex].hasOwnProperty(dayOfMonth))
        $scope.events = $scope.events_arr[monthIndex][dayOfMonth];

      var start = date.clone().startOf('day').toISOString();
      var end = date.clone().endOf('day').toISOString();
      Event.getEvents({start: start, end: end}).$promise.then(function(data) {
        $scope.events = data;
        $scope.events_arr[monthIndex][dayOfMonth] = data;
      })
    };

    $scope.blockDay = function(date) {
      Event.block({date: date.toISOString()}).$promise.then(function(data) {
        oneHealthToast.show('Blocked');
        var dayOfMonth = moment(new Date(date)).format('D');
        var monthIndex = moment(new Date(date)).format('M');
        $scope.summary[monthIndex][dayOfMonth].blocked = true;
      });
    };

    $scope.unblockDay = function(date) {
      Event.unblock({date: date.toISOString()}).$promise.then(function(data) {
        var dayOfMonth = moment(new Date(date)).format('D');
        var monthIndex = moment(new Date(date)).format('M');
        $scope.summary[monthIndex][dayOfMonth].blocked = false;
      });
    };

    $scope.cancelAll = function(date) {
      var events = [];
      angular.forEach($scope.events, function(e) {
        events.push(e.eventId);
      });
      Event.cancel({eventIds: events}).$promise.then(function(data) {
        oneHealthToast.show($filter('sprintf')($scope.gMsgs.post_cancel_all, 
                            moment(new Date(date)).format('D'), moment(new Date(date)).format('MMM')));
      });
    };

  }]);


oneHpControllers.controller('UploadSourceCtrl', ['$scope', 'close',
  function($scope, close) {
    $scope.select = function(source) {
      close(source);
    };
  }]);


oneHpControllers.controller('MenuCtrl', ['$scope', 'close',
  function($scope, close) {
    $scope.select = function(source) {
      close(source);
    };
  }]);





oneHpControllers.controller('AdminIndexCtrl', ['$scope','$state','$location',
  function($scope,$state,$location) {
	  $scope.isCurrentPath = function (path) {
      return $location.path() == path;
    };

	  
	  $scope.CurrentDate = new Date();
    $state.go("profile");
  }]);








//oneHpControllers.controller('AdminProfileCtrl', [
//  '$scope','ModalService', 'Event','documentUploader','$rootScope','Profile','$state',
//  function($scope, ModalService, Event, documentUploader, $rootScope, Profile, $state) {
//    'use strict';
//    $scope.firstLogin = $rootScope.firstLogin;
//    $scope.p = Profile.getProfile(function(data) {
//      // dateOfBirth is a Date object
//      $scope.p.dateOfBirth = new Date(data.dateOfBirth);
//    });
//
//    $scope.getSource = function() {
//      ModalService.showModal({
//          templateUrl: "partials/upload-source-modal.html",
//          controller: "UploadSourceCtrl"
//      }).then(function(modal) {
//        modal.close.then(function(source) {
//          if (source) {
//            documentUploader.upload(source, {targetWidth: 100, targetHeight: 100})
//              .then(function(fhandler) {
//                $scope.p.avatar = fhandler.url;
//                $scope.p.$updateProfile().then(function(data){
//                  // TODO: Repetition!
//                  $scope.p.dateOfBirth = new Date(data.dateOfBirth);
//                });
//              },
//              function(error) {
//                // TODO: Find a place for this
//                $scope.uploadError = error;
//              });
//          }
//        });
//      });
//    };
//
//    $scope.save = function() {
//
//      $scope.formSubmitted = true;
//      if ($scope.profileForm.$invalid) {
//        var elements = document.getElementsByClassName('ng-invalid');
//        angular.element(elements[1]).next().removeClass('validation-error'); //Show only one error.
//        elements[1].focus();
//        return;
//      }
//
//      $scope.p.$updateProfile().then(function(data) {
//        // TODO: Go to the last page, it doesn't always come from dashboard
//        $state.go('dashboard');
//      },
//      function(error) {
//        $scope.formError = error.data.message;
//      });
//    };
//
//    $scope.skip = function() {
//      $state.go('dashboard');
//    };
//
//}]);








oneHpControllers.controller('AdminProfileCtrl', ['$scope','$http','authService', function ($scope,$http,authService) {
	 $scope.CurrentDate = new Date();
	var dtoken = authService.getToken();
	$scope.secProfile = {};
//$http.get(serverUrl + '/1hp/partners/secretary')

$http({
    method: 'GET', 
    url: serverUrl + '/1hp/partners/secretary'
})
		.success(function(data, status, headers, config)
        {
			//alert(config);
			$scope.secProfile = data;
		})
		.error(function(data, status, headers, config){
           alert("Hi error. "+serverUrl + '/partners/secretary');
        });
		
		
		
		
		$scope.updatesec = function()
	   {
			//$scope.formSubmitted = true;
			console.log("tmp"+$scope.secProfile);
			var request = $http({
			method: 'PUT', 
			url: serverUrl + '/1hp/partners/secretary',
			data: JSON.stringify($scope.secProfile)
			});
			request.success(function(data, status, headers, config)
			{
			$scope.secProfile = data;
			});
			request.error(function(data, status, headers, config){
			alert(data);
			$scope.secProfile = data;
			});
	   }
	$scope.skip = function()
	   {
		   $scope.get_product();
	   }
}
]);






//PHYSIO PROFILE CONTROLLER
//oneHpControllers.controller('PhysioProfileCtrl', [
//  '$scope','ModalService', 'Event','documentUploader','$rootScope','Profile','$state',
//  function($scope, ModalService, Event, documentUploader, $rootScope, Profile, $state) {
//    'use strict';
//    $scope.firstLogin = $rootScope.firstLogin;
//    $scope.p = Profile.getProfile(function(data) {
//		$scope.prdata=data;
//      // dateOfBirth is a Date object
//      $scope.p.dateOfBirth = new Date(data.dateOfBirth);
//    });
//
//    $scope.getSource = function() {
//      ModalService.showModal({
//          templateUrl: "partials/upload-source-modal.html",
//          controller: "UploadSourceCtrl"
//      }).then(function(modal) {
//        modal.close.then(function(source) {
//          if (source) {
//            documentUploader.upload(source, {targetWidth: 100, targetHeight: 100})
//              .then(function(fhandler) {
//                $scope.p.avatar = fhandler.url;
//                $scope.p.$updateProfile().then(function(data){
//                  // TODO: Repetition!
//                  $scope.p.dateOfBirth = new Date(data.dateOfBirth);
//                });
//              },
//              function(error) {
//                // TODO: Find a place for this
//                $scope.uploadError = error;
//              });
//          }
//        });
//      });
//    };
//
//    $scope.save = function() {
//
//      $scope.formSubmitted = true;
//      if ($scope.profileForm.$invalid) {
//        var elements = document.getElementsByClassName('ng-invalid');
//        angular.element(elements[1]).next().removeClass('validation-error'); //Show only one error.
//        elements[1].focus();
//        return;
//      }
//
//      $scope.p.$updateProfile().then(function(data) {
//        // TODO: Go to the last page, it doesn't always come from dashboard
//        $state.go('dashboard');
//      },
//      function(error) {
//        $scope.formError = error.data.message;
//      });
//    };
//
//    $scope.skip = function() {
//      $state.go('dashboard');
//    };
//
//}]);

oneHpControllers.controller('PhysioProfileCtrl', ['$scope','$http','authService','$filter', function ($scope,$http,authService,$filter) {
	$scope.CurrentDate = new Date();
	var dtoken = authService.getToken();
	$scope.save_prac = true;
	$scope.sitems = [
        { value: 'Orthopaedic', name: 'Orthopaedic' },
        { value: 'Dermatologist', name: 'Dermatologist' },
		{ value: 'Paediatrician', name: 'Paediatrician' },
        { value: 'Physiotherapist', name: 'Physiotherapist' },
		{ value: 'Orthopaedic', name: 'Orthopaedic' },
        { value: 'Cardiologist', name: 'Cardiologist' }
    ];
	
	$scope.showdoctoredit = function() { 
		$scope.doctoredit=true;
		$scope.doctorapplist=false; 
	}
	var getlist = $http({
    method: 'GET', 
    url: serverUrl + '/1hp/practitioners/list'
	});
		getlist.success(function(data, status, headers, config)
        {
			$scope.pracList = data;
		});
		getlist.error(function(data, status, headers, config){
		   $scope.pracList = data;
        });
	
	//SELECT PHYSIO
	$scope.getDetails = function(pid)
	{
		$scope.selectedPrac = $filter('filter')($scope.pracList, {phoneNumber:pid})[0];
		$scope.update_prac = true;
		$scope.docedit = true;
		$scope.save_prac = false;
		$scope.doctoredit=false;
		$scope.doctorapplist=true;
		
		<!-- GET THE APPOINTMENT DETAILS OF THE DOCTOR -->
		var PracId = $scope.selectedPrac['_key'];
		var len = PracId.length; 
		var selectedPracId = PracId.substring(13, len);
		
		var getlist = $http({
    	method: 'GET', 
    	url: serverUrl + '/1hp/calendar/event/list?practitionerId='+selectedPracId+'&start=2015-01-01T18:30:00.814Z&end=2015-10-08T18:29:59.814Z'
		});
		getlist.success(function(data, status, headers, config)
        {
			//alert("success");
			$scope.pracAppointment = data;
			angular.forEach ($scope.pracAppointment, function(value, key) {
				var getPatientlist = $http({
					method: 'GET', 
					url: serverUrl + '/1hp/patient/'+value.patientId
				});
				getPatientlist.success(function(data, status, headers, config)
				{
					value.patientInfo = data;
				});
				getPatientlist.error(function(data, status, headers, config){
					console.log("fail");
				   $scope.patientList = data;
				});
			});
			
						
			
		});
		getlist.error(function(data, status, headers, config){
			alert("fail");
		   $scope.pracAppointment = data;
        });
		
		<!-- GET THE APPOINTMENT DETAILS OF THE DOCTOR -->
		
	}
	
	//ADD PHYSIO
		$scope.savesec = function()
	   {
			//$scope.formSubmitted = true;
			var request = $http({
			method: 'POST', 
			url: serverUrl + '/1hp/practitioners/add',
			data: {"title": "Dr.", 
		   "practGivenName": $scope.selectedPrac.practGivenName, 
		   "practLastName": $scope.selectedPrac.practLastName, 
		   "countryCode": "91", 
		   "phoneNumber": $scope.selectedPrac.phoneNumber, 
		   "email":  $scope.selectedPrac.email, 
		   "locations": [$scope.selectedPrac.locations],
			"iapNumber": $scope.selectedPrac.iapNumber, 
			"addressLine1": $scope.selectedPrac.addressLine1, 
			"addressLine2": $scope.selectedPrac.addressLine2,
		   "city": $scope.selectedPrac.city, 
		   "state": $scope.selectedPrac.state, 
		   "zipcode": $scope.selectedPrac.zipcode,
		   "econtactNumber": $scope.selectedPrac.econtactNumber, 
		   "sex": $scope.selectedPrac.sex, 
		   "homeCare": $scope.selectedPrac.homeCare,
		   "dateOfBirth": $scope.selectedPrac.dateOfBirth, 
		   "specialization": $scope.selectedPrac.specialization}
			});
			request.success(function(data, status, headers, config)
			{
			$scope.selectedPrac = data;
			});
			request.error(function(data, status, headers, config){
			$scope.selectedPrac = data;
			});
	   }
	//UPDATE PHYSIO	
		$scope.updatesec = function()
	   {
		    alert('update');
			//$scope.formSubmitted = true;
			var request = $http({
			method: 'PUT', 
			url: serverUrl + '/1hp/practitioners',
			data: $scope.selectedPrac
			});
			request.success(function(data, status, headers, config)
			{
				alert(status);
			$scope.selectedPrac = data;
			});
			request.error(function(data, status, headers, config){
				alert(status);
			$scope.selectedPrac = data;
			});
	   }
	   
	   //CANCEL UPDATE / ADDF
	   $scope.cancelPrac = function() {
		  // $scope.selectedPrac = {};
		   $scope.doctoredit=false;
		   $scope.doctorapplist=true;
	   }
}
]);







oneHpControllers.controller('refresh_control',function($scope,$interval){
$interval(function(){

},1000);
});

oneHpControllers.controller('LogoutCtrl', [
  '$scope', '$state','LoginServices', 'authService','Login',
  function($scope, $state, LoginServices, authService, Login) {

    $scope.logout = function () {
      LoginServices.logout(function(data) {
        authService.removeToken();
        $state.go('login');
      });
    };
//alert('Logout');
    $scope.logout();
  }]);


oneHpControllers.controller('ConsultFormsListCtrl', [
  '$scope', '$state', '$stateParams', 'ConsultFormsServices',
  function($scope, $state, $stateParams, ConsultFormsServices) {

    ConsultFormsServices.list().$promise.then(function(data){
      $scope.cfs = data;
    });

    $scope.patient = $stateParams.patient;

    console.log($scope.patient);

    //This might not be needed at the moment as .list() returns the questions[] too.
    //ConsultFormsServices.getForm({id: consultFormId})

    $scope.ViewForm = function(cf) {
      $state.go('consultformsfill', {cf: cf, patient: $scope.patient});
    };

  }]);


oneHpControllers.controller('ConsultFormsFillCtrl', [
  '$scope', '$state', '$stateParams', 'ConsultFormsServices', 'countryCode', 'oneHealthToast',
  function($scope, $state, $stateParams, ConsultFormsServices, countryCode, oneHealthToast) {

    $scope.cf = $stateParams.cf;
    $scope.patient = $stateParams.patient;
    $scope.countryCodes = countryCode.query();

    console.log($scope.patient);

    if ($scope.cf == null) {
      $state.go('patientslist');
    }

    if ($scope.patient == null) {
      $scope.new_patient = true;
      $scope.patient = {};
      $scope.patient.sex = 'male';
      $scope.patient.countryCode = "91";
    } else {
      $scope.new_patient = false;
    }

    $scope.saveForm = function(qna, patient) {
      $scope.formSubmitted = true;
      if ($scope.consultForm.$invalid) {
        var elements = document.getElementsByClassName('ng-invalid');
        angular.element(elements[1]).next().removeClass('validation-error'); //Show only one error.
        elements[1].focus();
        return;
      }

      var upload_obj = {consultFormName: qna.consultFormName, patientName: patient.name, 
        patientAge: patient.age, patientCountryCode: patient.countryCode,
        patientSex: patient.sex, patientPhone: patient.phoneNumber, questions: qna.questions}; //patientEmail: patient.email,
      ConsultFormsServices.uploadForm(upload_obj).$promise.then(function(data) {
        oneHealthToast.show($scope.gMsgs.post_record_save);
        $state.go('patientrecordlist', {patient: patient});
      });
    };

    $scope.skip = function() {
      oneHealthToast.show($scope.gMsgs.post_record_cancel);
      $state.go('patientrecordlist', {patient: $scope.patient});
    };

    //This might not be needed at the moment as .list() returns the questions[] too.
    //ConsultFormsServices.getForm({id: consultFormId})

  }]);

oneHpControllers.controller('PatientListCtrl', [
  '$scope', '$state', '$stateParams', 'ConsultFormsServices',
  function($scope, $state, $stateParams, ConsultFormsServices) {

    ConsultFormsServices.listPatientRecords().$promise.then(function(data) {
      $scope.prs = data;
    })

    $scope.patientrecordlist = function(pr) {

      var patient = {
        name : pr.consultforms[0].patientName,
        countryCode: pr.consultforms[0].patientCountryCode, phoneNumber : pr.patientPhone,
        sex: pr.consultforms[0].patientSex, age: pr.consultforms[0].patientAge
      };
      $state.go('patientrecordlist', {patient: patient, consultforms: pr.consultforms});
    };
  }]);

oneHpControllers.controller('PatientRecordsListCtrl', [
  '$scope', '$state', '$stateParams', 'ConsultFormsServices', 'ModalService',
  function($scope, $state, $stateParams, ConsultFormsServices, ModalService) {

    $scope.patient = $stateParams.patient;
    $scope.consultforms = $stateParams.consultforms;

    console.log($scope.patient);

    if ($scope.patient == null) {
      $state.go('patientslist');
      return;
    }
    if ($scope.consultforms == null) {
      ConsultFormsServices.listPatientRecords({patientPhone: $scope.patient.phoneNumber}).$promise.then(function(data) {
        console.log (data);
        try {
          $scope.consultforms = data[0].consultforms;
        } catch(err) {
          $scope.consultforms = [];
        }
      });
    }

    $scope.addconsultform = function() {
      $state.go('consultforms', {patient: $scope.patient});
    }

    $scope.showRecord = function(r) {
      ModalService.showModal({
        templateUrl: "partials/patientrecord-view-modal.html",
        controller: "PatientRecordViewModalCtrl",
        inputs: {record : r}
      }).then(function(modal) {
        modal.close.then(function(result) {

        });
      });
    };

    $scope.timeHumanize = function(date) {
      try {
        return moment.duration(moment().diff(date)).humanize();
      } catch(err) {
        return "";
      }
    };

  }]);

oneHpControllers.controller('PatientRecordViewModalCtrl', ['$scope', 'close', 'record', 'ConsultFormsServices',
  function($scope, close, record, ConsultFormsServices) {

    $scope.record = record;
    $scope.activeNetwork = true;

    ConsultFormsServices.getPatientRecords({id: $scope.record.recordId}).$promise.then(function(data) {
      $scope.questions = data.questions;
      $scope.activeNetwork = false;
    });

    $scope.close = function() {
      close();
    };

  }]);


'use strict';

/* Directives */

var oneHpApp = angular.module('oneHpApp');

function getWeekDays(start) {
  var weekdays = [];
  for (var i = start.clone().startOf('week'); i <= start.clone().endOf('week'); i.add(1, 'day')) {
    weekdays.push({date: i.clone()});
  }
  return weekdays;
};

function getWeeks(date) {
  var day = date.clone().startOf('month');
  var endOfMonth = date.clone().endOf('month');
  var weeks = [];

  while(day <= endOfMonth) {
    var startOfWeek = day.clone();
        var endOfWeek = day.endOf('week') < endOfMonth ? day.endOf('week') : endOfMonth;
        weeks.push(getWeekDays(startOfWeek.clone(), endOfWeek.clone()));
        day.add(1, 'day');
  }
  return weeks;
}

oneHpApp.directive('calendar', function() {
  return {
    restrict: 'AE',
    scope: {
      onSelectDate: '=',
      loadSummary: '=',
      summary: '=',
      cancelAll: '=',
      blockDay: '=',
      unblockDay: '=',
      addEvent: '='
    },
    templateUrl: 'partials/rcalendar/calendar.html',
    link: function(scope, element, attrs, ctrls) {
      scope.nextMonth = function() {
        scope.currentDate.startOf('month').add(1, 'months');
      };

      scope.previousMonth = function() {
        scope.currentDate.startOf('month').subtract(1, 'months');
      };

      scope.$watch('currentDate.month()', function(oldValue, newValue){
        scope.weeks = getWeeks(scope.currentDate);
        scope.loadSummary(scope.currentDate);
      });

      scope.$watch('currentDate', function(oldValue, newValue){
        scope.weeks = getWeeks(scope.currentDate);
        scope.onSelectDate(scope.currentDate);
      });
      scope.currentDate = moment();

      scope.selectDay = function(date) {
        var diff = scope.currentDate.clone().startOf('day').diff(date);
        if ((diff === 0 && !scope.showControls) || (diff != 0)) {
          scope.showControls = true;
        } else {
          scope.showControls = false;
        }
        scope.currentDate = date;
      };

      scope.hasEvents = function(date) {
        try {
          return scope.summary[date.month()+1][date.date()].hasEvents;
        } catch (e) {
          return false;
        }
      };

      scope.isBlocked = function(date) {
        try {
          return scope.summary[date.month()+1][date.date()].blocked;
        } catch (e) {
          return false;
        }
      };

    }
  };
});

oneHpApp.directive('menuControl', [function() {
  return {
    restrict: 'A',
    controller: function($scope) {
      this.show = function() {
        $scope.show = true;
      };
      this.hide = function() {
        $scope.show = false;
      };
      $scope.hide = this.hide;
    }
  };
}]);

oneHpApp.directive('menu', [function() {
  return {
    restrict: 'E',
    templateUrl: 'partials/menu.html',
    require: '^^menuControl'
  };
}]);

oneHpApp.directive('menuToggle', [function() {
  return {
    restrict: 'A',
    require: '^^menuControl',
    scope: true,
    link: function(scope, element, attrs, menuControlCtrl) {
      element.on('click', function(e) {
        e.preventDefault();
        menuControlCtrl.show();
        scope.$apply();
      });
    }
  };
}]);

oneHpApp.directive("filepicker",function(){
    return{
      restrict: 'A',
      link: function (scope, element, attrs) {
        (function(a) {
          if(window.filepicker) {
            return;
          }
          var b=a.createElement("script");
          b.type="text/javascript";
          b.async=!0;
          b.src=("https:"===a.location.protocol?"https:":"http:")+"//api.filepicker.io/v1/filepicker.js";
          var c=a.getElementsByTagName("script")[0];
          c.parentNode.insertBefore(b,c);
          var d={};
          d._queue=[];
          var e="pick,pickMultiple,pickAndStore,read,write,writeUrl,export,convert,store,storeUrl,remove,stat,setKey,constructWidget,makeDropPane".split(",");
          
          var f=function(a,b) {
            return function() {
              b.push([a,arguments]);
            };
          };
          
          for(var g=0;g<e.length;g++) {
            d[e[g]]=f(e[g],d._queue);
          }
          window.filepicker=d;
        })(document);
        
        //filepicker.setKey('AFIfKsctjSjS7vT6kAzEgz');//riteshiitbbs@gmail.com/tricon
        filepicker.setKey('AVAlGtDM8ROudMAtXBHDSz');//prashantnaik@gmail.com/123456
        //filepicker.setKey('AMfJlBtH6RHWPiaNaVhO6z');//Arun's credentials
        
        window.conversions = {
          'origin': {},
          'mythumb': {
            'w': 200,
            'format': 'jpg'
          }
        };
        
      }
    };
  });

//var oneHpApp = angular.module('oneHpApp');

oneHpApp.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.otherwise('/login');
  $stateProvider.
  state('login', {
    url: '/login',
    templateUrl: 'partials/views/login.html',
    controller: 'LoginCtrl'
  }).
  state('patient', {
    url: '/patientprofile',
    templateUrl: 'partials/views/patient-profile.html',
    controller: 'PatientCtrl',
	resolve: {isLoggedIn: isLoggedIn}
  }).
  state('profile', {
    url: '/profile',
    templateUrl: 'partials/views/profile.html',
    controller: 'AdminProfileCtrl',
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('onboarding', {
    url: '/physio',
    templateUrl: 'partials/views/physio-profile.html',
    controller: 'PhysioProfileCtrl',
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('appointment', {
    url: '/appointment',
    templateUrl: 'partials/views/book-appointment.html',
    controller: 'CalendarCtrl',
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('consultforms', {
    url: '/consultforms',
    templateUrl: 'partials/consultforms-list.html',
    controller: 'ConsultFormsListCtrl',
    params: {patient: null},
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('consultformsfill', {
    url: '/consultforms/fill',
    templateUrl: 'partials/consultforms-fill.html',
    controller: 'ConsultFormsFillCtrl',
    params: {cf: null, patient: null},
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('consultformsview', {
    url: '/consultforms/view/:id',
    templateUrl: 'partials/consultforms-view.html',
    controller: 'ConsultFormsViewCtrl',
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('patientslist', {
    url: '/patients/list',
    templateUrl: 'partials/patients-list.html',
    controller: 'PatientListCtrl',
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('patientrecordlist', {
    url: '/patientrecord/list',
    templateUrl: 'partials/patientrecords-list.html',
    controller: 'PatientRecordsListCtrl',
    params: {patient: null, consultforms: null},
    resolve: {isLoggedIn: isLoggedIn}
  }).
  state('logout', {
    url: '/logout',
    templateUrl: 'partials/views/login.html',
    controller: 'LogoutCtrl'
  })
});

var oneHpServices = angular.module('oneHpServices', ['ngResource']);

oneHpServices.factory('Login', ['$resource',
  function($resource) {
    return $resource(serverUrl + '/1hp/accesscode', {}, {
      getAccessCode: {
        method: 'POST',
        url: serverUrl + '/1hp/accesscode'
      },
      validateOtp: {
        method: 'POST',
        url: serverUrl + '/1hp/validate'
      },
      callToGetOTP: {
        method: 'POST',
        url: serverUrl + '/1hp/otpbycall'
      }
    });
  }]);

oneHpServices.factory('Event', ['$resource',
  function($resource) {
    return $resource(serverUrl + '/1hp/calendar/event/list', {}, {
      getEvents: {
        method: 'GET',
        url: serverUrl + '/1hp/calendar/event/list?start=:start&end=:end',
        isArray: true
      },
      add: {
        method: 'POST',
        url: serverUrl + '/1hp/calendar/event/add'
      },
      complete: {
        method: 'POST',
        url: serverUrl + '/1hp/calendar/event/complete'
      },
      cancel: {
        method: 'POST',
        url: serverUrl + '/1hp/calendar/event/cancel'
      },
      noshow: {
        method: 'POST',
        url: serverUrl + '/1hp/calendar/event/noshow'
      },
      update: {
        method: 'PUT',
        url: serverUrl + '/1hp/calendar/event/edit'
      },
      summary: {
        method: 'GET',
        url: serverUrl + '/1hp/calendar/event/summary?start=:start&end=:end',
        isArray: true
      },
      block: {
        method: 'POST',
        url: serverUrl + '/1hp/calendar/block'
      },
      unblock: {
        method: 'POST',
        url: serverUrl + '/1hp/calendar/unblock'
      }
    });
  }]);

oneHpServices.factory('countryCode', [
  '$resource',
  function($resource) {
    return $resource('json/country-code.json');
  }]);

oneHpServices.factory('dataUpload', ['$window', function($window) {
  var fileUpload = {
    pick : function(options, callback) {
      filepicker.pick(options,function (InkBlob) {
        callback && callback(InkBlob);
      });
    },
    store : function(imageDATA, callback) {
      filepicker.store(imageDATA, {
        mimetype: 'image/jpeg',
        filename: '1hf-' + (new Date()).getTime(),
        base64decode: true,
        Location: 'S3'
      }, function(InkBlob) {
        callback && callback(InkBlob);
      }, function(FPError) {
        //alert($scope.localeMessages["message.uploadRecords.errorUpload"]);
      }, function(progress) {
        //alert(progress + "% uploaded");
      });
    },
    remove : function(object, callback) {
      filepicker.remove(object,
                        function() {
                          console.log("Removed");
                          callback && callback();
                        },function(FPError) {
                          console.log(FPError);
                        });
    }
  };
  return fileUpload;
}]);

oneHpServices.service("documentUploader",
  ["$q", "$cordovaCamera", "dataUpload",
  function ($q, $cordovaCamera, dataUpload) {

    var default_options = {
      quality: 50,
      destinationType: Camera.DestinationType.DATA_URL,
      //sourceType: Camera.PictureSourceType.SAVEDPHOTOALBUM, //Camera.PictureSourceType.CAMERA,
      //correctOrientation: true,
      allowEdit: true,
      encodingType: Camera.EncodingType.JPEG,
      targetWidth: 800,
      targetHeight: 600,
      popoverOptions: CameraPopoverOptions,
      saveToPhotoAlbum: false
    };

    var upload = function (src, override_options) {
      var options = angular.extend({}, default_options, override_options);
      var deffered = $q.defer();
      if (src == "camera")
        options['sourceType'] = Camera.PictureSourceType.CAMERA;
      else
        options['sourceType'] = Camera.PictureSourceType.SAVEDPHOTOALBUM;

      $cordovaCamera.getPicture(options)
        .then(function(imageData) {
                dataUpload.store(imageData, function(object) {
                                              deffered.resolve(object);
                                            },
                                            function (error) {
                                              console.log(error);
                                              deffered.reject();
                                            });
              },
              function(error) {
                deffered.reject();
              });
      return deffered.promise;
    };

    return {upload: upload};
  }]);


/* Profile */
oneHpServices.factory('Profile', ['$resource',
  function($resource) {
    return $resource(serverUrl + '/1hp/practitioners', {}, {
      getProfile: {
        method: 'GET'
      },
      updateProfile: {
          method: 'PUT',
          url: serverUrl + '/1hp/practitioners'
        }
      });
  }]);

/* Auth services */
oneHpServices.factory('LoginServices', ['$resource',
  function($resource) {
    console.log("inside");
    return $resource(serverUrl + '/1hp/logout', {}, {
      logout: {
        method: 'POST',
        url: serverUrl + '/1hp/logout',
      }
    });
  }]);

oneHpServices.factory('ConsultFormsServices', ['$resource',
  function($resource) {
    return $resource(serverUrl + '/1hp/consultforms', {}, {
      list: {
        method: 'GET',
        url: serverUrl + '/1hp/consultforms',
        isArray: true
      },
      getForm: {
        method: 'GET',
        url: serverUrl + '/1hp/consultforms/questions/:id'
      },
      uploadForm: {
        method: 'POST',
        url: serverUrl + '/1hp/patient/records'
      },
      listPatientRecords : {
        method: 'GET',
        url: serverUrl + '/1hp/patient/records',
        isArray: true
      },
      getPatientRecords : {
        method: 'GET',
        url: serverUrl + '/1hp/patient/records/:id'
      }
    });
  }]);

/*
 * Wrapper for $cordovaToast. As sometimes, direct usage is disrupting browser flow. 
 */
oneHpServices.service("oneHealthToast",
  ["$rootScope", "$q", "$cordovaToast",
  function ($rootScope, $q, $cordovaToast) {
    var show = function(message) {
      try{
        $cordovaToast.show (message, "long", "center");
      } catch(err) {
        console.log("toast: ", message);
      }
    };

    return {show: show};
  }]);

oneHpServices.factory('localeMessages', ['$resource',
  function($resource) {
    return $resource('locale/messages.json', {}, {query:{isArray:false}});
  }]);


//# sourceMappingURL=app.js.map