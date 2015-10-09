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

    var removeToken = function() {
      dbService.remove("token");
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
