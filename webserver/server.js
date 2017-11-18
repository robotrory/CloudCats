const express = require('express')
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var fs = require('fs');
var shell = require('shelljs');
var request = require('request');
var fetchVideoInfo = require('youtube-info');
var Promise = require("bluebird");
var messenger = require('./messenger');
var receiver = require('./receiver');
var datastore = require('./datastore');

process.on('uncaughtException', function (err) {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});

app.set('view engine', 'ejs');

app.get('/', function (req, res) {
  res.render('pages/home')
})

app.get('/help', function (req, res) {
  res.render('pages/help')
})

app.get('/watch', function (req, res) {
  // res.send(`You requested video id ${req.query.v}`)
  renderVideoPage(res, req.query.v)
})

function renderVideoPage (res, videoId) {
  fetchVideoInfo(videoId).then(function (videoInfo) {
    if (videoInfo.url) {
      // valid videoId
      res.render('pages/video', {
        manifestUrl: generateManifestUrl(videoId),
        videoId: videoId,
        title: videoInfo.title,
        posterUrl: videoInfo.thumbnailUrl
      });
    } else {
      // invalid videoId
      res.render('pages/badVideo');
    }
  }).catch(function (err) {
    console.log('err', err);
  })
}

app.get('/watch/:videoId', function (req, res) {
  // res.send(`You requested video id ${req.params.videoId}`)
  renderVideoPage(res, req.params.videoId)
})

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('video request', function(msg){
    var videoId = msg.videoId
    requestVideo(socket, videoId)
    if (msg.force) {
      sendVideoProcessMessages();
    }
    
  });
});



function generateManifestUrl(videoId) {
  return `/media/${videoId}/manifest.mpd`;
}

http.listen(80, function(){
  console.log('listening on *:80');
});

function requestVideo(socket, videoId) {
  fetchVideoInfo(videoId).then(function (videoInfo) {
    if (videoInfo.url) {
      return Promise.resolve()
    } else {
      return Promise.reject(`invalid videoId request: ${videoId}`)
    }
  }).then(function () {
    return datastore.ensureMediaBucket()  
  }).then(function () {
    console.log('bucket exists')
    return datastore.blobExists({
      bucket: 'media',
      file: `${videoId}/manifest.mpd`})
  }).then(function (exists) {
    console.log(`blob exists: ${exists}`)
    if (exists) {
      console.log(`no need to process ${videoId} since we already have it`)
      socket.emit(videoId, 'finished downloading!')
    } else {
      beginVideoRequest(socket, videoId)
    }
  }).catch(console.warn)
}

function sendVideoProcessMessages (videoId) {
  // send video download request message
  messenger.requestVideoDownload(videoId)
  // send audio download request message
  messenger.requestAudioDownload(videoId)
  // send video transcode request message
  messenger.requestVideoTranscode(videoId)
}

function beginVideoRequest (socket, videoId) {

  console.log(`beginVideoRequest ${videoId}`)

  datastore.getVideoProcessingState(videoId).then(function (processing) {
    if (!processing) {
      console.log(`starting processing of ${videoId}`)

      datastore.setVideoProcessing(videoId)    
      sendVideoProcessMessages(videoId)
    } else {
      console.log(`we are already processing video ${videoId}`)
    }
  })
  
  socket.emit(videoId, 'beginning download')

  var cancelCallback
  receiver.waitVideoReady(videoId, function (msg, ackCallback, cancelCallback) {
    var duration = msg.duration
    console.log(`video ready message received for ${videoId}.`)
    
    socket.emit(videoId, 'finished downloading!')

    ackCallback()

    if (cancelCallback) {
      cancelCallback()
      cancelCallback = undefined
    }
  }).then(function (callback) {
    cancelCallback = callback
  })

  socket.on('disconnect', function(){
    if (cancelCallback) {
      console.log(`cancelling subscription since the requesting user has disconnected`)
      cancelCallback()
      cancelCallback = undefined
    }
  });
}