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

var tests = {
  /**************************************************
   * Basic API and board manipulation tests
   */
   BLANK_BOARD: "................................................................".split(),
  testGetPiece: function() {
    var chess = new Chess();
    var board = chess.getBoard();
    assertEquals(board.length, 64);
    // Just check pawn row
    for (var i = 8 ; i < 16 ; i++) {
      assertEquals(chess.getPiece(i), 'P');
    }
  },

  testToIndex: function() {
    assertEquals(Chess.toIndex("11"), 0);
    assertEquals(Chess.toIndex("88"), 63);
    assertEquals(Chess.toIndex("81"), 7);
    assertEquals(Chess.toIndex("18"), 56);
  },

  testSetPiece: function() {
    var chess = new Chess();
    var index = 43;  // Middle of the board somewhere
    assertEquals(chess.getPiece(index), Chess.BLANK);
    chess.setPiece(index, 'Q');
    assertEquals(chess.getPiece(index), 'Q');
  },

  testParseBasicMove: function() {
    var result = Chess.parseMove("11-12");
    assertEquals(result.from, 0);
    assertEquals(result.to, 8);
    assertTrue(!result.promote);
  },

  testParsePromote: function() {
    var result = Chess.parseMove("57-58-1");
    assertEquals(result.from, 52);
    assertEquals(result.to, 60);
    assertEquals(result.promote, 'Q');
  },

  testBasicMove: function() {
    // Try moving a pawn
    var chess = new Chess();
    assertEquals(chess.getPiece(Chess.toIndex('32')), 'P');
    assertEquals(chess.getPiece(Chess.toIndex('34')), Chess.BLANK);
    chess.addMove('32-34');
    assertEquals(chess.getPiece(Chess.toIndex('32')), Chess.BLANK);
    assertEquals(chess.getPiece(Chess.toIndex('34')), 'P');
  },

  testCapture: function() {
    var chess = new Chess();
    // Bogus "move my pawn across the board" test move
    assertEquals(chess.getPiece(Chess.toIndex('32')), 'P');
    chess.addMove('32-37');
    var capture = chess.getCaptureList();
    assertEquals(chess.getPiece(Chess.toIndex('37')), 'P');
    assertEquals(capture.length, 1);
    assertEquals(capture[0], 'p');
    // Take it back
    chess.addMove('38-37');
    assertEquals(capture.length, 2);
    assertEquals(capture[1], 'P');
  },

  castleTestBoard: function() {
    var chess = new Chess(tests.BLANK_BOARD.slice());
    // Sprinkle in some pieces appropriate for castling
    chess.setPiece(Chess.toIndex('11'), 'R');
    chess.setPiece(Chess.toIndex('51'), 'K');
    chess.setPiece(Chess.toIndex('81'), 'R');
    chess.setPiece(Chess.toIndex('18'), 'r');
    chess.setPiece(Chess.toIndex('58'), 'k');
    chess.setPiece(Chess.toIndex('88'), 'r');
    return chess;
  },
  testCastleLeft: function() {
    var chess = tests.castleTestBoard();
    chess.addMove("51-31");
    assertEquals(chess.getPiece(Chess.toIndex('41')), 'R');
    assertEquals(chess.getPiece(Chess.toIndex('31')), 'K');
    assertEquals(chess.getPiece(Chess.toIndex('81')), 'R');
    chess.addMove("58-38");
    assertEquals(chess.getPiece(Chess.toIndex('48')), 'r');
    assertEquals(chess.getPiece(Chess.toIndex('38')), 'k');
    assertEquals(chess.getPiece(Chess.toIndex('88')), 'r');
  },
  testCastleRight: function() {
    var chess = tests.castleTestBoard();
    chess.addMove("51-71");
    assertEquals(chess.getPiece(Chess.toIndex('11')), 'R');
    assertEquals(chess.getPiece(Chess.toIndex('71')), 'K');
    assertEquals(chess.getPiece(Chess.toIndex('61')), 'R');
    chess.addMove("58-78");
    assertEquals(chess.getPiece(Chess.toIndex('18')), 'r');
    assertEquals(chess.getPiece(Chess.toIndex('78')), 'k');
    assertEquals(chess.getPiece(Chess.toIndex('68')), 'r');
  },

  testGetPieceColor: function() {
    assertEquals(Chess.getPieceColor('P'), Chess.WHITE);
    assertEquals(Chess.getPieceColor('p'), Chess.BLACK);
  },

  whiteEnPassantBoard: function() {
    var chess = new Chess();
    // White pawn from 42 to 45
    chess.addMove("42-45");
    chess.addMove("57-55");
    return chess;
  },

  blackEnPassantBoard: function() {
    var chess = new Chess();
    // Black pawn from 42 to 45
    chess.addMove("12-13");  // white moves first
    chess.addMove("47-44");
    chess.addMove("52-54");
    return chess;
  },

  testWhiteEnPassant: function() {
    var chess = tests.whiteEnPassantBoard();
    // en-passant
    assertEquals(chess.getPiece(Chess.toIndex('55')), 'p');
    chess.addMove("45-56");
    assertEquals(chess.getPiece(Chess.toIndex('56')), 'P');
    assertEquals(chess.getPiece(Chess.toIndex('55')), Chess.BLANK);
    var capture = chess.getCaptureList();
    assertEquals(capture.length, 1);
    assertEquals(capture[0], 'p');
  },

  testBlackEnPassant: function() {
    var chess = tests.blackEnPassantBoard();
    // en-passant
    assertEquals(chess.getPiece(Chess.toIndex('54')), 'P');
    chess.addMove("44-53");
    assertEquals(chess.getPiece(Chess.toIndex('53')), 'p');
    assertEquals(chess.getPiece(Chess.toIndex('54')), Chess.BLANK);
    var capture = chess.getCaptureList();
    assertEquals(capture.length, 1);
    assertEquals(capture[0], 'P');
  },

  testPromoteWhite: function() {
    var chess = new Chess();
    chess.addMove("42-48-1");
    assertEquals(chess.getPiece(Chess.toIndex('42')), Chess.BLANK);
    assertEquals(chess.getPiece(Chess.toIndex('48')), 'Q');
  },

  testPromoteBlack: function() {
    var chess = new Chess();
    chess.addMove("47-41-2");
    assertEquals(chess.getPiece(Chess.toIndex('46')), Chess.BLANK);
    assertEquals(chess.getPiece(Chess.toIndex('41')), 'r');
  },

  /**************************************************
   * Tests for the move validation engine
   */
  testToCoords: function() {
    for (var x = 1 ; i <= 8 ; i++) {
      for (var y = 1 ; i <= 8 ; i++) {
        var moveStr = "" + x +"" + y + "-" + x +"" + y;
        var move = Chess.parseMove(moveStr);
        var c = Chess.toCoords(move);
        assertEquals(c.to.x, x);
        assertEquals(c.to.y, y);
        assertEquals(c.from.x, x);
        assertEquals(c.from.y, y);
      }
    }
  },

  testIsVertical: function() {
    var c = Chess.toCoords(Chess.parseMove("11-18"));
    assertTrue(Chess.isVertical(c));
    c = Chess.toCoords(Chess.parseMove("57-52"));
    assertTrue(Chess.isVertical(c));
    c = Chess.toCoords(Chess.parseMove("35-75"));
    assertFalse(Chess.isVertical(c));
    c = Chess.toCoords(Chess.parseMove("88-18"));
    assertFalse(Chess.isVertical(c));
    c = Chess.toCoords(Chess.parseMove("54-87"));
    assertFalse(Chess.isVertical(c));
  },

  testIsHorizontal: function() {
    var c = Chess.toCoords(Chess.parseMove("11-18"));
    assertFalse(Chess.isHorizontal(c));
    c = Chess.toCoords(Chess.parseMove("57-52"));
    assertFalse(Chess.isHorizontal(c));
    c = Chess.toCoords(Chess.parseMove("35-75"));
    assertTrue(Chess.isHorizontal(c));
    c = Chess.toCoords(Chess.parseMove("88-18"));
    assertTrue(Chess.isHorizontal(c));
    c = Chess.toCoords(Chess.parseMove("54-87"));
    assertFalse(Chess.isHorizontal(c));
  },

  testIsDiagonal: function() {
    var c = Chess.toCoords(Chess.parseMove("11-18"));
    assertFalse(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("57-52"));
    assertFalse(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("35-75"));
    assertFalse(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("88-18"));
    assertFalse(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("45-81"));
    assertTrue(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("54-87"));
    assertTrue(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("18-54"));
    assertTrue(Chess.isDiagonal(c));
    c = Chess.toCoords(Chess.parseMove("34-12"));
    assertTrue(Chess.isDiagonal(c));
  },

  testMovingOutOfTurn: function() {
    var chess = new Chess();
    assertFalse(chess.validMove("47-46"));
  },

  testBasicPawn: function() {
    var chess = new Chess();
    assertTrue(chess.validMove("42-43"));
    assertTrue(chess.validMove("42-44"));
    assertFalse(chess.validMove("42-45"));
    chess.addMove("42-43");
    assertTrue(chess.validMove("67-66"));
    assertTrue(chess.validMove("67-65"));
    assertFalse(chess.validMove("67-64"));
    assertFalse(chess.validMove("43-45"));
  },

  validateAndAddMove: function(chess, moveStr) {
    assertTrue(chess.validMove(moveStr));
    chess.addMove(moveStr);
  },
  testWhitePawnCapture: function() {
    var chess = new Chess();
    tests.validateAndAddMove(chess, "42-44");
    tests.validateAndAddMove(chess, "57-55");
    assertFalse(chess.validMove("44-35"));
    assertTrue(chess.validMove("44-55"));
  },
  testBlackPawnCapture: function() {
    var chess = new Chess();
    tests.validateAndAddMove(chess, "42-44");
    tests.validateAndAddMove(chess, "57-55");
    tests.validateAndAddMove(chess, "52-54");
    assertFalse(chess.validMove("55-64"));
    assertTrue(chess.validMove("55-44"));
  },
  testWhiteEnPassantValid: function() {
    var chess = new Chess();
    tests.validateAndAddMove(chess, "42-44");
    tests.validateAndAddMove(chess, "87-86");
    tests.validateAndAddMove(chess, "44-45");
    tests.validateAndAddMove(chess, "57-55");
    assertTrue(chess.validMove("45-46"));
    assertTrue(chess.validMove("45-56"));
    assertFalse(chess.validMove("45-36"));
  },

  testWhiteEnPassantNotValid: function() {
    var chess = new Chess();
    tests.validateAndAddMove(chess, "42-44");
    tests.validateAndAddMove(chess, "57-56");
    tests.validateAndAddMove(chess, "44-45");
    tests.validateAndAddMove(chess, "56-55");
    assertTrue(chess.validMove("45-46"));
    assertFalse(chess.validMove("45-56"));
    assertFalse(chess.validMove("45-36"));
  },
  testBlackEnPassantValid: function() {
    var chess = new Chess();
    tests.validateAndAddMove(chess, "12-14");
    tests.validateAndAddMove(chess, "57-55");
    tests.validateAndAddMove(chess, "14-15");
    tests.validateAndAddMove(chess, "55-54");
    tests.validateAndAddMove(chess, "42-44");
    assertTrue(chess.validMove("54-53"));
    assertTrue(chess.validMove("54-43"));
    assertFalse(chess.validMove("54-63"));
  },

  testKnight: function() {
    var chess = new Chess();
    assertTrue(chess.validMove("71-83"));
    assertFalse(chess.validMove("71-73"));
    tests.validateAndAddMove(chess, "71-63");
    assertTrue(chess.validMove("78-86"));
    tests.validateAndAddMove(chess, "78-66");
    assertTrue(chess.validMove("63-84"));
    tests.validateAndAddMove(chess, "63-44");
    assertTrue(chess.validMove("66-45"));
    tests.validateAndAddMove(chess, "66-85");
  },

  testWhiteQueen: function() {
    var chess = new Chess();
    assertFalse(chess.validMove("41-14"));
    assertFalse(chess.validMove("41-85"));
    assertFalse(chess.validMove("41-47"));
    assertFalse(chess.validMove("41-48"));
    chess.setPiece(Chess.toIndex("32"), Chess.BLANK);
    assertTrue(chess.validMove("41-14"));
    assertFalse(chess.validMove("41-85"));
    assertFalse(chess.validMove("41-47"));
    assertFalse(chess.validMove("41-48"));
    chess.setPiece(Chess.toIndex("52"), Chess.BLANK);
    assertTrue(chess.validMove("41-85"));
    assertFalse(chess.validMove("41-47"));
    assertFalse(chess.validMove("41-48"));
    chess.setPiece(Chess.toIndex("42"), Chess.BLANK);
    assertTrue(chess.validMove("41-47"));
    assertFalse(chess.validMove("41-48"));
    chess.setPiece(Chess.toIndex("47"), Chess.BLANK);
    assertTrue(chess.validMove("41-48"));
  },
  testCastle: function() {
    var chess = new Chess();
    assertFalse(chess.validMove("51-71"));
    assertFalse(chess.validMove("51-31"));
    chess.setPiece(Chess.toIndex("61"), Chess.BLANK);
    assertFalse(chess.validMove("51-71"));
    chess.setPiece(Chess.toIndex("71"), Chess.BLANK);
    assertTrue(chess.validMove("51-71"));

    // Make sure you can't castle through check.
    chess.setPiece(Chess.toIndex("52"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("62"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("72"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("82"), Chess.BLANK);

    // Make sure you can't castle through check
    chess.setPiece(Chess.toIndex("56"), 'q');
    assertFalse(chess.validMove("51-71"));
    chess.setPiece(Chess.toIndex("56"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("66"), 'q');
    debugger;
    assertFalse(chess.validMove("51-71"));
    chess.setPiece(Chess.toIndex("66"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("76"), 'q');
    assertFalse(chess.validMove("51-71"));
    chess.setPiece(Chess.toIndex("76"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("86"), 'q');
    // Should still be able to castle if only the rook is threatened.
    assertTrue(chess.validMove("51-71"));
  },

  // TODO: write tests for bishop, rook, and regular king moves

  testInCheck: function() {
    var chess = new Chess();
    assertFalse(chess.checkmate(chess.whoseTurn));
    chess.setPiece(Chess.toIndex("52"), Chess.BLANK);
    chess.setPiece(Chess.toIndex("57"), Chess.BLANK);
    assertFalse(chess.checkmate(chess.whoseTurn));
    assertFalse(chess.inCheck(Chess.WHITE));
    assertFalse(chess.inCheck(Chess.BLACK));
    tests.validateAndAddMove(chess, "41-52");
    assertFalse(chess.inCheck(Chess.WHITE));
    var check =chess.inCheck(Chess.BLACK);
    assertTrue(check != null);
    assertFalse(chess.checkmate(chess.whoseTurn()));
    assertEquals(check.from, Chess.toIndex("52"));
    assertEquals(check.to, Chess.toIndex("58"));
  },

  testFoolsMate: function() {
    var chess = new Chess();
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "72-74");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "57-55");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "62-63");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "48-84");
    assertTrue(chess.checkmate(chess.whoseTurn()));
  },

  // Sets up a simple scholar's mate
  testScholarsMate: function() {
    var chess = new Chess();
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "52-54");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "57-55");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "41-85");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "28-36");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "61-34");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "78-66");
    assertFalse(chess.checkmate(chess.whoseTurn()));
    tests.validateAndAddMove(chess, "85-67");
    assertTrue(chess.checkmate(chess.whoseTurn()));
  },

  // Test a random checkmate check that failed
  testCheckmate: function() {
    var chess = new Chess();
    chess.setPiece(Chess.toIndex("78"), Chess.BLANK);
    chess.addMove("71-66");
    assertTrue(chess.inCheck(Chess.BLACK));
    assertFalse(chess.checkmate(Chess.BLACK));
    assertFalse(chess.inCheck(Chess.WHITE));
    assertFalse(chess.checkmate(Chess.WHITE));
  },

  // Test that we can detect checkmate even when one player is one move away
  testSimultaneousCheckmate: function() {
    var chess = new Chess();
    chess.addMove("61-34");
    chess.addMove("28-44");
    chess.addMove("34-67");
    assertFalse(chess.checkmate(Chess.BLACK));
  }
};