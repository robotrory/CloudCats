/*
    Version 1.0.1

    Before running this example, install necessary dependencies by running:
    npm install http-signature jssha
*/

var fs = require('fs');
var https = require('https');
var os = require('os');
var httpSignature = require('http-signature');
var jsSHA = require("jssha");
var Promise = require("bluebird");
var Readable = require('stream').Readable;

// TODO: update these values to your own
var tenancyId = "ocid1.tenancy.oc1..aaaaaaaayqn5bwlknssj7uvcwp3z5icumi2r26zvid4ph4ny4saltzxwratq";
var authUserId = "ocid1.user.oc1..aaaaaaaa2pyylyzgsfnm5igxbiwdnpfigk32iaz7mvxc7wbvgkpb4mh2j4bq";
var keyFingerprint = "a2:62:90:97:33:76:7d:7c:aa:88:23:bd:46:3a:3d:1a";
var privateKeyPath = "mykey.pem";
var namespace = 'roarster'

var identityDomain = "identity.us-ashburn-1.oraclecloud.com";
var coreServicesDomain = "iaas.us-ashburn-1.oraclecloud.com";
var objectStorageDomain = "objectstorage.us-ashburn-1.oraclecloud.com";


if(privateKeyPath.indexOf("~/") === 0) {
    privateKeyPath = privateKeyPath.replace("~", os.homedir())
}
var privateKey = fs.readFileSync(privateKeyPath, 'ascii');

function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

// signing function as described at https://docs.us-phoenix-1.oraclecloud.com/Content/API/Concepts/signingrequests.htm
function sign(request, options) {

    var apiKeyId = options.tenancyId + "/" + options.userId + "/" + options.keyFingerprint;

    var headersToSign = [
        "host",
        "date",
        "(request-target)"
    ];

    var methodsThatRequireExtraHeaders = ["POST", "PUT"];

    if(methodsThatRequireExtraHeaders.indexOf(request.method.toUpperCase()) !== -1) {
        options.body = options.body || "";

        request.setHeader("Content-Length", options.body.length);
        headersToSign = headersToSign.concat([
            "content-type",
            "content-length"
        ]);  

        if (typeof options.body === "string") {
          var shaObj = new jsSHA("SHA-256", "TEXT");
          shaObj.update(options.body);

          
          request.setHeader("x-content-sha256", shaObj.getHash('B64'));

          headersToSign = headersToSign.concat([
              "x-content-sha256"
          ]);  
        }
        
    }

    httpSignature.sign(request, {
        key: options.privateKey,
        keyId: apiKeyId,
        headers: headersToSign
    });

    var newAuthHeaderValue = request.getHeader("Authorization").replace("Signature ", "Signature version=\"1\",");
    request.setHeader("Authorization", newAuthHeaderValue);
}

// generates a function to handle the https.request response object
function handleRequest(callback) {

    return function(response) {
        var responseBody = "";

        response.on('data', function(chunk) {
            responseBody += chunk;
        });

        response.on('end', function() {
            if(isJson(responseBody)) {
              callback(JSON.parse(responseBody), response.statusCode);  
            } else {
              callback(responseBody, response.statusCode);  
            }
        });
    }
}

function isSuccessResponseCode (code) {
  return code >= 200 && code < 300
}

function performRequest (options, callback) {
  var request = https.request(options, handleRequest(callback));

  if (options.body) {
    sign(request, {
        body: options.body,
        privateKey: privateKey,
        keyFingerprint: keyFingerprint,
        tenancyId: tenancyId,
        userId: authUserId
    });

    request.end(options.body);
  } else {
    sign(request, {
        privateKey: privateKey,
        keyFingerprint: keyFingerprint,
        tenancyId: tenancyId,
        userId: authUserId
    });

    request.end();    
  }
  
}

//////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////
// end helpers /////////////////////////////////
//////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////

function OracleOS() {
  
}

OracleOS.prototype.listBuckets = function listBuckets () {
  return new Promise(function (res, rej) {
    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/?compartmentId=${encodeURIComponent(tenancyId)}`
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(streamify(data))
      } else {
        rej(data)
      }
    })  
  })
}

OracleOS.prototype.makeBucket = function makeBucket (bucketName, noopRegion) {
  return new Promise(function (res, rej) {

    var body = JSON.stringify({
        compartmentId: tenancyId,
        namespace: namespace,
        name: bucketName
    });

    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/`,
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
        },
        body: body
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(data)  
      } else {
        rej(data)
      }
    })  
  })
}

