import oci
import os
import cStringIO
from minio import Minio
from minio.error import ResponseError
from minio.error import  BucketAlreadyOwnedByYou
from minio.error import  NoSuchKey

class Datastore(object):
    def __init__(self):
      self.dataService = os.environ['DATA_SERVICE']


      debug = os.environ['IS_DEBUG'] == 'true'
      dbHost = 'localhost' if debug else os.environ['S3_ADDR']
      print('dbHost: %s' % dbHost)
      self.minioClient = Minio(('%s:9000' % dbHost),
                  access_key='AKIAIOSFODNN7EXAMPLE',
                  secret_key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                  secure=False)

    def get_object(self, bucketName, objectName):
      try:
        response = self.minioClient.get_object(bucketName, objectName)
        inputStream = cStringIO.StringIO()
        for d in response.stream(32*1024):
          inputStream.write(d)
        return inputStream
      except NoSuchKey as err:
        print('err, no key')
        return None

    def make_bucket(self, bucketName):
      try:
          self.minioClient.make_bucket(bucketName)
      except BucketAlreadyOwnedByYou as err:
        print(err)

    def put_object(self, bucketName, objectName, data, dataLength, content_type):
      try:
        self.minioClient.put_object(bucketName, objectName, data, dataLength, content_type=content_type)
      except ResponseError as err:
        print(err)