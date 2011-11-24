#!/usr/bin/python2.4
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

"""Main app handler."""

#import logging
import sys
# Do this primarily so that simplejson can import itself.  It also lets us
# pretend the third party modules are just installed in site-packages.
sys.path.append('third_party')
import wsgiref.handlers

from google.appengine.ext import webapp

import clock
import views
import views_admin

#logging.getLogger().setLevel(logging.DEBUG)

def real_main():
  mapping = [
    ('/',         views.Root),
    ('/about',    views.About),
    ('/edit',     views.Edit),
    ('/list',     views.List),
    ('/admin',    views_admin.Admin),
    ('/delete',   views_admin.Delete),
    ('/backup',   views_admin.Backup),
    ('/restore',  views_admin.Restore),
    ('/test/.*',  views_admin.Test),
    ('/update_datastore', views_admin.UpdateDatastore),
    ('/.*\.png',  views.Image),
    ('.*',        views.Error404),
  ]
  application = webapp.WSGIApplication(mapping, debug=True)
  wsgiref.handlers.CGIHandler().run(application)

# TODO: always put a simple "render time" in the html
def profile_main():
  import cProfile, pstats
  prof = cProfile.Profile()
  prof = prof.runctx("real_main()", globals(), locals())
  stats = pstats.Stats(prof)
  stats.sort_stats("cumulative")
  print "<pre>"
  stats.print_stats(80)
  print "</pre>"

def main():
  clock.Start()
  real_main()

if __name__ == '__main__':
  main()
