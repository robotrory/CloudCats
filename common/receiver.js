const DEBUG = process.env.IS_DEBUG == undefined || process.env.IS_DEBUG != 'false'
var host = DEBUG ? "localhost" : process.env.RABBIT_ADDR
var amqp = require('amqplib-easy')(`amqp://${host}?heartbeat=20`);
var Promise = require("bluebird");

function createWorker (queue, callback) {
  console.log('create worker 1', {queueName: queue})
  return amqp.consume({
    exchange: 'default',
    queue: queue,
    queueOptions: {
      durable: true
    },
    exchangeOptions: {
      durable: true
    }
  }, function (data) {
    return new Promise(function (ackCallback, rej) {
      callback(data.json, ackCallback)  
    })
  }).catch(console.warn)
}

function createSubscriber (exchangeName, callback) {
  console.log('create subscriber 1')
  return amqp.consume({
    exchange: exchangeName,
    queue: 'publish_queue',
    topics: [ 'video_msg' ],
    queueOptions: {
      durable: true
    },
    exchangeOptions: {
      durable: true
    }
  }, function (data) {
    console.log('create subscriber 2')
    return new Promise(function (ackCallback, rej) {
      callback(data.json, ackCallback)  
    })
  }).catch(console.warn)
}

module.exports = {
  ready: function () {
    return new Promise(function (res, rej) {
      res()
    })
  },

  waitVideoDownloadRequest: function (callback) {
    return createWorker("video_download", callback)
  },

  waitAudioDownloadRequest: function (callback) {
    return createWorker("audio_download", callback)
  },

  waitVideoTranscodeRequest: function (callback) {
    return createWorker("video_transcode", callback)
  },

  waitFrameJob: function (callback) {
    return createWorker("frame_jobs", callback)
  },

  waitFrameJobFinish: function (videoId, callback) {    
    return createWorker(`out_frames_${videoId}`, callback)
  },

  waitVideoReady: function (videoId, callback) {
    return createSubscriber(`ready_${videoId}`, callback)
  },

  waitTotalVideoFrameCount: function (videoId, callback) {
    return createWorker(`frame_count_${videoId}`, callback)
  },

  waitVideoMetadata: function (videoId, callback) {
    return createWorker(`metadata_${videoId}`, callback)
  },

  cancelReceiver: function (worker) {
    // comsChannel.cancel(worker).then(function (err) {
    //   if (err) throw err
    // }).catch(console.warn)
    worker.then(function (cancelFunc) {
      cancelFunc()
    })
  }

};

