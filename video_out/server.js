var receiver = require('./receiver');
var messenger = require('./messenger');
var datastore = require('./datastore');
var streamTools = require('./stream_tools');
var shell = require('shelljs');
var fs = require('fs');
var scratchDir = 'output';
var Promise = require("bluebird");
const ejs = require('ejs')

receiver.waitVideoTranscodeRequest(function (msg, ackCallback) {
  console.log(`received request to transcode video for ${msg.videoId}`)
  waitForVideoFrames(msg.videoId, ackCallback)
})

datastore.ensureMediaBucket().then(function () {
  datastore.syncDirWithBucket(scratchDir, 'media').then(function () {

  })
})

// waitForVideoFrames("gajBIB8K2SY", function () {console.log('fake ack')})

var promiseWhile = Promise.method(function(condition, action) {
    if (!condition()) return;
    return action().then(promiseWhile.bind(null, condition, action));
});

function waitForVideoFrames(videoId, ackCallback) {
  console.log(`waitForVideoFrames for ${videoId}`)
  
  var ackCallbackArray = [ackCallback]
  // var ackCallbackArray = []
  var videoData = false
  console.log(`videoData: ${videoData}`)

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

    function onFinalFrameReached () {
      console.log("we're done")
      
      for (var i=0; i<ackCallbackArray.length; i++) {
        ackCallbackArray[i]()
      }
      cleanupBuckets(videoId)
    }

    var validFrameMap = {}
    var currentFrameIndex = 0
    var dir = `${scratchDir}/${videoId}`
    shell.mkdir('-p', dir);
    var inStream = streamTools.outputVideoStream(dir, videoData.fps, videoData.width, videoData.height, onFinalFrameReached)

    

    var expectedFrameCount = -1
    var framesSeen = 0
    receiver.waitTotalVideoFrameCount(videoId, function (msg, frameCountAckCallback) {
      console.log(`received expectedFrameCount: ${msg.count}`)
      ackCallbackArray.push(frameCountAckCallback)
      expectedFrameCount = msg.count
      if (framesSeen == expectedFrameCount) {
        inStream.end()
      }
    }).then(function (cancelCallback) {
      ackCallbackArray.push(cancelCallback)
    })

    function processFrame (frameNumber, data) {
      framesSeen++
      console.log(frameNumber)

      if (frameNumber == 0) {
        createManifest(videoId, videoData.duration)
      }

      if (framesSeen == expectedFrameCount) {
        inStream.end()
      } else if (data) {
        inStream.write(data)
      }
    }

    checkDataStore()

    function checkDataStore () {
      console.log(`starting checkDataStore, currentFrameIndex: ${currentFrameIndex}`)
      datastore.getVideoOutFrames(videoId).then(function (files) {
        var finishedFrames = files.map(x => parseInt(x.name.replace('out_', ''))).sort((a,b) => (a - b))
        
        if (finishedFrames.length > currentFrameIndex && finishedFrames[currentFrameIndex] == currentFrameIndex) {
          promiseWhile(function () {
            return finishedFrames.length > currentFrameIndex &&
            finishedFrames[currentFrameIndex] == currentFrameIndex
          }, function() {
            return datastore.loadBlob({
              bucket: datastore.getVideoBucketName(videoId),
              file: `out_${currentFrameIndex}`
            }).then(function (data) {
              processFrame(currentFrameIndex, new Buffer(data))
              currentFrameIndex++
            })
          }).then(function () {
            console.log('done going forward')
            if (validFrameMap[currentFrameIndex]) {
              console.log(`validFrameMap hold valid value for ${currentFrameIndex}`)
              checkDataStore()
            } else {
              console.log(`we're now waiting at ${currentFrameIndex}`)
            }
          }).catch(console.warn)
        } else {
          console.log(`still can't find current frame ${currentFrameIndex}!`)
        }


      })
    }
    
    console.log(`waiting for frames from ${videoId}`)
    receiver.waitFrameJobFinish(videoId, function (msg, frameAckCallback) {    
      if (msg.frameNumber == currentFrameIndex) {
        checkDataStore()  
      } else {
        validFrameMap[msg.frameNumber] = true
      }
      
      frameAckCallback()
    }).then(function (cancelCallback) {
      ackCallbackArray.push(cancelCallback)
    })
  }).then(function (cancelCallback) {
    ackCallbackArray.push(cancelCallback)
  })
}

function cleanupBuckets (videoId) {
  datastore.deleteBucket(datastore.getVideoBucketName(videoId)).then(function () {
    console.log("all clean")
  })
}

function createManifest (videoId, duration) {
  ejs.renderFile('manifest_template.xml', {duration: duration}, {}, function(err, str){

      datastore.ensureMediaBucket().then(function () {
        datastore.saveBlob({
          bucket: 'media',
          file: `${videoId}/manifest.mpd`
        }, str).then(function () {
          console.log("SENDING FIRST FRAME EVENT")
          messenger.broadcastVideoReady(videoId, duration)
        })
      })

  });
}