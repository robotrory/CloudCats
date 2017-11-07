import pika
import json
import uuid
import StringIO
import os
import numpy as np
import cv2
import openface
from Face import ImageParser
from Datastore import Datastore
import hashlib

print('starting')

debug = os.environ['IS_DEBUG'] == 'true'
dryRun = os.environ['DRY_RUN'] == 'true'
messageHost = 'localhost' if debug else os.environ['RABBIT_ADDR']


print('messageHost: %s' % messageHost)



connection = pika.BlockingConnection(pika.ConnectionParameters(host=messageHost, heartbeat=20))
channel = connection.channel()

channel.queue_declare(queue='frame_jobs', durable=True)

datastore = Datastore()

imageParser = ImageParser()

print("openface ready")

if dryRun:
  print("Dry run enabled")


# print(" [x] Sent 'Hello World!'")

def onFrameJob(ch, method, properties, body):
    msg = json.loads(body)
    print(body)

    videoId = msg['videoId']
    frameNumber = msg['frameNumber']
    addrObj = msg['addrObj']

    
    inputStream = datastore.get_object(addrObj['bucket'], addrObj['file'])
    if inputStream is not None:
      if dryRun:
        saveFrame(videoId, frameNumber, inputStream)
      else:
        try:
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

def getVideoBucketName(videoId):
  m = hashlib.md5()
  m.update(videoId)
  return m.hexdigest()

def saveFrame(videoId, frameNumber, data):
  fileName = ('out_%s' % frameNumber)
  addrObj = {"bucket": getVideoBucketName(videoId), "file": fileName}

  outQueue = "out_frames_%s" % videoId

  channel.queue_declare(queue=outQueue, durable=True)

  datastore.make_bucket(addrObj['bucket'])


  data.seek(0, os.SEEK_END)
  bufferSize = data.tell()
  data.seek(0, 0)
  datastore.put_object(addrObj['bucket'], addrObj['file'], data, bufferSize, content_type='application/octet-stream')
  
  channel.basic_publish(exchange='',
  routing_key=outQueue,
  body=json.dumps({"videoId": videoId, "frameNumber": frameNumber, "addrObj": addrObj}))


channel.basic_consume(onFrameJob,
                      queue='frame_jobs',
                      no_ack=False)

print(' [*] Waiting for messages. To exit press CTRL+C')
channel.start_consuming()