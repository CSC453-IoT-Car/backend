var express = require('express');
var bodyParser = require('body-parser')
var app = express();
app.use(bodyParser.json());
var request = require('request');

var nextId = 0;

app.get('/', function (req, res) {
    res.send('Server Online');
});

app.post('/heartbeat', function (req, res) {
    console.log('Received heartbeat from ' + req.body.id);
    res.json({commands: ['move']});
});

app.post('/register', function (req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log('Registered vehicle with ip ' + ip.split(':')[3]);
    res.json({id: nextId});
    nextId++;
});

app.listen(3000, function () {
    console.log('Backend started on port 3000.')
});
