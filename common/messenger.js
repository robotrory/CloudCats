var open = require('amqplib').connect('amqp://172.18.0.10')
var comsChannel

function sendMessage (queueName, obj) {
  comsChannel.assertQueue(queueName, {durable: false}).then(function () {
    return comsChannel.sendToQueue(queueName, new Buffer(JSON.stringify(obj)))
  }).catch(console.warn)
}

function publishMessage (exchangeName, obj) {
  comsChannel.assertExchange(exchangeName, 'fanout', {durable: false}).then(function () {
    comsChannel.publish(exchangeName, '', new Buffer(JSON.stringify(obj)))
  }).catch(console.warn)
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

  requestVideoTranscode: function (videoId) {
    sendMessage("video_transcode", {videoId: videoId})
  },

  submitFrameJob: function (videoId, frameNumber, addrObj) {
    sendMessage("frame_jobs", {videoId: videoId, frameNumber: frameNumber, addrObj: addrObj})
  },

  finishFrameJob: function (videoId, frameNumber, addrObj) {
    sendMessage(`out_frames_${videoId}`, {videoId: videoId, frameNumber: frameNumber, addrObj: addrObj})
  },

  broadcastVideoReady: function (videoId, duration) {
    publishMessage(`ready_${videoId}`, {duration: duration})
  },

  sendTotalVideoFrameCount: function (videoId, count) {
    sendMessage(`frame_count_${videoId}`, {count: count})
  },

  sendVideoMetadata: function (videoId, metadata) {
    sendMessage(`metadata_${videoId}`, {metadata: metadata})
  }
};
