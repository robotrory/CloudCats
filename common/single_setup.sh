#!/bin/bash

SCRIPT=$(cat << EOF
sudo rm -rf /var/lib/cni
sudo rm -rf /run/flannel
sudo rm -rf /etc/cni
sudo ifconfig cni0 down
sudo brctl delbr cni0
sudo iptables -F
sudo iptables -X
sudo iptables -t mangle -F
sudo iptables -t nat -F
sudo apt-get update
sudo apt-get install -y docker.io
sudo apt-get update
sudo apt-get install -y apt-transport-https
curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
echo "deb http://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
echo "running remote"
sudo kubeadm join --token $2 $3:6443 --discovery-token-ca-cert-hash $4
EOF
)

echo STARTING PROVISION

ssh -o StrictHostKeyChecking=no -l ubuntu $1 "${SCRIPT}"