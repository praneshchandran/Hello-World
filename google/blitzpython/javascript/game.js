/*
Copyright 2007 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/**
 * Javascript code specific to the game page.
 *
 * The game page is fairly complex, with a number of different, asynchronously
 * updating elements, controlled by a few different state variables.
 *
 * The Board:
 *
 * The board is basically an array of piece data. When we get a refresh from the
 * server, we calculate the new board state by starting with a fresh board and
 * applying the list of moves.
 *
 * The board is rendered as a series of divs, which are given class names to
 * cause them to render themselves appropriately based on the associated piece.
 * Every square on the board has its own DIV, and we intercept clicks on these
 * DIVs to process move input from the user. Input is ignored unless
 * canMove=true, which is set based on the game state (whose turn is it, has
 * the user already made his move, is the game over already?)
 *
 * Chat:
 *
 * The chat pane is only visible if the user is a participant in the game. It
 * has its own timer which fires off every 5 seconds.
 *
 * Game updates:
 *
 * We periodically poll the server for game status updates when it is not the
 * user's turn. For an untimed game, we update every 60 seconds, as a timely
 * update is not as important. For a timed game, we update every 3 seconds.
 *
 * Additionally, for timed games, we send an update to the server every 3
 * seconds when it is the user's turn, so the other player's display can be
 * updated with the current elapsed time.
 *
 * Endgame
 *
 * The game ends in checkmate, if a user resigns, or if one side runs out of
 * time. When one of these states are reached, we notify the server. For
 * the fast user feedback, we track things like elapsed time, resignation and
 * checkmate on the client, but in a production system we would want to
 * double-check these on the server to avoid cheating (for example, a client
 * failing to report running out of time, or incorrectly declaring checkmate)
 */
$(document).ready(function() {

    // Start refreshing the page as soon as we are loaded
    game.refreshBoard();

    // Corner-ify items
    $('.timeDisplay').corner({autoPad:true, validTags:["div"]});
    $('.waitingForOpponent').corner({autoPad:true, validTags:["div"]});
    $('.yourTurn').corner({autoPad:true, validTags:["div"]});

    // TODO: Set onbeforeunload() handler to catch when user navigates away
    // so we can warn the user first if he has a game in progress
});

