var open = require('amqplib').connect('amqp://172.18.0.10')
var comsChannel

// RedisSMQ = require("rsmq");
// const DEBUG = false
// var host = DEBUG ? "localhost" : "172.18.0.10"
// rsmq = new RedisSMQ( {host: host, port: 6379, ns: "rsmq"} );
// var RSMQWorker = require( "rsmq-worker" );

function createWorker (queue, callback) {
  return comsChannel.assertQueue(queue, {durable: false}).then(function () {
    return comsChannel.consume(queue, function(msg) {
      
      if (msg !== null) {
        try
        {
          var data = JSON.parse(msg.content.toString());
          callback(data, msg.fields.consumerTag)
        }
        catch(e)
        {
           console.log('received message that was not JSON')
           callback(undefined, msg.fields.consumerTag)
        }
        comsChannel.ack(msg);
      }


    })
  }).catch(console.warn)

  // var worker = new RSMQWorker( queue, {
  //     host: host,
  //     port: 6379,
  //     redisPrefix: "rsmq"
  //   });

  // worker.on( "message", function( msg, next, id ){
  //   // process your message
  //   // console.log("Received message id : " + id);

  //   try
  //   {
  //      var data = JSON.parse(msg);
  //     callback(data, worker)
  //   }
  //   catch(e)
  //   {
  //      console.log('received message that was not JSON')
  //      callback(undefined, worker)
  //   }
    
  //   next()
  // });

  // // optional error listeners
  // worker.on('error', function( err, msg ){
  //     console.log( "ERROR", err, msg.id );
  // });
  // worker.on('exceeded', function( msg ){
  //     console.log( "EXCEEDED", msg.id );
  // });
  // worker.on('timeout', function( msg ){
  //     console.log( "TIMEOUT", msg.id, msg.rc );
  // });

  // worker.start();
}

function ensureQueueExists (queueName, callback) {
  // rsmq.createQueue({qname: queueName}, function (err, resp) {
  //     callback()
  // });

  // return comsChannel.assertQueue(queueName).then(function(ok) {
  //   callback()
  // }).catch(console.warn)
  callback()
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
    // worker.stop()
    // console.log('cancelReceiver', worker)
    comsChannel.cancel(worker).then(function (err) {
      if (err) throw err
      // console.log('unsubbed worker')
    }).catch(console.warn)
  }

};

