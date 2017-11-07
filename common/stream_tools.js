var spawn = require('child_process').spawn;
var fs = require('fs');
var Promise = require("bluebird");

function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

function uintToString(uintArray) {
    var encodedString = String.fromCharCode.apply(null, uintArray),
        decodedString = decodeURIComponent(escape(encodedString));
    return decodedString;
}

module.exports = {
 
  parseAudioStream: function (stream, dir, finishCallback) {
    
    proc = spawn('ffmpeg', [ '-ac',
      '2',
      '-i',
      '-',
      '-map',
      '0:0',
      '-c:a',
      'libvorbis',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-f',
      'webm_chunk',
      '-audio_chunk_duration',
      '2000',
      '-header',
      `${dir}/171.hdr`,
      '-chunk_start_index',
      '1',
      `${dir}/171_%d.chk` ])

    proc.stderr.on('data', function(data) {
      console.log(uintToString(data));
    });

    proc.on('error', function (error) {
      console.log("AUDIO ERROR")
      console.log(error)
    })

    proc.on('exit', function (code) {
      console.log('audio process exited with code ' + code.toString());
      finishCallback()
    })

    stream.pipe(proc.stdin)


  },

  parseVideoStream: function (stream, frameCallback) {

    return new Promise(function (resolve, reject) {

      proc = spawn('ffmpeg', [ '-i',
        '-',
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
        '-' ])

      

      var seenFirstHeader = false
      var existingData = new Uint8Array();

      counter = 0
      proc.stdout.on('data', function(data) {
        var index = -1
        for (var i=0; i<data.length-7; i++) {
          if (data[i] == 137 &&
              data[i+1] == 80 &&
              data[i+2] == 78 &&
              data[i+3] == 71 &&
              data[i+4] == 13 &&
              data[i+5] == 10 &&
              data[i+6] == 26 &&
              data[i+7] == 10) {
            index = i
            break
          }
        }
        if (index >= 0) {
          if (!seenFirstHeader) {
            seenFirstHeader = true
            existingData = concatTypedArrays(existingData, data);
          } else {
            existingData = concatTypedArrays(existingData, data.slice(0, index))
            frameCallback(counter, existingData)
            counter++;
            existingData = data.slice(index, data.length)
          }
        } else {
          existingData = concatTypedArrays(existingData, data);
        }
      })



      proc.stderr.on('data', function(data) {
        console.log("VIDIN: "+uintToString(data));
      });

      proc.on('error', function (error) {
        console.log("VIDEO IN ERROR")
        console.log(error)
        reject(error)
      })

      proc.on('exit', function (code) {
        console.log('video input process exited with code ' + code.toString());
        resolve()
      })

      stream.pipe(proc.stdin)

    });

  },

  outputVideoStream: function (dir, fps, width, height, finishCallback) {

    var doubleFps = Math.round(2 * fps * 100) / 100

    proc = spawn('ffmpeg', [ '-y',
    '-r',
    fps,
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    '-i',
    '-',
    '-map',
    '0:0',
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libvpx-vp9',
    '-s',
    `${width}x${height}`,
    '-keyint_min',
    doubleFps,
    '-g',
    doubleFps,
    '-speed',
    '8',
    '-tile-columns',
    '6',
    '-frame-parallel',
    '1',
    '-threads',
    '1',
    '-cpu-used',
    '-5',
    '-static-thresh',
    '0',
    '-max-intra-rate',
    '300',
    '-deadline',
    'realtime',
    '-lag-in-frames',
    '0',
    '-error-resilient',
    '1',
    '-b:v',
    '3000k',
    '-f',
    'webm_chunk',
    '-header',
    `${dir}/360.hdr`,
    '-chunk_start_index',
    '1',
    `${dir}/360_%d.chk` ])

    proc.stderr.on('data', function(data) {
      console.log("VIDOUT: "+uintToString(data));
    });

    proc.on('error', function (error) {
      console.log("VIDEO OUT ERROR")
      console.log(error)
    })

    proc.stdin.on('error', function (error) {
      console.log("VIDEO OUT STDIN ERROR")
      console.log(error)
    })

    proc.stdout.on('error', function (error) {
      console.log("VIDEO OUT STDOUT ERROR")
      console.log(error)
    })

    proc.on('exit', function (code) {
      console.log('video output process exited with code ' + code.toString());
      finishCallback()
    })

    proc.on('uncaughtException', function(err) {
        console.log('process.on handler');
        console.log(err);
    });

    return proc.stdin
  }
};

// parseVideoStream(video, function onFrame(i, data) {
//   fs.writeFile(`/tmp/image_${i}.png`, data)
// })