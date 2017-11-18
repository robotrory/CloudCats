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

  parseVideoStream: function (stream, fps, frameCallback) {

    return new Promise(function (resolve, reject) {

      proc = spawn('ffmpeg', [ '-r',
        fps,
        '-i',
        '-',
        '-f',
        'image2pipe',
        '-framerate',
        fps,
        '-vcodec',
        'png',
        '-' ])

      

      var seenFirstHeader = false
      var existingData = new Uint8Array();

      var counter = 0
      proc.stdout.on('data', function(data) {
        var headerIndices = []
        // go through input data until we find a png header
        for (var i=0; i<data.length-7; i++) {
          if (data[i] == 137 &&
              data[i+1] == 80 &&
              data[i+2] == 78 &&
              data[i+3] == 71 &&
              data[i+4] == 13 &&
              data[i+5] == 10 &&
              data[i+6] == 26 &&
              data[i+7] == 10) {
            headerIndices.push(i)
          }
        }

        // if we've found a header
        if (headerIndices.length > 0) {
          // console.log(`found ${headerIndices.length} png headers in data`)

          existingData = concatTypedArrays(existingData, data.slice(0, headerIndices[0]))

          for (var i=0; i<headerIndices.length; i++) {
            var index = headerIndices[i]
            var nextIndex = (i < headerIndices.length-1) ? headerIndices[i+1] : -1

            var dataChunk = (nextIndex >= 0) ? data.slice(index, nextIndex) : data.slice(index, data.length)

            if (!seenFirstHeader) {
              seenFirstHeader = true
              existingData = concatTypedArrays(existingData, dataChunk);
            } else {
              frameCallback(counter, existingData)
              counter++;
              existingData = dataChunk
            }
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
        // total frames is counter - 1
        resolve(counter-1)
      })

      proc.stdout.on('exit', function (code) {
        console.log('video stdout exited, flushing');
        frameCallback(counter, existingData)
      })

      stream.pipe(proc.stdin)

    });

  },

  outputVideoStream: function (dir, fps, width, height, finishCallback) {

    var doubleFps = Math.round(2 * fps * 100) / 100

    proc = spawn('ffmpeg', [ '-y',
    '-f',
    'image2pipe',
    '-framerate',
    fps,
    '-vcodec',
    'png',
    '-i',
    '-',
    '-map',
    '0:0',
    '-r',
    fps,
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
    '4',
    '-frame-parallel',
    '1',
    '-threads',
    '4',
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
      if (code == 0) {
        finishCallback()
      }
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