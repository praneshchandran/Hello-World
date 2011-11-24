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

"""Base Page class used by the views."""

import calendar
import datetime
#import logging
import os
import rfc822

from google.appengine.api import users
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template

import clock
import models


def ForceLogin(func):
  """Decorator for get/post: If the user isn't logged in, take them to the
  login page.  Otherwise do normal processing.
  """
  def Wrapped(self, *arg, **kwarg):
    if users.GetCurrentUser() is None:
      self.redirect(users.CreateLoginURL(self.request.uri))
    else:
      # If the user came back to this page after logout, they'd get an error,
      # so send them somewhere else.
      self.after_logout_url = '/list'
      return func(self, *arg, **kwarg)
  return Wrapped


def FailIfNotAdmin(error_message):
  """Decorator for get/post: If the user isn't an admin, give them an error
  message.  Otherwise do normal processing.
  """
  def Decorator(func):
    def Wrapped(self, *arg, **kwarg):
      if not users.IsCurrentUserAdmin():
        self.RenderError(error_message)
      else:
        # If the user came back to this page after logout, they'd get an error,
        # so send them somewhere else.
        self.after_logout_url = '/list'
        return func(self, *arg, **kwarg)
    return Wrapped
  return Decorator


class Page(webapp.RequestHandler):
  """Base class for all other pages."""

  TEMPLATE_PATH = 'templates'

  def __init__(self):
    super(Page, self).__init__()
    self.errors = []  # RenderTemplate() will show these errors to the user.
    # User will go here after logout.  If None, will default to request.uri.
    self.after_logout_url = None

  def RenderError(self, error_message, status_code=None):
    """Render a stark error message."""
    if status_code is not None:
      self.error(status_code)
    values = {'error_message': error_message}
    self.RenderTemplate('error.html', values)

  def RenderTemplate(self, template_filename, template_values):
    """Render a template.  Takes care of some of the boilerplate (like getting
    the user, login links, showing error messages, etc.) for you."""
    path = os.path.join(self.TEMPLATE_PATH, template_filename)
    if not self.after_logout_url:
      self.after_logout_url = self.request.uri
    common_values = dict(
        user=users.GetCurrentUser(),
        user_is_admin=users.IsCurrentUserAdmin(),
        logout_url=users.CreateLogoutURL(self.after_logout_url),
        login_url=users.CreateLoginURL(self.request.uri),
        errors=self.errors,
        elapsed_time=clock.Elapsed()
        )
    common_values.update(template_values)
    self.response.out.write(template.render(path, common_values))

  def Checked(self, name):
    """Check if a checkbox was checked."""
    return bool(self.request.get(name))

  def FormatDate(self, datetime_obj):
    """Format a datetime obj for HTTP headeres."""
    date = rfc822.formatdate(calendar.timegm(datetime_obj.timetuple()))
    return date

  def SetCache(self, max_age):
    """Set cache-related headers."""
    self.response.headers['cache-control'] = 'max-age=%s, public' % max_age
    expires = (datetime.datetime.utcnow() + datetime.timedelta(seconds=max_age))
    self.response.headers['expires'] = self.FormatDate(expires)
