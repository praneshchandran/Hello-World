import logging

from google.appengine.api import users
from google.appengine.ext import db

user = users.get_current_user()
if user:
    q = db.GqlQuery("SELECT * FROM UserPrefs WHERE user = :1", user)
    results = q.fetch(2)
    if len(results) > 1:
        logging.error("more than one UserPrefs object for user %s", str(user))
    if len(results) == 0:
        logging.debug("creating UserPrefs object for user %s", str(user))
        userprefs = UserPrefs(user=user)
        userprefs.put()
    else:
        userprefs = results[0]
else:
    logging.debug("creating dummy UserPrefs for anonymous user")
