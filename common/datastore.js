var Minio = require('minio')
const DEBUG = false
var host = DEBUG ? "localhost" : "172.18.0.11"
var minioClient = new Minio.Client({
    endPoint: host,
    port: 9000,
    secure: false,
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
});

function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

module.exports = {
  saveManifest: function (videoId) {

  },

  isManifestExists: function (videoId) {
    
  },

  saveBlob: function (addrObj, data, callback) {
    minioClient.putObject(addrObj.bucket, addrObj.file, data, function(err, etag) {
      if (err) throw err
      callback()
    })
  },

  loadBlob: function (addrObj, callback) {
    var size = 0
    minioClient.getObject(addrObj.bucket, addrObj.file, function(err, dataStream) {
      if (err) {
        return console.log(err)
      }

      var existingData = new Uint8Array();

      dataStream.on('data', function(chunk) {
        size += chunk.length
        existingData = concatTypedArrays(existingData, chunk)
      })

      dataStream.on('end', function() {
        // console.log('End. Total size = ' + size)
        callback(existingData)
      })
      dataStream.on('error', function(err) {
        console.log("DATA ERROR: "+err)
      })
      dataStream.on('uncaughtException', function(err) {
          console.log('DATA ERROR process.on handler');
          console.log(err);
      });
    })
  }
}