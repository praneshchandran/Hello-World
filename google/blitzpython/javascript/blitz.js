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
var blitz = {


  /**
   * Prepares a dialog for display, and displays it.
   */
  initAndDisplayDialog: function(dialog) {
    // Clear out any errors and text fields
    $(dialog).find(".error").hide();
    $(dialog).find(":text").val("");
    $(dialog).modal();
  },

  updateZebraTables: function() {
    $("table.zebra tr:even").addClass("even");
    $("table.zebra tr:odd").addClass("odd");
  },

  // Error handler for ajax requests
  retryOnFail: function (xhr, textStatus, errorThrown) {
    if (xhr.status == 410) {
      // Whatever entity we are trying to access has been deleted
      alert("Sorry, this game has been deleted.");
      blitz.clickHandlers.enterLobby();
      return;
    }
    // Just try sending the request again - if the server is down, this can
    // lead to an infinite loop, so we put in a delay and try it every few
    // seconds.
    var ajaxOptions = this;
    window.setTimeout(function() { $.ajax(ajaxOptions);}, 2*1000);
  },

  dialogActive: function() {
    // Returns true if there's currently a dialog up - useful if we want to
    // avoid displaying multiple dialogs at once
    return ($.modal.impl && $.modal.impl.dialog && $.modal.impl.dialog.data);
  },


  /**
   * The handlers for click events
   */
  clickHandlers: {
    viewHistory: function() {
      window.location.href = "/history";
    },

    gotoMain: function() {
      window.location.href = "/";
    },

    enterLobby: function() {
      window.location.href = "/lobby";
    },

    inviteFriend: function() {
      blitz.initAndDisplayDialog("#inviteFriendDialog");
    },

    whatIsBlitz: function() {
      blitz.initAndDisplayDialog("#whatIsBlitzDialog");
    },

    // Invoked when the user clicks on the "sendInvite" button in the dialog
    sendInvite: function() {
      lobby.sendInvite();
    },

    closeModal: function() {
      $.modal.close();
    },

    sendLobbyChat: function() {
      lobby.sendChat();
    },

    // Given a game key, switches to view that game
    goGame: function(gameKey) {
      top.location.href = "/game/" + gameKey;
    },

    sendGameChat: function() {
      game.sendChat();
    },

    offerNewGame: function() {
      blitz.initAndDisplayDialog("#offerBlitzGameDialog");
    }
  }
};

