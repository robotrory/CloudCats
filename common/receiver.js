var open = require('amqplib').connect('amqp://172.18.0.10?heartbeat=20')
var comsChannel

function onQueueMessage (msg, callback, ackCallback) {
  if (msg !== null) {
    try
    {
      var data = JSON.parse(msg.content.toString());
      callback(data, ackCallback, msg.fields.consumerTag)
    }
    catch(e)
    {
      console.log('received message that was not JSON', e)
      callback(undefined, ackCallback, msg.fields.consumerTag)
    }
  }
}

function createWorker (queue, callback) {
  return comsChannel.assertQueue(queue, {durable: false}).then(function () {
    return comsChannel.consume(queue, function(msg) {
      var ackCallback = function () {
        comsChannel.ack(msg);
      }
      onQueueMessage(msg, callback, ackCallback)
    })
  }).catch(console.warn)
}

function createSubscriber (exchangeName, callback) {
  comsChannel.assertExchange(exchangeName, 'fanout', {durable: false}).then(function () {
  }).catch(console.warn)

  comsChannel.assertQueue('', {exclusive: true, durable: false}).then(function(q) {
    comsChannel.bindQueue(q.queue, exchangeName, '').then(function () {
    }).catch(console.warn)

    comsChannel.consume(q.queue, function(msg) {
      onQueueMessage(msg, callback, undefined)
    }, {noAck: true}).catch(console.warn)
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

  waitVideoDownloadRequest: function (callback) {
    createWorker("video_download", callback)
  },

  waitAudioDownloadRequest: function (callback) {
    createWorker("audio_download", callback)
  },

  waitVideoTranscodeRequest: function (callback) {
    createWorker("video_transcode", callback)
  },

  waitFrameJob: function (callback) {
    createWorker("frame_jobs", callback)
  },

  waitFrameJobFinish: function (videoId, callback) {    
    createWorker(`out_frames_${videoId}`, callback)
  },

  waitVideoReady: function (videoId, callback) {
    createSubscriber(`ready_${videoId}`, callback)
  },

  waitTotalVideoFrameCount: function (videoId, callback) {
    createWorker(`frame_count_${videoId}`, callback)
  },

  waitVideoMetadata: function (videoId, callback) {
    createWorker(`metadata_${videoId}`, callback)
  },

  cancelReceiver: function (worker) {
    comsChannel.cancel(worker).then(function (err) {
      if (err) throw err
    }).catch(console.warn)
  }

};

