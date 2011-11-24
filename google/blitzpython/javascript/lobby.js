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
 * Javascript code specific to the lobby page
 */
$(document).ready(function() {
    // Start refreshing the page as soon as we're loaded
    lobby.refresh();

    // Initialize the chat text input to send contents when enter pressed
    $("#chatInput").keypress(function(e) {
        if (e.keyCode == 13) {
          lobby.sendChat();
        }
      });

  });

$(window).unload(function() {
    // When we leave the page, notify the server
    lobby.leaving=true;
    lobby.leave();
  });


var lobby = {
  GAME_STATUS_ACTIVE:2,

  msgId: 0,
  // The games the user doesn't want to be prompted about
  ignoreMap: {},

  forceRefresh: function() {
    // If there's not already a refresh in process, refresh immediately.
    if (lobby.refreshTimer) {
      // There's a timer, which means there's no refresh in process, so
      // fire off the refresh - this will stop the existing timer so we don't
      // get a double update.
      lobby.refresh();
    }
  },

  // Calls the server to refresh the player list, chat window, and open games
  refresh: function() {
    // Stop any existing timer
    if (lobby.refreshTimer) {
      window.clearTimeout(lobby.refreshTimer);
      delete lobby.refreshTimer;
    }
    // Turn on to display busy cursor during ajax calls for debugging
    // $(".busy").show();
    var options = {
      url: "/lobby_ajax/" + blitz.user_email + "/" + lobby.msgId,
      // Add random param to URL to avoid browser caching of HTTP GETs
      data: {z: new Date().getTime()},
      dataType: "json",
      error: blitz.retryOnFail,
      success: lobby.handleAjaxResponse
    };
    $.ajax(options);
  },

  handleAjaxResponse: function(data) {
    // We got our response - make sure the busy cursor is off
    $(".busy").hide();
    lobby.msgId = data.chat_list.msg_id;

    // Convert the player name array to a list we can display
    lobby.updatePlayerList(data.player_list);

    // Update the chat
    chat.updateChat(data.chat_list.data);

    lobby.updateGameList(data.game_list);

    // Refresh the data every 5 secs
    lobby.refreshTimer = window.setTimeout(lobby.refresh, 5*1000);
  },

  updateGameList: function(gameList) {
    // Generate content of game table based on what was sent to us
    content = "";
    jQuery.each(gameList, function(index, game) {
        content += "<tr><td>" + game.creator + "</td><td>" +
          (game.opponent ? game.opponent : "&nbsp;") + "</td><td>" +
          (game.time_limit ?  (game.time_limit + " min") : "untimed") +
           "</td><td>";
        // OK, figure out what actions we have on this game. Choices are:
        // 1) Delete - if is_participant && opponent = null
        // 2) Join - if !is_participant && opponent = null
        // 3) Watch - if !is_participant && opponent = null
        //
        // We also check to see if the user is an invitee or if he's a
        // participant in an active blitz game, in which case we prompt him to
        // enter the game immediately.
        action = [];
        if (game.is_participant || game.is_invitee) {
          // Haven't prompted about this game before
          if (game.is_invitee) {
            // Display an invite dialog (after setting the flag so we don't
            // prompt about this game again)
            if (!lobby.ignoreMap[game.key] && !blitz.dialogActive()) {
              lobby.ignoreMap[game.key] = true;
              lobby.displayJoinDialog(game.creator, game.key);
            }
            action.push({id: "joinGame", label: "Join"});
          } else {
            // If the user is a participant in an active blitz game, warn
            // them and let them enter.
            if (!lobby.ignoreMap[game.key] && !blitz.dialogActive() &&
                game.status == lobby.GAME_STATUS_ACTIVE && game.time_limit) {
              // Don't prompt about this game again.
              lobby.ignoreMap[game.key] = true;
              lobby.displayEnterDialog(game.is_creator ?
                                       game.opponent : game.creator, game.key);
            }
            if (game.status == lobby.GAME_STATUS_ACTIVE) {
              action.push({id: "goGame", label: "Go"});
            }
          }
          if (game.can_delete) {
            action.push({id: "deleteGame", label: "Delete"});
          }
        } else if (game.status == lobby.GAME_STATUS_ACTIVE) {
          // Not a participant, and the game is full - action = watch
          action.push({id: "goGame", label: "Watch"});
        } else {
          // Not a participant, and there's no opponent yet - action = Join
          action.push({id: "joinGame", label: "Join"});
        }
        if (action.length == 0) {
          content += "&nbsp;";
        } else {
          jQuery.each(action, function(index, item) {
              if (index > 0) {
                content += "&nbsp;";
              }
              content += '<a class="btn" href="#" key="' + game.key +
                '" id="' + item.id + '">' + item.label + "</a>";
            });
        }
        content += "</td></tr>";
      });
    // Remove the old games, replace with new content
    $(".gameTable tr:not(.gameTableHeader)").remove();
    if (content.length) {
      $(".gameTable").append(content);
    }

    // Setup click handlers for the newly added buttons.
    $(".gameTable a").click(function(args) {
        var key = this.getAttribute('key');
        var func = lobby[this.id];
        func(key);
      });

    // Add stripes to the table
    $(".gameTable tr:even").addClass("even");
    $(".gameTable tr:odd").addClass("odd");
  },

  displayJoinDialog: function(creator, key) {
    $('#inviter').text(creator);
    $('#joinGame').attr({key: key});
    blitz.initAndDisplayDialog("#joinDialog");
  },

  displayEnterDialog: function(opponent, key) {
    $('#blitzOpponent').text(opponent);
    $('#goGame').attr({key: key});
    blitz.initAndDisplayDialog("#enterDialog");
    $('#goGame').attr({ref: key});
  },

  goGame: function(gameKey) {
    blitz.clickHandlers.goGame(gameKey);
  },

  joinGame: function(gameKey) {
    var options = {
      url: "/game_ajax/" + gameKey + "/join",
      // We don't actually need to send the key up (since it's already in
      // the URL) but some proxies don't like having a zero-length body for
      // POSTs so we need to put something in there.
      data: {gameKey: gameKey},
      type: "POST",
      success: function() {lobby.goGame(gameKey); },
      error: function() {
        alert("Could not join game");
        lobby.forceRefresh();
      }
    }
    $.ajax(options);
  },

  // Given the key to a game, delete it
  deleteGame: function(gameKey) {
    $(".busy").show();
    var options = {
      url: "/game_ajax/" + gameKey,
      type: "DELETE",
      success: lobby.forceRefresh
    };
    $.ajax(options);
  },

  // Displays a list of players in the window, and updates the chat window
  // when people enter/leave
  updatePlayerList: function(playerList) {
    var playerText = playerList.join("<br/>");
    $(".playerList").html(playerText);

    $("#lobbyStatus").html("Blitz Lobby<br/>" +
        (playerList.length == 1 ?
         "1 player" : "" + playerList.length + " players") +
         " in lobby");

    // Make a map of the players in the list
    var playerMap = {};
    jQuery.each(playerList, function(index, player) {
        playerMap[player] = true;
      });

    var chatStr = "";
    if (lobby.playerMap) {
      // Figure out the differences between the two maps and display who
      // joined/left the lobby
      for (oldPlayer in lobby.playerMap) {
        if (!playerMap[oldPlayer]) {
          chatStr += oldPlayer + " has left the lobby<br/>";
        }
      }
      for (newPlayer in playerMap) {
        if (!lobby.playerMap[newPlayer]) {
          chatStr += newPlayer + " has entered the lobby<br/>";
        }
      }
      chat.appendStringToChat(chatStr);
    }
    lobby.playerMap = playerMap;

  },

  leave: function() {
    // Tell the server we're leaving (this might fail since we are unloading,
    // but it's the best we can do)
    var options = {
      dataType: "json",
      url: "/lobby_ajax/" + blitz.user_email,
      type: "DELETE"
    };
    $.ajax(options);
  },

  sendChat: function() {
    var data = $("#chatInput").val();
    data = jQuery.trim(data);
    if (data.length > 0) {
      $("#chatInput").val("");
      var options = {
        url: "/lobby_ajax/" + blitz.user_email + "/chat",
        data: {chat: data},
        type: "POST",
        error: blitz.retryOnFail,
        success: lobby.forceRefresh
      };
      $.ajax(options);
    }
  },

  // Submits a game offer to the server
  sendGameOffer: function() {
    var offer = $("#offerForm").serialize();
    lobby.uploadGameInvite(offer);
  },

  uploadGameInvite: function(offer) {
    $(".busy").show();
    var options = {
      url: "/game_ajax?" + offer,
      // Need to send something up in the PUT body, as some proxies reject
      // PUT and POST requests with empty bodies
      data: offer,
      type: "PUT",
      error: blitz.retryOnFail,
      success: lobby.forceRefresh
    };

    $.ajax(options);
    $.modal.close();
  },

  sendInvite: function() {
    if (lobby.validateInvite("#inviteForm")) {
      var invitation = $("#inviteForm").serialize();
      lobby.uploadGameInvite(invitation);
    }
  },

  validateInvite: function(form) {
    // Make sure that if there's an email input, the contents match the regexp.
    var success = true;
    $(form).find("#email").each(function(index) {
        // See if it matches our regexp - this isn't a perfect email regexp,
        // but it basically allows xxx@xxx.xxx, xxx@xxx.xxx.xxx, etc.
        var regexp = /^\w+@\w+(\.\w+)+$/;
        var err;
        if (!this.value.match(regexp)) {
          err = "Please enter a valid email address";
        } else if (this.value.toLowerCase() == blitz.user_email.toLowerCase()) {
          err = "You cannot invite yourself to a game";
        }
        if (err) {
          success = false;
          $(form).
            find(".error").
            text(err).
            show();
        }
      });

    return success;
  }

};