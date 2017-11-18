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
  waitForVideoChunks(msg.videoId, ackCallback)
})

datastore.ensureMediaBucket().then(function () {
  datastore.syncDirWithBucket(scratchDir, 'media').then(function () {

  })
})

// waitForVideoChunks("gajBIB8K2SY", function () {console.log('fake ack')})

var promiseWhile = Promise.method(function(condition, action) {
    if (!condition()) return;
    return action().then(promiseWhile.bind(null, condition, action));
});

function waitForVideoChunks(videoId, ackCallback) {
  console.log(`waitForVideoChunks for ${videoId}`)
  
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

    function onFinalChunkReached () {
      console.log("we're done")
      
      for (var i=0; i<ackCallbackArray.length; i++) {
        ackCallbackArray[i]()
      }
      cleanupBuckets(videoId)
    }

    var validChunkMap = {}
    var currentChunkIndex = 0
    var minInitialChunkCount = videoData.fps
    var dir = `${scratchDir}/${videoId}`
    shell.mkdir('-p', dir);
    var inStream = streamTools.outputVideoStream(dir, videoData.fps, videoData.width, videoData.height, onFinalChunkReached)

    

    var expectedChunkCount = -1
    var chunksSeen = 0
    receiver.waitTotalVideoChunkCount(videoId, function (msg, chunkCountAckCallback) {
      console.log(`received expectedChunkCount: ${msg.count}`)
      ackCallbackArray.push(chunkCountAckCallback)
      expectedChunkCount = msg.count
      if (expectedChunkCount >= 0 && chunksSeen >= expectedChunkCount) {
        inStream.end()
      }
    }).then(function (cancelCallback) {
      ackCallbackArray.push(cancelCallback)
    })

    function processChunk (chunkNumber, data) {
      chunksSeen++
      // console.log(`${chunkNumber}:${chunksSeen}`)

      if (chunkNumber == 0) {
        createManifest(videoId, videoData.duration)
      }

      if (expectedChunkCount >= 0 && chunksSeen >= expectedChunkCount) {
        inStream.end()
      } else if (data) {
        inStream.write(data)
      }
    }

    var dataStoreSemaphore = false

    checkDataStore()

    function checkDataStore () {
      dataStoreSemaphore = true
      // console.log(`starting checkDataStore, currentChunkIndex: ${currentChunkIndex}`)
      datastore.getVideoOutChunks(videoId).then(function (files) {
        var finishedChunks = files.map(x => parseInt(x.name.replace('out_', ''))).sort((a,b) => (a - b))
        
        if (finishedChunks.length > minInitialChunkCount && finishedChunks.length > currentChunkIndex && finishedChunks[currentChunkIndex] == currentChunkIndex) {
          promiseWhile(function () {
            return finishedChunks.length > currentChunkIndex &&
            finishedChunks[currentChunkIndex] == currentChunkIndex
          }, function() {
            return datastore.loadBlob({
              bucket: datastore.getVideoBucketName(videoId),
              file: `out_${currentChunkIndex}`
            }).then(function (data) {
              processChunk(currentChunkIndex, new Buffer(data))
              currentChunkIndex++
            })
          }).then(function () {
            if (validChunkMap[currentChunkIndex]) {
              // console.log(`validChunkMap hold valid value for ${currentChunkIndex}`)
              checkDataStore()
            } else {
              dataStoreSemaphore = false
              // console.log(`we're now waiting at ${currentChunkIndex}`)
            }
          }).catch(console.warn)
        } else if (validChunkMap[currentChunkIndex]) {
          // console.log(`validChunkMap hold valid value for ${currentChunkIndex}`)
          checkDataStore()
        } else {
          dataStoreSemaphore = false
          // console.log(`still can't find current chunk ${currentChunkIndex}!`)
        }


      })
    }
    
    console.log(`waiting for chunks from ${videoId}`)
    receiver.waitChunkJobFinish(videoId, function (msg, chunkAckCallback) {    
      validChunkMap[msg.chunkNumber] = true
      if (msg.chunkNumber >= currentChunkIndex) {
        if (!dataStoreSemaphore) {
          checkDataStore() 
        }
      }
      
      chunkAckCallback()
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
          console.log("SENDING FIRST CHUNK EVENT")
          messenger.broadcastVideoReady(videoId, duration)
        })
      })

  });
}