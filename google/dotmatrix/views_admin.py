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

"""Administration view classes."""

import cgi
#import logging
import os
import urllib

import simplejson

from google.appengine.api import users
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template

import models
import page
import views

class Admin(page.Page):

  @page.FailIfNotAdmin('You must be an admin to view this page.')
  def get(self):
    self.RenderTemplate('admin.html', views.GetListContext(self.request))


class UpdateDatastore(page.Page):
  """Let admin cycle through all pictures, updating them in the datastore."""

  # HACK: this is hitting the datastore based on a GET request.  This would be
  # scary if it was doing anything other than just a put().
  @page.FailIfNotAdmin('You must be an admin to view this page.')
  def repeated_get(self):
    pic = models.Picture.gql('WHERE date_sort_index = -1 ORDER BY date ASC, case_insensitive_name DESC').get()
    #pic.date_sort_index = models.DateSortIndex.increment()
    pic.put()
    context = {
      'prev_name': pic.name,
      'next_name': 'Dunno',
      'next_url': '/update_datastore',
    }
    self.RenderTemplate('update_datastore.html', context)

  # HACK: this is hitting the datastore based on a GET request.  This would be
  # scary if it was doing anything other than just a put().
  @page.FailIfNotAdmin('You must be an admin to view this page.')
  def ordered_get(self):
    name = self.request.get('name', None)
    if name is None:
      pic = models.Picture.gql('ORDER BY name DESC').get()
      name = pic.name
    q = models.Picture.gql('WHERE name <= :1 ORDER BY name DESC', name)
    pics = q.fetch(limit=2)
    prev = pics[0]
    if len(pics) == 2:
      next_name = pics[1].name
      next_url = '/update_datastore?name=%s' % urllib.quote(next_name)
    else:
      next_name = 'FINISHED'
      next_url = '/admin'
    #prev.pixel_str = ''.join(str(int(p)) for p in prev.pixels)
    #kill = ['sort_by_date_index', 'test1','version', 'pixels']
    #for k in kill:
    #  if hasattr(prev, k):
    #    delattr(prev, k)
    #prev.date_sort_index = models.DateSortIndex.increment()
    #prev.pixel_str = ''.join(str(int(p)) for p in prev.pixels)
    prev.put()
    context = {
      'prev_name': name,
      'next_name': next_name,
      'next_url': next_url,
    }
    self.RenderTemplate('update_datastore.html', context)


class Delete(page.Page):
  """Delete a picture."""

  @page.FailIfNotAdmin('You must be an admin to delete images.')
  def post(self):
    name = self.request.get('name')
    models.Picture.DeleteByName(name)
    self.redirect('/list')


class Test(webapp.RequestHandler):
  """Testing http://b/issue?id=1082122"""

  def get(self):
    p = self.response.out.write
    p('uri is: [%s]<br>' % self.request.uri)
    p('1st level of unquote: [%s]<br>' % urllib.unquote(self.request.uri))
    p('2nd level of unquote: [%s]<br>' %
      urllib.unquote(urllib.unquote(self.request.uri)))


class Backup(page.Page):
  """Show all the data as JSON so you can back it up."""

  # I want to get this page from cronjobs, so I'm not requiring admin access.
  def get(self):
    pics = models.Picture.gql('ORDER BY date DESC, case_insensitive_name ASC')
    pics = [pic.AsDict() for pic in pics]
    data = simplejson.dumps(pics, indent=2, sort_keys=True)
    self.response.headers['content-type'] = 'text/plain'
    self.response.out.write(data)


class Restore(page.Page):
  """Restore JSON data (from the Backup view)."""

  @page.FailIfNotAdmin('You must be an admin to view this page.')
  def get(self):
    self.RenderTemplate('restore.html', {})

  @page.FailIfNotAdmin('You must be an admin to restore data.')
  def post(self):
    data = self.request.get('backup_file')
    self.RestoreFromJson(data)
    self.redirect('/admin')

  def RestoreFromJson(self, json):
    data = simplejson.loads(json)
    pics = []
    for x in data:
      pic = models.Picture.FromDict(x)
      pic.Validate(True)
      pics.append(pic)

    # Ok, all validated and ready to commit
    for pic in pics:
      pic.put()
