const express = require('express')
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const ejs = require('ejs')
var fs = require('fs');
var shell = require('shelljs');
var messenger = require('./messenger');
var receiver = require('./receiver');
var datastore = require('./datastore');

process.on('uncaughtException', function (err) {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});

app.use(express.static('static'))
app.set('view engine', 'ejs');

app.get('/', function (req, res) {
  res.send('CloudCats!')
})

app.get('/health', function (req, res) {
  res.json({
    healthy: true
  })
})

app.get('/watch', function (req, res) {
  // res.send(`You requested video id ${req.query.v}`)
  res.render('pages/video', {
    manifestUrl: generateManifestUrl(req.query.v),
    videoId: req.query.v
  });
  downloadVideo(req.query.v)
})

app.get('/watch/:videoId', function (req, res) {
  // res.send(`You requested video id ${req.params.videoId}`)
  res.render('pages/video', {
    manifest_url: generateManifestUrl(req.params.videoId),
    videoId: req.params.videoId
  });
  downloadVideo(req.params.videoId)
})

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
  socket.on('status query', function(msg){
    // TODO: check db or something
    var videoId = msg.videoId
    socket.emit(videoId, 'not sure...')
  });
});



function generateManifestUrl(videoId) {
  return `/fs/${videoId}/manifest.mpd`;
}

messenger.ready().then(function () {
  return receiver.ready()
}).then(function () {
  console.log('coms ready')  
  
  http.listen(3000, function(){
    console.log('listening on *:3000');
  });
})


function downloadVideo(videoId) {
  // TODO: check db to see if we have completed this video and cached it
  var dir = `static/fs/${videoId}`;
  shell.mkdir('-p', dir);
  var manifestFile = `${dir}/manifest.mpd`

  if (fs.existsSync(manifestFile)) {
    setTimeout(function () {
      io.emit(videoId, 'finished downloading!')
    }, 1000)
    
    console.log('exiting early because we\'ve already downloaded the file')
    return
  }

  io.emit(videoId, 'beginning download')
  
  // send video download request message
  messenger.requestVideoDownload(videoId)
  // send audio download request message
  messenger.requestAudioDownload(videoId)

  receiver.waitFirstVideoFrameSeen(videoId, function (msg, receiverInstance) {
    receiver.cancelReceiver(receiverInstance)
    var duration = msg.duration
    console.log('first chunk received. Should do something about the manifest now!')

    ejs.renderFile('manifest_template.xml', {duration: duration}, {}, function(err, str){
        fs.writeFile(manifestFile, str, function(err) {
            if(err) {
                return console.log(err);
            }

            console.log("manifest saved!");
        });
    });

    io.emit(videoId, 'finished downloading!')
  })

}