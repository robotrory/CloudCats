var receiver = require('./receiver');
var youtubedl = require('youtube-dl');
var streamTools = require('./stream_tools');
var shell = require('shelljs');


receiver.ready().then(function () {
  console.log('coms up')
  receiver.waitAudioDownloadRequest(function (msg, ackCallback) {
    console.log(`received request to download audio for ${msg.videoId}`)
    downloadAudio(msg.videoId, ackCallback)
  })
})

// downloadAudio("gajBIB8K2SY")

function downloadAudio(videoId, ackCallback) {
  
  console.log(`download audio for ${videoId}`)
  var audio = youtubedl(`http://www.youtube.com/watch?v=${videoId}`,
    // Optional arguments passed to youtube-dl.
    ['--format=139'],
    // Additional options can be given for calling `child_process.execFile()`.
    { cwd: __dirname });

  var dir = `fs/${videoId}`
  shell.mkdir('-p', dir);
  streamTools.parseAudioStream(audio, dir, ackCallback)

}