OracleOS.prototype.removeBucket = function removeBucket (bucketName) {
  return new Promise(function (res, rej) {
    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/`,
        method: 'DELETE',
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(data)  
      } else {
        rej(data)
      }
    })  
  })
}

OracleOS.prototype.headBucket = function headBucket (bucketName) {
  return new Promise(function (res, rej) {
    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/`,
        method: 'HEAD',
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(data)  
      } else {
        rej(data)
      }
    })  
  })
}

function mapAccessPolicy (minioPolicy) {
  if (minioPolicy == 'readonly') {
    return 'ObjectRead'
  } else {
    return 'NoPublicAccess'
  }
}

OracleOS.prototype.setBucketPolicy = function setBucketPolicy (bucketName, prefix='', minioPolicy) {
  return new Promise(function (res, rej) {

    var policy = mapAccessPolicy(minioPolicy)

    var body = JSON.stringify({
        compartmentId: tenancyId,
        namespace: namespace,
        name: bucketName,
        publicAccessType: policy
    });

    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/`,
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
        },
        body: body
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(data)  
      } else {
        rej(data)
      }
    })  
  })
}


OracleOS.prototype.fPutObject = function fPutObject (bucketName, objectName, fileName) {
  return new Promise(function (res, rej) {
    fs.readFile(fileName, function(err, data) {
      if (err) {
        rej(err);
        return
      }

      res(OracleOS.prototype.putObject(bucketName, objectName, data))
    });
  });
}

OracleOS.prototype.putObject = function putObject (bucketName, objectName, data) {
  return new Promise(function (res, rej) {

    if (!Buffer.isBuffer(data)) {
      rej({msg: `data paramter must be a buffer, not '${typeof data}'`})
      return
    }

    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`,
        method: 'PUT',
        headers: {
            "Content-Type": "application/octet-stream",
        },
        body: data
    }, function (resData, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(resData)  
      } else {
        rej(resData)
      }
    })  
  })
}

OracleOS.prototype.getObject = function getObject (bucketName, objectName) {
  return new Promise(function (res, rej) {
    var s = new Readable();
    s._read = function noop() {};

    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        s.push(data);
        s.push(null); 
      } else {
        s.push(data)
      }
    })

    res(s)
  })
}

OracleOS.prototype.listObjects = function listObjects (bucketName, prefix='', recursive) {
  var s = new Readable({objectMode: true});
  s._read = function noop() {};
  
  var prefixQuery = prefix.length > 0 ? `prefix=${encodeURIComponent(prefix)}` : ''
  performRequest({
      host: objectStorageDomain,
      path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/o/?${prefixQuery}`
  }, function (data, statusCode) {
    if (isSuccessResponseCode(statusCode)) {
      for (var i=0; i<data.objects.length; i++) {
        s.push(data.objects[i]);
      }
      s.push(null);
      
    } else {
      s.push(data)
    }

  })

  return s;
}

OracleOS.prototype.removeObject = function removeObject (bucketName, objectName) {
  return new Promise(function (res, rej) {
    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`,
        method: 'DELETE'
    }, function (data, statusCode) {
      if (isSuccessResponseCode(statusCode)) {
        res(data)
      } else {
        rej(data)
      }
    })  
  })
}

OracleOS.prototype.statObject = function statObject (bucketName, objectName) {
  return new Promise(function (res, rej) {
    performRequest({
        host: objectStorageDomain,
        path: `/n/${namespace}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`,
        method: 'HEAD',
    }, function (data, statusCode) {
      console.log('data', data)
      console.log('statusCode', statusCode)
      if (isSuccessResponseCode(statusCode)) {
        res(data)  
      } else if (statusCode == 404) {
        rej({code: 'NotFound'})
      }
    })  
  })
}

// var stream = OracleOS.prototype.listObjects("aasd");

// stream.on('data', function(obj) {
//   console.log('obj',obj)
// });

// stream.on('end', function(obj) {
//   console.log('end')
// });


module.exports = OracleOS;
 