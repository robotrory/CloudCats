var receiver = require('./receiver');
var messenger = require('./messenger');
var datastore = require('./datastore');
var streamTools = require('./stream_tools');
var shell = require('shelljs');
var fs = require('fs');


messenger.ready().then(function () {
  return receiver.ready()
}).then(function () {
  console.log('coms up')
  receiver.waitVideoTranscodeRequest(function (msg, ackCallback) {
    console.log(`received request to transcode video for ${msg.videoId}`)
    waitForVideoFrames(msg.videoId, ackCallback)
  })
})

// waitForVideoFrames("gajBIB8K2SY", {width: 640, height: 360, fps: 30, duration: 128})

function waitForVideoFrames(videoId, ackCallback) {
  console.log(`waitForVideoFrames for ${videoId}`)
  
  var ackCallbackArray = [ackCallback]
  var videoData = false

  receiver.waitVideoMetadata(videoId, function (msg, metaAckCallback) {
    console.log(`received metadata for ${videoId}`)  
    
    if (videoData) {
      console.log(`but we already have the metadata, so we're ignoring this message`)  
      metaAckCallback()
      return;
    }

    ackCallbackArray.push(metaAckCallback)

    videoData = msg.metadata
    console.log(videoData)

    var savedData = {}
    var currentFrameIndex = 0
    var dir = `fs/${videoId}`
    // console.log(`dir: ${dir}`)
    shell.mkdir('-p', dir);
    var inStream = streamTools.outputVideoStream(dir, videoData.fps, videoData.width, videoData.height)

    function onFinalFrameReached () {
      console.log("we're done")
      inStream.end()
      for (var i in ackCallbackArray) {
        ackCallbackArray[i]()
      }
    }

    var expectedFrameCount = -1
    var framesSeen = 0
    receiver.waitTotalVideoFrameCount(videoId, function (msg, frameCountAckCallback) {
      console.log(`received expectedFrameCount: ${msg.count}`)
      ackCallbackArray.push(frameCountAckCallback)
      expectedFrameCount = msg.count
      if (framesSeen == expectedFrameCount) {
        onFinalFrameReached()
      }
    })

    function processFrame (frameNumber, data) {
      // console.log(`remaining: ${indices.length}`)
      framesSeen++
      console.log(frameNumber)
      if (framesSeen == expectedFrameCount) {
        onFinalFrameReached()
      } else if (data) {
        inStream.write(data)
      }
    }

    
    console.log(`waiting for frames from ${videoId}`)
    receiver.waitFrameJobFinish(videoId, function (msg, frameAckCallback) {    
      ackCallbackArray.push(frameAckCallback)

      datastore.loadBlob(msg.addrObj, function (data) {
        // console.log(Object.prototype.toString.call(data))
        var imageData = new Buffer(data)
        if (msg.frameNumber == currentFrameIndex) {
          processFrame(msg.frameNumber, imageData)

          if (msg.frameNumber == 0 && currentFrameIndex == 0) {
            console.log("SENDING FIRST FRAME EVENT")
            messenger.broadcastVideoReady(videoId, videoData.duration)
          }

          currentFrameIndex++
          while(savedData.hasOwnProperty(currentFrameIndex)) {
            processFrame(currentFrameIndex, savedData[currentFrameIndex])
            delete savedData[currentFrameIndex]
            currentFrameIndex++
          }
        } else {
          console.log(`out of order frame: ${msg.frameNumber} expecting: ${currentFrameIndex}`)
          savedData[msg.frameNumber] = imageData
        }

      });    
    })
  })
}