var Minio = require('minio')
var crypto = require('crypto')
var chokidar = require('chokidar')
var waitOn = require('wait-on');
var redis = require("redis");
var fs = require('fs')
var Promise = require("bluebird");
var OSS = require("./oracle_os");

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

var dataHost = (typeof process.env.S3_ADDR !== 'undefined') ? process.env.S3_ADDR : "http://localhost:9000"
var redisHost = (typeof process.env.REDIS_ADDR !== 'undefined') ? process.env.REDIS_ADDR : "localhost"

var redisClient = redis.createClient(6379, redisHost)

redisClient.on("error", function (err) {
    console.log("Error " + err);
});

var osClient
if (process.env.DATA_SERVICE == 'oracle') {
  osClient = new OSS()
} else {
  osClient = new Minio.Client({
      endPoint: dataHost,
      port: 9000,
      secure: false,
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  });
}

function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

module.exports = {

  getVideoBucketName: function (videoId) {
    return crypto.createHash('md5').update(videoId).digest("hex")
  },

  createBucket: function (bucketName) {
    return osClient.makeBucket(bucketName, 'us-east-1').catch(function (err) {
      if (err && err.code != 'BucketAlreadyOwnedByYou' && err.code != 'BucketAlreadyExists') {
        throw err
      } else {
        return Promise.resolve()
      }
    })
    // osClient.makeBucket({
    //   Bucket: bucketName
    // }).then(function () {
    //   callback()
    // }).catch(function (err) {
    //   if (err && err.code != 'BucketAlreadyOwnedByYou') {
    //     throw err
    //   } else {
    //     callback()
    //   }
    // })
    // osClient.makeBucket(bucketName, 'us-east-1', function(err) {
    //   if (err && err.code != 'BucketAlreadyOwnedByYou') {
    //     return console.log('Error creating bucket.', err)
    //   }
    //   callback()
    // })
  },

  deleteBucket: function (bucketName) {
    return new Promise(function (res, rej) {
      var stream = osClient.listObjects(bucketName,'', true)
      var dataCounter = 0
      var removedCounter = 0
      var ended = false

      function deleteEmptyBucket () {
        osClient.removeBucket(bucketName).then(function () {
          console.log('Bucket removed successfully.')
          res()
        }).catch(function(err) {
          console.log('unable to remove bucket.', err)
          rej(err)
        })
      }

      stream.on('data', function(obj) {
        dataCounter++
        osClient.removeObject(bucketName, obj.name).then(function () {
          removedCounter++
          if (ended && dataCounter == removedCounter) {
            deleteEmptyBucket()
          }
        }).catch(function (err) {
          if (err) {
            removedCounter++
            return console.log('Unable to remove object', err)
          }
        })
      } )

      stream.on('error', function(err) { console.log(err) } )
      stream.on('end', function(err) {
        ended = true
        if (dataCounter == 0) {
          deleteEmptyBucket()
        }
      });
    })
  },

  saveBlob: function (addrObj, data) {
    return osClient.putObject(addrObj.bucket, addrObj.file, data)
  },

  loadBlob: function (addrObj) {
    var size = 0
    return osClient.getObject(addrObj.bucket, addrObj.file).then(function(dataStream) {
      return new Promise(function (res, rej) {
        var existingData = new Uint8Array();

        dataStream.on('data', function(chunk) {
          size += chunk.length
          existingData = concatTypedArrays(existingData, chunk)
        })

        dataStream.on('end', function() {
          // console.log('End. Total size = ' + size)
          res(existingData)
        })
        dataStream.on('error', function(err) {
          console.log("DATA ERROR: "+err)
        })
        dataStream.on('uncaughtException', function(err) {
            console.log('DATA ERROR process.on handler');
            rej(err);
        });
      })
    })
  },

  syncDirWithBucket: function (dirName, bucketName) {
    return new Promise(function (res, rej) {
      var watcher = chokidar.watch(dirName, {
        ignored: /[\/\\]\./, persistent: true
      });

      var log = console.log.bind(console);

      watcher
        .on('add', function(path) {
          var parts = path.split("/")
          var filename = parts.slice(1,parts.length).join("/")

          waitOn({
            resources: [
              path
            ],
            interval: 100, // poll interval in ms, default 250ms 
            timeout: 30000, // timeout in ms, default Infinity 
            window: 1000, // stabilization time in ms, default 750ms 
          }, function (err) {
            if (err) { return handleError(err); }
            

            osClient.fPutObject(bucketName, filename, path, 'application/octet-stream').then(function(err) {
              res()
              fs.unlink(path, function () {

              })
            }).catch(function (err) {
              if (err) {
                console.log(err) // err should be null
              }
            })

          });

        })
      })
  },

  blobExists: function (addrObj) {
    return new Promise(function (res, rej) {
      osClient.statObject(addrObj.bucket, addrObj.file).then(function () {
        console.log('stat res')
        res(true)
      }).catch(function (err) {
        if (err && err.code == 'NotFound') {
          res(false)
        } else if (err) {
          rej(err)
        }  
      })
    }) 
  },

  getMediaBucketPublicUrl: function () {
    if (process.env.DATA_SERVICE == 'oracle') {
      return `https://objectstorage.us-ashburn-1.oraclecloud.com/n/roarster/b/media/o`
    } else {
      return `${dataHost}:9000/media`
    }
  },

  getVideoOutFrames: function (videoId) {
    return new Promise(function (res, rej) {
      var stream = osClient.listObjects(module.exports.getVideoBucketName(videoId), 'out_', false)
      var files = []
      stream.on('data', function(obj) { 
        files.push(obj)
      } )
      stream.on('error', function(err) {
        console.log(err)
        rej(err)
      } )
      stream.on('end', function() {
        res(files)
      })
    })
  },

  setVideoProcessing: function (videoId) {
    return redisClient.set(`state_${videoId}`, true)
  },

  getVideoProcessingState: function (videoId) {
    return redisClient.getAsync(`state_${videoId}`)
  },

  ensureMediaBucket: function () {
    return osClient.makeBucket('media', 'us-east-1').then(function () {
      return Promise.resolve()
    }).catch(function (err) {
      if (err && err.code != 'BucketAlreadyOwnedByYou' && err.code != 'BucketAlreadyExists') {
        console.log('throwing')
        throw err
      } else {
        return Promise.resolve()
      }
    }).then(function () {
      return osClient.setBucketPolicy('media', '', Minio.Policy.READONLY)      
    }).catch(function (err) {
      if (err && err.code != 'BucketAlreadyOwnedByYou' && err.code != 'BucketAlreadyExists') {
        console.log('throwing')
        throw err
      } else {
        return Promise.resolve()
      }
    }).catch(console.warn)
  }
}