var express = require('express')
var app = express()

app.get('/', function (req, res) {
  res.send('Server Online')
})

app.listen(8000, function () {
  console.log('Backend started on port 8000.')
})