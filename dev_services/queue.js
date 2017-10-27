RedisSMQ = require("rsmq");
rsmq = new RedisSMQ( {host: "127.0.0.1", port: 6379, ns: "rsmq"} );

var queues = ["video_download", "audio_download", "video_transcode", "frame_jobs"];

for (var i in queues) {
  console.log(`creating for ${queues[i]}`)
  rsmq.createQueue({qname:queues[i]}, function (err, resp) {
      if (resp===1) {
        console.log(`queue created for ${queues[i]}`)
      }
  });
}