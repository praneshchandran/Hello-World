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
#
import datetime

from google.appengine.api import users
from google.appengine.ext import webapp

class AjaxHandler(webapp.RequestHandler):
  """Class implementing helper functions for ajax request handlers
  """
  def _ensure_logged_in(self):
    """ Makes sure the user is logged in, and returns the current user.
        If not logged in, sets an appropriate error status in the response, 
        and returns None
    """
    user = users.GetCurrentUser()
    if user is None:
      self.error(http.HTTP_UNAUTHORIZED)
      self.response.out.write('Must be logged in')      
    return user

  def get(self):
    user = self._ensure_logged_in()
    if user:
      self.Get(user)
      
  def put(self):
    user = self._ensure_logged_in()
    if user:
      self.Put(user)

  def post(self):
    user = self._ensure_logged_in()
    if user:
      self.Post(user)

  def delete(self):
    user = self._ensure_logged_in()
    if user:
      self.Delete(user)


