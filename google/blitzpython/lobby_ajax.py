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

import wsgiref.handlers
import os
import urllib
import re
import time

import datetime

import lobby
import gamemodel
import chat
import http

import ajax

import simplejson

from google.appengine.api import users
from google.appengine.ext import db
from google.appengine.ext import webapp


class LobbyHandler(ajax.AjaxHandler):
  """Class implementing REST APIs for accessing the lobby data
  """

  def Get(self, user):
    """ Sends down a list of players and games for the lobby in json format.

        The URL format is:
           GET /lobby/useremail/<opt_msgid>
           
        Fetches a list of games for the passed user.

        If the opt_msgid is present, we return a list of chats that were sent
        after that msgid, otherwise the chat list will be empty

        Response is a Javascript object with 4 attributes:
        {
          'player_list': ["player 1", "player 2"...],  // string array

          'game_list': [
            {
             // See Game.to_dict() for information about the format of
             // each game
            },
            ...more games...
          ],

          'chat_list': {
            'msg_id': 12345,             // The msg_id to pass up on the next
                                         // update
            data: [
              { 'author': "player 1",    // Omitted if this is a system msg
                'data': "blah blah blah"
              },
              ...more chats...
            ]
          }
        }
        
    """
    self.response.headers['Content-Type'] = 'text/javascript'
    # Parse the path into distinct entities
    path_list = self._get_path_list(user)
    if path_list:
      # Get the msgid if any
      msgid = 0
      if len(path_list) == 3:
        try:
          msgid = int(path_list[2])
        except ValueError:
          # Just ignore this and leave msgid as 0
          msgid = 0
            
      # Let the lobby know the user is here
      lobby.in_lobby(user)

      # Build our response and write it out
      response = {}
      response['player_list'] = self.get_player_list()
      response['game_list'] = self.get_game_list(user)
      response['chat_list'] = chat.get_chat("lobby", 50).to_dict(msgid)
      self.response.out.write(simplejson.dumps(response))

  def Delete(self, user):
    """ Removes the passed user from the lobby.
        Format of URL is /lobby/<user email>
    """
    self.response.headers['Content-Type'] = 'text/javascript'
    # Parse the path into distinct entities
    path_list = self._get_path_list(user)
    if path_list:
      lobby.leave_lobby(user)

  def Post(self, user):
    """ Handles posting a chat to the lobby.
        URL format is:
          /lobby_ajax/<email>/chat
    """
    path_list = self._get_path_list(user)
    if path_list:
      command = path_list[2]
      if command == "chat":
        data = self.request.get("chat")
        chat.add_chat("lobby", user, data, 50)
      else:
        self.error(http.HTTP_ERROR)
        self.response.out.write('Invalid request ' + command)

  def _get_path_list(self, user):
    # Parse the path into distinct entities
    path_list = self.request.path.strip('/').split('/')
    if len(path_list) < 2:
      # Invalid query
      self.error(http.HTTP_ERROR)
      self.response.out.write('Invalid request')
    else:
      # user email passed - make sure this is that user
      email = urllib.unquote(path_list[1])
      if (users.IsCurrentUserAdmin() or user.email() == email):
        return path_list
      else:
        self.error(http.HTTP_UNAUTHORIZED)
        self.response.out.write('Permissions error for ' + email)
    return None
    
  def get_player_list(self):
    """ Get a list of strings representing all players in the lobby
    """
    # For brevity's sake, only return the top 50 players
    players = lobby.lobby_list(50)
    return map(lambda obj:obj.player.nickname(), players)


  def get_game_list(self, user):
    """ Get a list of dict objects corresponding to the active games.
        The list includes a max of 50 games that match the following criteria:
        1) status is GAME_STATUS_OPEN
        2) status is GAME_STATUS_INVITED and the user is one of the players
        3) status is GAME_STATUS_ACTIVE and the game is public *or* the user
           is one of the players.

        The list is sorted to have the user's games at the top, followed by
        open games, followed by public games, each section sorted to have
        most recently modified games first
    """
    # First, get all the user's games
    user_games = gamemodel.games_by_user_list(user)
    
    # Now get list of open and active games,  sorted to have the open games 
    # first
    active_games = gamemodel.public_game_list()
    # Filter to just have the ones that don't involve the user so we don't have 
    # duplicates
    active_games = filter(lambda gameObj: gameObj.player1 != user and gameObj.player2 != user, active_games)
    
    # Now render these in dict representation
    return map(lambda gameObj: gameObj.to_dict(user), 
               list(user_games) + list(active_games))
