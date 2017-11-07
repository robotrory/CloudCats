const DEBUG = process.env.IS_DEBUG == undefined || process.env.IS_DEBUG != 'false'
var host = DEBUG ? "localhost" : process.env.RABBIT_ADDR
var amqp = require('amqplib-easy')(`amqp://${host}`);
var Promise = require("bluebird");

function sendMessage (queueName, obj) {
  amqp.sendToQueue({
    queue: queueName,
    queueOptions: {
      durable: true
    },
    exchangeOptions: {
      durable: true
    }}, obj).catch(console.warn)
}

function publishMessage (exchangeName, obj) {
  amqp.publish({
    exchange: exchangeName,
    queueOptions: {
      durable: true
    },
    exchangeOptions: {
      durable: true
    }}, 'video_msg', obj).catch(console.warn)
}

module.exports = {
  ready: function () {
    return new Promise(function (res, rej) {
      res()
    })
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
