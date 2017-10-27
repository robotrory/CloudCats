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

connection = pika.BlockingConnection(pika.ConnectionParameters('172.18.0.10'))
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

def manipulateFrame(stream):
  stream.seek(0)
  img_array = np.asarray(bytearray(stream.read()), dtype=np.uint8)
  bgrImg = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
  processed = imageParser.process(bgrImg)
  r, encoded = cv2.imencode(".png",processed)
  outStream = StringIO.StringIO(bytearray(encoded))
  return outStream

def overlay_image_alpha(img, img_overlay, pos, alpha_mask):
    """Overlay img_overlay on top of img at the position specified by
    pos and blend using alpha_mask.

    Alpha mask must contain values within the range [0, 1] and be the
    same size as img_overlay.
    """

    x, y = pos

    # Image ranges
    y1, y2 = max(0, y), min(img.shape[0], y + img_overlay.shape[0])
    x1, x2 = max(0, x), min(img.shape[1], x + img_overlay.shape[1])

    # Overlay ranges
    y1o, y2o = max(0, -y), min(img_overlay.shape[0], img.shape[0] - y)
    x1o, x2o = max(0, -x), min(img_overlay.shape[1], img.shape[1] - x)

    # Exit if nothing to do
    if y1 >= y2 or x1 >= x2 or y1o >= y2o or x1o >= x2o:
        return

    channels = img.shape[2]

    alpha = alpha_mask[y1o:y2o, x1o:x2o]
    alpha_inv = 1.0 - alpha

    for c in range(channels):
        img[y1:y2, x1:x2, c] = (alpha * img_overlay[y1o:y2o, x1o:x2o, c] +
                                alpha_inv * img[y1:y2, x1:x2, c])

def saveFrame(videoId, frameNumber, data):
  fileName = str(uuid.uuid1())
  print(fileName)
  addrObj = {"bucket": "outframes", "file": fileName}

  try:
      data.seek(0, os.SEEK_END)
      bufferSize = data.tell()
      data.seek(0, 0)
      minioClient.put_object(addrObj['bucket'], addrObj['file'], data, bufferSize, content_type='application/octet-stream')
      outQueue = "out_frames_%s" % videoId
      channel.basic_publish(exchange='',
      routing_key=outQueue,
      body=json.dumps({"videoId": videoId, "frameNumber": frameNumber, "addrObj": addrObj}))
  except ResponseError as err:
      print(err)

channel.basic_consume(onFrameJob,
                      queue='frame_jobs',
                      no_ack=True)

print(' [*] Waiting for messages. To exit press CTRL+C')
channel.start_consuming()