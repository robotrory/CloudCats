var receiver = require('./receiver');
var messenger = require('./messenger');
var datastore = require('./datastore');
const uuidv1 = require('uuid/v1');
var youtubedl = require('youtube-dl');
var streamTools = require('./stream_tools');

messenger.ready().then(function () {
  return receiver.ready()
}).then(function () {
  console.log('coms up')
  receiver.waitVideoDownloadRequest(function (msg, ackCallback) {
    console.log(`received request to download video for ${msg.videoId}`)
    downloadVideo(msg.videoId, ackCallback)
  })
})

// downloadVideo("gajBIB8K2SY")

function downloadVideo(videoId, ackCallback) {
  
  var video = youtubedl(`http://www.youtube.com/watch?v=${videoId}`,
    // Optional arguments passed to youtube-dl.
    ['--format=243'],
    // Additional options can be given for calling `child_process.execFile()`.
    { cwd: __dirname });

  // Will be called when the download starts.
  video.on('info', function(info) {
    console.log('Download started');
    console.log('fps: ' + info.fps)
    console.log('filename: ' + info.filename);
    console.log('size: ' + info.size);

    var targetFormat = info.formats.filter(function (x) {
      return x['format'].indexOf("243") == 0
    })[0]

    var width = targetFormat.width
    var height = targetFormat.height
    var fps = targetFormat.fps
    var duration = info._duration_raw

    onInfo(width, height, fps, duration)
  });

  function onInfo (width, height, fps, duration) {

    console.log(`width: ${width} height: ${height} fps: ${fps} duration: ${duration}`)
    
    messenger.sendVideoMetadata(videoId, {
      width: width,
      height: height,
      fps: fps,
      duration: duration
    })

    var indicesCount = 0
    streamTools.parseVideoStream(video, function onFrame(i, data) {
      indicesCount++
      saveFrame(videoId, i, data)
    }).then(function () {
      messenger.sendTotalVideoFrameCount(videoId, indicesCount)
      ackCallback()
    })

  }
}

function saveFrame (videoId, frameNumber, data) {
  // TODO: chunk these
  var uuid = uuidv1()
  var addrObj = {bucket: "inframes", file: uuid}
  datastore.saveBlob(addrObj, new Buffer(data), function () {
    messenger.submitFrameJob(videoId, frameNumber, addrObj)
  })
}