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
 * Common handling code for chat windows
 */
var chat = {
  updateChat: function(chatList) {
    var chatStr = "";
    jQuery.each(chatList, function(index, val) {
        if (val.data) {
          if (val.author) {
            chatStr += "<b>" + val.author + ":</b>&nbsp;";
          }
          chatStr += val.data + "<br/>";
        }
      });

    chat.appendStringToChat(chatStr);
  },

  // Appends a string to the chat window and scrolls to the bottom to make
  // it visible
  appendStringToChat: function(chatStr) {
    if (chatStr.length > 0) {
      $(".chat").append(chatStr).each(function() {
          // Scroll chat window to the bottom if chat changed
          this.scrollTop = this.scrollHeight;
        });
    }
  }
};