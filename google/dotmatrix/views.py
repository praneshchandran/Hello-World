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

"""View classes (user-facing views only)."""

import cgi
#import logging
import os
import urllib

from google.appengine.api import users

import models
import page


class Edit(page.Page):
  """Show/process an edit form for creating new drawings."""

  def RenderPage(self, template, pic):
    template_values = {
      'pic': pic,
    }
    self.RenderTemplate(template, template_values)

  @page.ForceLogin
  def get(self):
    pic = models.Picture()
    self.RenderPage('edit.html', pic)

  # No ForceLogin because we handle missing logins below.
  def post(self):
    # Get params
    width = int(self.request.get('width'))
    height = int(self.request.get('height'))
    pixels = [self.Checked('pixel_in_%s' % x) for x in range(width * height)]
    name = cgi.escape(self.request.get('name'))
    case_insensitive_name = name.lower()
    user = users.GetCurrentUser()

    # Build a Picture object
    pic = models.Picture()
    pic.name = name
    pic.case_insensitive_name = case_insensitive_name
    pic.author = user

    pic.width = width
    pic.height = height
    pic.pixel_str = ''.join(str(int(p)) for p in pixels)
    # Note: Calculating this before error-checking everything else isn't
    # terribly efficient.  Fixing this would require 2 validation passes,
    # though.
    pic.png_data = pic.GetPngData()

    # Error check the picture
    if user is None:
      # BUG: The user is screwed at this point: the "sign in" redirect
      # will destroy their data (unless they do it in a 2nd window).  This is
      # mitigated by the fact that this should only happen if they logged out
      # in a 2nd window after coming to this page.
      self.errors.append('You must be signed in to submit new drawings.')

    self.errors.extend(pic.Validate())

    if self.errors:
      self.RenderPage('edit.html', pic)
    else:
      if self.request.get('action') == 'Preview':
        self.RenderPage('preview.html', pic)
      elif self.request.get('action') == 'Save':
        # Save it.
        pic.put()
        self.redirect('/list')
      else:
        self.RenderPage('edit.html', pic)


def GetListContext(request):
  """Get the template values expected by _list.html."""
  number = int(request.get('n', 30))
  offset = int(request.get('offset', 0))
  max_index = models.DateSortIndex.current()
  threshold = max_index - offset
  # BUG: This crashes on the last page.  Falling off the list somehow?
  pics = models.Picture.gql('WHERE date_sort_index < :1 '
                            'ORDER BY date_sort_index DESC', threshold)
  pics = pics.fetch(number +1)
  show_next = False
  if len(pics) > number:
    show_next = True
    pics.pop()
  context = {
    'pics': pics,
    'show_next': show_next,
    'show_prev': (offset > 0),
    'next_offset': number + offset,
    'prev_offset': max(0, offset - number),
  }
  return context


class List(page.Page):
  """Show recent drawings."""
  def get(self):
    self.RenderTemplate('list.html', GetListContext(self.request))


class Root(page.Page):
  """/index.html view.  Same as list for now."""
  def get(self):
    self.redirect('/list')


class Image(page.Page):
  """Show a PNG image."""

  def get(self):
    path = self.request.path.split('/')
    name = path[-1]
    # Note: have to call unquote twice to get back to non-quoted name.
    name = urllib.unquote(urllib.unquote(name))
    name = name.replace('.png', '')
    pics = models.Picture.GetByName(name)
    if pics.count() < 1:
      self.RenderError('Image not found.', status_code=404)
      return
    pic = pics[0]
    self.response.headers['content-disposition'] = 'inline'
    self.response.headers['filename'] = '%s.png' % name
    self.response.headers['content-type'] = 'image/png'
    self.SetCache(604800)  # 1 week
    self.response.headers['last-modified'] = self.FormatDate(pic.date)
    self.response.out.write(pic.png_data)


class About(page.Page):

  def GetChessboard(self):
    def ColorToggle():
      """Give chessboard alternating colors."""
      while True:
        for i in range(4):  # First row (starts with white)
          yield 'White'
          yield 'Black'
        for i in range(4):  # Second row (starts with black)
          yield 'Black'
          yield 'White'

    row = ['Rook', 'Knight', 'Bishop', 'Queen',
           'King', 'Bishop', 'Knight', 'Rook']
    color = ColorToggle()
    chessboard = [
      ['/%s Black on %s.png' % (piece, color.next()) for piece in row],
      ['/Pawn Black on %s.png' % color.next() for x in range(8)],
      ['/Empty %s.png' % color.next() for x in range(8)],
      ['/Empty %s.png' % color.next() for x in range(8)],
      ['/Empty %s.png' % color.next() for x in range(8)],
      ['/Empty %s.png' % color.next() for x in range(8)],
      ['/Pawn White on %s.png' % color.next() for x in range(8)],
      ['/%s White on %s.png' % (piece, color.next()) for piece in row],
    ]
    return chessboard

  def get(self):
    values = {
      'chessboard': self.GetChessboard()
    }
    self.RenderTemplate('about.html', values)


class Error404(page.Page):
  """Generic 404 page."""
  def get(self):
    self.RenderError('404 Not Found', status_code=404)

  def post(self):
    return self.get()
