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
import time
import sys

from google.appengine.api import users
from google.appengine.ext import db

class Game(db.Model):
  """ Our DB representation of a game - includes the type of the game, the
      players, public visibility, etc
  """
  # Player 1 is the creator of the game
  player1 = db.UserProperty(required=True)

  # Player 1 color (WHITE or BLACK)
  player1_color = db.IntegerProperty(required=True)

  # The amount of time each player has remaining
  player1_time = db.IntegerProperty()
  player2_time = db.IntegerProperty()

  # If invitee is empty, then this is a publicly joinable game
  # (GAME_STATUS_OPEN). Otherwise, if invitee is non-empty, then this is an
  # invite-only game and only users with that email can join it.
  invitee = db.StringProperty()

  # The person who has joined the game
  player2 = db.UserProperty()

  # If True, anyone can view this game
  public = db.BooleanProperty(default=False)

  # Description of the status of this game. See the GAME_STATUS values
  status = db.IntegerProperty(required=True)

  # The index of the victor (1 = player 1, 2 = player 2, 0 = draw)
  victor = db.IntegerProperty()

  # Various strings are valid: chess, blitz-5, blitz-10
  game_type = db.StringProperty(required=True)
  
  # The data for this game
  game_data = db.StringListProperty()

  # timestamp is updated on create
  created = db.DateTimeProperty(auto_now_add=True)

  # timestamp is updated on every refresh
  last_modified = db.DateTimeProperty(auto_now=True)

  def get_creation_time(self):
    """ Returns the creation time, rendered as a string. We could do timezone
        math, but for now (because it's easy) we'll just emit a time delta
        (e.g. "15 minutes ago")
    """
    elapsed = time.time() - time.mktime(self.created.timetuple())
    return relative_string(elapsed)

  def get_last_modified(self):
    """ Returns the last modification date as a reasonably formatted string """
    elapsed = time.time() - time.mktime(self.last_modified.timetuple())
    return relative_string(elapsed)

  def get_color_as_string(self):
    """ return white/black based on which player the user is """
    color = self.get_user_color(users.GetCurrentUser())
    return "White" if color == WHITE else "Black"

  def get_user_color(self, user):
    """ Return WHITE/BLACk based on the color of player 1, and whether the user
        is player 1 or not
    """
    if (user == self.player1):
      return self.player1_color
    else:
      return BLACK - self.player1_color

  def get_opposing_player(self):
    user = users.GetCurrentUser()
    if user == self.player1:
      return self.player2
    else:
      return self.player1


  def user_can_modify(self, user):
    """ Returns true if the user can modify this game (user is a participant,
        or an invitee, or the game is still open
    """
    return self.user_is_participant(user) or self.status == GAME_STATUS_OPEN

  def user_is_participant(self, user):
    """ Returns true if the user is a participant - i.e. he's either the
        creator, the opponent, or an invitee
    """
    return (user == self.player1 or user == self.player2 or
            (self.status == GAME_STATUS_INVITED and
             user.email() == self.invitee))

  def user_can_view(self, user):
    return self.public or self.user_can_modify(user)

  def to_dict(self, user):
    """ Converts a game object to a dict with the following properties for
        ease of json-ification:
            {'creator': "player 1",    // The nickname for player 1
             'opponent': "player 2",   // Omitted if game is open/joinable
             'creator_color': 0/1      // 0 = white, 1 = black
             'time_limit': 5,          // Currently only 5 or 10 is supported,
                                       //   or omitted if untimed game
             'player1_time': 1234,     // Time bank in msecs, omitted if untimed
             'player2_time': 5678,     // Time bank in msecs, omitted if untimed
             'is_creator' : true       // True if the player is the game creator
                                       //   (e.g. player == player1)
             'is_invitee': true,       // present if user is the invitee and
                                       //   status=GAME_STATUS_INVITED
             'is_participant': true,   // omitted if user not a participant
             'status': 0/1/2/3         // open, invited, active, complete
             'victor': 0/1/2           // draw, player1, player2
             'can_delete' : true,      // true if 'is_participant' and # 
                                       // moves < 2
             'whose_turn' : 0/1        // 0 = white, 1 = black
            }
    """
    result = {}
    result['creator'] = self.player1.nickname()
    result['creator_color'] = self.player1_color
    result['status'] = self.status
    result['key'] = str(self.key())

    # Set the opponent to the appropriate value. We send nothing down if this
    # is an unclaimed open game
    if self.status >= GAME_STATUS_ACTIVE:
      # Game is active or completed
      result['opponent'] = self.player2.nickname()
    elif self.status == GAME_STATUS_INVITED:
      if self.player2:
        result['opponent'] = self.player2.nickname()
      else:
        result['opponent'] = self.invitee

    # Send down the time limit appropriate to the game type
    if self.game_type == GAME_TYPE_BLITZ_5:
      result['time_limit'] = 5
    elif self.game_type == GAME_TYPE_BLITZ_10:
      result['time_limit'] = 10

    # If the user is a participant, send down information about their 
    # permissions and status
    if self.user_is_participant(user):
      result['is_participant'] = True
      result['can_delete'] = len(self.game_data) <= 2
      if user == self.player1:
        result['is_creator'] = True
      elif self.status == GAME_STATUS_INVITED:
        result['is_invitee'] = True

    # If this game has a time limit, send down the time status of each player
    if 'time_limit' in result:
      result['player1_time'] = self.player1_time
      result['player2_time'] = self.player2_time

    if self.status == GAME_STATUS_COMPLETE:
      result['victor'] = self.victor
    else:
      result['whose_turn'] = self.whose_turn()

    return result

  def update(self, user, move=None, timer=None, victor=None):
    """ Adds a move if the user can move.
        Returns true if move was accepted - we have logic to ignore duplicate
        moves, as that can happen sometimes if the server response is lost and
        the client resubmits
    """
    return db.run_in_transaction(txn_update, self.key(), user, move, timer, victor)

  def is_victory(self, user):
    """ Returns True if this game was a victory for the user """
    return ((self.victor == 1 and self.player1 == user) or 
            (self.victor == 2 and self.player2 == user))

  def is_loss(self, user):
    """ Returns True if this game was a loss for the user """
    return ((self.victor == 1 and self.player2 == user) or 
            (self.victor == 2 and self.player1 == user))

  def whose_turn(self):
    """ Returns WHITE (0) or BLACK (1) depending on whose turn it is
    """
    # If there's been 0, 2, 4, 6 moves, it's white's turn, otherwise black
    return len(self.game_data) % 2

  def is_duplicate_move(self, move):
    """ Returns true if the passed move was the last move taken
    """
    return self.game_data and self.game_data[-1] == move

  def set_time_for_user(self, user, timer):
    """ Sets the time remaining for the user """
    if user == self.player1:
      self.player1_time = min(self.player1_time, timer)
    else:
      self.player2_time = min(self.player2_time, timer)

    # Check for expired timer
    if timer <= 0:
      self.status = GAME_STATUS_COMPLETE
      if user == self.player1:
        # Player 1 lost by time
        self.victor = 2
      else:
        # Player 2 lost by time
        self.victor = 1

  def join(self, user):
    # User is joining a game - make sure it's an open game, or the user
    # is the one who was invited
    return db.run_in_transaction(txn_join, self.key(), user)

  def get_outcome_as_string(self):
    # Returns a string saying whether the user won/lost/drew
    user = users.GetCurrentUser()
    if self.is_victory(user):
      return "Won"
    elif self.is_loss(user):
      return "Lost"
    else:
      return "Draw"

