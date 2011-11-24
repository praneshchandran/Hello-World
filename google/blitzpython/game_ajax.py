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
import os
import random
import re
import sys
import time
import urllib
import wsgiref.handlers

import chat

import simplejson
import ajax
import gamemodel
import http

from google.appengine.api import mail
from google.appengine.api import users
from google.appengine.ext import db
from google.appengine.ext import webapp

class GameHandler(ajax.AjaxHandler):
  """Class implementing REST APIs for manipulating games
     - create game
     - get game state
     - list games for user
     - append game state
  """

  def Get(self, user):
    """Our handler for HTTP GET requests - the options are:
       1) game_ajax/list/<useremail> - fetches a list of games for the passed 
             user in least-recently-modified order (permissions check is done)
       2) game_ajax//move/<id>/<index> - fetches a list of entries for the game 
             matching the passed ID. Also takes an optional index URL parameter,
             in which case we send only entries with an index > t (useful for
             checking for updates)
       3) game_ajax/chat/<id>/<index> - fetches a list of chat entries 
             associated with this game. Takes an optional index param
    """
    # make sure the user is logged in
    self.response.headers['Content-Type'] = 'text/javascript'
    # Parse the path into distinct entities
    path_list = self.request.path.strip('/').split('/')
    if len(path_list) < 2 or len(path_list) > 4:
      # Invalid query
      self.error(http.HTTP_ERROR)
      self.response.out.write('Invalid request')
    elif len(path_list) == 2:
      # user email passed - make sure they have permission to view the list
      email = urllib.unquote(path_list[1])
      if (users.IsCurrentUserAdmin() or user.email() == email):
        game_list = self._get_game_list(user.email())
        # Emit list as array of json entities
        self.response.out.write('[')
        for game in game_list:
          self.emit_game_as_json(game)
        self.response.out.write(']')
      else:
        self.error(http.HTTP_UNAUTHORIZED)
        self.response.out.write('Permissions error for ' + email)
    else:
      # ID passed, look it up
      game = gamemodel.Game.get(path_list[2])
      if game is None:
        self.error(http.HTTP_GONE)
      elif not game.user_can_view(user):
        self.error(http.HTTP_UNAUTHORIZED)
      else:
        if (path_list[1] == "chat"):
          # Get the last 200 chats on this channel
          chatObj = chat.get_chat(str(game.key()), GAME_CHAT_LIMIT)
          # Get the chat data - either starting at the start index, or
          # using what the user passed in
          index = 0
          if len(path_list) > 3:
            index = int(path_list[3])
          if index == 0:
            index = chatObj.index
          self.response.out.write(simplejson.dumps(chatObj.to_dict(index)))
        else:
          # Get the game data
          index = 0
          if len(path_list) > 3:
            index = int(path_list[3])
          result = game.to_dict(user)
          result["num_moves"] = len(game.game_data)
          result["game_data"] = game.game_data[index:]
          self.response.out.write(simplejson.dumps(result))

  def Put(self, user):
    """Our handler for HTTP PUT requests - this creates a new game for the user.

       URL Path is ignored (but must start with /game_ajax)

       Post params include:
         email: <email address of opponent to invite>
         public: true (if anyone is allowed to view this game)
         game_type: <string identifying game type> 

       Response:
         JSON-encoded ID of the newly-created game
    """
    # Pull the params out of the request and set them in the model object

    player1 = users.GetCurrentUser()
    public = False
    if (self.request.get("public") and 
        self.request.get("public").lower() == "true"):
      public = True
    invitee = self.request.get("email")
    status = gamemodel.GAME_STATUS_OPEN
    if invitee:
      status = gamemodel.GAME_STATUS_INVITED
    game_type = self.request.get("game_type")

    # Randomly generate the player's color if it's not supplied
    color = self.request.get("color")
    if color and color != "random":
      color = gamemodel.WHITE if color.lower() == "white" else gamemodel.BLACK
    else:
      color = random.getrandbits(1)

    newGame = gamemodel.Game(player1=player1, public=public, status=status,
                             game_type=game_type, player1_color=color)
    if invitee:
      try:
        # See if we have a google user for this invitee
        newGame.player2 = users.User(invitee)
        if newGame.player2 == newGame.player1:
          self.error(http.HTTP_ERROR)
          self.response.out.write("Cannot invite yourself to a game")
          return
      except UserNotFoundError:
        # This user hasn't signed up for an acct yet - just put them in
        # as an invitee
        newGame.invitee = invitee

    # Init the time remaining
    if game_type == gamemodel.GAME_TYPE_BLITZ_5:
      newGame.player1_time = newGame.player2_time = 5 * 60 * 1000
    elif game_type == gamemodel.GAME_TYPE_BLITZ_10:
      newGame.player1_time = newGame.player2_time = 10 * 60 * 1000

    newGame.put()

    # If it's an invitation to a game, send an email
    if status == gamemodel.GAME_STATUS_INVITED:
      subject = "Blitz invitation from %s" % user.nickname()
      lobby_url = self.request.uri
      lobby_url = lobby_url[:lobby_url.rindex("game_ajax")] + "lobby"
      if newGame.player1_time:
        game_name = "Blitz chess"
      else:
        game_name = "chess"
      invitation = """
%s has invited you to play a game of %s.

Visit %s to play!

- the Blitz chess server
      """ % (user.nickname(), game_name, lobby_url)
      mail.SendMail(GAME_SENDER, invitee, subject, invitation)

    # Return the ID to the user in json format
    self.response.set_status(http.HTTP_CREATED)
    self.response.headers['Content-Type'] = 'text/javascript'
    self.response.out.write('"%s"' % str(newGame.key()))

  def _get_id_from_path(self):
    """ Fetches an ID from the second path element (i.e. expects a URL path
        of the form /game/<id>)
    """
    path_list = self.request.path.strip('/').split('/')
    if len(path_list) < 2:
      return None
    else:
      return path_list[1]

  def Delete(self, user):
    """ Our handler for HTTP DELETE requests - this deletes a user's game.
        URL Path should be:
          /game/<id of game to delete>

        Response:
          HTTP status code appropriate to the request:
          200 if item deleted
          401 if not logged in
          410 if item already deleted
          500 if malformed request
    """
    game_to_delete = self._get_game_to_modify(user)
    if game_to_delete:
      game_to_delete.delete()

  def _get_game_to_modify(self, user):
    """ Makes sure that there's a logged in user, then loads up the game 
        specified in the request does permissions checking to make sure the
        user can modify it
    """
    game_id = self._get_id_from_path()
    if game_id is None:
      # Invalid delete request (malformed path)
      self.error(http.HTTP_ERROR)
      self.response.out.write('Invalid request')
    else:
      game = gamemodel.Game.get(game_id)
      if game is None:
        self.error(http.HTTP_GONE)
      elif not game.user_can_modify(user):
        self.error(http.HTTP_FORBIDDEN)
        self.respone.out.write('cannot modify game')
      else:
        return game
    return None

  def Post(self, user):
    """ Our handler for HTTP POST requests - this posts a user's move to the
        given game. User must be a participant in that game. This attempts to
        be idempotent, so if the same move is posted twice in a row, the second
        post is ignored.
        
        URL Path should be one of:
          /game_ajax/<id of game to join>/join
          (no post params)

          /game_ajax/<id of game to post a move to>/move
            POST params are:
              move: <string data in ICCF format>
                    Special values: 'resign', 'draw' causes a resignation/draw
                    Moves that start with '#' denote a checkmate
              time: updated time
          /game_ajax/<id of game to post a chat to>/chat
            POST params are:
              chat: <string data>

          /game_ajax/<id of game to update time>/time
            POST params are:
              time: milliseconds left for user
            
        Response:
          HTTP errors:
            http.HTTP_FORBIDDEN if you try to join a game that is already full
              or try to move out of turn
            http.HTTP_UNAUTHORIZED if you aren't a participant and try to move
              or chat
            
          JSON-encoded response:
            none
    """
    game_to_modify = self._get_game_to_modify(user)
    if game_to_modify:
      path_list = self.request.path.strip('/').split('/')
      command = path_list[2]
      if command == 'join':
        result = game_to_modify.join(user)
        if not result:
          # Error - game is already full, or closed
          self.error(http.HTTP_FORBIDDEN)
      elif command == 'move':
        # User is posting a move
        move = self.request.get('move')
        timer = self.request.get('time')
        victor = None
        is_resignation = False
        if timer:
          timer = int(timer)
        if move:
          # Handle special endgame move commands 
          if move == 'resign':
            # User resigned
            victor = get_player_number(game_to_modify, user, True)
            is_resignation = True
          elif move == 'draw':
            victor = 0
          elif move[0] == '#':
            # User won by checkmate
            victor = get_player_number(game_to_modify, user, False)

          if not game_to_modify.update(user, move, timer, victor):
            # User tried to move when it was not his turn
            self.error(http.HTTP_FORBIDDEN)
          else:
            # User moved - let's notify the other player if this is an untimed
            # game.
            if game_to_modify.game_type == gamemodel.GAME_TYPE_CHESS:
              if get_player_number(game_to_modify, user, False) == 1:
                notify_email = game_to_modify.player2.email()
              else:
                notify_email = game_to_modify.player1.email()
              self.email_status(game_to_modify, notify_email, user.nickname(),
                                victor, is_resignation)
      elif command == 'time':
        # User is posting a time update
        timer = int(self.request.get('time'))
        game_to_modify.update(user, timer=timer)
      elif command == 'chat':
        # User is posting a chat
        data = self.request.get('chat')
        if data:
          chat.add_chat(str(game_to_modify.key()), user, data, GAME_CHAT_LIMIT)

  def email_status(self, gameObj, email, opponent, victor, is_resignation):
    """ Sends an email to a player that it's their turn, or the game is
        over.
    """
    game_url = self.request.uri
    game_url = (game_url[:game_url.rindex("game_ajax")] + "game/" + 
                str(gameObj.key()))
    subject = "Blitz move notification"
    if victor is None:
      # Just send a blank notification
      notification = """
%s has moved. It now is your turn.

Visit %s to make your next move!

- the Blitz chess server
      """ % (opponent, game_url)
    elif victor == 0:
      notification = """
Your game against %s ended in a draw.

Visit %s to review the game!

- the Blitz chess server
""" % (opponent, game_url)
    elif is_resignation:
      notification = """
%s has resigned - you won!

Visit %s to review the game.

- the Blitz chess server
""" % (opponent, game_url)
    else:
      # Checkmate!
      notification = """
Checkmate! %s has won!

Visit %s to review the game.

- the Blitz chess server
""" % (opponent, game_url)
    mail.SendMail(GAME_SENDER, email, subject, notification)
    
    
def get_player_number(gameObj, user, opponent):
  """ Returns 1 or 2, depending on whether player 1 or player 2 is the user
      Param: user - user to operate on
             opponent - True to return the *other* player's number, else False 
                        to return the user's number
  """
  if user == gameObj.player1:
    player = 1
  else:
    player = 2

  if opponent:
    # Return the other player (3-2=1 and 3-1=2)
    return 3 - player
  else:
    return player


# The number of chat items we keep per game - if we exceed this number, we toss
# the older chats
GAME_CHAT_LIMIT = 200    
GAME_SENDER = "chess.blitz@gmail.com"
