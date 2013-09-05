/**
 * Module dependencies.
 */

var express = require('express'),
    http = require('http'),
    path = require('path'),
    request = require('request'),
    ejs = require('ejs'),
    orgchart = require('sforgchart');



//todo move these to config
orgchart.zoomLevel = 8; //256x256 tiles = can hold up to ~65,500 employees!
orgchart.instanceUrl = 'https://org62.my.salesforce.com';
orgchart.fields = ['Name', 'SmallPhotoUrl', 'Title', 'ManagerId', 'Email', 'Phone', 'Id'];
orgchart.companyName = 'salesforce.com';
orgchart.soql = 'https://org62.my.salesforce.com/services/data/v27.0/query?q=SELECT Name,SmallPhotoUrl,Title,ManagerId,Email,Phone,Id from User WHERE email LIKE \'%25@salesforce.com\' And UserType=\'Standard\' And IsActive=TRUE And (ManagerId !=null OR Email = \'ceo@salesforce.com\')';


//SET APP_RELATIVE_PATH to a folder where your app's index.html resides.
var APP_RELATIVE_PATH = path.join(__dirname, '/public/');
console.log(APP_RELATIVE_PATH);


var app = express();

app.configure(function() {
    app.set('port', process.env.PORT || 3000);
    app.set('view engine', 'ejs');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.static(APP_RELATIVE_PATH));
});

app.configure('development', function() {
    app.use(express.errorHandler());
});

var client_id = process.env.client_id;
var app_url = process.env.app_url;


app.post('/employee/validate/?', function(req, res) {
    console.log("req.body.oauthresponse = " + req.body.oauthresponse);
    setOauthResponse(req.body.oauthresponse);

    var url = orgchart['instance_url'] + '/services/data/v27.0/sobjects/User/' + orgchart['userId'];
    console.log(url);
    request.get({
        url: url,
        headers: {
            'Authorization': 'OAuth ' + orgchart['access_token']
        }
    }, function(error, response, body) {
        try {
            body = JSON.parse(body);
            if (error) {
                error.isValid = false;
                res.json(400, error);
            } else if (body.CompanyName == orgchart.companyName) {
                loadOrgChart(req, res);
            }
        } catch (e) {
            res.json(500, {
                "isValid": false,
                "error": e
            });
        }

    })
});

function loadOrgChart(req, res) {
    console.log('loading users..');
    if (!orgchart.loaded) {
        orgchart.on('loaded', function() {
            orgchart.loaded = true;
            res.json({
                "isValid": true,
                "isLoaded": true
            });
        });

        orgchart.on('error', function() {
            res.json({
                "isValid": true,
                "isLoaded": false
            });
        });

        //load..
        orgchart.load();
    } else {
        res.json({
            "isValid": true,
            "isLoaded": true
        });
    }
}

function setOauthResponse(loc) {
    var fragment = loc.split("#")[2];

    if (fragment) {
        var nvps = fragment.split('&');
        for (var nvp in nvps) {
            var parts = nvps[nvp].split('=');

            //Note some of the values like refresh_token might have '=' inside them
            //so pop the key(first item in parts) and then join the rest of the parts with =
            var key = parts.shift();
            var val = parts.join('=');
            orgchart[key] = decodeURIComponent(val);
        }
    }

    orgchart['sessionId'] = orgchart['access_token'];
    var id = orgchart['id'];
    if (id) {
        orgchart['userId'] = id.substring(id.lastIndexOf('/') + 1, id.length);
    }
}

app.get('/', function(req, res) {
    res.render("index", {
        client_id: client_id,
        app_url: app_url
    });
});

app.get('/index.html', function(req, res) {
    res.render("index", {
        client_id: client_id,
        app_url: app_url
    });
});

app.get('/employee/:z/:x/:y/?', function(req, res) {
    return res.json(orgchart.getOrgChartByXY(req.params.x + "/" + req.params.y));
});

app.get('/id/:id/?', function(req, res) {
    return res.json(orgchart.getOrtChartById(req.params.id));
});


app.get('/pics/:z/:x/:y/?', function(req, res) {
    console.log(req.query.sessionId);
    if (!orgchart.loaded) {
        return res.json(400, {
            "isReady": false
        });
    }
    if (!req.query.sessionId) {
        return res.json(400, {
            "isReady": false,
            "error": "sessionId not passed"
        });
    }
    var xy = req.params.x + "/" + req.params.y;

    var node = orgchart.getItemByXY(xy);
    if (!node) {
        res.redirect('/blank.jpeg');
        console.log(' **** no node: ' + req.path + "  xy=" + xy);
        return;
    }
    var photoUrl = node.SmallPhotoUrl.replace("/T", "/F") + "?oauth_token=" + req.query.sessionId;
    res.redirect(photoUrl);
});


app.all('/proxy/?*', function(req, res) {
    log(req);
    var body = req.body;
    var contentType = "application/x-www-form-urlencoded";
    var sfEndpoint = req.headers["salesforceproxy-endpoint"];
    if (body) {
        //if doing oauth, then send body as form-urlencoded
        if (sfEndpoint && sfEndpoint.indexOf('oauth2') > 0) {
            body = getAsUriParameters(body);
        } else { //for everything else, it's json
            contentType = "application/json";
            body = JSON.stringify(body);
        }
    }

    if ((!body || JSON.stringify(body) === "\"{}\"") && (typeof sfEndpoint != "string")) {
        return res.send('Request successful (but nothing to proxy to SF)');
    }
    request({
        url: sfEndpoint || "https://login.salesforce.com//services/oauth2/token",
        method: req.method,
        headers: {
            "Content-Type": contentType,
            "Authorization": req.headers["authorization"] || req.headers['x-authorization'],
            "X-User-Agent": req.headers["x-user-agent"]
        },
        body: body
    }).pipe(res);
});

app.get('/employee/coordinates/:email', function(req, res) {
    console.log(req.params.email);
    var xSlashY = orgchart.getXYByEmail(req.params.email);
    var arry = [];
    if (xSlashY) {
        arry = xSlashY.split('/');
    }
    return res.json({
        x: arry[0],
        y: arry[1]
    });
});

function log(req) {
    console.log("req.headers[\"authorization\"] = " + req.headers["authorization"]);
    console.log("req.headers[\"x-authorization\"] = " + req.headers["x-authorization"]);
    console.log("req.headers[\"salesforceproxy-endpoint\"] = " + req.headers["salesforceproxy-endpoint"]);
    console.log('req.method = ' + req.method);
    console.log('req.body ' + JSON.stringify(req.body));
}

function getAsUriParameters(data) {
    var url = '';
    for (var prop in data) {
        url += encodeURIComponent(prop) + '=' +
            encodeURIComponent(data[prop]) + '&';
    }
    var result = url.substring(0, url.length - 1);
    console.log(result);
    return result;
}

http.createServer(app).listen(app.get('port'), function() {
    console.log("Express server listening on port " + app.get('port'));
});