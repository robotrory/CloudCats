RedisSMQ = require("rsmq");
const DEBUG = false
var host = DEBUG ? "localhost" : "172.18.0.10"
rsmq = new RedisSMQ( {host: host, port: 6379, ns: "rsmq"} );

function ensureQueueExists (queueName, callback) {
  rsmq.createQueue({qname: queueName}, function (err, resp) {
      callback()
  });
}

module.exports = {
  requestVideoDownload: function (videoId) {
    console.log('going')
    rsmq.sendMessage({qname:"video_download", message: JSON.stringify({videoId: videoId})}, function (err, resp) {
      console.log(err)
      console.log(resp)
      if (resp) {
        console.log("Message sent. ID:", resp);
      }
    });
  },

  requestAudioDownload: function (videoId) {
    rsmq.sendMessage({qname:"audio_download", message: JSON.stringify({videoId: videoId})}, function (err, resp) {
      if (resp) {
        console.log("Message sent. ID:", resp);
      }
    });
  },

  requestVideoTranscode: function (videoId, videoData) {
    rsmq.sendMessage({qname:"video_transcode", message: JSON.stringify({videoId: videoId, videoData: videoData})}, function (err, resp) {
      if (resp) {
        console.log("Message sent. ID:", resp);
      }
    });
  },

  submitFrameJob: function (videoId, frameNumber, addrObj) {
    rsmq.sendMessage({qname:"frame_jobs", message: JSON.stringify({videoId: videoId, frameNumber: frameNumber, addrObj: addrObj})}, function (err, resp) {
      if (resp) {
        console.log("Message sent. ID:", resp);
      }
    });
  },

  finishFrameJob: function (videoId, frameNumber, addrObj) {
    var queueName = `out_frames_${videoId}`
    ensureQueueExists(queueName, function () {
      rsmq.sendMessage({qname:queueName, message: JSON.stringify({videoId: videoId, frameNumber: frameNumber, addrObj: addrObj})}, function (err, resp) {
        if (resp) {
          console.log(`Message sent for ${frameNumber}. ID:`, resp);
        }
      });
    });
  },

  broadcastFirstVideoFrameSeen: function (videoId, duration) {
    var queueName = `first_frame_${videoId}`
    ensureQueueExists(queueName, function () {
      rsmq.sendMessage({qname:queueName, message: JSON.stringify({duration: duration})}, function (err, resp) {
        if (err) throw err
        if (resp) {
          console.log("Message sent. ID:", resp);
        }
      });
    });
  },

  broadcastTotalVideoFrameCount: function (videoId, count) {
    var queueName = `frame_count_${videoId}`
    ensureQueueExists(queueName, function () {
      rsmq.sendMessage({qname:queueName, message: JSON.stringify({count: count})}, function (err, resp) {
        if (resp) {
          console.log("Message sent. ID:", resp);
        }
      });
    });
  }
};
