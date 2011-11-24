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

class Chat(db.Model):
  """ Our DB representation of a chat stream - basically just a long list of
      timestamped strings.
  """

  # The index of the first chat item in our list
  index = db.IntegerProperty(default=1)

  # The name of the chat (used to look up a specific chat, for example the
  # lobby chat.
  name = db.StringProperty()

  # The list of chat strings the format of each string is:
  #   nickname\ndata
  data = db.StringListProperty()

  # The maximum number of items we allow in the list (if None, then there's no
  # limit)
  limit = db.IntegerProperty()

  def get_chat_list(self, index):
    """ Gets all chats that are newer than the passed msgid. Since the
        clients all poll fairly rapidly, this should never return more than
        a few items """
    if index <= self.index:
      return self.data
    else:
      return self.data[index-self.index: ]

  def to_dict(self, msgid):
    """ Given a msgid, returns all chats that have happened since this
        msgid in dict format.
        Return: dict object in this format:
          'msg_id': 12345,             // The msg_id to pass up on the next
                                       // update
          'data': [
            { 'author': "player 1",    // Omitted if this is a system msg
              'data': "blah blah blah"
            },
            ...more chats...
          ]
      
    """
    result = {}
    result['msg_id'] = self.index + len(self.data)
    chat_result = []
    if msgid:
      chats = self.get_chat_list(msgid)
      for chat_item in chats:
        dict = {}
        chat_split = chat_item.split("\n")
        dict['author'] = chat_split[0]
        dict['data'] = chat_split[1]
        chat_result.append(dict)
    result['data'] = chat_result
    return result
    

def add_chat(name, user, data, limit):
  """ Adds a chat entry to this chat stream, using a transaction to ensure
      atomicity.
  """
  chat = get_chat(name, limit)
  db.run_in_transaction(txn_add_chat, chat.key(), user, data)

def txn_add_chat(key, user, data):
  """ Called within a transaction - adds data to the chat stream
  """
  chat = Chat.get(key)
  chat.data.append(user.nickname() + "\n" + data)
  # Toss out the oldest values if we've exceeded our limit
  if chat.limit and len(chat.data) > chat.limit:
    num_items_to_toss = len(chat.data) - chat.limit
    chat.index += num_items_to_toss
    chat.data = chat.data[num_items_to_toss:]
  chat.put()
    

def get_chat(name, limit):
  """ Gets a chat with the passed name, or creates one with the passed limit
      if none exists yet
  """
  return db.run_in_transaction(txn_get_chat, name, limit)

def txn_get_chat(name, limit):
  """ Implementation of get_chat() that runs in a transaction
  """
  chat = Chat.get(db.Key.from_path('Chat', name))
  if not chat:
    # Need to create one
    chat = Chat(key_name=name, name=name, limit=limit)
    chat.put()
  return chat