var game = {
  // The constants that match each piece color
  WHITE: 0,
  BLACK: 1,

  // The constants that match the game states (active/complete)
  ACTIVE:2,
  COMPLETE:3,

  // The index of the last chat item we have displayed - this is updated
  // as chats are sent from the server.
  chatId: 0,

  // Set to true once we've initialized the chat area
  chatInitialized: false,

  // The list of moves that were sent from the server
  moveList: [],

  // The total time limit for this game (5 = 5 mins, 10 = 10 mins,
  // null = untimed)
  timeLimit: null,

  // How much time is left for each player
  whiteTime: null,
  blackTime: null,

  // How often we redraw the timers, in milliseconds
  TIMER_UPDATE_INTERVAL: 200,

  // Whose turn it is (WHITE = 0, BLACK = 1) or null if the game is over
  whoseTurn: null,

  // The color of the currently logged in user (WHITE=0, BLACK=1, or null if
  // the user is a spectator (not a participant)
  color: null,

  // The status of the game (active or complete)
  status: null,

  // The victor (if status == COMPLETE, then 0=draw, 1 = creator won, 2 =
  // opponent won)
  victor: null,

  // If true, the user can make a move (it's his turn, and he hasn't made his
  // move yet)
  canMove: false,

  // The timestamp of when the user started his move, otherwise null (if it's
  // not his move or he isn't a participant)
  moveStart: null,

  // The timer we use to trigger an update from the server for the game state
  refreshGameTimer: null,

  // The timer we use to trigger an update of the chat window
  refreshChatTimer: null,

  // This is a hack - when the user does a pawn promotion, we need to save
  // off the pending move to give him a chance to select what piece he wants
  // before sending it to the server, so we put it here.
  pendingMove: null,

  refreshBoard: function() {
    // hit the ajax handler to load our game data
    var options = {
      url: "/game_ajax/move/" + game.gameKey + "/" + game.moveList.length,
      dataType: "json",
      // Avoid caching of HTTP GETs by appending a random param
      data: {z: new Date().getTime()},
      error: blitz.retryOnFail,
      success: game.updateGameDisplay
    };
    $.ajax(options);
  },

  // Handle a game update from the server - update our game state, then
  // update the ui.
  updateGameDisplay: function(data) {
    $(".busy").hide();
    game.moveList = game.moveList.concat(data.game_data);
    game.status = data.status;
    game.victor = data.victor;
    game.creator_color = data.creator_color;

    // Figure out what color the player is, based on the "is_creator" flag
    // and the creator_color value.
    if (data.is_participant) {
      game.color = data.is_creator ? data.creator_color : 1 - data.creator_color;
    }

    // Calculate whose turn it is based on how many moves there have been
    // (if 0, 2, 4, then it's white's turn, otherwise black).
    if (game.status == game.ACTIVE) {
      game.whoseTurn = (game.moveList.length % 2);
    } else {
      delete game.whoseTurn;
    }

    // Update our time variables
    game.whiteTime = data.creator_color == game.WHITE ?
      data.player1_time : data.player2_time
    game.blackTime = data.creator_color == game.BLACK ?
      data.player1_time : data.player2_time
    game.timeLimit = data.time_limit;

    // Get the player names
    game.whiteName = data.creator_color == game.WHITE ?
      data.creator : data.opponent;
    game.blackName = data.creator_color == game.BLACK ?
      data.creator : data.opponent;

    // Only participants get to see the chat
    if (data.is_participant) {
      game.initChat();
    }

    // Update the board with the latest moves
    game.updateBoard();

    // Update the header with time elapsed, etc - also refreshes our internal
    // variables
    game.updateHeader();

    // If it's still not our turn, kick off the refresh timer to check for
    // updates from the server
    if (game.status == game.ACTIVE) {
      if (game.canMove) {
        // It's the user's turn - if there's a time limit, we should set a
        // timer to update the server periodically with the updated time.
        if (game.timeLimit) {
          game.refreshGameTimer =
            window.setTimeout(game.sendTimeToServer, 5*1000);
        }
      } else {
        // If the user is playing blitz, then check every 3 secs to keep the
        // game moving along quickly. Otherwise, check at a leisurely
        // once-per-minute pace.
        var refreshInterval = game.timeLimit ? 3*1000 : 60 * 1000;
        game.refreshGameTimer =
            window.setTimeout(game.refreshBoard, refreshInterval);
      }
    }

    if (game.color != null && game.whoseTurn == game.color) {
      if (game.getLastMove() == 'offerDraw') {
        // The opponent is offering us a draw
        blitz.initAndDisplayDialog("#acceptDrawDialog");
      } else if (game.getLastMove() == 'reject') {
        blitz.initAndDisplayDialog("#drawRefusedDialog");
      }
    }
  },



  // returns the last move that was sent
  getLastMove: function() {
    if (game.moveList.length == 0) {
      return "";
    } else {
      return game.moveList[game.moveList.length-1];
    }
  },

  // Renders the board based on the latest move list
  updateBoard: function() {
    // Figure out our current board situation (caps = white)
    // (first char is lower left corner of board)
    game.chess = new Chess();
    game.applyMoveList(game.moveList);
    game.renderBoard();

  },

  // Applies a set of moves to the board
  applyMoveList: function(moveList) {
    // Walk the list, ignoring entries that are things like offered draws.
    jQuery.each(moveList, function(index, move) {
      if (move.charAt(0) == '#' ||
          (move.charAt(0) >= '0' && move.charAt(0) <= '9')) {
        game.chess.addMove(move);
      }
    });
  },

  renderBoard: function() {
    // Remove all pieces
    $(".gameBoard .piece").remove();

    // Map of piece indicators (see definition of "defaultBoard" above) to
    // CSS classes of template pieces for us to clone
    var pieceMap = {
      'P': '.pawn',
      'p': '.pawn_black',
      'R': '.rook',
      'r': '.rook_black',
      'N': '.knight',
      'n': '.knight_black',
      'B': '.bishop',
      'b': '.bishop_black',
      'Q': '.queen',
      'q': '.queen_black',
      'K': '.king',
      'k': '.king_black',
      '.': '.blank'
    };
    var board = game.chess.getBoard();
    var check = game.chess.inCheck(game.chess.whoseTurn());
    var lastMove = game.chess.getLastMove();

    // Walk our game board and place pieces appropriately
    for (var i = 0 ; i < board.length ; i++) {
      var highlightStyle = "";
      if (check && (i == check.from || i == check.to)) {
        highlightStyle += " inCheck";
      } else if (lastMove && (i == lastMove.from || i == lastMove.to)) {
        highlightStyle += " lastMove";
      }

      var id = pieceMap[board[i]];
      if (id) {
        // We need to render a piece - convert from an array index into
        // 0-based x/y coords (where 0,0 is the lower left corner of the board)
        var x = i % 8;
        var y = Math.floor(i / 8);
        // Track the real (uninverted) position so when we move we know what
        // position to record. Positions are in ICCF format (11 is the lower
        // left corner, 18 is the upper left, 88 is the upper right)
        var pos = {pos: ""+(x+1)+(y+1)};
        if (game.color == game.BLACK) {
          // Rotate board 180 degrees (draw black at the bottom) if inverted
          y = 7-y;
          x = 7-x;
        }

        // We have a bunch of class names (x0-x7 and y0-y7) to match each of
        // the X/Y coords, which position the piece appropriately
        var posClass = {posClass: "x"+x + " y"+y};

        // We use a different image set for IE6 (as it doesn't support the alpha
        // channel on PNG files) - detect IE6 and set the appropriate class.
        // This is kind of a moot point as we don't really support IE6 anyway.
        var isIe6 = jQuery.browser.msie &&
            (parseFloat(jQuery.browser.version) < 7);
        var ie6Class = isIe6 ? "ie " : "";

        // Clone our template piece, adding the appropriate class name to
        // it to force the position, and setting a "pos" and "posClass"
        // attribute which we use to track the class and "real" position for
        // use when moving items around in handleClick()
        $(".templates " + id).clone()
          .addClass(posClass.posClass + highlightStyle + ie6Class)
          .attr(pos)
          .attr(posClass)
          .appendTo(".gameBoard");
      }
    }

    // Let's render the captured state too (TODO)

    // Make the pieces clickable (the click handler decides whether to ignore
    // clicks or not)
    $(".gameBoard .piece").click(game.handleClick);
  },

  handleClick: function() {
    // Our click handler - ignore clicks if we can't move
    if (game.canMove) {
      var colorClass = game.color == game.WHITE ? "white" : "black";
      if ($(this).hasClass("selected")) {
        // Remove selection if we click on the same piece twice
        $(this).removeClass("selected");
      } else if ($(this).hasClass(colorClass)) {
        // If this is one of our own pieces, move selection here
        $(".piece").removeClass("selected");
        $(this).addClass("selected");
      } else if ($(".selected").size() > 0) {
        // There is a selection, and we are moving to either a blank row or
        // an opponent's piece, so see if the move is valid
        var oldPos = $(".selected").attr("pos");
        var newPos = $(this).attr("pos");
        if (!game.chess.validMove(oldPos + "-" + newPos)) {
          // Flash this as invalid for 1/4 second
          $(this).addClass("invalidMove");
          window.setTimeout(game.removeInvalid, 250);
          return;
        }

        //
        // Move is valid, so move the piece there by swapping out the
        // position CSS classes
        var oldClass = $(".selected").attr("posClass");
        var newClass = $(this).attr("posClass");
        var piece = game.chess.getPiece(Chess.toIndex(oldPos));
        if (piece.toLowerCase() == 'p') {
          // Moving a pawn - are we moving it to the promote row?
          if (newPos.charAt(1) == '1' || newPos.charAt(1) == '8') {
            blitz.initAndDisplayDialog('#promoteDialog');
            // Save the pending move for when the user returns
            game.pendingMove = oldPos + "-" + newPos;
            return;
          }
        }
        $(this).remove();
        $(".selected").removeClass(oldClass).addClass(newClass);
        // OK, we've moved, and we can't move again until we get an update
        game.sendMoveToServer(oldPos + "-" + newPos);
      }
    }
  },

  // Called via a timer to remove the "invalid move" highlight
  removeInvalid: function() {
    $('.invalidMove').removeClass("invalidMove");
  },

  doPromote: function() {
    var result = $("input[@name=promote]:checked").val();
    $.modal.close();
    game.sendMoveToServer(game.pendingMove + "-" + result);
  },

  // Tell the server about our latest move
  sendMoveToServer: function(move) {
    // We're sending a move to the server, so our turn is over
    game.canMove = false;
    var data = {};
    if (move) {
      if (move.charAt(0) >='0' && move.charAt(0) <= '9') {
        // It's a real move - let's see if it's a checkmate
        game.chess.addMove(move);
        // If it's a checkmate, mark it so
        if (game.chess.checkmate(1-game.color)) {
          move = '#' + move;
        }
      }
      data.move = move;
    }

    // Send up a time update
    if (game.timeLimit && game.moveStart) {
      if (game.color == game.WHITE) {
        game.whiteTime -= game.elapsedTime();
        data.time = game.whiteTime;
      } else {
        game.blackTime -= game.elapsedTime();
        data.time = game.blackTime;
      }
      data.time = Math.max(data.time, 0);
      // Blow away the elapsed time
      delete game.moveStart;
    }

    // We're sending our move to the server - stop updating the board. When
    // this comes back, we'll refresh the board which will kick off a new
    // timer.
    window.clearTimeout(game.refreshGameTimer);
    delete game.refreshGameTimer;
    $(".busy").show();
    options = {
      url: "/game_ajax/" + game.gameKey + (move ? "/move" : "/time"),
      data: data,
      type: "POST",
      error: game.refreshBoard,
      success: game.refreshBoard
    };
    $.ajax(options);
  },

  // Update our timestamp on the server - this is called by a timer periodically
  sendTimeToServer: function() {
    if (game.color == game.WHITE) {
      var time = Math.max(0, game.whiteTime - game.elapsedTime());
    } else {
      var time = Math.max(0, game.blackTime - game.elapsedTime());
    }

    options = {
      url: "/game_ajax/" + game.gameKey + "/time",
      data: {time: time},
      type: "POST"
      // Ignore errors and success - this is just a non-critical attempt to
      // keep the server in-sync
    };
    $.ajax(options);

    // Fire off the next timer
    game.refreshGameTimer = window.setTimeout(game.sendTimeToServer, 5*1000);
  },

  updateHeader: function() {
    // Updates the header display when changes happen (game ends, etc)
    game.updateStatusDisplay();

    // Figure out if we can move
    if (game.color != null && game.status == game.ACTIVE) {
      if (game.whoseTurn == game.color) {
        // This is this user's turn - tell them
        if (!game.canMove) {
          // It's now our turn (it wasn't before) so start the timer
          game.canMove = true;
          // Mark what time our move started
          game.moveStart = new Date().getTime();
        }
      } else {
        // Not our turn - stop tracking our start time (checked below in
        // updateTime())
        delete game.moveStart;
      }
    } else {
      game.canMove = false;
    }

    // Render the header - this involves updating the timer (if necessary)
    // and making sure the colors are in the right places
    if (game.color == game.BLACK) {
      // We're drawing the black pieces at the bottom, so make sure it's there
      // already, otherwise we have to swap.
      $('.statusTop .blackHeader')
          .replaceWith($('.statusBottom .whiteHeader'))
          .appendTo('.statusBottom');
    }

    $('#whitePlayer').text(game.whiteName);
    $('#blackPlayer').text(game.blackName);

    $('.title').hide();
    $('.statusTop').show();
    $('.statusBottom').show();

    if (game.timeLimit) {
      game.updateTime();
    }
  },

  updateStatusDisplay: function() {
    // Update the various turn indicators
    if (game.status != game.ACTIVE) {
        // Game is over, hide everything, show end game display
      $('#blackIndicator').hide();
      $('#whiteIndicator').hide();
      $('.yourTurn').hide();
      $('.waitingForOpponent').hide();

      // Figure out why the game ended - either through resignation, a draw,
      // a timeout, or checkmate
      if (game.victor == 0) {
        var result = "Game ended in a draw";
      } else {
        if (game.victor == 1) {
          var winningColor = game.creator_color;
        } else {
          var winningColor = 1-game.creator_color;
        }

        if (game.color != null) {
          // Participant is viewing
          var result = (winningColor == game.color) ?
            "You win!" : "You lost!"
        } else {
          // Spectator is viewing
          var result = (winningColor == game.WHITE) ?
              "White wins!" : "Black wins!";
        }

        if (game.getLastMove() == "resign") {
          result += " (" +
            (winningColor == game.WHITE ? "black" : "white") +
            " resigned)";
        } else if (game.timeLimit &&
                   (game.whiteTime == 0 || game.blackTime == 0)) {
          result += " (time expired)";
        }
      }
      $('.gameOver').text(result);
      $('.gameOver').corner({autoPad:true, validTags:["div"]});
      $('.gameOver').show();

    } else {
      if (game.whoseTurn == game.WHITE) {
        $('#blackIndicator').hide();
        $('#whiteIndicator').show();
      } else {
        $('#blackIndicator').show();
        $('#whiteIndicator').hide();
      }
      if (game.color != null) {
        if (game.whoseTurn != game.color) {
          $('.waitingForOpponent').show();
          $('.yourTurn').hide();
        } else {
          $('.waitingForOpponent').hide();
          $('.yourTurn').show();
        }
      }
    }
  },

  elapsedTime: function() {
    // Returns the elapsed time from the start of the player's move
    return new Date().getTime() - game.moveStart;
  },

  updateTime: function() {
    // Updates the time display - calculate the time, and if it's the user's
    // turn to move then also incorporate the time delta
    var whiteTime = game.whiteTime;
    var blackTime = game.blackTime;
    if (game.moveStart) {
      if (game.color == game.WHITE) {
        whiteTime -= game.elapsedTime();
      } else if (game.color == game.BLACK) {
        blackTime -= game.elapsedTime();
      }

      if (whiteTime < 0 || blackTime < 0) {
        game.outOfTime();
      }
    }
    game.setTime('#whiteTime', Math.max(whiteTime, 0));
    game.setTime('#blackTime', Math.max(blackTime, 0));

    if (game.moveStart) {
      // Only need to update the time again if the user has a move timer
      timeDisplayTimer = window.setTimeout(game.updateTime,
                                           game.TIMER_UPDATE_INTERVAL);
    }
  },

  outOfTime: function() {
    // Called when the user runs out of time
    // Disable any moves, and send the time update to the server
    game.sendMoveToServer();

    // Just wait for the response to come back - this will automatically cause
    // the end game to be reflected on the screen
  },

  resign: function() {
    game.sendMoveToServer("resign");
  },

  setTime: function(element, timeRemaining) {
    // Format the time remaining in MM:SS format (or, conversely, in SS.T)
    // format where T = tenths of seconds)
    if (timeRemaining >= 60*1000) {
      // > 1 minute
      var minutes = Math.floor(timeRemaining/60000);
      var seconds = Math.floor(timeRemaining/1000) % 60;
      var timeStr = "" + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
    } else {
      var tenths = Math.floor(timeRemaining/100);
      var timeStr = "" + Math.floor(tenths/10) + "." + (tenths % 10);
    }
    $(element).text(timeStr);
    $(".timeDisplay").show();
    if (timeRemaining < 30000) {
      // Highlight the time if there's < 30 secs
      $(element).addClass("critical")
    }
  },

  resignGame: function() {
    if (game.canMove) {
      if (confirm("Are you sure you want to resign?")) {
        // Make sure the user can still move - events may have been processed
        // while we were blocked on the dialog
        if (game.canMove) {
          game.sendMoveToServer("resign");
        }
      }
    }
  },

  offerDraw: function() {
    if (game.canMove) {
      if (confirm("Are you sure you want to offer to end this game in a draw?")) {
        // Make sure the user can still move - events may have been processed
        // while we were blocked on the dialog
        if (game.canMove) {
          game.sendMoveToServer('offerDraw');
        }
      }
    }
  },

  acceptDraw: function() {
    if (game.canMove) {
      game.sendMoveToServer('draw')
    }
    $.modal.close();
  },

  rejectDraw: function() {
    if (game.canMove) {
      game.sendMoveToServer('reject')
    }
    $.modal.close();
  },

  //----------------------------------------
  // Chat handling code
  initChat: function() {
    if (!game.chatInitialized) {
      game.chatInitialized = true;

      // Make sure chat is visible
      $('.chatGroup').show();

      // Initialize the chat text input to send contents when enter pressed
      $("#chatInput").keypress(function(e) {
          if (e.keyCode == 13) {
            game.sendChat();
          }
        });

      // Kick off the chat timer/refresh
      game.refreshChat();
    }
  },

  forceRefreshChat: function() {
    if (game.refreshChatTimer) {
      // If a timer exists, then force a refresh (if a timer exists, it means
      // that there isn't a refresh in process)
      game.refreshChat();
    }
  },

  refreshChat: function() {
    // Stop any existing timer (so if we're called from forceRefreshChat() we
    // won't get dual timers running
    if (game.refreshChatTimer) {
      window.clearTimeout(game.refreshChatTimer);
      delete game.refreshChatTimer;
    }

    var options = {
      url: "/game_ajax/chat/" + game.gameKey + "/" + game.chatId,
      dataType: "json",
      // Avoid caching of HTTP GETs
      data: {z: new Date().getTime()},
      error: blitz.retryOnFail,
      success: game.handleChatResponse
    };
    $.ajax(options);
  },

  sendChat: function() {
    // Grab the string the user entered and send it to the server
    var data = $("#chatInput").val();
    data = jQuery.trim(data);
    if (data.length > 0) {
      $("#chatInput").val("");
      var options = {
        url: "/game_ajax/" + game.gameKey + "/chat",
        data: {chat: data},
        type: "POST",
        error: blitz.retryOnFail,
        success: game.forceRefreshChat
      };
      $.ajax(options);
    }
  },

  handleChatResponse: function(data) {
    // Got a response from the server - update our chat and fire off another
    // refresh in 5 secs.
    game.chatId = data.msg_id;
    chat.updateChat(data.data);
    game.refreshChatTimer = window.setTimeout(game.refreshChat, 5*1000);
  }

};

