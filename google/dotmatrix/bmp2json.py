#!/usr/bin/python2.4
#
# Copyright 2007 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Convert .bmp file(s) to JSON snippet(s)."""

import sys
sys.path.append('third_party')  # Make simplejson happy.
from PIL import Image
import simplejson

HEIGHT=11
WIDTH=11

def main():
  pics = []
  for file in sys.argv[1:]:
    img = Image.open(file)
    pixels = [x[0]==0 for x in img.getdata()]
    assert(len(pixels) == HEIGHT * WIDTH)
    data = dict(author='author@example.com',
                date=1205454595.0,
                height=HEIGHT,
                width=WIDTH,
                name=file,
                pixels = ''.join(str(int(x)) for x in pixels),
                )
    pics.append(data)
  print simplejson.dumps(pics, indent=2)


if __name__ == '__main__':
  main()
