//$('#myModal').modal('show');
var myApp = angular.module('OrgChartModule', ['ui.bootstrap']);

myApp.service('mapService', function() {
    this.sayHello = function() {
        return "Hello, World!"
    };
});

function OrgChartCtrl($scope, $dialog, $rootScope, AngularForce, $http) {
    $scope.opts = {
        backdrop: true,
        keyboard: true,
        backdropClick: true,
        dialogFade: true,
        backdropFade: true,

        //template:  t, // OR: templateUrl: 'path/to/view.html',
        templateUrl: '/partials/orgchart.html',
        controller: 'DialogCtrl',
        url: $scope.url
    };

    $scope.openDialog = function(empURI) {
        $scope.opts.url = empURI;
        var d = $dialog.dialog($scope.opts);
        d.startAutoPan = $scope.startAutoPan;
        d.open().then(function(result) {
            if (result) {
                alert('dialog closed with result: ' + result);
            }
        });
    };

    function getEmployeeURIfromTile(tile) {
        var uri = tile.src.replace(tile.baseURI, "");
        return uri.replace('pics', '/employee');
    }

    $scope.onMapClick = function(e) {
        var layerPoint = e.layerPoint;
        var containerPoint = e.containerPoint;
        var tile = findTileFromLayerPoint(layerPoint);
        var empURI = getEmployeeURIfromTile(tile);
        $scope.openDialog(empURI);
        $scope.$apply();
        clearInterval($scope.timer);
    }

    function findTileFromLayerPoint(layerPoint) {
        var tiles = $scope.tileLayer._tiles;

        for (var tileNumber in tiles) {
            var tilePos = tiles[tileNumber]._leaflet_pos;
            if ((tilePos.x <= layerPoint.x && ((tilePos.x + 256) >= layerPoint.x)) && (tilePos.y <= layerPoint.y && ((tilePos.y + 256) >= layerPoint.y))) {
                return tiles[tileNumber];
            }
        }
        return null;
    }

    $scope.$on('$routeChangeStart', function(scope, next, current) {
        console.log('Changing route from ' + angular.toJson(current) + ' to ' + angular.toJson(next));
    });

    $scope.$on('$routeChangeSuccess', function() {
        initMap();

    });

    function initMap() {
        if ($scope.map) {
            return;
        }
        var maxZoom = 8;
        var map = $scope.map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        });
        $scope.tileLayer = L.tileLayer("/pics/{z}/{x}/{y}/?sessionId=" + AngularForce.sessionId, {
            maxZoom: maxZoom,
            minZoom: maxZoom,
            crs: L.CRS.Simple,
            updateWhenIdle: false
        }).addTo(map);

        $scope.minX = 65;
        $scope.minY = 65;
        $scope.maxX = 65 + 125;
        $scope.maxY = 65 + 125;
        var southWest = map.unproject([$scope.minX * 256, $scope.maxY * 256], map.getMaxZoom());
        var northEast = map.unproject([$scope.maxX * 256, $scope.minY * 256], map.getMaxZoom());
        map.setMaxBounds($scope.bounds);
        map.setView([0, 0], maxZoom, {
            animate: true
        });

        $scope.onDragStart = function(e) {
            clearInterval($scope.timer);
        }

        map.on('click', $scope.onMapClick);
        map.on('dragstart', $scope.onDragStart);
        $scope.startAutoPan();
    }

    $scope.startAutoPan = function() {
        $scope.timer = setInterval(function() {
            if ($scope.isOutOfBounds()) {
                $scope.map.panTo([0, 0]);
            } else {
            $scope.map.panBy(new L.Point(15, 20));

            }
        }, 150);
    };


    $scope.isOutOfBounds = function() {
        var tiles = $scope.tileLayer._tiles;
        for (var tileNumber in tiles) {
            var xyArry = tileNumber.split(':');
            var x = parseInt(xyArry[0], 10);
            var y = parseInt(xyArry[1], 10);
            if (x < ($scope.minX + 10) || y < ($scope.minY + 10) || x > ($scope.maxX - 10) || y > ($scope.maxY - 10)) {
                return true;
            }
        }
        return false;
    }


    $scope.searchEmail = function() {
        $http.get('/employee/coordinates/' + $scope.email).
        success(function(data, status, headers, config) {
            clearInterval($scope.timer);
            doSlowPanTo(parseInt(data.x), parseInt(data.y));
        }).
        error(function(data, status, headers, config) {
            alert(data);
        });
    }

    function doSlowPanTo(x, y) {
        if (!x || !y || y == NaN || x == NaN) {
            return;
        }
        var panArray = [];
        var itemLatLng = $scope.map.unproject(new L.Point((x + 1) * 256, (y + 1) * 256));
        for (var i = 2; i > 0; i = -0.5) {
            panArray.push(new L.LatLng(itemLatLng.lat + i, itemLatLng.lng));
        }
        panArray.push(itemLatLng); //add the final destination

        var count = 0;

        function slowPan() {
            $scope.map.panTo(panArray[count++]);
            if (count < panArray.length) {
                setTimeout(slowPan, 130);
            }
        }
        slowPan(); //recurse
    }
}

