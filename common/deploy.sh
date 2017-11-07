#!/bin/bash

echo PREPARING DOCKER IMAGES

docker tag webserver_web roarster/webserver
docker tag worker_worker roarster/image_worker
docker tag audioinout_audio_dl roarster/audio
docker tag videoout_video_transcode roarster/video_transcode
docker tag videoin_video_dl roarster/video_download

echo PUSHING DOCKER IMAGES

docker push roarster/webserver
docker push roarster/image_worker
docker push roarster/audio
docker push roarster/video_transcode
docker push roarster/video_download

echo APPLYING REMOTE DEPLOY

SCRIPT=$(cat << EOF
kubectl delete -f http://7ebf91db.ngrok.io/webserver.yaml
kubectl delete -f http://7ebf91db.ngrok.io/image_worker.yaml
kubectl delete -f http://7ebf91db.ngrok.io/video_download.yaml
kubectl delete -f http://7ebf91db.ngrok.io/video_transcode.yaml
kubectl delete -f http://7ebf91db.ngrok.io/audio.yaml

kubectl apply -f http://7ebf91db.ngrok.io/webserver.yaml
kubectl apply -f http://7ebf91db.ngrok.io/image_worker.yaml
kubectl apply -f http://7ebf91db.ngrok.io/video_download.yaml
kubectl apply -f http://7ebf91db.ngrok.io/video_transcode.yaml
kubectl apply -f http://7ebf91db.ngrok.io/audio.yaml
EOF
)
ssh -l ubuntu $1 "${SCRIPT}"