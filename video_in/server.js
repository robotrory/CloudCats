var receiver = require('./receiver');
var messenger = require('./messenger');
var datastore = require('./datastore');
const uuidv1 = require('uuid/v1');
var youtubedl = require('youtube-dl');
var streamTools = require('./stream_tools');
var FRAME_CHUNK_SIZE = 5

receiver.waitVideoDownloadRequest(function (msg, ackCallback) {
  console.log(`received request to download video for ${msg.videoId}`)
  downloadVideo(msg.videoId, ackCallback)
})

function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

// downloadVideo("gajBIB8K2SY", function () {console.log('fake ack')})

function downloadVideo(videoId, ackCallback) {
  
  var video
  var bucketName = datastore.getVideoBucketName(videoId)
  console.log("bucketName", bucketName)
  datastore.createBucket(bucketName).then(function () {
    video = youtubedl(`http://www.youtube.com/watch?v=${videoId}`,
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

  }).catch(console.warn)

  function onInfo (width, height, fps, duration) {

    console.log(`width: ${width} height: ${height} fps: ${fps} duration: ${duration}`)
    
    messenger.sendVideoMetadata(videoId, {
      width: width,
      height: height,
      fps: fps,
      duration: duration
    })

    streamTools.parseVideoStream(video, fps, function onFrame(i, data) {
      // console.log(`seen frame ${i}`)
      saveFrame(videoId, i, data)
    }).then(function (totalFrameCount) {
      console.log(`we're done, at ${totalFrameCount} frames`)
      ackCallback()
      flushFrameDataQueue()
      messenger.sendTotalVideoChunkCount(videoId, chunkCounter)
    })

  }

  var frameDataQueue = new Uint8Array()
  var framePointerQueue = []
  var chunkCounter = 0

  function saveFrame (videoId, frameNumber, data) {
    framePointerQueue.push(frameDataQueue.length)
    frameDataQueue = concatTypedArrays(frameDataQueue, data)
    if (framePointerQueue.length >= FRAME_CHUNK_SIZE) {
      flushFrameDataQueue()
    }
  }

  function flushFrameDataQueue () {
    // TODO: chunk these
    if (framePointerQueue.length > 0) {
      console.log(`flushing ${framePointerQueue.length} frames to chunk ${chunkCounter}`)
      var fileName = `in_${chunkCounter}`
      var addrObj = {bucket: bucketName, file: fileName}
      var data = new Buffer(frameDataQueue)
      var chunkCounterVal = chunkCounter
      var pointerQueue = framePointerQueue
      datastore.saveBlob(addrObj, data).then(function () {
        messenger.submitChunkJob(videoId, chunkCounterVal, pointerQueue, addrObj)
      })
      framePointerQueue = []
      frameDataQueue = new Uint8Array()
      chunkCounter++
    }
  }

}


