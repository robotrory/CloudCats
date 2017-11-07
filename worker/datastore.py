import oci
import os
import StringIO
from minio import Minio
from minio.error import ResponseError
from minio.error import  BucketAlreadyOwnedByYou
from minio.error import  NoSuchKey

user_ocid = "ocid1.user.oc1..aaaaaaaa2pyylyzgsfnm5igxbiwdnpfigk32iaz7mvxc7wbvgkpb4mh2j4bq"
tenancyId = "ocid1.tenancy.oc1..aaaaaaaayqn5bwlknssj7uvcwp3z5icumi2r26zvid4ph4ny4saltzxwratq"
key_file = "mykey.pem"
keyFingerprint = "a2:62:90:97:33:76:7d:7c:aa:88:23:bd:46:3a:3d:1a"
namespace = 'roarster'

class Datastore(object):
    def __init__(self):
      self.dataService = os.environ['DATA_SERVICE']

      if self.dataService == "oracle":
        config = {
            "user": user_ocid,
            "key_file": key_file,
            "fingerprint": keyFingerprint,
            "tenancy": tenancyId,
            "region": "us-ashburn-1"
        }

        self.objectStorage = oci.object_storage.object_storage_client.ObjectStorageClient(config)
      else:
        debug = os.environ['IS_DEBUG'] == 'true'
        dbHost = 'localhost' if debug else os.environ['S3_ADDR']
        print('dbHost: %s' % dbHost)
        self.minioClient = Minio(('%s:9000' % dbHost),
                    access_key='AKIAIOSFODNN7EXAMPLE',
                    secret_key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                    secure=False)

    def get_object(self, bucketName, objectName):
      if self.dataService == "oracle":
        response = self.objectStorage.get_object(namespace, bucketName, objectName).data
        inputStream = StringIO.StringIO()
        for d in response.iter_content(32*1024):
          inputStream.write(d)
        return inputStream
      else:
        try:
          response = self.minioClient.get_object(bucketName, objectName)
          inputStream = StringIO.StringIO()
          for d in response.stream(32*1024):
            inputStream.write(d)
          return inputStream
        except NoSuchKey as err:
          print('err, no key')
          return None

    def make_bucket(self, bucketName):
      if self.dataService == "oracle":
        try:
          self.objectStorage.create_bucket(namespace, {
            "compartmentId": tenancyId,
            "name": bucketName
          })
        except oci.exceptions.ServiceError as err:
          print(err)
      else:
        try:
            self.minioClient.make_bucket(bucketName)
        except BucketAlreadyOwnedByYou as err:
          print(err)

    def put_object(self, bucketName, objectName, data, dataLength, content_type):
      if self.dataService == "oracle":
        self.objectStorage.put_object(namespace, bucketName, objectName, data)
      else:
        try:
          self.minioClient.put_object(bucketName, objectName, data, dataLength, content_type=content_type)
        except ResponseError as err:
          print(err)