// the dialog is injected in the specified controller

function DialogCtrl($scope, dialog, $http, AngularForce) {
    $scope.hasContact = function() {
        return $scope.contact ? true : false;
    };

    $scope.getImgUrl = function(contact) {
        return contact && contact.SmallPhotoUrl + "?oauth_token=" + AngularForce.sessionId;
    };

    $scope.newSearch = function(contact) {
        if (!contact || !contact.Id) {
            return;
        }
        $scope.getOrgChart('/id/' + contact.Id);
    }

    $scope.close = function(result) {
        dialog.startAutoPan();
        dialog.close();
    };

    $scope.getOrgChart = function(uri) {
        $http({
            method: 'GET',
            url: uri
        }).
        success(function(data, status, headers, config) {
            $scope.contact = data.employee;
            if (!$scope.contact) {
                return;
            }
            $scope.manager = data.manager;
            $scope.directReports = data.directReports;
            $scope.hasDirectReports = data.directReports && data.directReports.length > 0;
            $scope.title = $scope.contact.Name;
            $scope.hasManager = $scope.contact.ManagerId ? true : false;
        }).
        error(function(data, status, headers, config) {
            alert(data);
        });
    }
    $scope.getOrgChart(dialog.options.url);
}

function AdminCtrl($scope, AngularForce, $location, $route) {
    var isOnline = AngularForce.isOnline();
    var isAuthenticated = AngularForce.authenticated();

    //Offline support (only for Cordova)
    //First check if we are online, then check if we are already authenticated (usually happens in Cordova),
    //If Both online and authenticated(Cordova), go directly to /contacts view. Else show login page.
    if (!isOnline) {
        if (!isAuthenticated) { //MobileWeb
            return $location.path('/login');
        } else { //Cordova
            return $location.path('/orgchart/');
        }
    }

    //If in visualforce, directly login
    if (AngularForce.inVisualforce) {
        $location.path('/login');
    } else if (AngularForce.refreshToken) { //If web, try to relogin using refresh-token
        AngularForce.login(function() {
            $location.path('/orgchart/');
            $scope.$apply(); //Required coz sfdc uses jquery.ajax
        });
    } else {
        $location.path('/login');
    }

}

/**
 * Describe Salesforce object to be used in the app. For example: Below AngularJS factory shows how to describe and
 * create an 'Contact' object. And then set its type, fields, where-clause etc.
 *
 *  PS: This module is injected into ListCtrl, EditCtrl etc. controllers to further consume the object.
 */
angular.module('Contact', []).factory('Contact', function(AngularForceObjectFactory) {
    //Describe the contact object
    var objDesc = {
        type: 'Contact',
        fields: ['FirstName', 'LastName', 'Title', 'Phone', 'Email', 'Id', 'Account.Name'],
        where: '',
        orderBy: 'LastName',
        limit: 20
    };
    var Contact = AngularForceObjectFactory(objDesc);

    return Contact;
});

function HomeCtrl($scope, AngularForce, $location, $route) {
    var isOnline = AngularForce.isOnline();
    var isAuthenticated = AngularForce.authenticated();

    //Offline support (only for Cordova)
    //First check if we are online, then check if we are already authenticated (usually happens in Cordova),
    //If Both online and authenticated(Cordova), go directly to /contacts view. Else show login page.
    if (!isOnline) {
        if (!isAuthenticated) { //MobileWeb
            return $location.path('/login');
        } else { //Cordova
            return $location.path('/orgchart/');
        }
    }

    //If in visualforce, directly login
    if (AngularForce.inVisualforce) {
        $location.path('/login');
    } else if (AngularForce.refreshToken) { //If web, try to relogin using refresh-token
        AngularForce.login(function() {
            $location.path('/orgchart/');
            $scope.$apply(); //Required coz sfdc uses jquery.ajax
        });
    } else {
        $location.path('/login');
    }
}

function LoginCtrl($scope, AngularForce, $location) {
    //Usually happens in Cordova
    if (AngularForce.authenticated()) {
        return $location.path('/orgchart/');
    }

    $scope.login = function() {
        //If in visualforce, 'login' = initialize entity framework
        if (AngularForce.inVisualforce) {
            AngularForce.login(function() {
                $location.path('/orgchart/');
            });
        } else {
            AngularForce.login();
        }
    };



    $scope.isLoggedIn = function() {
        return AngularForce.authenticated();
    };

    $scope.logout = function() {
        AngularForce.logout(function() {
            //Now go to logout page
            $location.path('/logout');
            $scope.$apply();
        });
    };
}

function CallbackCtrl($scope, AngularForce, $location, $http) {
    AngularForce.oauthCallback(document.location.href);

    $http.post('/employee/validate/', {
        oauthresponse: document.location.href
    }).success(function(res, res2) {
        //Note: Set hash to empty before setting path to /contacts to keep the url clean w/o oauth info.
        //..coz oauth CB returns access_token in its own hash making it two hashes (1 from angular,
        // and another from oauth)
        $location.hash('');
        $location.path('/orgchart');

    })
}

