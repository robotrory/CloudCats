var receiver = require('./receiver');
var messenger = require('./messenger');
var datastore = require('./datastore');
var uuidv1 = require('uuid/v1');
var fs = require('fs');

messenger.ready().then(function () {
  return receiver.ready()
}).then(function () {
  console.log('coms up')
  start()
})

function start () {
  receiver.waitFrameJob(function (msg) {
    console.log(msg)
    var videoId = msg.videoId
    var frameNumber = msg.frameNumber
    var addrObj = msg.addrObj

    datastore.loadBlob(addrObj, function (data) {
      // var image = new Buffer(data)
      // fs.writeFile(`${addrObj.file}.png`, new Buffer(data), function () {
        
      // })
      saveFrame(videoId, frameNumber, data)
    })
  })
}

function saveFrame (videoId, frameNumber, data) {
  // TODO: chunk these
  var uuid = uuidv1()
  var addrObj = {bucket: "outframes", file: uuid}
  datastore.saveBlob(addrObj, new Buffer(data), function () {
    console.log(`saved frame ${frameNumber}`)
    messenger.finishFrameJob(videoId, frameNumber, addrObj)
  })
}