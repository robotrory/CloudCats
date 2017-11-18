import argparse
from subprocess import call

parser = argparse.ArgumentParser(description='Remote server setup script')
parser.add_argument('token', help='server token')
parser.add_argument('ip', help='server ip')
parser.add_argument('hash', help='server hash')
parser.add_argument('ips', metavar='I', nargs='+',
                    help='an integer for the accumulator')

args = parser.parse_args()
for ip in args.ips:
  call(["./single_setup.sh", ip, args.token, args.ip, args.hash])