def txn_join(key, user):
  """ Adds the user to a game, if he was the invitee """
  gameObj = Game.get(key)
  if not gameObj.invitee or user.email() == gameObj.invitee:
    if gameObj.status != GAME_STATUS_COMPLETE:
      gameObj.player2 = user
      gameObj.status = GAME_STATUS_ACTIVE
      gameObj.put()
      return True
  return False

def txn_update(key, user, move, timer, victor):
  """ Updates a game object within the context of a transaction for 
      atomicity, after checking for validity. Returns True if the data was 
      saved.
  """
  gameObj = Game.get(key)
  if gameObj.status != GAME_STATUS_ACTIVE:
    # Can only modify active games
    return False
  elif gameObj.whose_turn() == gameObj.get_user_color(user):
    # It's our turn, add the move
    if move != None:
      gameObj.game_data.append(move)
    if timer != None:
      gameObj.set_time_for_user(user, timer)
    if victor != None:
      gameObj.victor = victor
      gameObj.status = GAME_STATUS_COMPLETE
    gameObj.put()
    return True
  elif move:
    # Not our turn, but don't return an error if it's a duplicate of the last 
    # one (it just means the client sent it twice due to a network hiccup)
    return gameObj.is_duplicate_move(move)
  else:
    return False


# The color of player 1's pieces
WHITE = 0
BLACK = 1  

# An open game (anyone can join)
GAME_STATUS_OPEN = 0

# A game with a specific invitee - the invite has been issued, but not accepted
# yet
GAME_STATUS_INVITED = 1

# The game is in progress
GAME_STATUS_ACTIVE = 2

# The game is over
GAME_STATUS_COMPLETE = 3

GAME_TYPE_CHESS = "chess"
GAME_TYPE_BLITZ_5 = "blitz-5"
GAME_TYPE_BLITZ_10 = "blitz-10"

