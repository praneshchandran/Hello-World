
m google.appengine.runtime import DeadlineExceededError

class MainPage(webapp.RequestHandler):
    def get(self):
        try:
            # Do stuff...

        except DeadlineExceededError:
            self.response.clear()
            self.response.set_status(500)
            self.response.out.write("This operation could not be completed in time...")
