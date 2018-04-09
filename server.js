var express = require('express');
var bodyParser = require('body-parser')
var crypto = require("crypto");
var request = require('request');
var config = require('./config.json');
var redis = require('redis');

var cache = redis.createClient({
    host: 'zeroparticle.net',
    password: config.redis.password
});
console.log('Connected to redis...');

var app = express();
app.use(bodyParser.json());

var registered = 'registered-list';
var startTime = Math.floor(Date.now());

app.get('/', function (req, res) {
    res.send('Server Online');
});

app.get('/registered', function(req, res) {
    cache.get(registered, function(err, result) {
        if (!err) {
            res.json(JSON.parse(result));
        } else {
            res.send(err);
        }
    });
});

app.post('/heartbeat', function (req, res) {
    console.log('Received heartbeat from ' + req.body.id);
    if (req.body.id < 0) {
        res.sendStatus(403);
        return;
    }
    req.body.lastCom = Math.floor(Date.now());
    cache.get(registered, function (err, response) {
        if (!err) {
            var array = JSON.parse(response);
            var found = false;
            for (var i = 0; i < array.length; i++) {
                if (array[i].id == req.body.id && array[i].sessionKey === req.body.sessionKey) {
                    array[i] = req.body;
                    cache.set(registered, JSON.stringify(array));
                    found = true;
                    break;
                }
            }
            if (found === false) {
                res.sendStatus(403);
            } else {
                res.json({commands: ['move']});
            }
        }
    });
});

app.post('/register', function (req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('Received registration request from vehicle with ip ' + ip.split(':')[3]);
    req.body.lastCom = Math.floor(Date.now());
    cache.get(registered, function (err, response) {
        if (!err) {
            var array = JSON.parse(response);
            var found = false;
            for (var i = 0; i < array.length; i++) {
                if (array[i].id == req.body.id) {
                    console.log('Found conflicting server ids');
                    if (req.body.sessionKey == array[i].sessionKey) {
                        // We know them, but let them re-register.
                        console.log('Allowing old session to re-register');
                        array.splice(i, 1);
                        break;
                    } else {
                        console.log('Registration denied. Mismatched session keys.\nReceived: ' + req.body.sessionKey + "\nExpected: "+ array[i].sessionKey);
                        res.sendStatus(403);
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                req.body.sessionKey = crypto.randomBytes(20).toString('hex');
                array.push(req.body);
                cache.set(registered, JSON.stringify(array));
                res.json({sessionKey: req.body.sessionKey});
            }
        }
    });
});

app.listen(3000, function () {
    console.log('Backend started on port 3000.');
    cache.set(registered, JSON.stringify([]));
});
