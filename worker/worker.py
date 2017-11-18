import pika
import json
import uuid
import cStringIO
import os
import numpy as np
import cv2
import openface
from Face import ImageParser
from Datastore import Datastore
import hashlib
import time

print('starting')

debug = os.environ['IS_DEBUG'] == 'true'
dryRun = False #os.environ['DRY_RUN'] == 'true'
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

    videoId = msg['videoId']
    chunkNumber = msg['chunkNumber']
    pointerQueue = msg['pointerQueue']
    addrObj = msg['addrObj']

    print("%s:%s" % (videoId, chunkNumber))

    
    inputStream = datastore.get_object(addrObj['bucket'], addrObj['file'])
    if inputStream is not None:
      outputStream = manipulateChunk(inputStream, pointerQueue)
      saveChunk(videoId, chunkNumber, outputStream)

    ch.basic_ack(delivery_tag=method.delivery_tag)

def manipulateChunk(stream, pointerQueue):
  stream.seek(0)

  npData = np.asarray(bytearray(stream.getvalue()), dtype=np.uint8)

  headerIndices = pointerQueue
  dataLength = len(npData)
  outStream = cStringIO.StringIO()
  headersCount = len(headerIndices)
  for i in range(headersCount):
    headerIndex = headerIndices[i]
    nextHeaderIndex = headerIndices[i+1] if i+1 < headersCount else dataLength
    img_array = npData[headerIndex:nextHeaderIndex]
    bgrImg = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    processed = bgrImg if dryRun else imageParser.process(bgrImg)
    _, encoded = cv2.imencode(".png", processed)
    outStream.write(bytearray(encoded))
  
  return outStream

def getVideoBucketName(videoId):
  m = hashlib.md5()
  m.update(videoId)
  return m.hexdigest()

def saveChunk(videoId, chunkNumber, data):
  fileName = ('out_%s' % chunkNumber)
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
  body=json.dumps({"videoId": videoId, "chunkNumber": chunkNumber, "addrObj": addrObj}))


channel.basic_consume(onFrameJob,
                      queue='frame_jobs',
                      no_ack=False)

print(' [*] Waiting for messages. To exit press CTRL+C')
channel.start_consuming()