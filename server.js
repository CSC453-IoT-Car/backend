var express = require('express');
var app = express();
var request = require('request');

var nextId = 0;

app.get('/', function (req, res) {
    res.send('Server Online');
});

app.post('/heartbeat', function (req, res) {
    res.send('Received heartbeat.');
});

app.post('/register', function (req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('Registered vehicle with ip ' + ip.split(':')[3]);
    res.json({id: nextId});
    nextId++;
    request({
        url: 'http://' + ip.split(':')[3] + '/move',
        method: "POST",
        json: {}
    }, function (err, res, body) {
        if (!res || res.statusCode != 200) {
            console.log(res.toJSON());
        } else {
            console.log('Sent move command.');
        }
    });
});

app.listen(3000, function () {
    console.log('Backend started on port 3000.')
});
