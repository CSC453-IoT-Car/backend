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
var heartbeatResponses = 'responses';

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

app.post('/set/target', function (req, res) {
    if (req.body.id && req.body.targetId) {
        console.log('Recieved target change request for ' + req.body.id + ' to ' + req.body.targetId);
        cache.hget(heartbeatResponses, req.body.id, function (err, respon) {
            var updated = JSON.parse(respon);
            if (!updated) {
                updated = {};
            }
            if (!err) {
                updated.targetId = req.body.targetId;
                cache.hset(heartbeatResponses, req.body.blockedById, JSON.stringify(updated));
            }
        });
    }
});

app.post('/notify/blocked', function (req, res) {
    if (req.body.id && req.body.blockedById) {
        console.log('Recieved blocked notification from ' + req.body.id + ': Blocked by ' + req.body.blockedById);
        cache.get(registered, function(err, response) {
            if (!err) {
                var array = JSON.parse(response);
                var targetIndex = -1;
                for (var i = 0; i < array.length; i++) {
                    if (array[i].id == req.body.blockedById && Math.floor(Date.now()) - array[i].lastCom < 10000) {
                        targetIndex = i;
                        break;
                    }
                }
                if (targetIndex != -1) {
                    if (array[targetIndex].status == 'navigating') {
                        console.log(req.body.id + ' is blocked by moving vehicle, instructing to wait.');
                        res.json({
                            action: 'wait'
                        });
                    } else if (array[targetIndex].status == 'idle') {
                        console.log(req.body.id + ' is blocked by an idle vehicle, instructing ' + req.body.id + ' to wait for remote resolution.');
                        cache.hget(heartbeatResponses, req.body.blockedById, function (err, respon) {
                            var updated = JSON.parse(respon);
                            if (!updated) {
                                updated = {};
                            }
                            if (!err) {
                                updated.blocking = req.body.id;
                                cache.hset(heartbeatResponses, req.body.blockedById, JSON.stringify(updated));
                            }
                        });
                        res.json({
                            action: 'resolve-remote'
                        });
                    } else {
                        console.log(req.body.id + ' is blocked by a vehicle with unknown status, instructing to resolve locally.');
                        res.json({
                            action: 'resolve-local'
                        });
                    }
                } else {
                    console.log(req.body.id + ' is blocked by an unregistered object. Instructing to resolve locally.');
                    res.json({
                        action: 'resolve-local'
                    });
                }
            }
        });
    }
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
                cache.hget(heartbeatResponses, req.body.id, function (err, respon) {
                    if (!respon) {
                        res.json({});
                    } else {
                        res.json(JSON.parse(respon));
                    }
                });
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

app.post('/beacon/register', function (req, res) {
    if (req.body && req.body.id) {
        console.log('Received request to register a target beacon with id ' + req.body.id);
        cache.get(registered, function (err, response) {
            if (!err) {
                var array = JSON.parse(response);
                var found = false;
                for (var i = 0; i < array.length; i++) {
                    if (array[i].id == req.body.id) {
                        console.log('Entity with ' + req.body.id + '\'s requested id already exists.');
                        found = true;
                        res.sendStatus(403);
                        break;
                    }
                }
                if (!found) {
                    array.push({
                        id: req.body.id,
                        type: 'beacon'
                    });
                    cache.set(registered, JSON.stringify(array));
                    res.sendStatus(200);
                }
            }
        });
    }
});

app.post('/remove', function (req, res) {
    if (req.body && req.body.id) {
        console.log('Received request to remove ' + req.body.id);
        cache.get(registered, function (err, response) {
            if (!err) {
                var array = JSON.parse(response);
                var index = -1;
                for (var i = 0; i < array.length; i++) {
                    if (array[i].id == req.body.id) {
                        index = i;
                        break;
                    }
                }
                if (index != -1) {
                    console.log('Removed ' + req.body.id);
                    array.splice(index, 1);
                    cache.set(registered, JSON.stringify(array));
                    res.sendStatus(200);
                } else {
                    console.log('Could not remove ' + req.body.id + ': Not found');
                    res.json({error: 'Not found'});
                }
            }
        });
    }
});

app.listen(3000, function () {
    console.log('Backend started on port 3000.');
    //cache.set(registered, JSON.stringify([]));
});
