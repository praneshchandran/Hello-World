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

from google.appengine.api import users
from google.appengine.ext import db

import datetime


class Lobby(db.Model):
  """ Our DB representation of the lobby - basically just a list of players
  """
  # player is a reference to an individual user in the lobby
  player = db.UserProperty(required=True)
  
  # The timestamp that the user entered the lobby
  entered = db.DateTimeProperty(auto_now_add=True)

  # The timestamp updated on every ping from the user's browser. We use this
  # to detect when a user has left the lobby (when it's older than about 30
  # seconds)
  last_update = db.DateTimeProperty(auto_now=True)

# How long it takes for us to decide a user has left the lobby
EXPIRATION_TIME = datetime.timedelta(seconds=60)

def in_lobby(user):
  """ The user is in the lobby, so update the data store """
  get_lobby_for_user(user)

def get_lobby_for_user(user):
  """ Find a non-expired lobby for this user, or create a new one """
  entries = get_lobby_entries_for_user(user)
  expires = get_expiration_time()
  for entry in entries:
    if (entry.last_update > expires):
      # We've found an entry - update the time and return it
      entry.put()
      return entry
    else:
      # Entry is out of date - delete it
      entry.delete()

  # Have to create an entry - this has a minor race condition where the
  # user could enter the lobby simultaneously from different browsers,
  # but it's not worth the trouble to avoid (at worst, people will see
  # two entries for the user in the lobby)
  result = Lobby(player = user)
  result.put()
  return result

def leave_lobby(user):
  """ Called when a user has left the lobby - cleans up any lobby entries
      (there should never be more than one).
  """
  entries = get_lobby_entries_for_user(user)
  for entry in entries:
    entry.delete()

def get_lobby_entries_for_user(user):
  return Lobby.gql("WHERE player = :1", user)

def get_expiration_time():
  return datetime.datetime.now() - EXPIRATION_TIME

def lobby_list(limit):
  """ Gets a list of users in this lobby """
  expires = get_expiration_time()
  entries = Lobby.gql("WHERE last_update > :time LIMIT %d" % limit, 
                      time=expires)
  return entries

  
