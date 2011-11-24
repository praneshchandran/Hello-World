import time

_start = 0
def Start():
  global _start
  _start = time.time()

def Elapsed():
  return time.time() - _start
