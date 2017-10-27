var open = require('amqplib').connect('amqp://172.18.0.10')
var comsChannel

function ensureQueueExists (queueName, callback) {
  callback()
}

function sendMessage (queueName, obj) {
  comsChannel.assertQueue(queueName, {durable: false}).then(function () {
    return comsChannel.sendToQueue(queueName, new Buffer(JSON.stringify(obj)))
  })
}

module.exports = {
  ready: function () {
    return open.then(function(conn) {
      return conn.createChannel()
    }).then(function(ch) {
      comsChannel = ch
    }).catch(console.warn)
  },

  requestVideoDownload: function (videoId) {
    sendMessage("video_download", {videoId: videoId})
  },

  requestAudioDownload: function (videoId) {
    sendMessage("audio_download", {videoId: videoId})
  },

  requestVideoTranscode: function (videoId, videoData) {
    sendMessage("video_transcode", {videoId: videoId, videoData: videoData})
  },

  submitFrameJob: function (videoId, frameNumber, addrObj) {
    sendMessage("frame_jobs", {videoId: videoId, frameNumber: frameNumber, addrObj: addrObj})
  },

  finishFrameJob: function (videoId, frameNumber, addrObj) {
    var queueName = `out_frames_${videoId}`

    ensureQueueExists(queueName, function () {
      sendMessage(queueName, {videoId: videoId, frameNumber: frameNumber, addrObj: addrObj})
    });
  },

  broadcastFirstVideoFrameSeen: function (videoId, duration) {
    var queueName = `first_frame_${videoId}`
    ensureQueueExists(queueName, function () {
      sendMessage(queueName, {duration: duration})
    });
  },

  broadcastTotalVideoFrameCount: function (videoId, count) {
    var queueName = `frame_count_${videoId}`
    ensureQueueExists(queueName, function () {
      sendMessage(queueName, {count: count})
    });
  }
};
