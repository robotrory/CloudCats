var receiver = require('./receiver');
var messenger = require('./messenger');
var datastore = require('./datastore');
var streamTools = require('./stream_tools');
var shell = require('shelljs');
var fs = require('fs');

receiver.waitVideoTranscodeRequest(function (msg) {
  console.log(`received request to transcode video for ${msg.videoId}`)
  waitForVideoFrames(msg.videoId, msg.videoData)
})

// waitForVideoFrames("gajBIB8K2SY", {width: 640, height: 360, fps: 30, duration: 128})

function waitForVideoFrames(videoId, videoData) {
  console.log(`waitForVideoFrames for ${videoId}`)
  console.log(videoData)

  var savedData = {}
  var currentFrameIndex = 0
  var dir = `fs/${videoId}`
  // console.log(`dir: ${dir}`)
  shell.mkdir('-p', dir);
  var inStream = streamTools.outputVideoStream(dir, videoData.fps, videoData.width, videoData.height)

  var expectedFrameCount = -1
  var framesSeen = 0
  receiver.waitTotalVideoFrameCount(videoId, function (msg) {
    console.log(`received expectedFrameCount: ${expectedFrameCount}`)
    expectedFrameCount = msg.count
    if (framesSeen == expectedFrameCount) {
      console.log("we're done")
      inStream.end()
    }
  })

  function processFrame (frameNumber, data) {
    // console.log(`remaining: ${indices.length}`)
    framesSeen++
    console.log(frameNumber)
    if (framesSeen == expectedFrameCount) {
      console.log("we're done")
      inStream.end()
    } else if (data) {
      inStream.write(data)
    }
  }

  

  receiver.waitFrameJobFinish(videoId, function (msg) {    
    // console.log(msg)
    if (msg.frameNumber == 0 && currentFrameIndex == 0) {
      console.log("SENDING FIRST FRAME EVENT")
      messenger.broadcastFirstVideoFrameSeen(videoId, videoData.duration)
    }

    datastore.loadBlob(msg.addrObj, function (data) {
      // console.log(Object.prototype.toString.call(data))
      var imageData = new Buffer(data)
      // fs.writeFile(`fs/${msg.addrObj.file}.png`, imageData, function (err) {
      //   console.log(err)
      // })
      if (msg.frameNumber == currentFrameIndex) {
        processFrame(msg.frameNumber, imageData)
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
}