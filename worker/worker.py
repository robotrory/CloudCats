#!/usr/bin/env python
import pika
import json
from minio import Minio
from minio.error import ResponseError
from minio.error import  BucketAlreadyOwnedByYou
import uuid
import StringIO
import os
import cv2
import numpy as np
import openface
from Face import ImageParser

minioClient = Minio('172.18.0.11:9000',
                  access_key='AKIAIOSFODNN7EXAMPLE',
                  secret_key='wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                  secure=False)

connection = pika.BlockingConnection(pika.ConnectionParameters(host='172.18.0.10', heartbeat=20))
channel = connection.channel()

channel.queue_declare(queue='frame_jobs')

try:
    minioClient.make_bucket("outframes")
except BucketAlreadyOwnedByYou as err:
  print(err)

imageParser = ImageParser()

print("openface ready")


# print(" [x] Sent 'Hello World!'")

def onFrameJob(ch, method, properties, body):
    msg = json.loads(body)
    print(body)

    videoId = msg['videoId']
    frameNumber = msg['frameNumber']
    addrObj = msg['addrObj']

    try:
        data = minioClient.get_object(addrObj['bucket'], addrObj['file'])
        inputStream = StringIO.StringIO()
        for d in data.stream(32*1024):
          inputStream.write(d)
        outputStream = manipulateFrame(inputStream)
        saveFrame(videoId, frameNumber, outputStream)
    except ResponseError as err:
        print(err)

    ch.basic_ack(delivery_tag=method.delivery_tag)

def manipulateFrame(stream):
  stream.seek(0)
  img_array = np.asarray(bytearray(stream.read()), dtype=np.uint8)
  bgrImg = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
  processed = imageParser.process(bgrImg)
  r, encoded = cv2.imencode(".png",processed)
  outStream = StringIO.StringIO(bytearray(encoded))
  return outStream

def saveFrame(videoId, frameNumber, data):
  fileName = str(uuid.uuid1())
  print(fileName)
  addrObj = {"bucket": "outframes", "file": fileName}

  outQueue = "out_frames_%s" % videoId
  
  channel.queue_declare(queue=outQueue)

  try:
      data.seek(0, os.SEEK_END)
      bufferSize = data.tell()
      data.seek(0, 0)
      minioClient.put_object(addrObj['bucket'], addrObj['file'], data, bufferSize, content_type='application/octet-stream')
      
      channel.basic_publish(exchange='',
      routing_key=outQueue,
      body=json.dumps({"videoId": videoId, "frameNumber": frameNumber, "addrObj": addrObj}))
  except ResponseError as err:
      print(err)

channel.basic_consume(onFrameJob,
                      queue='frame_jobs',
                      no_ack=False)

print(' [*] Waiting for messages. To exit press CTRL+C')
channel.start_consuming()