def public_game_list():
  """ Returns a list of open and public active games
  """
  games = Game.gql("WHERE status = :status" 
                   " ORDER BY last_modified DESC LIMIT 25",
                   status=GAME_STATUS_OPEN)
  
  games2 = Game.gql("WHERE status = :status AND public=:public"
                    " ORDER BY last_modified DESC LIMIT 25",
                    status=GAME_STATUS_ACTIVE, public=True)
  return filter(filter_expired_games, list(games) + list(games2))

  
def games_by_user_list(user):
  """ Returns a list of non-completed games that involve this user. Have to do
      two separate queries, since we can't query either player1 OR player2
  """
  games = Game.gql("WHERE player1 = :user AND status < :status",
                    user=user, status=GAME_STATUS_COMPLETE)
  games2 = Game.gql("WHERE player2 = :user AND status < :status",
                    user=user, status=GAME_STATUS_COMPLETE)
  result = filter(filter_expired_games, list(games) + list(games2))
  result.sort(key=lambda obj:obj.last_modified, reverse=True)
  return result
  
def completed_games_list(user):
  """ Returns a list of finished games that involve this user """
  games = Game.gql("WHERE player1 = :user AND status = :status"
                   " ORDER BY last_modified DESC", 
                    user=user, status=GAME_STATUS_COMPLETE)
  games2 = Game.gql("WHERE player2 = :user AND status = :status"
                    " ORDER BY last_modified DESC", 
                    user=user, status=GAME_STATUS_COMPLETE)
  result = list(games) + list(games2)
  result.sort(key=lambda obj:obj.last_modified, reverse=True)
  return result

def relative_string(elapsed):
  """ Takes a time delta and expresses it as a relative string """
  if elapsed < 2 * 60:
    result = "1 minute ago"
  elif elapsed < 60*60:
    result = "%d minutes ago" % (elapsed/60)
  elif elapsed < 2 * 60 * 60:
    result = "1 hour ago"
  elif elapsed < 24 * 60 * 60:
    result = "%d hours ago" % (elapsed/(60*60))
  elif elapsed < 48 * 60 * 60:
    result = "1 day ago"
  else:
    result = "%d days ago" % (elapsed/(24 * 60 * 60))
  return result

# Timed games expire after the user's timer has run out + 2 minutes
TIMED_GAME_BUFFER = 60*2

# Abandoned games (games with no moves) get deleted after a week
ABANDONED_GAME_DURATION = 60 * 24 * 7

# Open timed games expire after 15 minutes
OPEN_GAME_EXPIRATION = 60 * 15

# After 4 moves, abandoned games count as a loss
MAX_MOVES_FOR_DELETION = 4

def filter_expired_games(gameObj):
  """ Checks the date of the game - if it is expired, deletes it and returns
      false.
  """
  elapsed = time.time() - time.mktime(gameObj.last_modified.timetuple())
  # Games with no moves expire after a week
  if ((not gameObj.game_data or (len(gameObj.game_data) == 0)) and
      (elapsed >= ABANDONED_GAME_DURATION)):
    gameObj.delete()
    return False
    
  # Untimed games don't expire currently
  if gameObj.game_type == GAME_TYPE_CHESS:
    return True
  
  # OK, we're a timed game. If we're an open game (nobody has joined yet) we
  # expire after 15 minutes. 
  if gameObj.status == GAME_STATUS_OPEN: 
    if elapsed > OPEN_GAME_EXPIRATION:
      gameObj.delete()
      return False
    else:
      return True
  
  # OK, there are moves in this game. Calculate whose turn it is, how long since
  # their last move, and whether the game should be over or not. This is 
  # slightly dangerous since games could be prematurely ended if the times on
  # the servers are out of sync, so we give the user a couple of minutes of
  # leeway before terminating it.
  if gameObj.whose_turn() == gameObj.player1_color:
    remaining = gameObj.player1_time
  else:
    remaining = gameObj.player2_time
  if elapsed < (remaining/1000 + TIMED_GAME_BUFFER):
    # Game hasn't expired yet
    return True

  # OK, this game is expiring - if the game only has a few moves, we'll just
  # delete it. Otherwise, we'll force a timeout for the player who abandoned
  # it.
  if gameObj.game_data and (len(gameObj.game_data) > MAX_MOVES_FOR_DELETION):
    turn = gameObj.whose_turn()
    if turn == gameObj.player1_color:
      # player 1 must lose
      loser = gameObj.player1
    else:
      loser = gameObj.player2
    # Set the time as expired for the poor loser
    gameObj.update(loser, timer=0)
  else:
    gameObj.delete()
  return False
