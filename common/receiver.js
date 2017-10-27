RedisSMQ = require("rsmq");
const DEBUG = false
var host = DEBUG ? "localhost" : "172.18.0.10"
rsmq = new RedisSMQ( {host: host, port: 6379, ns: "rsmq"} );
var RSMQWorker = require( "rsmq-worker" );

function createWorker (queue, callback) {
  var worker = new RSMQWorker( queue, {
      host: host,
      port: 6379,
      redisPrefix: "rsmq"
    });

  worker.on( "message", function( msg, next, id ){
    // process your message
    // console.log("Received message id : " + id);

    try
    {
       var data = JSON.parse(msg);
      callback(data, worker)
    }
    catch(e)
    {
       console.log('received message that was not JSON')
       callback(undefined, worker)
    }
    
    next()
  });

  // optional error listeners
  worker.on('error', function( err, msg ){
      console.log( "ERROR", err, msg.id );
  });
  worker.on('exceeded', function( msg ){
      console.log( "EXCEEDED", msg.id );
  });
  worker.on('timeout', function( msg ){
      console.log( "TIMEOUT", msg.id, msg.rc );
  });

  worker.start();
}

function ensureQueueExists (queueName, callback) {
  rsmq.createQueue({qname: queueName}, function (err, resp) {
      callback()
  });
}

module.exports = {
  
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
    var queueName = `out_frames_${videoId}`
    ensureQueueExists(queueName, function () {
      createWorker(queueName, callback)
    })
  },

  waitFirstVideoFrameSeen: function (videoId, callback) {
    var queueName = `first_frame_${videoId}`
    ensureQueueExists(queueName, function () {
      createWorker(queueName, callback)
    })
  },

  waitTotalVideoFrameCount: function (videoId, callback) {
    var queueName = `frame_count_${videoId}`
    ensureQueueExists(queueName, function () {
      createWorker(queueName, callback)
    })
  },

  cancelReceiver: function (worker) {
    worker.stop()
  }

};

