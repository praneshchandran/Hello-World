/* Copyright 2007 Google Inc.

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

/* Update a pixel based on the (hidden) checkboxes. */
function dotmatrix_updatePixel(n) {
  var inBox  = document.getElementById('pixel_in_' + n);
  var canvasPixel = document.getElementById('canvas_pixel_' + n);
  var previewPixel = document.getElementById('preview_pixel_' + n);
  if (inBox.checked) {
    canvasPixel.className = 'black';
    previewPixel.className = 'black';
  } else {
    canvasPixel.className = 'white';
    previewPixel.className = 'white';
  }
}

/* Set up the page */
function dotmatrix_setupDrawingArea() {
  /* TODO: I don't like the hard-coded width/height */
  for (var i = 0; i < 11*11; i = i + 1) {
    dotmatrix_updatePixel(i);
  }
  dotmatrix_pickColor('black');
}

/* Click & drag drawing */
var dotmatrix_currentlyDrawing = false;
function dotmatrix_stopDrawing() {
  dotmatrix_currentlyDrawing = false;
}

function dotmatrix_startDrawing(n) {
  dotmatrix_currentlyDrawing = true;
  var inBox = document.getElementById('pixel_in_' + n);
  if (inBox.checked) {  /* Toggle the color. */
    dotmatrix_pickColor('white');
  } else {
    dotmatrix_pickColor('black');
  }
  dotmatrix_setPixel(n, dotmatrix_currentColor);
}

function dotmatrix_mouseOver(n) {
  if (dotmatrix_currentlyDrawing) {
    dotmatrix_setPixel(n, dotmatrix_currentColor);
  }
}

function dotmatrix_setPixel(n, color) {
  var inBox = document.getElementById('pixel_in_' + n);
  inBox.checked = (color == 'black');
  dotmatrix_updatePixel(n);
}

/* Picking colors */
var dotmatrix_currentColor = 'black';
function dotmatrix_pickColor(color) {
  dotmatrix_currentColor = color;
}

/* Clearing the canvas */
function dotmatrix_fill(color) {
  if (confirm('This will replace your current drawing.  Continue?')) {
    /* TODO: I don't like the hard-coded width/height */
    for (var i = 0; i < 11*11; i = i + 1) {
      dotmatrix_setPixel(i, color);
    }
  }
}
