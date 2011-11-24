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

"""Data model code."""

import array
import datetime
import StringIO
import time
import urllib

import png

from google.appengine.ext import db
from google.appengine.api import users


class ValidationException(Exception):
  pass


def EncodePng(width, height, pixel_values):
  """Encode pixels as a PNG file & return the encoded PNG data."""
  depth = 1
  a = array.array('B', pixel_values)
  i = png.interleave_planes(a, a, depth, depth)
  i = png.interleave_planes(i, a, 2*depth, depth)
  writer = png.Writer(width, height, bytes_per_sample=depth)
  f = StringIO.StringIO()
  writer.write_array(f, i)
  return f.getvalue()


class DateSortIndex(db.Model):
  counter = db.IntegerProperty(default=0)

  @classmethod
  def increment(cls):
    acc = db.GqlQuery('SELECT * FROM DateSortIndex').get()
    db.run_in_transaction(cls._transaction, acc.key(), 1)
    return acc.counter

  @classmethod
  def current(cls):
    acc = db.GqlQuery('SELECT * FROM DateSortIndex').get()
    return acc.counter

  @classmethod
  def _transaction(cls, key, amount):
    obj = db.get(key)
    obj.counter += amount
    obj.put()


class Picture(db.Model):
  author = db.UserProperty()
  date_sort_index = db.IntegerProperty(default=-1)
  # Store raw (i.e. not in a PNG) image data so we can re-encode later.
  width = db.IntegerProperty(default=11)
  height = db.IntegerProperty(default=11)
  pixel_str = db.StringProperty()
  png_data = db.BlobProperty()
  date = db.DateTimeProperty(auto_now_add=True)
  # We want name comparison to be case-insensitive, but we also want to
  # preserve the original case for display purposes.
  # Name with original case.
  name = db.StringProperty(default='')
  # TODO: This should maybe be a key or key name.
  # Used to keep names unique.
  case_insensitive_name = db.StringProperty(default='')

  def put(self):
    """Save to the database, but do some error checking first."""
    if self.date_sort_index < 0:
      self.date_sort_index = DateSortIndex.increment()
    self.Validate(die_on_error=True)
    super(Picture, self).put()
    #if not self.id:
    #  # Now stuff the ID in
    #  self.id = self.key().id()
    #  super(Picture, self).put()

  def Validate(self, die_on_error=False):
    """Check for errors that we wouldn't want to save to the database.  If
    die_on_error is True, raises exception.  If die_on_error is False, will
    return a list of error messages.
    """
    errors = []
    if len(self.pixel_str) != self.width * self.height:
      errors.append('Wrong number of pixels (internal error)')
    if not self.png_data:
      errors.append('Missing PNG data (internal error)')
    if not self.name:
      errors.append('Missing name')
    try:
      ascii_name = self.name.encode('ascii')
    except UnicodeEncodeError:
      errors.append('Name has to be ASCII, not unicode (for now)')
    if self.name.lower() != self.case_insensitive_name:
      errors.append('Case insensitive name incorrect (internal error)')
    # TODO There's a Query method to just get the first result.  Use it here.
    # Don't allow duplicate names.  Check for new pics & renames.
    same_name = Picture.GetByName(self.name)
    if same_name.count():
      if not self.is_saved() or same_name[0].key() != self.key():
        errors.append('Name "%s" already in use' % self.name)
    if die_on_error and errors:
      raise ValidationException('\n'.join(errors))
    return errors

  # TODO: look into {% url %} syntax to avoid doing this.
  @property
  def url(self):
    return '/%s.png' % urllib.quote(self.name)

  @property
  def display_author(self):
    """Get display-friendly author name"""
    if self.author:
      return self.author.nickname()
    return 'Anonymous'

  @property
  def pixels_as_list(self):
    """Access pixel_str as a list of bools."""
    return [bool(int(x)) for x in list(self.pixel_str)]

  @property
  def pixels_as_enumerated_grid(self):
    """Return a grid of {id, pixel_value} dicts."""
    width = self.width
    height = self.height
    if self.pixel_str:
      assert(len(self.pixel_str) == width * height)
      pixels = [{'id':i, 'value':x} for i, x in enumerate(self.pixels_as_list)]
    else:
      # Make an empty grid that's the right size.
      pixels = [{'id':i, 'value':False} for i in range(width * height)]
    return [[pixels[x+y*width] for x in range(width)] for y in range(height)]

  @classmethod
  def DeleteByName(cls, name):
    """Delete all pictures matching name."""
    for pic in cls.GetByName(name):
      pic.delete()

  @classmethod
  def GetByName(cls, name):
    """Load any pics that have the given name."""
    name = name.lower()
    return cls.gql('WHERE case_insensitive_name = :1', name)

  def GetPngData(self):
    """Encode self.pixels as PNG data & return (suitable for populating
    self.png_data)."""
    multiplier = 5  # Size multiplier.
    pixel_values = []
    row = []
    for p in self.pixels_as_list:
      for x in range(multiplier):
        row.append(255*int(not p))
      if len(row) == self.width * multiplier:
        for x in range(multiplier):
          pixel_values.extend(row)
        row = []
    return EncodePng(self.width*multiplier,
                     self.height*multiplier, pixel_values)


  def AsDict(self):
    """Convert picture to a dict (useful for backup)."""
    author = ''
    if self.author:
      author = self.author.email()
    return dict(author=author,
                width=self.width,
                height=self.height,
                pixels=self.pixel_str,
                date=time.mktime(self.date.timetuple()),
                name=self.name,
                )

  @classmethod
  def FromDict(cls, data):
    """Create and return a picture from the dict (which is expected to have
    come from Picture.AsDict)
    """
    pic = cls()
    try:
      pic.author = users.User(data['author'])
    except users.UserNotFoundError:
      pass
    pic.width = int(data['width'])
    pic.height = int(data['height'])
    pic.pixel_str = data['pixels']
    pic.pixels = [bool(int(x)) for x in data['pixels']]
    pic.png_data = pic.GetPngData()
    pic.date = datetime.datetime.fromtimestamp(data['date'])
    pic.name = data['name']
    pic.case_insensitive_name = pic.name.lower()
    return pic
