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
 * chess.js
 *
 * This file contains an implementation of a chessboard, with a move validator,
 * tracking of captured pieces, and checkmate detection.
 *
 * Typical use of this object might be:
 *
 * var chess = new Chess();  // Initialize a Chess object with the default board
 * if (!chess.validMove(moveStr)) {
 *   ...handle invalid move...
 * } else {
 *   chess.addMove(moveStr);
 *   if (chess.is_checkmate()) {
 *     ...handle checkmate...
 *   } else {
 *     var board = chess.getBoard();
 *        ... render board ...
 *     var capturedPieceArray = chess.getCapturedPieces()
 *        ... render captured pieces ...
 *   }
 * }
 *
 * The "moveStr" is a string in ICCF format, where positions are given
 * numerically starting at 11 in the lower left corner (White Queen's Rook)
 * and going to 88 in the upper right corner (Black King's Rook).
 *
 * http://en.wikipedia.org/wiki/ICCF_Notation
 *
 * Accepted formats are (f=From position, t=To position):
 *
 * ff-tt   (example: 12-14 moves the leftmost white pawn two ranks forward)
 * ff-tt-p (same as ff-tt, except p denotes a pawn promotion: 1=Queen, 2=Rook,
 *          3=Bishop, 4=Knight)
 * #ff-tt    (same as ff-tt, except # denotes "checkmate")
 * #ff-tt-p  (same as ff-tt-p, except # denotes "checkmate")
 *
 * Castling is denoted by a king move (the corresponding rook move is implied
 * by the king moving two squares to the left/right)
 */


/**
 * Creates a new Chess object given the optional starting board.
 *
 * @param opt_startingBoard Array of strings containing a board state - 64
 * characters, one per board square, going from 11, 21, 31, 41... up to 88.
 *
 */
function Chess(opt_startingBoard) {
  this.board = opt_startingBoard;
  if (!this.board) {
    // No board was provided, so use a default board. Capital letters denote
    // white pieces
    this.board = Chess.DEFAULT_BOARD.slice();
  }
  // List of moves that have been added to this board by addMove() - this is
  // needed because some moves (like en passant and castling) require that we
  // have access to the move history to check validity.
  this.moveList = [];

  // List of pieces that have been captured (not sorted in any particular order)
  this.captureList = [];
};

Chess.prototype = {};

// The default, normal chess board.
Chess.DEFAULT_BOARD = ("RNBQKBNR" +
                      "PPPPPPPP" +
                      "........" +
                      "........" +
                      "........" +
                      "........" +
                      "pppppppp" +
                      "rnbqkbnr").split('');

// This is how we denote a blank square on the board
Chess.BLANK = '.';

// Constants when we need
Chess.WHITE = 0;
Chess.BLACK = 1;

// Map of piece types to validator functions
Chess.VALIDATOR_MAP = {
    k: 'validateKing',
    q: 'validateQueen',
    b: 'validateBishop',
    r: 'validateRook',
    n: 'validateKnight',
    p: 'validatePawn'
};

/**
 * Checks to see if the proposed move is valid
 * @param moveStr The move in ICCF format (see file header)
 * @return true if the move is valid, else false
 */
Chess.prototype.validMove = function(moveStr) {
  // Make sure the move is generally valid - that it's the appropriate
  // color's turn, and that the move does not move one color on top of another
  // piece of the same color.
  var move = Chess.parseMove(moveStr);
  return this.validParsedMove(move);
}

/**
 * Same as validMove, but takes a parsed move.
 * @param move move object, with to/from integer properties
 * @param opt_skip_turn_check if True, skips the turn check (useful when
 *   checking for Check/Checkmate)
 * @param opt_skip_check_check if True, skips the check for being in check
 *   used when checking for being in check, as you can still put your opponent
 *   in check with a piece even if technically you can't move that piece
 *   because it is blocking your own king from being in check)
 */
  Chess.prototype.validParsedMove = function(move, opt_skip_turn_check,
                                             opt_skip_check_check) {
  var piece = this.getPiece(move.from);
  if (piece == Chess.BLANK) {
    // Can't move a blank piece
    return false;
  }

  var color = Chess.getPieceColor(piece);
  if (!opt_skip_turn_check && color != this.whoseTurn()) {
    // Not this player's turn
    return false;
  }
  var dest = this.getPiece(move.to);
  if (dest != Chess.BLANK && color == Chess.getPieceColor(dest)) {
    // Can't move a piece over its own color (this also catches the case
    // where move.to = move.from)
    return false;
  }
  if (move.promote && (piece.toLowerCase() != 'p')) {
    // Trying to promote a piece that is not a pawn
    return false;
  }

  // Now we've done the general validation - do piece-specific validation
  var validator = Chess.VALIDATOR_MAP[piece.toLowerCase()];
  var valid = this[validator](move, color);
  if (!valid) {
    return false;
  }

  // OK, the move is mechanically valid - now see if it leaves us in check.
  // We do this by creating a new board with our same board state, adding the
  // move to it, then calling inCheck() on it.
  if (opt_skip_check_check) {
    // Checking for mechanic validity is enough
    return true;
  } else {
    // Check to see if we are in check now - if so, this is an invalid move
    var copy = this.board.slice();
    var chess = new Chess(copy);
    chess.addParsedMove(move);
    return chess.inCheck(color) == null;
  }
};

/**
 * Returns true if the specified color is checkmated
 */
Chess.prototype.checkmate = function(color) {
  if (!this.inCheck(color)) {
    // We aren't in check, so no checkmate
    return false;
  }
  // OK, we're in check, but we're only in checkmate if there's no move to
  // take us out of check. So do the following brute-force algorithm:
  //
  // 1) make a list of all pieces of this color
  // 2) make a list of all positions on the board that are *not* occupied by
  //    pieces of this color.
  // 3) Walk through the first list, exhaustively trying to move to each square
  //    in the second list. If we can move to that square, then we see if
  //    after moving to that square, we are still in check.
  // 4) If we find a valid move that results in us not being in check, then
  //    it is not checkmate. Otherwise, if we reach the end of all possible
  //    moves and we're in check in every single one of them, then it's
  //    checkmate.
  var pieceList = [];
  var targetList = [];
  // Do steps 1 and 2 - make a list of this color's pieces (pieceList) and
  // a list of potential target spaces for moves (targetList)
  for (var i = 0 ; i < this.board.length ; i++) {
    var piece = this.getPiece(i);
    if (piece != Chess.BLANK && Chess.getPieceColor(piece) == color) {
      pieceList.push(i);
    } else {
      targetList.push(i);
    }
  }

  // OK, walk through our piece list, and try to move to various squares
  for (var pieceIndex = 0 ; pieceIndex < pieceList.length ; pieceIndex++) {
    for (targetIndex = 0 ; targetIndex < targetList.length ; targetIndex++) {
      var move = {
        from: pieceList[pieceIndex],
        to: targetList[targetIndex]
      };
      if (this.validParsedMove(move, true)) {
        // OK, that piece can move there (validParsedMove() will return false
        // if we are in check after a given move). If we get here, we aren't
        // in checkmate
        return false;
      }
    }
  }
  return true;
}

/**
 * Determines whether the passed color's king is in check.
 *
 * @param color WHITE or BLACK
 * @return move object of pieces in check, or null if not in check
 */
Chess.prototype.inCheck = function(color) {
  // OK, walk the board, and make two lists - a list of enemy pieces, and
  // this color's king.
  var kingPiece = (color == Chess.WHITE ? 'K' : 'k');
  var kingIndex = -1;
  var enemies = [];
  for (var i = 0 ; i < this.board.length ; i++) {
    var piece = this.board[i];
    if (piece == kingPiece) {
      kingIndex = i;
    } else if (piece != Chess.BLANK && Chess.getPieceColor(piece) != color) {
      enemies.push(i);
    }
  }

  // OK, now we have a list of enemies. See if any of them can make it to the
  // king.
  if (enemies.length == 0 || kingIndex == -1) {
    throw "Could not find any enemies or the king";
  }

  for (var index = 0 ; index < enemies.length ; index++) {
    var move = {
      from: enemies[index],
      to: kingIndex
    };
    if (this.validParsedMove(move, true, true)) {
      // An enemy can validly move to the king's square, so we are indeed in
      // check.
      return move;
    }
  }
  return null;
};

/**
 * Processes a move, updating the board state and our array of captured pieces.
 * No validation is done on these moves - it is the caller's responsibility to
 * call validMove() if it requires validation.
 *
 * @param moveStr The move in ICCF format (see file header for more details)
 */
Chess.prototype.addMove = function(moveStr) {
  var move = Chess.parseMove(moveStr);
  this.addParsedMove(move);
};

// Same as addMove, but takes a parsed move instead of a string
Chess.prototype.addParsedMove = function(move) {
  var capturedPawn = this.isEnPassant(move);
  if (capturedPawn) {
    // Manually capture the pawn for en passant - this is the only case in
    // chess where you capture a piece that isn't on the destination square.
    this.capture(capturedPawn);
  }
  var castle = this.isCastle(move);
  if (castle) {
    // We are castling - move the rook also
    this.movePiece(castle);
  }

  // Move the piece itself
  this.movePiece(move);

  // Save the current move
  this.moveList.push(move);
};

/**
 * Checks to see if this is a castle move, and if so, returns the associated
 * rook move.
 * @param move Move to check (should be a king's move)
 * @return null if not a castle, otherwise object in move format (to/from)
 */
Chess.prototype.isCastle = function(move) {
  var piece = this.getPiece(move.from);
  if (piece == 'k' || piece == 'K') {
    // Moving a king - see if it's a castle move
    if (Math.abs(move.from - move.to) == 2) {
      // We are moving two squares horizontally - it's a castle move.
      // Figure out the associated rook move
      var rook = {};
      if (move.from < move.to) {
        // Moving to the right
        rook.from = move.from + 3;
        rook.to = move.to - 1;
      } else {
        // Moving to the left
        rook.from = move.from - 4;
        rook.to = move.to + 1;
      }
      return rook;
    }
  }
  return null;
};


/**
 * Checks to see if this is an en passant move, and if so, returns the index
 * of the piece to capture.
 *
 * @param move Move to check (should be a pawn move)
 * @return null, or index of piece to capture
 */
Chess.prototype.isEnPassant = function(move) {
  var piece = this.getPiece(move.from);
  if (piece == 'p' || piece == 'P') {
    // Pawn move - could be en-passant
    // See if the pawn is moving diagonally without capturing a piece
    if (Math.abs(move.from - move.to) != 8 &&
        Math.abs(move.from - move.to) != 16) {
      // We've moving diagonally - are we capturing?
      var dest = this.getPiece(move.to);
      if (dest == Chess.BLANK) {
        // Moving diagonally without capturing - calculate which pawn would be
        // captured if this is en passant (the piece in the rank *before* the
        // destination).
        if (move.from > move.to) {
          // Moving down the board
          var capture = move.to + 8;
        } else {
          var capture = move.to - 8;
        }
        return capture;
      }
    }
  }
  return null;
};

/**
 * Given an object with move coordinates (from/to), performs the move on the
 * board.
 *
 * @param move Object with integer 'from', 'to', and optional 'promote'
 *     properties (see parseMove() below)
 */
Chess.prototype.movePiece = function(move) {
  this.capture(move.to);

  if (move.promote) {
    // Doing a pawn promotion - make sure the new piece is the right color
    var promote = move.promote;
    var piece = this.board[move.from];
    if (Chess.getPieceColor(piece) == Chess.BLACK) {
      // Promoting to a black piece, so convert the character to lower case
      promote = promote.toLowerCase();
    }
    this.board[move.to] = promote;
  } else {
    this.board[move.to] = this.board[move.from];
  }
  this.removePiece(move.from);
};

/**
 * Given a piece, figures out the color (i.e. if capital, returns WHITE, else
 * BLACK)
 */
Chess.getPieceColor = function(piece) {
  if (piece >= 'A' && piece <= 'Z') {
    return Chess.WHITE;
  } else if (piece >= 'a' && piece <= 'z') {
    return Chess.BLACK;
  } else {
    throw "Can't get color for piece: " + piece;
  }
};

/**
 * Returns 0 if it's white's turn, or 1 if it's black's turn
 */
Chess.prototype.whoseTurn = function() {
  return(this.moveList.length % 2);
};

/**
 * Moves a piece to the capture list if there is one on the square
 * @param index numeric index into board (0-63)
 */
Chess.prototype.capture = function(index){
  var capturedPiece = this.getPiece(index);
  this.removePiece(index);
  if (capturedPiece != Chess.BLANK) {
    // Add to capture list
    this.captureList.push(capturedPiece);
  }
};


/**
 * Fetches whatever piece is at this index
 * @param index board index from 0-63
 * @return piece value at that position
 */
Chess.prototype.getPiece = function(index) {
  return this.board[index];
};


/**
 * Sets a piece at a given index - mainly exposed for testing purposes.
 * @param index board index from 0-63
 * @param piece piece to set (one of KQBNRPkqbnrp)
 */
Chess.prototype.setPiece = function(index, piece) {
  this.board[index] = piece;
};

/**
 * Just removes a piece from the board (sets it to BLANK)
 */
Chess.prototype.removePiece = function(index) {
  this.board[index] = Chess.BLANK;
};

/**
 * Given an ICCF-format move, returns it in parsed form.
 *
 * @param moveStr in iccf form
 * @return object with these properties:
 *   from: index of from square, from 0 - 63
 *   to: index of to square, from 0-63
 *   promote: piece we are promoting to (Q/R/B/N)
 */
Chess.parseMove = function(moveStr) {
  if (moveStr[0] == '#') {
    // Checkmate - just strip it
    moveStr = moveStr.substring(1);
  }

  // Convert "ff-tt" to a pair of 0-63 numeric indices into the board array
  var result = {};
  result.from = Chess.toIndex(moveStr);
  result.to = Chess.toIndex(moveStr.substring(3));

  if (moveStr.length == 7) {
    // It's a pawn promotion
    var promote = moveStr.charAt(6) - '1';
    var promoteList = "QRBN";
    if (promote >= promoteList.length) {
      throw "Invalid promotion: " + promote;
    }
    result.promote = promoteList.charAt(promote);
  }
  return result;
};

/**
 * Converts a position string (e.g. '11', '88') into an index into the
 * board array (e.g. '11' -> 0, '21' -> 1, '88' -> 63).
 * @param positionStr The position string to convert to an index
 * @return the numeric index (0-63)
 */
Chess.toIndex = function(positionStr) {
  result = positionStr.charAt(0) - '1' + (positionStr.charAt(1)-'1') * 8;
  if (result < 0 || result > 63) {
    throw "Invalid position: " + positionStr;
  }
  return result;
};

/**
 * Fetches the board as an array of pieces
 * @return array of characters representing the board
 */
Chess.prototype.getBoard = function() {
  return this.board;
};

/**
 * Fetches the list of captured pieces
 * @return array of characters representing captured pieces
 */
Chess.prototype.getCaptureList = function() {
  return this.captureList;
};

/***********************************************
 * Individual validation routines, to see if a given piece type can make
 * this move. Basic checks (is the destination square empty or occupied by
 * an enemy, is it the player's turn) have already been done. This routine
 * just needs to check the mechanics of the move - is the piece allowed to
 * move to the passed square given the constraints on piece movement (e.g.
 * bishops must move diagonally) and are the intervening squares unoccupied.
 *
 * @param move Object in move format (to/from integer properties)
 * @return true if move is valid
 */

// Converts move (to/from) to coord pair (to/from)
Chess.toCoords = function(move) {
  var result = {
    from: Chess.toCoord(move.from),
    to: Chess.toCoord(move.to)
  };
  return result;
};

// Converts an index into a pair of x/y coords (0-7)
Chess.toCoord = function(index) {
  var result = {};
  result.x = index % 8;
  result.y = Math.floor(index/8);
  return result;
};

// Given two coords, sees if they are vertical (no change in x)
Chess.isVertical = function(coords) {
  return (coords.to.x == coords.from.x);
};

// Horizontal if no change in y
Chess.isHorizontal = function(coords) {
  return (coords.to.y == coords.from.y);
};

// Diagonal if change in x == change in y
Chess.isDiagonal = function(coords) {
  return (Math.abs(coords.to.y - coords.from.y) == Math.abs(coords.to.x - coords.from.x));
};

Chess.prototype.hasMoved = function(index) {
  for (var i = 0 ; i < this.moveList.length ; i++) {
    if (this.moveList[i].from == index || this.moveList[i].to == index) {
      return true;
    }
  }
  return false;
};

// Tests to see if every square between move.from and move.to is clear
// (not counting the endpoints)
Chess.prototype.isHorizontalClear = function(move) {
  return this.checkClear(move, 1);
};

Chess.prototype.checkClear = function(move, offset) {
  // Moving down/left board, so switch offset to negative
  if (move.from > move.to) {
    offset = 0-offset;
  }
  for (var index = move.from + offset ; index != move.to ; index += offset) {
    if (index > 63 || index < 0) {
      throw "Invalid checkClear: " +
        move.from + " - " + move.to + " - " + offset;
    }
    if (this.getPiece(index) != Chess.BLANK) {
      // Can't move here
      return false;
    }
  }
  return true;
};

// Checks to see if the squares between move.from and move.to are clear
Chess.prototype.isVerticalClear = function(move) {
  return this.checkClear(move, 8);
};

// Checks to see if the squares between move.from and move.to are clear
Chess.prototype.isDiagonalClear = function(move) {
  // Diagonal offsets are one of 7, -7, 9, -9 (that's what we add to move
  // diagonally between rows)
  if (Math.abs(move.from - move.to) % 9 == 0) {
    var offset = 9;
  } else {
    var offset = 7;
  }
  return this.checkClear(move, offset);
};

Chess.prototype.validateKing = function(move, color) {
  // Convert from move to individual X/Y coords
  var coords = Chess.toCoords(move);

  // King can move one square in every direction.
  if (Math.abs(coords.to.x - coords.from.x) <= 1 &&
      Math.abs(coords.to.y - coords.from.y) <= 1) {
    // The king is only moving one square
    return true;
  }

  // The user is trying to move more than one square - see if it's a castle
  var rookMove = this.isCastle(move);
  if (!rookMove) {
    // Nope, not trying to castle, so this is an invalid move
    return false;
  }
  // The king is trying to castle - make sure everything is kosher
  // 1) Make sure the king and the rook have not ever moved
  if (this.hasMoved(move.from) || this.hasMoved(rookMove.from)) {
    // Can't castle, as we've moved one of the pieces.
    return false;
  }
  // Make sure there's nothing between the king and the rook
  if (!this.isHorizontalClear({from: move.from, to: rookMove.from})) {
    return false;
  }
  // OK, everything *looks* clear - now make sure that no pieces are
  // threatening the intervening squares.
  if (this.inCheck(color)) {
    return false;
  }

  // Check the next square over (since abs(move.from + move.to) == 2, the
  // coordinate of the middle square is just move.from + move.to / 2).
  var middleMove = {from: move.from, to: (move.from + move.to)/2 };
  var copy = this.board.slice();
  var chess = new Chess(copy);
  chess.addParsedMove(middleMove);
  if (chess.inCheck(color)) {
    return false;
  }

  // Check the final position of the king - if it's also clear, then this is
  // a valid castle
  copy = this.board.slice();
  chess = new Chess(copy);
  chess.addParsedMove(move);
  if (chess.inCheck(color)) {
    return false;
  }

  // It's a valid castle
  return true;
};

Chess.prototype.validateQueen = function(move) {
  var coords = Chess.toCoords(move);
  if (Chess.isDiagonal(coords)) {
    return this.isDiagonalClear(move);
  } else if (Chess.isHorizontal(coords)) {
    return this.isHorizontalClear(move);
  } else if (Chess.isVertical(coords)) {
    return this.isVerticalClear(move);
  }
  // Piece can't go here
  return false;
};

Chess.prototype.validateRook = function(move) {
  var coords = Chess.toCoords(move);
  if (Chess.isHorizontal(coords)) {
    return this.isHorizontalClear(move);
  } else if (Chess.isVertical(coords)) {
    return this.isVerticalClear(move);
  }
  // Piece can't go here
  return false;
};

Chess.prototype.validateBishop = function(move) {
  // Bishop move is simple - is it diagonal, and clear to the destination
  var coords = Chess.toCoords(move);
  return Chess.isDiagonal(coords) && this.isDiagonalClear(move);
};

Chess.prototype.validateKnight = function(move) {
  var coords = Chess.toCoords(move);
  // Knight moves one vertical and two horizontal, or two horizontal and one
  // vertical.
  if ((Math.abs(coords.to.x - coords.from.x) == 1 &&
       Math.abs(coords.to.y - coords.from.y) == 2) ||
      (Math.abs(coords.to.x - coords.from.x) == 2 &&
       Math.abs(coords.to.y - coords.from.y) == 1)) {
    return true;
  }
  return false;
};

Chess.prototype.validatePawn = function(move, color) {
  var coords = Chess.toCoords(move);
  // Pawns move only in one direction - make sure it's the right one'
  if (color == Chess.WHITE && coords.to.y <= coords.from.y) {
    return false;
  } else if (color == Chess.BLACK && coords.to.y >= coords.from.y) {
    return false;
  }

  if (Chess.isVertical(coords)) {
    // Make sure we're moving an acceptable # square
    var numSquares = Math.abs(coords.from.y - coords.to.y);
    if (numSquares > 2) {
      // Too far
      return false;
    } else if (numSquares == 2 && this.hasMoved(move.from)) {
      // Can't move two squares if you already moved before
      return false;
    }

    // Now just make sure intervening squares are free.
    var index = (color == Chess.WHITE ? 8 : -8);
    var i = move.from;
    while (1) {
      i = i + index;
      if (this.getPiece(i) != Chess.BLANK) {
        // Path isn't empty'
        return false;
      }
      if (i == move.to) {
        break;
      }
    }
    // If we get here, we know the move is valid - go for it!
    return true;
  } else {
    if (!Chess.isDiagonal(coords)) {
      return false;
    }
    if (Math.abs(coords.from.x - coords.to.x) != 1 &&
        Math.abs(coords.from.y - coords.to.y) != 1) {
      return false;
    }

    // OK, we are moving diagonally - this is only acceptable in two situations:
    // There's an enemy on the square, or it's en passant
    if (this.getPiece(move.to) != Chess.BLANK) {
      return true;
    } else {
      // See if it's en passant
      var capturedPawn = this.isEnPassant(move);
      var opposingPawn = (color == Chess.WHITE ? 'p' : 'P');
      if (capturedPawn != null && this.getPiece(capturedPawn) == opposingPawn) {
        // We have a captured pawn - now, has that pawn only moved once, and
        // on the most recent move?
        var lastMove = this.getLastMove();
        if (lastMove) {
          // Make sure this last move involved the pawn on the destination
          // square
          if (lastMove.to == capturedPawn &&
              Math.abs(lastMove.from - lastMove.to) == 16) {
            // It's en passant!
            return true;
          }
        }
      }
      return false;
    }
  }
};

/**
 * Fetches the last move made, or null if there have been no moves
 */
Chess.prototype.getLastMove = function() {
  var lastMove = this.moveList == null ?
    null : this.moveList[this.moveList.length-1];
  return lastMove;
};
